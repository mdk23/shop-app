import { authorize } from "./permissions";
import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { getLocalDateString } from "./metrics";
import { dayRows, sumTotals, totalsByBranch, totalsOf } from "./lib/salesMetrics";

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
// Everything here reads the sales totals (dailyMetrics / monthlyMetrics), never the sales
// themselves: a month is a handful of rows however busy the shop is.
// ─────────────────────────────────────────────

const localRange = (start: number, end: number) => ({
  from: getLocalDateString(start),
  to: getLocalDateString(end),
});

type Agg = { qty: number; revenue: number; profit: number };

/** Turns an id-keyed breakdown into named rows, biggest revenue first. */
async function namedRows(
  ctx: QueryCtx,
  map: Record<string, Agg>,
  limit?: number
): Promise<({ name: string } & Agg)[]> {
  const sorted = Object.entries(map).sort((a, b) => b[1].revenue - a[1].revenue);
  const picked = limit ? sorted.slice(0, limit) : sorted;
  return await Promise.all(
    picked.map(async ([id, agg]) => {
      const doc = (await ctx.db.get(id as Id<"products">)) as { name?: string } | null;
      return { name: doc?.name ?? "—", ...agg };
    })
  );
}

const topByQty = async (ctx: QueryCtx, map: Record<string, Agg>, n: number) =>
  (await namedRows(ctx, map))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, n)
    .map(({ name, qty }) => ({ name, qty }));

export const getDashboardMetrics = query({
  args: {
    token: v.string(),
    start: v.number(),
    end: v.number(),
    branchId: branchIdArg,
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "reports.view");
    const branchId = normalizeBranchId(args.branchId);
    const span = Math.max(1, args.end - args.start);
    const { from, to } = localRange(args.start, args.end);
    const prev = localRange(args.start - span, args.start - 1);

    // Every branch, for the leaderboard; the figures use the chosen one(s).
    const byBranch = await totalsByBranch(ctx, from, to);
    const t = sumTotals(
      [...byBranch.entries()].filter(([b]) => !branchId || b === branchId).map(([, x]) => x)
    );
    const previous = sumTotals((await totalsByBranch(ctx, prev.from, prev.to, branchId)).values());

    const revenueGrowth =
      previous.revenue > 0
        ? ((t.revenue - previous.revenue) / previous.revenue) * 100
        : t.revenue > 0
          ? 100
          : 0;

    const branchLeaderboard = branchId
      ? []
      : (
          await Promise.all(
            [...byBranch.entries()].map(async ([b, x]) => ({
              name: (await ctx.db.get(b))?.name ?? "?",
              revenue: x.revenue,
              sales: x.salesCount,
            }))
          )
        )
          .filter((r) => r.sales !== 0 || r.revenue !== 0)
          .sort((a, b) => b.revenue - a.revenue);

    return {
      grossRevenue: t.revenue,
      salesCount: t.salesCount,
      revenueGrowth,
      cashCollected: t.collected,
      collectedPercentage: t.revenue > 0 ? (t.collected / t.revenue) * 100 : 0,
      outstandingDebt: t.outstanding,
      discountTotal: t.discount,
      taxTotal: t.tax,
      grossProfit: t.profit,
      marginPercent: t.revenue > 0 ? (t.profit / t.revenue) * 100 : 0,
      itemsSold: t.itemsSold,
      avgSaleValue: t.salesCount > 0 ? t.revenue / t.salesCount : 0,
      avgItemsPerSale: t.salesCount > 0 ? t.itemsSold / t.salesCount : 0,
      activeCustomersCount: Object.keys(t.customers).length,
      fullyPaidCount: t.paidCount,
      partiallyPaidCount: t.partlyPaidCount,
      pendingCount: t.unpaidCount,
      returnsCount: t.returnsCount,
      refundAmount: t.returnValue,
      paymentMethodsBreakdown: t.paymentMethods,
      topProducts: await topByQty(ctx, t.products, 5),
      topCategories: await topByQty(ctx, t.categories, 5),
      topSizes: await topByQty(ctx, t.sizes, 5),
      topColors: await topByQty(ctx, t.colors, 5),
      branchLeaderboard,
    };
  },
});

// ─────────────────────────────────────────────
// LIGHTWEIGHT WIDGETS
// ─────────────────────────────────────────────

export const todaySnapshot = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "reports.view");
    const today = getLocalDateString(Date.now());
    // Today's totals are the day's rows, one per branch (none yet = nothing sold today).
    const t = sumTotals((await dayRows(ctx, today, today)).map(totalsOf));
    const stock = await stockTotalsFor(ctx);
    return {
      dateString: today,
      revenue: t.revenue,
      salesCount: t.salesCount,
      itemsSold: t.itemsSold,
      discount: t.discount,
      returnsCount: t.returnsCount,
      refundAmount: t.returnValue,
      grossProfit: t.profit,
      lowStockItems: stock.lowCount,
      outOfStockItems: stock.outCount,
    };
  },
});

export const salesTrend = query({
  args: {
    token: v.string(),
    start: v.number(),
    end: v.number(),
    branchId: branchIdArg,
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "reports.view");
    const { from, to } = localRange(args.start, args.end);
    const rows = await dayRows(ctx, from, to, normalizeBranchId(args.branchId));
    const buckets: Record<string, { revenue: number; sales: number }> = {};
    const add = (key: string, revenue: number, sales: number) => {
      const b = (buckets[key] = buckets[key] ?? { revenue: 0, sales: 0 });
      b.revenue += revenue;
      b.sales += sales;
    };
    // One day: by hour (Maputo time). Longer: by day.
    for (const row of rows) {
      if (from === to) {
        for (const [hour, h] of Object.entries(row.hours)) add(`${hour}:00`, h.revenue, h.sales);
      } else {
        add(row.dateString, row.revenue, row.salesCount);
      }
    }
    return Object.entries(buckets)
      .filter(([, b]) => b.sales !== 0 || b.revenue !== 0)
      .map(([label, b]) => ({ label, ...b }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
});

export const salesBreakdown = query({
  args: {
    token: v.string(),
    start: v.number(),
    end: v.number(),
    branchId: v.optional(v.union(v.id("branches"), v.literal("all"))),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "reports.view");
    const { from, to } = localRange(args.start, args.end);
    const t = sumTotals(
      (await totalsByBranch(ctx, from, to, normalizeBranchId(args.branchId))).values()
    );
    const withoutProfit = (rows: ({ name: string } & Agg)[]) =>
      rows.map(({ name, qty, revenue }) => ({ name, qty, revenue }));
    return {
      byCategory: withoutProfit(await namedRows(ctx, t.categories)),
      bySize: withoutProfit(await namedRows(ctx, t.sizes)),
      byColor: withoutProfit(await namedRows(ctx, t.colors)),
      byProduct: await namedRows(ctx, t.products),
    };
  },
});

export const customerDebt = query({
  args: {
    token: v.string(), branchId: v.optional(v.union(v.id("branches"), v.literal("all"))) },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "reports.view");
    const branchId = normalizeBranchId(args.branchId);
    const partlyPaid = await ctx.db
      .query("sales")
      .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "PARTIALLY_PAID"))
      .collect();
    const unpaid = await ctx.db
      .query("sales")
      .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "UNPAID"))
      .collect();
    const sales = [...partlyPaid, ...unpaid].filter(
      (s) =>
        s.status !== "CANCELLED" && (!branchId || s.branchId === branchId) && s.balance > 0
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
  args: {
    token: v.string(), branchId: branchIdArg },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "reports.view");
    const branchId = normalizeBranchId(args.branchId);
    // The running stock totals (lib/stockTotals.ts): one row per branch.
    const s = await stockTotalsFor(ctx, branchId);
    return {
      costValue: s.costValue,
      retailValue: s.retailValue,
      units: s.units,
      lowStockCount: s.lowCount,
      outOfStockCount: s.outCount,
    };
  },
});

/** Stock totals for one branch, or summed over all of them (one row per branch). */
async function stockTotalsFor(ctx: QueryCtx, branchId?: Id<"branches">) {
  const rows = branchId
    ? await ctx.db
        .query("stockTotals")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .collect()
    : await ctx.db.query("stockTotals").collect();
  return rows.reduce(
    (s, r) => ({
      units: s.units + r.units,
      costValue: s.costValue + r.costValue,
      retailValue: s.retailValue + r.retailValue,
      lowCount: s.lowCount + r.lowCount,
      outCount: s.outCount + r.outCount,
    }),
    { units: 0, costValue: 0, retailValue: 0, lowCount: 0, outCount: 0 }
  );
}
