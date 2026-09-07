import { v } from "convex/values";
import {
  mutation,
  internalMutation,
  query,
  MutationCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize, requirePermission } from "./permissions";
import { writeAudit } from "./audit";
import { variantLabel } from "./inventory";
import {
  applyDailyMetrics,
  applyTodayCounters,
  getLocalDateString,
  nextSequence,
  sanitizeKey,
  zeroDeltas,
  type SaleMetricDeltas,
} from "./metrics";
import { adjustCustomerCredit } from "./customerCredits";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const isCash = (method: string) => method.trim().toLowerCase() === "cash";

async function getSetting(ctx: MutationCtx, key: string) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

async function resolveOpenSession(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  provided?: Id<"cashRegisterSessions">
): Promise<Doc<"cashRegisterSessions"> | null> {
  if (provided) {
    const s = await ctx.db.get(provided);
    if (s && s.status === "open") return s;
  }
  const open = await ctx.db
    .query("cashRegisterSessions")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .collect();
  return open.find((s) => s.branchId === branchId) ?? open.find((s) => !s.branchId) ?? null;
}

function paymentStatusFor(paid: number, total: number): Doc<"sales">["paymentStatus"] {
  if (paid <= 0) return "UNPAID";
  if (paid + 1e-6 >= total) return "PAID";
  return "PARTIALLY_PAID";
}

function saleStatusFor(paid: number, total: number): Doc<"sales">["status"] {
  if (paid <= 0) return "PENDING";
  if (paid + 1e-6 >= total) return "COMPLETED";
  return "PARTIALLY_PAID";
}

// ─────────────────────────────────────────────
// CREATE SALE (POS checkout) — atomic
// ─────────────────────────────────────────────

const saleItemsValidator = v.array(
  v.object({
    productVariantId: v.id("productVariants"),
    quantity: v.number(),
    unitPrice: v.optional(v.number()),
    discount: v.optional(v.number()), // absolute, per line total
  })
);

const saleInputValidator = {
  branchId: v.id("branches"),
  customerId: v.id("customers"),
  items: saleItemsValidator,
  discount: v.optional(v.number()), // absolute, sale-level
  taxRate: v.optional(v.number()), // percent; falls back to settings
  payments: v.optional(
    v.array(v.object({ method: v.string(), amount: v.number() }))
  ),
  cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
  isDelivery: v.optional(v.boolean()),
  deliveryFeeId: v.optional(v.id("deliveryFees")),
  notes: v.optional(v.string()),
};

type SaleInput = {
  branchId: Id<"branches">;
  customerId: Id<"customers">;
  items: {
    productVariantId: Id<"productVariants">;
    quantity: number;
    unitPrice?: number;
    discount?: number;
  }[];
  discount?: number;
  taxRate?: number;
  payments?: { method: string; amount: number }[];
  cashRegisterSessionId?: Id<"cashRegisterSessions">;
  isDelivery?: boolean;
  deliveryFeeId?: Id<"deliveryFees">;
  notes?: string;
};

/**
 * Core sale creation shared by the public POS mutation and internal callers
 * (exchanges). The caller must already be authenticated + authorized for
 * `pos.use`; discount authority is enforced here against `actor`.
 */
export async function performSale(
  ctx: MutationCtx,
  actor: Doc<"users">,
  args: SaleInput
): Promise<Id<"sales">> {
  {
    if (args.items.length === 0) throw new Error("A sale needs at least one item.");

    const branch = await ctx.db.get(args.branchId);
    if (!branch) throw new Error("Branch not found.");
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found.");

    const allowNegSetting = (await getSetting(ctx, "allowNegativeStock"))?.isActive ?? false;

    // 1. Resolve lines, price them, and verify stock up-front.
    const lines: {
      productVariantId: Id<"productVariants">;
      productName: string;
      label: string;
      sku: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      total: number;
      costPriceAtSale: number;
      size?: string;
      color?: string;
      categoryName: string;
      brandName: string | null;
    }[] = [];

    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantities must be positive.");
      const variant = await ctx.db.get(item.productVariantId);
      if (!variant || !variant.active)
        throw new Error("A selected product variant is unavailable.");
      const product = await ctx.db.get(variant.productId);
      if (!product) throw new Error("Parent product missing for a variant.");
      const category = await ctx.db.get(product.categoryId);
      const brand = product.brandId ? await ctx.db.get(product.brandId) : null;

      const unitPrice = item.unitPrice ?? variant.sellingPrice;
      const lineDiscount = item.discount ?? 0;
      const lineTotal = Math.max(0, unitPrice * item.quantity - lineDiscount);

      const stock = await ctx.db
        .query("variantStock")
        .withIndex("by_branch_and_variant", (q) =>
          q.eq("branchId", args.branchId).eq("productVariantId", item.productVariantId)
        )
        .unique();
      const available = stock?.quantity ?? 0;
      if (available < item.quantity && !allowNegSetting) {
        throw new Error(
          `Insufficient stock for ${product.name} (${variantLabel(variant)}). Available: ${available}, requested: ${item.quantity}.`
        );
      }

      lines.push({
        productVariantId: item.productVariantId,
        productName: product.name,
        label: variantLabel(variant),
        sku: variant.sku,
        quantity: item.quantity,
        unitPrice,
        discount: lineDiscount,
        total: lineTotal,
        costPriceAtSale: variant.costPrice,
        size: variant.size,
        color: variant.color,
        categoryName: category?.name ?? "Uncategorised",
        brandName: brand?.name ?? null,
      });
    }

    // 2. Money.
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const lineDiscountTotal = lines.reduce((s, l) => s + l.discount, 0);
    const saleDiscount = Math.max(0, args.discount ?? 0);
    const discount = lineDiscountTotal + saleDiscount;

    const taxRate =
      args.taxRate ??
      Number((await getSetting(ctx, "taxRatePercent"))?.value ?? "0") ??
      0;
    const taxableBase = Math.max(0, subtotal - discount);
    const tax = Math.round(taxableBase * (taxRate / 100) * 100) / 100;

    let deliveryFeeAmount = 0;
    if (args.deliveryFeeId) {
      const fee = await ctx.db.get(args.deliveryFeeId);
      deliveryFeeAmount = fee?.fee ?? 0;
    }

    const total = Math.max(0, taxableBase + tax + deliveryFeeAmount);

    // 3. Discount authority.
    const discountPct = subtotal > 0 ? (discount / subtotal) * 100 : 0;
    const maxWithoutApproval = Number(
      (await getSetting(ctx, "discountMaxPercentWithoutApproval"))?.value ?? "100"
    );
    if (discountPct > maxWithoutApproval) {
      requirePermission(actor, "sales.discount_large");
    } else if (discount > 0) {
      requirePermission(actor, "sales.discount");
    }

    // 4. Payments.
    const payments = (args.payments ?? []).filter((p) => p.amount > 0);
    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const appliedToSale = Math.min(paidAmount, total);
    const overpayment = Math.max(0, paidAmount - total);
    const balance = Math.max(0, total - appliedToSale);
    const status = saleStatusFor(appliedToSale, total);
    const paymentStatus = paymentStatusFor(appliedToSale, total);

    // 5. Sale number.
    const now = Date.now();
    const dateString = getLocalDateString(now);
    const seq = await nextSequence(ctx, `sale_sequence_${args.branchId}`, dateString);
    const saleNumber = `${branch.code}-${dateString.replace(/-/g, "").slice(2)}-${String(seq).padStart(3, "0")}`;

    // 6. Session.
    const session = payments.some((p) => isCash(p.method))
      ? await resolveOpenSession(ctx, args.branchId, args.cashRegisterSessionId)
      : args.cashRegisterSessionId
        ? await ctx.db.get(args.cashRegisterSessionId)
        : null;
    if (payments.some((p) => isCash(p.method)) && !session) {
      throw new Error(
        "No open cash register session for this branch. Open the register before taking cash."
      );
    }

    // 7. Insert sale.
    const saleId = await ctx.db.insert("sales", {
      saleNumber,
      branchId: args.branchId,
      customerId: args.customerId,
      userId: actor._id,
      username: actor.username,
      status,
      subtotal,
      discount,
      tax,
      total,
      paidAmount: appliedToSale,
      balance,
      paymentStatus,
      cashRegisterSessionId: session?._id,
      isDelivery: args.isDelivery,
      deliveryFeeId: args.deliveryFeeId,
      deliveryFeeAmount: deliveryFeeAmount || undefined,
      customerName: customer.name,
      itemSummary: lines.map((l) => ({
        productVariantId: l.productVariantId,
        label: `${l.productName} — ${l.label}`,
        quantity: l.quantity,
      })),
      splitPayments: payments.length > 1 ? payments : undefined,
      createdAt: now,
      updatedAt: now,
    });

    // 8. Sale items + stock deduction (ledger is the source of truth).
    for (const l of lines) {
      await ctx.db.insert("saleItems", {
        saleId,
        productVariantId: l.productVariantId,
        productName: l.productName,
        variantLabel: l.label,
        sku: l.sku,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discount: l.discount,
        total: l.total,
        costPriceAtSale: l.costPriceAtSale,
      });
      await ctx.runMutation(internal.inventory.mutateStock, {
        productVariantId: l.productVariantId,
        branchId: args.branchId,
        quantity: -l.quantity,
        movementType: "SALE",
        referenceType: "sale",
        referenceId: saleId,
        notes: `Sale ${saleNumber}`,
        userId: actor._id,
        username: actor.username,
        allowNegative: allowNegSetting,
      });
    }

    // 9. Payment rows.
    for (const p of payments) {
      await ctx.db.insert("payments", {
        saleId,
        method: p.method,
        amount: p.amount,
        kind: "payment",
        createdAt: now,
      });
    }

    // 10. Cash movement.
    if (session) {
      const cashTotal = payments
        .filter((p) => isCash(p.method))
        .reduce((s, p) => s + p.amount, 0);
      if (cashTotal > 0) {
        await ctx.runMutation(internal.caixa.recordCashSale, {
          sessionId: session._id,
          userId: actor._id,
          username: actor.username,
          amount: cashTotal,
          saleId,
          saleNumber,
        });
      }
    }

    // 11. Overpayment → store credit.
    if (overpayment > 0 && !customer.isGeneric) {
      await adjustCustomerCredit(ctx, {
        customerId: args.customerId,
        delta: overpayment,
        reason: "OVERPAYMENT",
        referenceType: "sale",
        referenceId: saleId,
        userId: actor._id,
        username: actor.username,
        notes: `Overpayment on ${saleNumber}`,
      });
    }

    // 12. Metrics.
    const grossProfit = lines.reduce(
      (s, l) => s + (l.total - l.costPriceAtSale * l.quantity),
      0
    );
    const deltas: SaleMetricDeltas = {
      ...zeroDeltas(),
      totalRevenue: total,
      totalSales: 1,
      totalItemsSold: lines.reduce((s, l) => s + l.quantity, 0),
      totalDiscount: discount,
      totalTax: tax,
      totalProfit: grossProfit,
      totalPending: balance,
      cashCollected: payments
        .filter((p) => isCash(p.method))
        .reduce((s, p) => s + p.amount, 0),
      outstandingDebt: balance,
      fullyPaidCount: status === "COMPLETED" ? 1 : 0,
      partiallyPaidCount: status === "PARTIALLY_PAID" ? 1 : 0,
      pendingCount: status === "PENDING" ? 1 : 0,
      customerId: customer.isGeneric ? undefined : args.customerId,
      paymentMethods: {},
      categorySales: {},
      brandSales: {},
      productSales: {},
      sizeSales: {},
      colorSales: {},
    };
    for (const p of payments) {
      const k = sanitizeKey(p.method);
      deltas.paymentMethods![k] = deltas.paymentMethods![k] ?? { amount: 0, count: 0 };
      deltas.paymentMethods![k].amount += p.amount;
      deltas.paymentMethods![k].count += 1;
    }
    for (const l of lines) {
      deltas.categorySales![sanitizeKey(l.categoryName)] =
        (deltas.categorySales![sanitizeKey(l.categoryName)] ?? 0) + l.quantity;
      if (l.brandName)
        deltas.brandSales![sanitizeKey(l.brandName)] =
          (deltas.brandSales![sanitizeKey(l.brandName)] ?? 0) + l.quantity;
      deltas.productSales![sanitizeKey(l.productName)] =
        (deltas.productSales![sanitizeKey(l.productName)] ?? 0) + l.quantity;
      if (l.size)
        deltas.sizeSales![sanitizeKey(l.size)] =
          (deltas.sizeSales![sanitizeKey(l.size)] ?? 0) + l.quantity;
      if (l.color)
        deltas.colorSales![sanitizeKey(l.color)] =
          (deltas.colorSales![sanitizeKey(l.color)] ?? 0) + l.quantity;
    }
    await applyDailyMetrics(ctx, dateString, deltas);
    await applyTodayCounters(ctx, dateString, deltas);

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "sale.created",
      entityType: "sale",
      entityId: saleId,
      details: `${saleNumber} — total ${total.toFixed(2)}, paid ${appliedToSale.toFixed(2)}, ${lines.length} line(s)`,
    });

    return saleId;
  }
}

export const create = mutation({
  args: { token: v.string(), ...saleInputValidator },
  handler: async (ctx, args): Promise<Id<"sales">> => {
    const { token, ...rest } = args;
    const actor = await authorize(ctx, token, "pos.use");
    return await performSale(ctx, actor, rest);
  },
});

/** Internal entrypoint for exchanges / migrations. */
export const createInternal = internalMutation({
  args: {
    actingUserId: v.id("users"),
    ...saleInputValidator,
  },
  handler: async (ctx, args): Promise<Id<"sales">> => {
    const { actingUserId, ...rest } = args;
    const actor = await ctx.db.get(actingUserId);
    if (!actor) throw new Error("Acting user not found.");
    requirePermission(actor, "pos.use");
    return await performSale(ctx, actor, rest);
  },
});

// ─────────────────────────────────────────────
// CANCEL SALE (soft — reverses stock, keeps the row)
// ─────────────────────────────────────────────

export const cancel = mutation({
  args: { token: v.string(), saleId: v.id("sales"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "sales.cancel");
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found.");
    if (sale.status === "CANCELLED") throw new Error("Sale is already cancelled.");
    if (sale.status === "REFUNDED" || sale.status === "PARTIALLY_REFUNDED") {
      throw new Error("Cancel is not allowed after a return. Process a return instead.");
    }

    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();

    for (const it of items) {
      await ctx.runMutation(internal.inventory.mutateStock, {
        productVariantId: it.productVariantId,
        branchId: sale.branchId,
        quantity: it.quantity,
        movementType: "SALE_CANCELLATION",
        referenceType: "sale_cancellation",
        referenceId: args.saleId,
        notes: `Cancelled ${sale.saleNumber}: ${args.reason}`,
        userId: actor._id,
        username: actor.username,
      });
    }

    // Return cash taken, if a session is open.
    const cashPaid = (
      await ctx.db
        .query("payments")
        .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
        .collect()
    )
      .filter((p) => p.kind !== "refund" && isCash(p.method))
      .reduce((s, p) => s + p.amount, 0);
    if (cashPaid > 0) {
      const open = await ctx.db
        .query("cashRegisterSessions")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .collect();
      const session =
        open.find((s) => s.branchId === sale.branchId) ?? open.find((s) => !s.branchId);
      if (session) {
        await ctx.db.insert("cashRegisterMovements", {
          sessionId: session._id,
          userId: actor._id,
          username: actor.username,
          type: "refund",
          amount: cashPaid,
          description: `Cancellation refund — ${sale.saleNumber}`,
          saleId: args.saleId,
          createdAt: Date.now(),
        });
      }
      await ctx.db.insert("payments", {
        saleId: args.saleId,
        method: "Cash",
        amount: -cashPaid,
        kind: "refund",
        createdAt: Date.now(),
      });
    }

    await ctx.db.patch(args.saleId, {
      status: "CANCELLED",
      paymentStatus: "REFUNDED",
      balance: 0,
      updatedAt: Date.now(),
    });

    // Reverse the sale's metric contribution.
    const dateString = getLocalDateString(sale.createdAt);
    const grossProfit = items.reduce(
      (s, it) => s + (it.total - it.costPriceAtSale * it.quantity),
      0
    );
    await applyDailyMetrics(ctx, dateString, {
      ...zeroDeltas(),
      totalRevenue: -sale.total,
      totalSales: -1,
      totalItemsSold: -items.reduce((s, it) => s + it.quantity, 0),
      totalDiscount: -sale.discount,
      totalTax: -sale.tax,
      totalProfit: -grossProfit,
      totalPending: -sale.balance,
      outstandingDebt: -sale.balance,
      cashCollected: -cashPaid,
    });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "sale.cancelled",
      entityType: "sale",
      entityId: args.saleId,
      details: `${sale.saleNumber}: ${args.reason}`,
    });
  },
});

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const listRecent = query({
  args: { limit: v.optional(v.number()), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    let rows = await ctx.db
      .query("sales")
      .withIndex("by_created_at")
      .order("desc")
      .take((args.limit ?? 25) * (args.branchId ? 3 : 1));
    if (args.branchId) rows = rows.filter((s) => s.branchId === args.branchId);
    return rows.slice(0, args.limit ?? 25);
  },
});

export const listByRange = query({
  args: {
    start: v.number(),
    end: v.number(),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    let rows = await ctx.db
      .query("sales")
      .withIndex("by_created_at", (q) =>
        q.gte("createdAt", args.start).lte("createdAt", args.end)
      )
      .order("desc")
      .collect();
    if (args.branchId) rows = rows.filter((s) => s.branchId === args.branchId);
    return rows;
  },
});

export const listByCustomer = query({
  args: { customerId: v.id("customers"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const get = query({
  args: { id: v.id("sales") },
  handler: async (ctx, args) => {
    const sale = await ctx.db.get(args.id);
    if (!sale) return null;
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", args.id))
      .collect();
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_sale", (q) => q.eq("saleId", args.id))
      .collect();
    const customer = await ctx.db.get(sale.customerId);
    const branch = await ctx.db.get(sale.branchId);
    const returns = await ctx.db
      .query("salesReturns")
      .withIndex("by_sale", (q) => q.eq("saleId", args.id))
      .collect();
    return { ...sale, items, payments, customer, branch, returns };
  },
});
