import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getLocalDateString } from "./metrics";
import { stockStatus } from "./stock";

// ─────────────────────────────────────────────
// BRANCH FILTER
// The client uses the sentinel string "all" to mean "every branch".
// Accept it in the validator and normalize it to `undefined`.
// ─────────────────────────────────────────────

const branchIdArg = v.optional(v.union(v.id("branches"), v.literal("all")));

function normalizeBranchId(
  branchId: Id<"branches"> | "all" | undefined
): Id<"branches"> | undefined {
  return !branchId || branchId === "all" ? undefined : branchId;
}

// ─────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────

async function salesInRange(
  ctx: QueryCtx,
  start: number,
  end: number,
  branchId?: Id<"branches">
): Promise<Doc<"sales">[]> {
  let rows = await ctx.db
    .query("sales")
    .withIndex("by_created_at", (q) =>
      q.gte("createdAt", start).lte("createdAt", end)
    )
    .collect();
  if (branchId) rows = rows.filter((s) => s.branchId === branchId);
  return rows;
}

export const getDashboardMetrics = query({
  args: {
    start: v.number(),
    end: v.number(),
    branchId: branchIdArg,
  },
  handler: async (ctx, args) => {
    const { start, end } = args;
    const branchId = normalizeBranchId(args.branchId);
    const span = Math.max(1, end - start);

    const current = (await salesInRange(ctx, start, end, branchId)).filter(
      (s) => s.status !== "CANCELLED"
    );
    const previous = (
      await salesInRange(ctx, start - span, start - 1, branchId)
    ).filter((s) => s.status !== "CANCELLED");

    const returns = (
      await ctx.db
        .query("salesReturns")
        .withIndex("by_created_at", (q) =>
          q.gte("createdAt", start).lte("createdAt", end)
        )
        .collect()
    ).filter((r) => !branchId || r.branchId === branchId);

    let grossRevenue = 0;
    let cashCollected = 0;
    let outstandingDebt = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    let itemsSold = 0;
    let grossProfit = 0;
    let fullyPaid = 0;
    let partiallyPaid = 0;
    let pending = 0;

    const customerIds = new Set<string>();
    const methods: Record<string, { amount: number; count: number }> = {};
    const productQty: Record<string, number> = {};
    const categoryQty: Record<string, number> = {};
    const brandQty: Record<string, number> = {};

    for (const sale of current) {
      grossRevenue += sale.total;
      cashCollected += sale.paidAmount;
      outstandingDebt += sale.balance;
      discountTotal += sale.discount;
      taxTotal += sale.tax;
      if (!(sale.customerName ?? "").toLowerCase().includes("walk-in"))
        customerIds.add(sale.customerId);

      if (sale.paymentStatus === "PAID") fullyPaid += 1;
      else if (sale.paymentStatus === "PARTIALLY_PAID") partiallyPaid += 1;
      else if (sale.paymentStatus === "UNPAID") pending += 1;

      const payments = await ctx.db
        .query("payments")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      for (const p of payments) {
        if (p.kind === "refund") continue;
        methods[p.method] = methods[p.method] ?? { amount: 0, count: 0 };
        methods[p.method].amount += p.amount;
        methods[p.method].count += 1;
      }

      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
        .collect();
      for (const it of items) {
        itemsSold += it.quantity;
        grossProfit += it.total - it.costPriceAtSale * it.quantity;
        productQty[it.productName] = (productQty[it.productName] ?? 0) + it.quantity;
        const variant = await ctx.db.get(it.productVariantId);
        const product = variant ? await ctx.db.get(variant.productId) : null;
        if (product) {
          const category = await ctx.db.get(product.categoryId);
          if (category)
            categoryQty[category.name] =
              (categoryQty[category.name] ?? 0) + it.quantity;
          if (product.brandId) {
            const brand = await ctx.db.get(product.brandId);
            if (brand)
              brandQty[brand.name] = (brandQty[brand.name] ?? 0) + it.quantity;
          }
        }
      }
    }

    const prevRevenue = previous.reduce((s, x) => s + x.total, 0);
    const revenueGrowth =
      prevRevenue > 0
        ? ((grossRevenue - prevRevenue) / prevRevenue) * 100
        : grossRevenue > 0
          ? 100
          : 0;

    const returnsCount = returns.length;
    const refundAmount = returns.reduce((s, r) => s + r.refundAmount, 0);
    const salesCount = current.length;

    const top = (rec: Record<string, number>, n: number) =>
      Object.entries(rec)
        .map(([name, qty]) => ({ name, qty }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, n);

    // Branch leaderboard (ignores the branch filter).
    const branchBoard: Record<string, { name: string; revenue: number; sales: number }> = {};
    if (!branchId) {
      const all = (await salesInRange(ctx, start, end)).filter(
        (s) => s.status !== "CANCELLED"
      );
      for (const s of all) {
        const key = s.branchId;
        if (!branchBoard[key]) {
          const b = await ctx.db.get(s.branchId);
          branchBoard[key] = { name: b?.name ?? "?", revenue: 0, sales: 0 };
        }
        branchBoard[key].revenue += s.total;
        branchBoard[key].sales += 1;
      }
    }

    return {
      grossRevenue,
      salesCount,
      revenueGrowth,
      cashCollected,
      collectedPercentage: grossRevenue > 0 ? (cashCollected / grossRevenue) * 100 : 0,
      outstandingDebt,
      discountTotal,
      taxTotal,
      grossProfit,
      marginPercent: grossRevenue > 0 ? (grossProfit / grossRevenue) * 100 : 0,
      itemsSold,
      avgSaleValue: salesCount > 0 ? grossRevenue / salesCount : 0,
      avgItemsPerSale: salesCount > 0 ? itemsSold / salesCount : 0,
      activeCustomersCount: customerIds.size,
      fullyPaidCount: fullyPaid,
      partiallyPaidCount: partiallyPaid,
      pendingCount: pending,
      returnsCount,
      refundAmount,
      paymentMethodsBreakdown: methods,
      topProducts: top(productQty, 5),
      topCategories: top(categoryQty, 5),
      topBrands: top(brandQty, 5),
      branchLeaderboard: Object.values(branchBoard).sort(
        (a, b) => b.revenue - a.revenue
      ),
    };
  },
});

// ─────────────────────────────────────────────
// LIGHTWEIGHT WIDGETS
// ─────────────────────────────────────────────

export const todaySnapshot = query({
  args: {},
  handler: async (ctx) => {
    const today = getLocalDateString(Date.now());
    const row = await ctx.db
      .query("dailyMetrics")
      .withIndex("by_date", (q) => q.eq("dateString", today))
      .first();
    const readCounter = async (key: string) => {
      const c = await ctx.db
        .query("counters")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      return c?.value ?? 0;
    };
    return {
      dateString: today,
      revenue: row?.totalRevenue ?? (await readCounter("today_revenue")),
      salesCount: row?.totalSales ?? (await readCounter("today_sales_count")),
      itemsSold: row?.totalItemsSold ?? (await readCounter("today_items_sold")),
      discount: row?.totalDiscount ?? (await readCounter("today_discount")),
      returnsCount: row?.totalReturns ?? (await readCounter("today_returns_count")),
      refundAmount: row?.refundAmount ?? (await readCounter("today_refund_amount")),
      grossProfit: row?.totalProfit ?? (await readCounter("today_gross_profit")),
      lowStockItems: await readCounter("low_stock_items"),
      outOfStockItems: await readCounter("out_of_stock_items"),
    };
  },
});

export const salesTrend = query({
  args: {
    start: v.number(),
    end: v.number(),
    branchId: branchIdArg,
  },
  handler: async (ctx, args) => {
    const rows = (
      await salesInRange(ctx, args.start, args.end, normalizeBranchId(args.branchId))
    ).filter((s) => s.status !== "CANCELLED");
    const singleDay = args.end - args.start <= 26 * 60 * 60 * 1000;
    const buckets: Record<string, { revenue: number; sales: number }> = {};
    for (const s of rows) {
      const key = singleDay
        ? `${String(new Date(s.createdAt).getHours()).padStart(2, "0")}:00`
        : getLocalDateString(s.createdAt);
      buckets[key] = buckets[key] ?? { revenue: 0, sales: 0 };
      buckets[key].revenue += s.total;
      buckets[key].sales += 1;
    }
    return Object.entries(buckets)
      .map(([label, v]) => ({ label, ...v }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
});

export const salesBreakdown = query({
  args: {
    start: v.number(),
    end: v.number(),
    branchId: v.optional(v.union(v.id("branches"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    const branchId = normalizeBranchId(args.branchId);
    const sales = (await salesInRange(ctx, args.start, args.end, branchId)).filter(
      (s) => s.status !== "CANCELLED"
    );
    const cat: Record<string, { qty: number; revenue: number }> = {};
    const brand: Record<string, { qty: number; revenue: number }> = {};
    const size: Record<string, { qty: number; revenue: number }> = {};
    const color: Record<string, { qty: number; revenue: number }> = {};
    const product: Record<string, { qty: number; revenue: number; profit: number }> = {};
    const bump = (
      rec: Record<string, { qty: number; revenue: number; profit?: number }>,
      key: string,
      qty: number,
      revenue: number,
      profit?: number
    ) => {
      const e = rec[key] ?? { qty: 0, revenue: 0, profit: 0 };
      e.qty += qty;
      e.revenue += revenue;
      if (profit !== undefined) e.profit = (e.profit ?? 0) + profit;
      rec[key] = e;
    };

    for (const s of sales) {
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", s._id))
        .collect();
      for (const it of items) {
        const profit = it.total - it.costPriceAtSale * it.quantity;
        bump(product, it.productName, it.quantity, it.total, profit);
        const variant = await ctx.db.get(it.productVariantId);
        if (variant) {
          if (variant.size) bump(size, variant.size, it.quantity, it.total);
          if (variant.color) bump(color, variant.color, it.quantity, it.total);
          const p = await ctx.db.get(variant.productId);
          if (p) {
            const c = await ctx.db.get(p.categoryId);
            if (c) bump(cat, c.name, it.quantity, it.total);
            if (p.brandId) {
              const b = await ctx.db.get(p.brandId);
              if (b) bump(brand, b.name, it.quantity, it.total);
            }
          }
        }
      }
    }

    const toRows = (r: Record<string, { qty: number; revenue: number; profit?: number }>) =>
      Object.entries(r)
        .map(([name, v2]) => ({ name, ...v2 }))
        .sort((a, b) => b.revenue - a.revenue);

    return {
      byCategory: toRows(cat),
      byBrand: toRows(brand),
      bySize: toRows(size),
      byColor: toRows(color),
      byProduct: toRows(product),
    };
  },
});

export const customerDebt = query({
  args: { branchId: v.optional(v.union(v.id("branches"), v.literal("all"))) },
  handler: async (ctx, args) => {
    const branchId = normalizeBranchId(args.branchId);
    let sales = await ctx.db
      .query("sales")
      .withIndex("by_status", (q) => q.eq("status", "PARTIALLY_PAID"))
      .collect();
    const pending = await ctx.db
      .query("sales")
      .withIndex("by_status", (q) => q.eq("status", "PENDING"))
      .collect();
    sales = [...sales, ...pending].filter(
      (s) => (!branchId || s.branchId === branchId) && s.balance > 0
    );
    const byCustomer: Record<string, { name: string; balance: number; sales: number }> = {};
    for (const s of sales) {
      const e = byCustomer[s.customerId] ?? {
        name: s.customerName ?? "Walk-in",
        balance: 0,
        sales: 0,
      };
      e.balance += s.balance;
      e.sales += 1;
      byCustomer[s.customerId] = e;
    }
    return Object.entries(byCustomer)
      .map(([customerId, v2]) => ({ customerId, ...v2 }))
      .sort((a, b) => b.balance - a.balance);
  },
});

export const inventoryValuation = query({
  args: { branchId: branchIdArg },
  handler: async (ctx, args) => {
    const branchId = normalizeBranchId(args.branchId);
    const stockRows = branchId
      ? await ctx.db
          .query("variantStock")
          .withIndex("by_branch", (q) => q.eq("branchId", branchId))
          .collect()
      : await ctx.db.query("variantStock").collect();
    let costValue = 0;
    let retailValue = 0;
    let units = 0;
    let low = 0;
    let out = 0;
    for (const row of stockRows) {
      const variant = await ctx.db.get(row.productVariantId);
      if (!variant || !variant.active) continue;
      units += row.quantity;
      costValue += row.quantity * variant.costPrice;
      retailValue += row.quantity * variant.sellingPrice;
      const status = stockStatus(
        row.quantity,
        row.reorderLevel ?? variant.reorderLevel
      );
      if (status === "LOW_STOCK") low += 1;
      else if (status === "OUT_OF_STOCK") out += 1;
    }
    return { costValue, retailValue, units, lowStockCount: low, outOfStockCount: out };
  },
});
