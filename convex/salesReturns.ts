import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import {
  applyDailyMetrics,
  applyTodayCounters,
  getLocalDateString,
  nextSequence,
  sanitizeKey,
  zeroDeltas,
} from "./metrics";
import { adjustCustomerCredit } from "./customerCredits";
import { performSale } from "./sales";

const RETURN_ITEM_REASON = v.union(
  v.literal("WRONG_SIZE"),
  v.literal("WRONG_COLOR"),
  v.literal("DEFECTIVE"),
  v.literal("CUSTOMER_CHANGED_MIND"),
  v.literal("WRONG_ITEM"),
  v.literal("OTHER")
);

const REFUND_METHOD = v.union(
  v.literal("CASH"),
  v.literal("CARD"),
  v.literal("MPESA"),
  v.literal("EMOLA"),
  v.literal("BANK_TRANSFER"),
  v.literal("STORE_CREDIT"),
  v.literal("OTHER")
);

async function getSetting(ctx: MutationCtx, key: string) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

async function alreadyReturnedQty(
  ctx: MutationCtx,
  saleItemId: Id<"saleItems">
): Promise<number> {
  const rows = await ctx.db
    .query("salesReturnItems")
    .withIndex("by_sale_item", (q) => q.eq("saleItemId", saleItemId))
    .collect();
  return rows.reduce((s, r) => s + r.quantity, 0);
}

/**
 * Resolve return lines against a sale: validates ownership, caps quantity at
 * (sold − alreadyReturned) and computes the net (discount-adjusted) refund per line.
 */
async function resolveReturnLines(
  ctx: MutationCtx,
  saleId: Id<"sales">,
  items: {
    saleItemId: Id<"saleItems">;
    quantity: number;
    reason: string;
    restock: boolean;
  }[]
) {
  const resolved = [];
  for (const item of items) {
    if (item.quantity <= 0) throw new Error("Return quantity must be positive.");
    const saleItem = await ctx.db.get(item.saleItemId);
    if (!saleItem || saleItem.saleId !== saleId)
      throw new Error("A return line does not belong to this sale.");
    const returned = await alreadyReturnedQty(ctx, item.saleItemId);
    const remaining = saleItem.quantity - returned;
    if (item.quantity > remaining) {
      throw new Error(
        `Cannot return ${item.quantity} of ${saleItem.productName} (${saleItem.variantLabel}); only ${remaining} remain.`
      );
    }
    const unitNet = saleItem.total / saleItem.quantity; // discount-adjusted
    resolved.push({
      saleItem,
      quantity: item.quantity,
      reason: item.reason,
      restock: item.restock,
      unitPrice: saleItem.unitPrice,
      refundAmount: Math.round(unitNet * item.quantity * 100) / 100,
      unitCost: saleItem.costPriceAtSale,
    });
  }
  return resolved;
}

// ─────────────────────────────────────────────
// PROCESS RETURN
// ─────────────────────────────────────────────

export const create = mutation({
  args: {
    token: v.string(),
    saleId: v.id("sales"),
    items: v.array(
      v.object({
        saleItemId: v.id("saleItems"),
        quantity: v.number(),
        reason: RETURN_ITEM_REASON,
        restock: v.boolean(),
      })
    ),
    refundMethod: REFUND_METHOD,
    notes: v.optional(v.string()),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
  },
  handler: async (ctx, args): Promise<Id<"salesReturns">> => {
    const actor = await authorize(ctx, args.token, "returns.process");

    if (!((await getSetting(ctx, "returnsEnabled"))?.isActive ?? true)) {
      throw new Error("Returns are disabled in settings.");
    }

    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found.");
    if (sale.status === "CANCELLED")
      throw new Error("Cannot return items from a cancelled sale.");
    if (args.items.length === 0) throw new Error("Nothing to return.");

    const lines = await resolveReturnLines(ctx, args.saleId, args.items);
    const refundAmount =
      Math.round(lines.reduce((s, l) => s + l.refundAmount, 0) * 100) / 100;

    const now = Date.now();
    const dateString = getLocalDateString(now);
    const seq = await nextSequence(
      ctx,
      `return_sequence_${sale.branchId}`,
      dateString
    );
    const branch = await ctx.db.get(sale.branchId);
    const returnNumber = `R-${branch?.code ?? "STORE"}-${dateString
      .replace(/-/g, "")
      .slice(2)}-${String(seq).padStart(3, "0")}`;

    // Cash refund needs an open register.
    let session: Doc<"cashRegisterSessions"> | null = null;
    if (args.refundMethod === "CASH") {
      const open = await ctx.db
        .query("cashRegisterSessions")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .collect();
      session =
        open.find((s) => s.branchId === sale.branchId) ??
        open.find((s) => !s.branchId) ??
        null;
      if (!session)
        throw new Error("Open a cash register before issuing a cash refund.");
    }

    const returnId = await ctx.db.insert("salesReturns", {
      returnNumber,
      saleId: args.saleId,
      branchId: sale.branchId,
      customerId: sale.customerId,
      userId: actor._id,
      username: actor.username,
      status: "COMPLETED",
      refundMethod: args.refundMethod,
      refundAmount,
      reason: args.notes ?? "Customer return",
      notes: args.notes,
      cashRegisterSessionId: session?._id,
      createdAt: now,
    });

    let restockedUnits = 0;
    let returnedUnits = 0;
    let returnedCost = 0;
    for (const l of lines) {
      returnedUnits += l.quantity;
      returnedCost += l.unitCost * l.quantity;
      await ctx.db.insert("salesReturnItems", {
        returnId,
        saleItemId: l.saleItem._id,
        productVariantId: l.saleItem.productVariantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        refundAmount: l.refundAmount,
        reason: l.reason as Doc<"salesReturnItems">["reason"],
        restock: l.restock,
      });
      if (l.restock) {
        restockedUnits += l.quantity;
        await ctx.runMutation(internal.inventory.mutateStock, {
          productVariantId: l.saleItem.productVariantId,
          branchId: sale.branchId,
          quantity: l.quantity,
          movementType: "SALE_RETURN",
          referenceType: "sale_return",
          referenceId: returnId,
          notes: `Return ${returnNumber}`,
          userId: actor._id,
          username: actor.username,
        });
      }
    }

    // Issue the refund.
    if (args.refundMethod === "STORE_CREDIT") {
      await adjustCustomerCredit(ctx, {
        customerId: sale.customerId,
        delta: refundAmount,
        reason: "RETURN_REFUND",
        referenceType: "sale_return",
        referenceId: returnId,
        userId: actor._id,
        username: actor.username,
        notes: `Store credit for ${returnNumber}`,
      });
    } else {
      await ctx.db.insert("payments", {
        saleId: args.saleId,
        method: args.refundMethod,
        amount: -refundAmount,
        kind: "refund",
        returnId,
        createdAt: now,
      });
      if (args.refundMethod === "CASH" && session) {
        await ctx.runMutation(internal.caixa.recordCashRefund, {
          sessionId: session._id,
          userId: actor._id,
          username: actor.username,
          amount: refundAmount,
          returnId,
          returnNumber,
        });
      }
    }

    // Update sale status.
    const allItems = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();
    let soldTotal = 0;
    let returnedTotal = 0;
    for (const si of allItems) {
      soldTotal += si.quantity;
      returnedTotal += await alreadyReturnedQty(ctx, si._id);
    }
    const fullyReturned = returnedTotal >= soldTotal;
    await ctx.db.patch(args.saleId, {
      status: fullyReturned ? "REFUNDED" : "PARTIALLY_REFUNDED",
      paymentStatus: fullyReturned ? "REFUNDED" : "PARTIALLY_REFUNDED",
      updatedAt: now,
    });

    // Metrics: unwind the returned portion.
    const deltas = {
      ...zeroDeltas(),
      totalRevenue: -refundAmount,
      totalReturns: 1,
      refundAmount,
      totalItemsSold: -returnedUnits,
      totalProfit: -(refundAmount - returnedCost),
      cashCollected: args.refundMethod === "CASH" ? -refundAmount : 0,
      paymentMethods:
        args.refundMethod === "STORE_CREDIT"
          ? {}
          : { [sanitizeKey(args.refundMethod)]: { amount: -refundAmount, count: -1 } },
    };
    await applyDailyMetrics(ctx, dateString, deltas);
    await applyTodayCounters(ctx, dateString, deltas);

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "return.processed",
      entityType: "salesReturn",
      entityId: returnId,
      details: `${returnNumber} vs ${sale.saleNumber} — refund ${refundAmount} via ${args.refundMethod}, ${restockedUnits} unit(s) restocked`,
    });

    return returnId;
  },
});

// ─────────────────────────────────────────────
// EXCHANGE  (return some items, issue replacement items, settle the difference)
// ─────────────────────────────────────────────

export const exchange = mutation({
  args: {
    token: v.string(),
    saleId: v.id("sales"),
    returnItems: v.array(
      v.object({
        saleItemId: v.id("saleItems"),
        quantity: v.number(),
        reason: RETURN_ITEM_REASON,
        restock: v.boolean(),
      })
    ),
    replacementItems: v.array(
      v.object({
        productVariantId: v.id("productVariants"),
        quantity: v.number(),
        unitPrice: v.optional(v.number()),
      })
    ),
    // Payment the customer makes when the replacement costs more.
    additionalPayments: v.optional(
      v.array(v.object({ method: v.string(), amount: v.number() }))
    ),
    // Where to send a positive balance when the replacement costs less.
    refundMethod: REFUND_METHOD,
    notes: v.optional(v.string()),
  },
  handler: async (
    ctx,
    args
  ): Promise<{ returnId: Id<"salesReturns">; replacementSaleId: Id<"sales">; difference: number }> => {
    const actor = await authorize(ctx, args.token, "returns.process");
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found.");
    if (args.returnItems.length === 0 || args.replacementItems.length === 0)
      throw new Error("An exchange needs both returned and replacement items.");

    // 1. Value the returned goods (always restock-eligible per line flag) and credit them.
    const lines = await resolveReturnLines(ctx, args.saleId, args.returnItems);
    const returnValue =
      Math.round(lines.reduce((s, l) => s + l.refundAmount, 0) * 100) / 100;

    // 2. Build the replacement sale, applying the return value as a discount.
    const replacementGross = args.replacementItems.reduce(async (accP, it) => {
      const acc = await accP;
      const variant = await ctx.db.get(it.productVariantId);
      const price = it.unitPrice ?? variant?.sellingPrice ?? 0;
      return acc + price * it.quantity;
    }, Promise.resolve(0));
    const grossNew = await replacementGross;
    const discountToApply = Math.min(returnValue, grossNew);

    const now = Date.now();
    const dateString = getLocalDateString(now);

    // 3. Record the return itself (store credit for any leftover value).
    const seq = await nextSequence(
      ctx,
      `return_sequence_${sale.branchId}`,
      dateString
    );
    const branch = await ctx.db.get(sale.branchId);
    const returnNumber = `R-${branch?.code ?? "STORE"}-${dateString
      .replace(/-/g, "")
      .slice(2)}-${String(seq).padStart(3, "0")}`;
    const leftoverCredit = Math.max(0, returnValue - discountToApply);

    const returnId = await ctx.db.insert("salesReturns", {
      returnNumber,
      saleId: args.saleId,
      branchId: sale.branchId,
      customerId: sale.customerId,
      userId: actor._id,
      username: actor.username,
      status: "COMPLETED",
      refundMethod: leftoverCredit > 0 ? args.refundMethod : "OTHER",
      refundAmount: returnValue,
      reason: args.notes ?? "Exchange",
      notes: args.notes,
      createdAt: now,
    });

    let returnedUnits = 0;
    let returnedCost = 0;
    for (const l of lines) {
      returnedUnits += l.quantity;
      returnedCost += l.unitCost * l.quantity;
      await ctx.db.insert("salesReturnItems", {
        returnId,
        saleItemId: l.saleItem._id,
        productVariantId: l.saleItem.productVariantId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        refundAmount: l.refundAmount,
        reason: l.reason as Doc<"salesReturnItems">["reason"],
        restock: l.restock,
      });
      if (l.restock) {
        await ctx.runMutation(internal.inventory.mutateStock, {
          productVariantId: l.saleItem.productVariantId,
          branchId: sale.branchId,
          quantity: l.quantity,
          movementType: "SALE_RETURN",
          referenceType: "exchange_return",
          referenceId: returnId,
          notes: `Exchange ${returnNumber}`,
          userId: actor._id,
          username: actor.username,
        });
      }
    }

    if (leftoverCredit > 0 && args.refundMethod === "STORE_CREDIT") {
      await adjustCustomerCredit(ctx, {
        customerId: sale.customerId,
        delta: leftoverCredit,
        reason: "RETURN_REFUND",
        referenceType: "exchange",
        referenceId: returnId,
        userId: actor._id,
        username: actor.username,
        notes: `Exchange credit for ${returnNumber}`,
      });
    }

    // 4. Create the replacement sale (return value applied as a discount).
    const replacementSaleId: Id<"sales"> = await performSale(ctx, actor, {
      branchId: sale.branchId,
      customerId: sale.customerId,
      items: args.replacementItems.map((it) => ({
        productVariantId: it.productVariantId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
      discount: discountToApply,
      payments: args.additionalPayments,
      notes: `Exchange for ${sale.saleNumber}`,
    });

    await ctx.db.patch(returnId, { exchangeSaleId: replacementSaleId });

    const difference = Math.round((grossNew - returnValue) * 100) / 100;

    await ctx.db.patch(args.saleId, {
      status: "PARTIALLY_REFUNDED",
      paymentStatus: "PARTIALLY_REFUNDED",
      updatedAt: now,
    });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "return.exchanged",
      entityType: "salesReturn",
      entityId: returnId,
      details: `${returnNumber}: returned value ${returnValue}, replacement ${grossNew}, difference ${difference}`,
    });

    // Metrics for the returned side (replacement side handled by performSale).
    await applyDailyMetrics(ctx, dateString, {
      ...zeroDeltas(),
      totalReturns: 1,
      totalItemsSold: -returnedUnits,
      totalProfit: -(returnValue - returnedCost),
    });

    return { returnId, replacementSaleId, difference };
  },
});

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const listRecent = query({
  args: { limit: v.optional(v.number()), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    let rows = await ctx.db
      .query("salesReturns")
      .withIndex("by_created_at")
      .order("desc")
      .take((args.limit ?? 50) * (args.branchId ? 3 : 1));
    if (args.branchId) rows = rows.filter((r) => r.branchId === args.branchId);
    return rows.slice(0, args.limit ?? 50);
  },
});

export const getForSale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    const returns = await ctx.db
      .query("salesReturns")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();
    return await Promise.all(
      returns.map(async (r) => ({
        ...r,
        items: await ctx.db
          .query("salesReturnItems")
          .withIndex("by_return", (q) => q.eq("returnId", r._id))
          .collect(),
      }))
    );
  },
});

export const get = query({
  args: { id: v.id("salesReturns") },
  handler: async (ctx, args) => {
    const ret = await ctx.db.get(args.id);
    if (!ret) return null;
    const items = await ctx.db
      .query("salesReturnItems")
      .withIndex("by_return", (q) => q.eq("returnId", args.id))
      .collect();
    const sale = await ctx.db.get(ret.saleId);
    return { ...ret, items, sale };
  },
});
