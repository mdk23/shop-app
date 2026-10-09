import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import {
  mutation,
  internalMutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize, requirePermission } from "./permissions";
import { writeAudit } from "./audit";
import { formatVariantLabel, variantNames } from "./lib/variantNames";
import { paymentMethodValidator, type PaymentMethod } from "./lib/paymentMethods";
import { requireOpenSession } from "./cashRegister";
import { assertCustomerCanBuy } from "./customers";
import { getLocalDateString } from "./metrics";
import { recordSaleMetrics, sumTotals, totalsByBranch, trackSale } from "./lib/salesMetrics";
import { adjustCustomerCredit } from "./customerCredits";
import { refreshCustomerProfile } from "./customerProfile";
import { currentNuit, round2 } from "./lib/fiscal";
import { nextDocumentNumber } from "./lib/numbering";
import { paymentStatusFor, saleMoney, settleSale } from "./lib/saleMoney";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

const isCash = (method: string) => method === "CASH";

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
    if (s && s.status === "OPEN") return s;
  }
  const open = await ctx.db
    .query("cashRegisterSessions")
    .withIndex("by_status", (q) => q.eq("status", "OPEN"))
    .collect();
  return open.find((s) => s.branchId === branchId) ?? open.find((s) => !s.branchId) ?? null;
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
  payments: v.optional(v.array(v.object({ method: paymentMethodValidator, amount: v.number() }))),
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
  payments?: { method: PaymentMethod; amount: number }[];
  /** Money already received for this sale (customer-order deposits). Linked, not copied. */
  priorPayments?: Doc<"payments">[];
  /**
   * The line prices were agreed earlier and already checked (a customer order being
   * collected). Otherwise a price other than the variant's selling price is a price
   * override and needs discount authority.
   */
  agreedPrices?: boolean;
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
    const defaultTaxPercent =
      args.taxRate ?? Number((await getSetting(ctx, "taxRatePercent"))?.value ?? "0") ?? 0;

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
      taxRateId?: Id<"taxRates">;
      taxPercent: number;
      net: number;
      taxAmount: number;
    }[] = [];

    // Price overrides: lines sold at a price other than the selling price, and how much
    // below it they went. Both count as discounts for the authority check.
    let overriddenLines = 0;
    let priceCut = 0;

    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantities must be positive.");
      if (item.unitPrice !== undefined && item.unitPrice < 0) {
        throw new Error("A price cannot be negative.");
      }
      const variant = await ctx.db.get(item.productVariantId);
      if (!variant || !variant.active)
        throw new Error("A selected product variant is unavailable.");
      const product = await ctx.db.get(variant.productId);
      if (!product) throw new Error("Parent product missing for a variant.");
      const category = await ctx.db.get(product.categoryId);
      const names = await variantNames(ctx, variant);
      const taxRate = product.taxRateId ? await ctx.db.get(product.taxRateId) : null;
      if (taxRate && !taxRate.active) {
        throw new Error(`The IVA rate on ${product.name} is inactive. Update the product before selling it.`);
      }

      const unitPrice = item.unitPrice ?? variant.sellingPrice;
      if (!args.agreedPrices && Math.abs(unitPrice - variant.sellingPrice) > 1e-6) {
        overriddenLines += 1;
        priceCut += Math.max(0, variant.sellingPrice - unitPrice) * item.quantity;
      }
      const lineDiscount = item.discount ?? 0;
      if (lineDiscount < 0) throw new Error("A discount cannot be negative.");
      const lineTotal = Math.max(0, unitPrice * item.quantity - lineDiscount);

      const stock = await ctx.db
        .query("variantStock")
        .withIndex("by_branch_and_variant", (q) =>
          q.eq("branchId", args.branchId).eq("productVariantId", item.productVariantId)
        )
        .unique();
      const holds = await ctx.db
        .query("stockHolds")
        .withIndex("by_branch_variant_status", (q) =>
          q
            .eq("branchId", args.branchId)
            .eq("productVariantId", item.productVariantId)
            .eq("status", "ACTIVE")
        )
        .collect();
      const reserved = holds.reduce((s, h) => s + h.quantity, 0);
      const available = (stock?.quantity ?? 0) - reserved;
      if (available < item.quantity && !allowNegSetting) {
        const reservedNote = reserved > 0 ? ` (${reserved} held for customer orders)` : "";
        throw new Error(
          `Insufficient stock for ${product.name} (${formatVariantLabel(names, variant.sku)}). Available: ${available}${reservedNote}, requested: ${item.quantity}.`
        );
      }

      lines.push({
        productVariantId: item.productVariantId,
        productName: product.name,
        label: formatVariantLabel(names, variant.sku),
        sku: variant.sku,
        quantity: item.quantity,
        unitPrice,
        discount: lineDiscount,
        total: lineTotal,
        costPriceAtSale: variant.costPrice,
        size: names.size,
        color: names.color,
        categoryName: category?.name ?? "Uncategorised",
        taxRateId: taxRate?._id,
        taxPercent: taxRate ? taxRate.percentage : defaultTaxPercent,
        net: 0,
        taxAmount: 0,
      });
    }

    // 2. Money.
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
    const lineDiscountTotal = lines.reduce((s, l) => s + l.discount, 0);
    const saleDiscount = Math.max(0, args.discount ?? 0);

    // Automatic tier discount — server-authoritative so it can't be forged
    // client-side, and kept out of the discount-authority check below since
    // it's never a cashier choice. Ships dark (settings default to
    // isActive:false / value:"0"), so this is a no-op until an admin opts in.
    const tier = customer.tier ?? "NOVO";
    const tierSettingKey =
      tier === "VIP"
        ? "tierDiscountPercentVIP"
        : tier === "REGULAR"
          ? "tierDiscountPercentREGULAR"
          : null;
    let tierDiscountPercent = 0;
    if (tierSettingKey) {
      const tierSetting = await getSetting(ctx, tierSettingKey);
      if (tierSetting?.isActive) tierDiscountPercent = Number(tierSetting.value ?? "0") || 0;
    }
    const manualDiscount = lineDiscountTotal + saleDiscount;
    const preTierBase = Math.max(0, subtotal - manualDiscount);
    const tierDiscountAmount =
      tierDiscountPercent > 0
        ? Math.round(preTierBase * (tierDiscountPercent / 100) * 100) / 100
        : 0;
    const discount = manualDiscount + tierDiscountAmount;

    // Sale-level discounts are spread across lines in proportion to their gross
    // value, so each line's IVA is computed on its own net amount. The last line
    // takes the rounding remainder, keeping the allocated total exact.
    const saleLevelDiscount = discount - lineDiscountTotal;
    const grossSum = lines.reduce((s, l) => s + l.total, 0);
    let allocated = 0;
    lines.forEach((l, i) => {
      const share =
        i === lines.length - 1
          ? round2(saleLevelDiscount - allocated)
          : grossSum > 0
            ? round2((saleLevelDiscount * l.total) / grossSum)
            : 0;
      allocated = round2(allocated + share);
      l.net = round2(Math.max(0, l.total - share));
      l.taxAmount = round2((l.net * l.taxPercent) / 100);
    });
    const taxableBase = round2(lines.reduce((s, l) => s + l.net, 0));
    const tax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));

    let deliveryFeeAmount = 0;
    if (args.deliveryFeeId) {
      const fee = await ctx.db.get(args.deliveryFeeId);
      deliveryFeeAmount = fee?.fee ?? 0;
    }

    const total = Math.max(0, taxableBase + tax + deliveryFeeAmount);

    // 3. Discount authority — the manual discounts plus any price overrides, measured
    // against the list-price value; the automatic tier discount is never a cashier
    // choice and can't trip this. Any changed price needs `sales.discount`.
    const cashierDiscount = manualDiscount + priceCut;
    const listSubtotal = subtotal + priceCut;
    const discountPct = listSubtotal > 0 ? (cashierDiscount / listSubtotal) * 100 : 0;
    const maxWithoutApproval = Number(
      (await getSetting(ctx, "discountMaxPercentWithoutApproval"))?.value ?? "100"
    );
    if (discountPct > maxWithoutApproval) {
      requirePermission(actor, "sales.discount_large");
    } else if (cashierDiscount > 0 || overriddenLines > 0) {
      requirePermission(actor, "sales.discount");
    }

    // 4. Payments: new money taken now, plus any already received (deposits).
    const newPayments = (args.payments ?? []).filter((p) => p.amount > 0);
    const priorPayments = args.priorPayments ?? [];
    const payments = [
      ...priorPayments.map((p) => ({ method: p.method, amount: p.amount })),
      ...newPayments,
    ];
    const paidAmount = payments.reduce((s, p) => s + p.amount, 0);
    const appliedToSale = Math.min(paidAmount, total);
    const overpayment = Math.max(0, paidAmount - total);
    const balance = Math.max(0, total - appliedToSale);
    // A rung-up sale is COMPLETED; whether it is paid is its paymentStatus.
    const status = "COMPLETED" as const;
    const paymentStatus = paymentStatusFor(appliedToSale, total);

    // 5. Sale number: the gapless fiscal number, the sale's only number.
    const now = Date.now();
    const saleNumber = await nextDocumentNumber(ctx, "SALE", now);

    // 6. Session: every payment goes through the branch's open register.
    const session =
      newPayments.length > 0
        ? (await resolveOpenSession(ctx, args.branchId, args.cashRegisterSessionId)) ??
          (await requireOpenSession(ctx, args.branchId))
        : null;

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
      isDelivery: args.isDelivery,
      deliveryFeeId: args.deliveryFeeId,
      deliveryFeeAmount: deliveryFeeAmount || undefined,
      tierDiscountAmount: tierDiscountAmount || undefined,
      customerNuit: await currentNuit(ctx, customer._id),
      customerName: customer.name,
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
        netAmount: l.net,
        taxRateId: l.taxRateId,
        taxRatePercent: l.taxPercent,
        taxAmount: l.taxAmount,
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

    // 9. Payment rows. Cash rows carry the register session: that is the drawer's record.
    // Money already received is linked to the sale rather than recorded again.
    for (const p of priorPayments) await ctx.db.patch(p._id, { saleId });
    for (const p of newPayments) {
      await ctx.db.insert("payments", {
        saleId,
        method: p.method,
        amount: p.amount,
        kind: "payment",
        cashRegisterSessionId: session?._id,
        userId: actor._id,
        username: actor.username,
        createdAt: now,
      });
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

    // 11.5. Recompute size profile + tier from history (includes this sale,
    // since its saleItems were just inserted above). Skipped for the
    // walk-in/generic customer inside the helper. Runs before metrics/audit
    // so a failure here can never leave a misleading "sale created" trail.
    await refreshCustomerProfile(ctx, args.customerId, {
      _id: actor._id,
      username: actor.username,
    });

    // 12. Sales totals (dashboard and reports).
    await recordSaleMetrics(ctx, saleId);

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "sale.created",
      entityType: "sale",
      entityId: saleId,
      details:
        `${saleNumber} — total ${total.toFixed(2)}, paid ${appliedToSale.toFixed(2)}, ${lines.length} line(s)` +
        (overriddenLines > 0
          ? `, price changed on ${overriddenLines} line(s) (${priceCut.toFixed(2)} below list)`
          : ""),
    });

    return saleId;
  }
}

export const create = mutation({
  args: { token: v.string(), ...saleInputValidator },
  handler: async (ctx, args): Promise<Id<"sales">> => {
    const { token, ...rest } = args;
    const actor = await authorize(ctx, token, "pos.use");
    // A new sale needs a customer who can buy. Exchanges and order collections reuse
    // performSale for business that already exists, so they are not checked.
    const customer = await ctx.db.get(rest.customerId);
    if (customer) assertCustomerCanBuy(customer);
    return await performSale(ctx, actor, rest);
  },
});

/** Internal entrypoint for exchanges. */
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
    if (sale.status === "RETURNED" || sale.status === "PARTIALLY_RETURNED") {
      throw new Error("Cancel is not allowed after a return. Process a return instead.");
    }

    const metricsDone = await trackSale(ctx, args.saleId);
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

    // Give back the money kept for the sale, by the method it came in: one refund row per
    // method, never more than that method brought in. Cash goes last, so money paid over
    // the total (already turned into store credit) is not handed back twice.
    const now = Date.now();
    const money = await saleMoney(ctx, sale);
    const keptByMethod = new Map<Doc<"payments">["method"], number>();
    for (const p of money.rows) {
      keptByMethod.set(p.method, (keptByMethod.get(p.method) ?? 0) + p.amount);
    }
    const methods = [...keptByMethod.keys()].sort(
      (a, b) => Number(isCash(a)) - Number(isCash(b))
    );
    let toRefund = money.paid;
    const refunds: { method: Doc<"payments">["method"]; amount: number }[] = [];
    for (const method of methods) {
      const amount = round2(Math.min(toRefund, keptByMethod.get(method) ?? 0));
      if (amount <= 0) continue;
      refunds.push({ method, amount });
      toRefund = round2(toRefund - amount);
    }
    // Money given back goes through the open register; store credit goes back on the
    // customer's credit balance.
    const session = refunds.some((r) => r.method !== "STORE_CREDIT")
      ? await requireOpenSession(ctx, sale.branchId)
      : null;
    for (const r of refunds) {
      if (r.method === "STORE_CREDIT") {
        await adjustCustomerCredit(ctx, {
          customerId: sale.customerId,
          delta: r.amount,
          reason: "RETURN_REFUND",
          referenceType: "sale_cancellation",
          referenceId: args.saleId,
          userId: actor._id,
          username: actor.username,
          notes: `Store credit back for cancelled ${sale.saleNumber}`,
        });
      }
      await ctx.db.insert("payments", {
        saleId: args.saleId,
        method: r.method,
        amount: -r.amount,
        kind: "refund",
        cashRegisterSessionId: r.method === "STORE_CREDIT" ? undefined : session?._id,
        userId: actor._id,
        username: actor.username,
        createdAt: now,
      });
    }

    await ctx.db.patch(args.saleId, { status: "CANCELLED", updatedAt: now });
    await settleSale(ctx, args.saleId);

    // Cancelling changes both this sale's size observations (now excluded,
    // being CANCELLED) and the customer's trailing spend — same invariant
    // as a normal sale/return.
    await refreshCustomerProfile(ctx, sale.customerId, {
      _id: actor._id,
      username: actor.username,
    });

    // The sale leaves the sales totals.
    await metricsDone();

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "sale.cancelled",
      entityType: "sale",
      entityId: args.saleId,
      details:
        `${sale.saleNumber}: ${args.reason}` +
        (refunds.length > 0
          ? ` — refunded ${refunds.map((r) => `${r.method} ${r.amount.toFixed(2)}`).join(", ")}`
          : ""),
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

const saleListFilters = {
  start: v.number(),
  end: v.number(),
  branchId: v.optional(v.id("branches")),
  status: v.optional(
    v.union(v.literal("COMPLETED"), v.literal("CANCELLED"), v.literal("RETURNED"), v.literal("PARTIALLY_RETURNED"))
  ),
  paymentStatus: v.optional(
    v.union(
      v.literal("PAID"),
      v.literal("PARTIALLY_PAID"),
      v.literal("UNPAID"),
      v.literal("REFUNDED"),
      v.literal("PARTIALLY_REFUNDED")
    )
  ),
};

type SaleListFilters = {
  start: number;
  end: number;
  branchId?: Id<"branches">;
  status?: Doc<"sales">["status"];
  paymentStatus?: Doc<"sales">["paymentStatus"];
};

/**
 * Sales in a date range, newest first, through the index that narrows them most (each
 * carries `createdAt`); a second filter, when one is picked as well, is applied by the
 * database as it reads that range.
 */
function salesInRange(ctx: QueryCtx, f: SaleListFilters) {
  const base = f.paymentStatus
    ? ctx.db
        .query("sales")
        .withIndex("by_payment_status", (q) =>
          q.eq("paymentStatus", f.paymentStatus!).gte("createdAt", f.start).lte("createdAt", f.end)
        )
    : f.status
      ? ctx.db
          .query("sales")
          .withIndex("by_status", (q) =>
            q.eq("status", f.status!).gte("createdAt", f.start).lte("createdAt", f.end)
          )
      : f.branchId
        ? ctx.db
            .query("sales")
            .withIndex("by_branch", (q) =>
              q.eq("branchId", f.branchId!).gte("createdAt", f.start).lte("createdAt", f.end)
            )
        : ctx.db
            .query("sales")
            .withIndex("by_created_at", (q) => q.gte("createdAt", f.start).lte("createdAt", f.end));
  const needsBranch = f.branchId && (f.paymentStatus || f.status);
  const needsStatus = f.status && f.paymentStatus;
  return (needsBranch || needsStatus
    ? base.filter((q) =>
        q.and(
          needsBranch ? q.eq(q.field("branchId"), f.branchId!) : true,
          needsStatus ? q.eq(q.field("status"), f.status!) : true
        )
      )
    : base
  ).order("desc");
}

/** The sales list, a page at a time. A search looks up sale numbers and customer names. */
export const listPaged = query({
  args: { ...saleListFilters, search: v.optional(v.string()), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const { search, paginationOpts, ...filters } = args;
    const term = search?.trim();
    if (!term) return await salesInRange(ctx, filters).paginate(paginationOpts);

    // Sale numbers ("FT 2026/000042") by prefix, or by their number alone ("42").
    const upper = term.toUpperCase();
    const byNumber = await ctx.db
      .query("sales")
      .withIndex("by_sale_number", (q) => q.gte("saleNumber", upper).lt("saleNumber", upper + "~"))
      .take(50);
    if (/^\d+$/.test(term)) {
      const year = getLocalDateString(args.end).slice(0, 4);
      const exact = await ctx.db
        .query("sales")
        .withIndex("by_sale_number", (q) => q.eq("saleNumber", `FT ${year}/${term.padStart(6, "0")}`))
        .unique();
      if (exact) byNumber.push(exact);
    }
    const byName = await ctx.db
      .query("sales")
      .withSearchIndex("search_customer", (q) => {
        let s = q.search("customerName", term);
        if (filters.branchId) s = s.eq("branchId", filters.branchId);
        if (filters.status) s = s.eq("status", filters.status);
        if (filters.paymentStatus) s = s.eq("paymentStatus", filters.paymentStatus);
        return s;
      })
      .take(50);
    const seen = new Set<string>();
    const page = [...byNumber, ...byName]
      .filter(
        (s) =>
          !seen.has(s._id) &&
          !!seen.add(s._id) &&
          s.createdAt >= args.start &&
          s.createdAt <= args.end &&
          (!filters.branchId || s.branchId === filters.branchId) &&
          (!filters.status || s.status === filters.status) &&
          (!filters.paymentStatus || s.paymentStatus === filters.paymentStatus)
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    return { page, isDone: true, continueCursor: "" };
  },
});

/** Every sale for the CSV export, on request (up to 5,000). */
export const listForExport = query({
  args: saleListFilters,
  handler: async (ctx, args) => await salesInRange(ctx, args).take(5000),
});

/** The period's totals for the sales page, from the daily/monthly sales totals. */
export const rangeTotals = query({
  args: { start: v.number(), end: v.number(), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const t = sumTotals(
      (
        await totalsByBranch(
          ctx,
          getLocalDateString(args.start),
          getLocalDateString(args.end),
          args.branchId
        )
      ).values()
    );
    return { count: t.salesCount, revenue: t.revenue, collected: t.collected, outstanding: t.outstanding };
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

/** Cursor-paginated sales history for one customer — powers the Ficha's unbounded Histórico tab. */
export const listByCustomerPaged = query({
  args: {
    customerId: v.id("customers"),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .paginate(args.paginationOpts);
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
