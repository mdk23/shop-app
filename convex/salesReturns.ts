import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { recordReturnMetrics, trackSale } from "./lib/salesMetrics";
import { adjustCustomerCredit } from "./customerCredits";
import { performSale } from "./sales";
import { refreshCustomerProfile } from "./customerProfile";
import { nextDocumentNumber } from "./lib/numbering";
import { requireOpenSession } from "./cashRegister";
import { paymentMethodValidator, refundMethodValidator } from "./lib/paymentMethods";
import { settleSale, splitReturnValue, unitValueOfLine } from "./lib/saleMoney";

/**
 * A return's value and refund, read from where they live: the goods' value is the sum of
 * its lines, the money given back is its refund rows in `payments`.
 */
export async function returnSummary(ctx: QueryCtx, ret: Doc<"salesReturns">) {
  const items = await ctx.db
    .query("salesReturnItems")
    .withIndex("by_return", (q) => q.eq("returnId", ret._id))
    .collect();
  const refunds = await ctx.db
    .query("payments")
    .withIndex("by_return", (q) => q.eq("returnId", ret._id))
    .collect();
  return {
    items,
    returnValue: Math.round(items.reduce((s, i) => s + i.refundAmount, 0) * 100) / 100,
    refunded: Math.round(refunds.reduce((s, p) => s - p.amount, 0) * 100) / 100,
    refundMethods: [...new Set(refunds.map((p) => p.method))],
  };
}

const RETURN_ITEM_REASON = v.union(
  v.literal("WRONG_SIZE"),
  v.literal("WRONG_COLOR"),
  v.literal("DEFECTIVE"),
  v.literal("CUSTOMER_CHANGED_MIND"),
  v.literal("WRONG_ITEM"),
  v.literal("OTHER")
);

const CONDITION = v.union(v.literal("SELLABLE"), v.literal("USED"), v.literal("DAMAGED"));

const RESOLUTION = v.union(
  v.literal("TROCA"),
  v.literal("DEVOLUCAO"),
  v.literal("REEMBOLSO"),
  v.literal("CREDITO"),
  v.literal("REPARACAO"),
  v.literal("RECUSA")
);

const REFUND_METHOD = refundMethodValidator;

async function getSetting(ctx: MutationCtx, key: string) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

async function alreadyReturnedQty(
  ctx: QueryCtx,
  saleItemId: Id<"saleItems">
): Promise<number> {
  const rows = await ctx.db
    .query("salesReturnItems")
    .withIndex("by_sale_item", (q) => q.eq("saleItemId", saleItemId))
    .collect();
  return rows.reduce((s, r) => s + r.quantity, 0);
}

/** Whether every unit sold on the sale has come back. */
async function isFullyReturned(ctx: MutationCtx, saleId: Id<"sales">): Promise<boolean> {
  const saleItems = await ctx.db
    .query("saleItems")
    .withIndex("by_sale", (q) => q.eq("saleId", saleId))
    .collect();
  for (const si of saleItems) {
    if ((await alreadyReturnedQty(ctx, si._id)) < si.quantity) return false;
  }
  return true;
}

/**
 * Resolve return lines against a sale: validates ownership, caps quantity at
 * (sold − alreadyReturned) and values each line at what the customer paid for it
 * (after discounts, with IVA). Whether that value comes back as money depends on what
 * was paid — see splitReturnValue.
 */
async function resolveReturnLines(
  ctx: QueryCtx,
  sale: Doc<"sales">,
  items: {
    saleItemId: Id<"saleItems">;
    quantity: number;
    reason: string;
    restock: boolean;
    condition?: "SELLABLE" | "USED" | "DAMAGED";
  }[]
) {
  if (sale.status === "CANCELLED") throw new Error("Cannot return items from a cancelled sale.");
  const saleItems = await ctx.db
    .query("saleItems")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect();
  const resolved = [];
  for (const item of items) {
    if (item.quantity <= 0) throw new Error("Return quantity must be positive.");
    const saleItem = saleItems.find((si) => si._id === item.saleItemId);
    if (!saleItem) throw new Error("A return line does not belong to this sale.");
    const returned = await alreadyReturnedQty(ctx, item.saleItemId);
    const remaining = saleItem.quantity - returned;
    if (item.quantity > remaining) {
      throw new Error(
        `Cannot return ${item.quantity} of ${saleItem.productName} (${saleItem.variantLabel}); only ${remaining} remain.`
      );
    }
    // What a unit cost the customer: after every discount, with its IVA.
    const unitNet = unitValueOfLine(saleItem, sale, saleItems);
    resolved.push({
      saleItem,
      quantity: item.quantity,
      reason: item.reason,
      condition: item.condition,
      restock: item.condition === "DAMAGED" ? false : item.restock,
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
        condition: v.optional(CONDITION),
      })
    ),
    refundMethod: REFUND_METHOD,
    notes: v.optional(v.string()),
    resolutionType: v.optional(RESOLUTION),
    complaintId: v.optional(v.id("complaints")),
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
    if (args.complaintId) {
      const complaint = await ctx.db.get(args.complaintId);
      if (!complaint) throw new Error("Complaint not found.");
      if (complaint.saleId && complaint.saleId !== args.saleId)
        throw new Error("This complaint is about a different sale.");
    }

    const metricsDone = await trackSale(ctx, args.saleId);
    const lines = await resolveReturnLines(ctx, sale, args.items);
    const returnValue =
      Math.round(lines.reduce((s, l) => s + l.refundAmount, 0) * 100) / 100;
    // The goods first cancel what is still owed on the sale; only the rest, up to what
    // was paid, is money back.
    const { debtCleared, refund: refundAmount } = await splitReturnValue(ctx, sale, returnValue);

    const now = Date.now();
    const returnNumber = await nextDocumentNumber(ctx, "RETURN", now);

    // Money given back goes through the open register; store credit moves no money.
    const session =
      args.refundMethod === "STORE_CREDIT" || refundAmount <= 0
        ? null
        : await requireOpenSession(ctx, sale.branchId);

    const returnId = await ctx.db.insert("salesReturns", {
      returnNumber,
      saleId: args.saleId,
      branchId: sale.branchId,
      customerId: sale.customerId,
      userId: actor._id,
      username: actor.username,
      status: "COMPLETED",
      reason: args.notes ?? "Customer return",
      notes: args.notes,
      resolutionId: args.resolutionType
        ? await ctx.db.insert("resolutions", {
            resolutionType: args.resolutionType,
            decidedAt: now,
          })
        : undefined,
      complaintId: args.complaintId,
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
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        refundAmount: l.refundAmount,
        reason: l.reason as Doc<"salesReturnItems">["reason"],
        restock: l.restock,
        condition: l.condition,
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

    // Issue the refund. The payment row is the refund's record (and the drawer's when in
    // cash); store credit also adds to the customer's credit balance.
    if (refundAmount > 0) {
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
      }
      await ctx.db.insert("payments", {
        saleId: args.saleId,
        method: args.refundMethod,
        amount: -refundAmount,
        kind: "refund",
        returnId,
        cashRegisterSessionId: session?._id,
        userId: actor._id,
        username: actor.username,
        createdAt: now,
      });
    }

    // Goods back → status RETURNED / PARTIALLY_RETURNED; the sale's paid amount, balance
    // and payment status are then re-read from its returns and payments.
    await ctx.db.patch(args.saleId, {
      status: (await isFullyReturned(ctx, args.saleId)) ? "RETURNED" : "PARTIALLY_RETURNED",
      updatedAt: now,
    });
    await settleSale(ctx, args.saleId);
    // Sales totals: the sale's new share, and the return on its own day.
    await metricsDone();
    await recordReturnMetrics(ctx, returnId);

    // A return changes size observations (returned units net out) and
    // trailing spend — recompute before metrics/audit.
    await refreshCustomerProfile(ctx, sale.customerId, {
      _id: actor._id,
      username: actor.username,
    });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "return.processed",
      entityType: "salesReturn",
      entityId: returnId,
      details:
        `${returnNumber} vs ${sale.saleNumber} — goods ${returnValue}, refund ${refundAmount} via ${args.refundMethod}` +
        (debtCleared > 0 ? `, ${debtCleared} taken off the customer's debt` : "") +
        `, ${restockedUnits} unit(s) restocked`,
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
      v.array(v.object({ method: paymentMethodValidator, amount: v.number() }))
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

    // 1. Value the returned goods. They first cancel what is still owed on the sale; the
    // rest is credit the customer can spend on the replacement.
    const metricsDone = await trackSale(ctx, args.saleId);
    const lines = await resolveReturnLines(ctx, sale, args.returnItems);
    const returnValue =
      Math.round(lines.reduce((s, l) => s + l.refundAmount, 0) * 100) / 100;
    const { debtCleared, refund: credit } = await splitReturnValue(ctx, sale, returnValue);

    const now = Date.now();

    // 2. Record the return itself.
    const returnNumber = await nextDocumentNumber(ctx, "RETURN", now);
    const returnId = await ctx.db.insert("salesReturns", {
      returnNumber,
      saleId: args.saleId,
      branchId: sale.branchId,
      customerId: sale.customerId,
      userId: actor._id,
      username: actor.username,
      status: "COMPLETED",
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

    // 3. The replacement is a normal sale at its normal prices. Ordering matters: the
    // `salesReturnItems` rows above are already inserted, so `performSale`'s internal
    // `refreshCustomerProfile` call sees this exchange's return.
    const replacementSaleId: Id<"sales"> = await performSale(ctx, actor, {
      branchId: sale.branchId,
      customerId: sale.customerId,
      items: args.replacementItems.map((it) => ({
        productVariantId: it.productVariantId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
      })),
      payments: args.additionalPayments,
      notes: `Exchange for ${sale.saleNumber}`,
    });
    const replacement = (await ctx.db.get(replacementSaleId))!;

    // 4. The credit pays for the replacement: it leaves the original sale as a store-credit
    // refund and arrives on the replacement as a store-credit payment. What is left over
    // goes back by the chosen method.
    const applied = Math.round(Math.min(credit, replacement.balance) * 100) / 100;
    if (applied > 0) {
      const replacementDone = await trackSale(ctx, replacementSaleId);
      await ctx.db.insert("payments", {
        saleId: args.saleId,
        method: "STORE_CREDIT",
        amount: -applied,
        kind: "refund",
        returnId,
        reference: replacement.saleNumber,
        userId: actor._id,
        username: actor.username,
        createdAt: now,
      });
      await ctx.db.insert("payments", {
        saleId: replacementSaleId,
        method: "STORE_CREDIT",
        amount: applied,
        kind: "payment",
        reference: returnNumber,
        userId: actor._id,
        username: actor.username,
        createdAt: now,
      });
      await settleSale(ctx, replacementSaleId);
      await replacementDone();
    }

    const leftover = Math.round((credit - applied) * 100) / 100;
    if (leftover > 0) {
      const leftoverSession =
        args.refundMethod === "STORE_CREDIT" ? null : await requireOpenSession(ctx, sale.branchId);
      if (args.refundMethod === "STORE_CREDIT") {
        await adjustCustomerCredit(ctx, {
          customerId: sale.customerId,
          delta: leftover,
          reason: "RETURN_REFUND",
          referenceType: "exchange",
          referenceId: returnId,
          userId: actor._id,
          username: actor.username,
          notes: `Exchange credit for ${returnNumber}`,
        });
      }
      await ctx.db.insert("payments", {
        saleId: args.saleId,
        method: args.refundMethod,
        amount: -leftover,
        kind: "refund",
        returnId,
        cashRegisterSessionId: leftoverSession?._id,
        userId: actor._id,
        username: actor.username,
        createdAt: now,
      });
    }

    await ctx.db.patch(returnId, { exchangeSaleId: replacementSaleId });
    await ctx.db.patch(args.saleId, {
      status: (await isFullyReturned(ctx, args.saleId)) ? "RETURNED" : "PARTIALLY_RETURNED",
      updatedAt: now,
    });
    await settleSale(ctx, args.saleId);
    // Sales totals: the sale's new share, and the return on its own day.
    await metricsDone();
    await recordReturnMetrics(ctx, returnId);

    // Positive: what the customer paid or still owes on top; negative: given back.
    const difference = Math.round((replacement.total - credit) * 100) / 100;

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "return.exchanged",
      entityType: "salesReturn",
      entityId: returnId,
      details:
        `${returnNumber}: returned goods ${returnValue}` +
        (debtCleared > 0 ? ` (${debtCleared} taken off the customer's debt)` : "") +
        `, replacement ${replacement.saleNumber} ${replacement.total}, credit applied ${applied}` +
        (leftover > 0 ? `, ${leftover} back via ${args.refundMethod}` : ""),
    });

    return { returnId, replacementSaleId, difference };
  },
});

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const listPaged = query({
  args: {
    branchId: v.optional(v.id("branches")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("salesReturns")
      .withIndex("by_created_at")
      .order("desc")
      .paginate(args.paginationOpts);
    const rows = args.branchId
      ? result.page.filter((r) => r.branchId === args.branchId)
      : result.page;
    const page = await Promise.all(
      rows.map(async (r) => {
        const { returnValue, refunded, refundMethods } = await returnSummary(ctx, r);
        return { ...r, returnValue, refunded, refundMethods };
      })
    );
    return { ...result, page };
  },
});

export const getForSale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    const returns = await ctx.db
      .query("salesReturns")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();
    return await Promise.all(returns.map(async (r) => ({ ...r, ...(await returnSummary(ctx, r)) })));
  },
});

export const get = query({
  args: { id: v.id("salesReturns") },
  handler: async (ctx, args) => {
    const ret = await ctx.db.get(args.id);
    if (!ret) return null;
    const sale = await ctx.db.get(ret.saleId);
    return { ...ret, ...(await returnSummary(ctx, ret)), sale };
  },
});

/**
 * What a return of these lines would do, before it is made: the goods' value, how much of
 * it only clears the customer's debt on the sale, and how much is money back.
 */
export const previewReturn = query({
  args: {
    token: v.string(),
    saleId: v.id("sales"),
    items: v.array(v.object({ saleItemId: v.id("saleItems"), quantity: v.number() })),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "returns.process");
    const sale = await ctx.db.get(args.saleId);
    if (!sale || sale.status === "CANCELLED" || args.items.length === 0) return null;
    const lines = await resolveReturnLines(
      ctx,
      sale,
      args.items.map((i) => ({ ...i, reason: "OTHER", restock: false }))
    );
    const returnValue = Math.round(lines.reduce((s, l) => s + l.refundAmount, 0) * 100) / 100;
    return { returnValue, ...(await splitReturnValue(ctx, sale, returnValue)) };
  },
});
