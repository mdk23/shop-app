import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { branchIdArg, localRange, normalizeBranchId, stockTotalsFor } from "./analytics";
import { dayRows, sumTotals, totalsByBranch, type Totals } from "./lib/salesMetrics";
import { round2 } from "./lib/fiscal";

/**
 * Conhecimento Activo: what the sales, stock and requests say, compared with the period
 * before, with the alerts that cross a threshold. Every figure is read from its one
 * source — the sales totals (dailyMetrics / monthlyMetrics), the stock totals and the
 * demands — and nothing here is stored. Forecasts are labelled as such: a straight line
 * through the last six months, not a promise.
 */

const DAY = 24 * 60 * 60 * 1000;
// Alert thresholds.
const GROWTH_ALERT = 15; // % growth of a category over the previous period
const RETURNS_ALERT = 20; // % more returns than the previous period
const LOW_MARGIN = 15; // % margin under which a product is flagged
const INACTIVE_DAYS = 60;

const pct = (now: number, before: number) => (before > 0 ? round2(((now - before) / before) * 100) : null);
const marginPct = (revenue: number, profit: number) => (revenue > 0 ? round2((profit / revenue) * 100) : 0);

async function periodTotals(ctx: QueryCtx, start: number, end: number, branchId?: Id<"branches">): Promise<Totals> {
  const { from, to } = localRange(start, end);
  return sumTotals((await totalsByBranch(ctx, from, to, branchId)).values());
}

/** Demands created in [start, end], newest first (the table is read in creation order). */
async function demandsCreated(ctx: QueryCtx, start: number, end: number) {
  const rows: Doc<"demands">[] = [];
  for await (const d of ctx.db.query("demands").order("desc")) {
    if (d._creationTime < start) break;
    if (d._creationTime <= end) rows.push(d);
  }
  return rows;
}

const conversion = (rows: Doc<"demands">[]) => {
  if (rows.length === 0) return null;
  const won = rows.filter((d) => d.stage === "CONVERTED" || d.stage === "FULFILLED").length;
  return round2((won / rows.length) * 100);
};

/** A straight line through the points (least squares), extended `ahead` steps. */
function project(values: number[], ahead: number): number[] {
  const n = values.length;
  if (n < 2) return Array(ahead).fill(values[0] ?? 0);
  const mx = (n - 1) / 2;
  const my = values.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  values.forEach((y, x) => {
    num += (x - mx) * (y - my);
    den += (x - mx) ** 2;
  });
  const slope = den ? num / den : 0;
  return Array.from({ length: ahead }, (_, i) => Math.max(0, round2(my + slope * (n + i - mx))));
}

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

export const overview = query({
  args: { token: v.string(), start: v.number(), end: v.number(), branchId: branchIdArg },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "reports.view");
    const branchId = normalizeBranchId(args.branchId);
    const span = Math.max(DAY, args.end - args.start);
    const prevStart = args.start - span;
    const prevEnd = args.start - 1;

    const cur = await periodTotals(ctx, args.start, args.end, branchId);
    const prev = await periodTotals(ctx, prevStart, prevEnd, branchId);
    const stock = await stockTotalsFor(ctx, branchId);

    // ── KPIs ──
    const curDemands = await demandsCreated(ctx, args.start, args.end);
    const prevDemands = await demandsCreated(ctx, prevStart, prevEnd);
    const curConversion = conversion(curDemands);
    const prevConversion = conversion(prevDemands);
    // Units sold in the period for each unit in stock now.
    const rotation = (t: Totals) => (stock.units > 0 ? round2(t.itemsSold / stock.units) : null);
    const kpis = {
      revenue: { value: cur.revenue, change: pct(cur.revenue, prev.revenue) },
      activeCustomers: {
        value: Object.keys(cur.customers).length,
        change: pct(Object.keys(cur.customers).length, Object.keys(prev.customers).length),
      },
      conversion: {
        value: curConversion,
        changePoints: curConversion !== null && prevConversion !== null ? round2(curConversion - prevConversion) : null,
        requests: curDemands.length,
      },
      rotation: { value: rotation(cur), change: pct(cur.itemsSold, prev.itemsSold) },
    };

    // ── Sales and margin per day ──
    const { from, to } = localRange(args.start, args.end);
    // Branches added up per day; margin is profit over revenue before IVA.
    const daily = new Map<string, { revenue: number; net: number; profit: number }>();
    for (const r of await dayRows(ctx, from, to, branchId)) {
      const d = daily.get(r.dateString) ?? { revenue: 0, net: 0, profit: 0 };
      d.revenue += r.revenue;
      d.net += r.revenue - r.tax;
      d.profit += r.profit;
      daily.set(r.dateString, d);
    }
    const days = [...daily]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, d]) => ({ date, revenue: round2(d.revenue), marginPct: marginPct(d.net, d.profit) }));

    // ── Forecast: last 6 full months, a straight line 3 months ahead ──
    const now = new Date(args.end);
    const months: { month: string; revenue: number }[] = [];
    for (let i = 6; i >= 1; i--) {
      const first = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const last = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 12));
      const t = await periodTotals(ctx, first.getTime() + 12 * 60 * 60 * 1000, last.getTime(), branchId);
      months.push({ month: monthKey(first), revenue: round2(t.revenue) });
    }
    const forecastValues = project(months.map((m) => m.revenue), 3);
    const forecast = forecastValues.map((revenue, i) => ({
      month: monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + i, 1))),
      revenue,
    }));

    // ── Categories: growth over the previous period and open requests for them ──
    const openDemands = [
      ...(await ctx.db.query("demands").withIndex("by_stage", (q) => q.eq("stage", "OPEN")).take(2000)),
      ...(await ctx.db.query("demands").withIndex("by_stage", (q) => q.eq("stage", "PROCEEDING")).take(2000)),
    ];
    const demandByCategory = new Map<string, { count: number; value: number }>();
    for (const d of openDemands) {
      let categoryId: string | undefined = d.categoryId;
      if (!categoryId && d.productId) categoryId = (await ctx.db.get(d.productId))?.categoryId;
      if (!categoryId && d.productVariantId) {
        const variant = await ctx.db.get(d.productVariantId);
        if (variant) categoryId = (await ctx.db.get(variant.productId))?.categoryId;
      }
      if (!categoryId) continue;
      const e = demandByCategory.get(categoryId) ?? { count: 0, value: 0 };
      e.count += 1;
      e.value += d.estimatedValue ?? d.maxPrice ?? 0;
      demandByCategory.set(categoryId, e);
    }
    const categoryIds = new Set([...Object.keys(cur.categories), ...demandByCategory.keys()]);
    const categories = (
      await Promise.all(
        [...categoryIds].map(async (id) => {
          const c = cur.categories[id] ?? { qty: 0, revenue: 0, profit: 0 };
          const p = prev.categories[id] ?? { qty: 0, revenue: 0, profit: 0 };
          const doc = await ctx.db.get(id as Id<"categories">);
          const demand = demandByCategory.get(id) ?? { count: 0, value: 0 };
          return {
            categoryId: id,
            name: doc?.name ?? "—",
            qty: c.qty,
            revenue: round2(c.revenue),
            profit: round2(c.profit),
            marginPct: marginPct(c.revenue, c.profit),
            growth: pct(c.revenue, p.revenue),
            openRequests: demand.count,
            openRequestValue: round2(demand.value),
          };
        })
      )
    ).sort((a, b) => (b.growth ?? -Infinity) - (a.growth ?? -Infinity) || b.openRequestValue - a.openRequestValue);

    // ── Products ──
    // Best sellers by units, with the previous period's units for the trend.
    const topProducts = await Promise.all(
      Object.entries(cur.products)
        .sort((a, b) => b[1].qty - a[1].qty)
        .slice(0, 5)
        .map(async ([id, a]) => ({
          productId: id,
          name: (await ctx.db.get(id as Id<"products">))?.name ?? "—",
          qty: a.qty,
          revenue: round2(a.revenue),
          previousQty: prev.products[id]?.qty ?? 0,
        }))
    );
    const lowMarginProducts = Object.values(cur.products).filter(
      (a) => a.revenue > 0 && marginPct(a.revenue, a.profit) < LOW_MARGIN
    ).length;

    // ── Customers over the last 12 months ──
    const year = await periodTotals(ctx, args.end - 365 * DAY, args.end, branchId);
    const recent = await periodTotals(ctx, args.end - INACTIVE_DAYS * DAY, args.end, branchId);
    const spend = year.customerSpend ?? {};
    const topCustomers = await Promise.all(
      Object.entries(spend)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(async ([id, value]) => {
          const customer = await ctx.db.get(id as Id<"customers">);
          const last = await ctx.db
            .query("sales")
            .withIndex("by_customer", (q) => q.eq("customerId", id as Id<"customers">))
            .order("desc")
            .first();
          return {
            customerId: id,
            name: customer?.name ?? "—",
            purchases: year.customers[id] ?? 0,
            value: round2(value),
            lastPurchase: last?.createdAt ?? null,
            // Bought in the last 60 days too.
            recent: id in recent.customers,
          };
        })
    );
    const inactiveCustomers = Object.keys(year.customers).filter((id) => !(id in recent.customers)).length;

    // ── Alerts (only what crosses its threshold) and the insights that explain them ──
    // Text goes out as a phrase plus its values, so the page can translate it.
    type Phrase = { text: string; params?: Record<string, string | number> };
    type Alert = { kind: string; title: string; detail: Phrase; action: string; href: string; tone: "error" | "warning" | "info" | "success" };
    const alerts: Alert[] = [];
    const insights: Phrase[] = [];
    const growing = categories.find((c) => c.growth !== null && c.growth >= GROWTH_ALERT);
    if (stock.outCount + stock.lowCount > 0) {
      alerts.push({
        kind: "STOCK",
        title: "Critical stock",
        detail: { text: "{out} out of stock, {low} low", params: { out: stock.outCount, low: stock.lowCount } },
        action: "Restock",
        href: "/inventory",
        tone: "error",
      });
      insights.push({ text: "{out} product(s) are out of stock and {low} are below their reorder level.", params: { out: stock.outCount, low: stock.lowCount } });
    }
    const returnsChange = pct(cur.returnsCount, prev.returnsCount);
    if (cur.returnsCount > 0 && returnsChange !== null && returnsChange >= RETURNS_ALERT) {
      alerts.push({
        kind: "RETURNS",
        title: "More returns",
        detail: { text: "+{change}% on the previous period", params: { change: returnsChange } },
        action: "Analyse",
        href: "/returns",
        tone: "warning",
      });
    }
    if (inactiveCustomers > 0) {
      alerts.push({
        kind: "INACTIVE",
        title: "Inactive customers",
        detail: { text: "{count} bought in the last year but not in {days} days", params: { count: inactiveCustomers, days: INACTIVE_DAYS } },
        action: "Contact",
        href: "/customers",
        tone: "info",
      });
      insights.push({ text: "{count} customer(s) bought in the last 12 months but not in the last {days} days.", params: { count: inactiveCustomers, days: INACTIVE_DAYS } });
    }
    if (growing) {
      alerts.push({
        kind: "GROWTH",
        title: "Growing demand",
        detail: { text: "{name} +{growth}%", params: { name: growing.name, growth: growing.growth ?? 0 } },
        action: "Plan stock",
        href: "/procurement-planning",
        tone: "warning",
      });
      insights.unshift({ text: "{name} sales grew {growth}% on the previous period.", params: { name: growing.name, growth: growing.growth ?? 0 } });
    }
    if (lowMarginProducts > 0) {
      alerts.push({
        kind: "MARGIN",
        title: "Low margin",
        detail: { text: "{count} product(s) under {margin}% margin", params: { count: lowMarginProducts, margin: LOW_MARGIN } },
        action: "Review prices",
        href: "/products",
        tone: "success",
      });
    }
    if (kpis.conversion.changePoints !== null && kpis.conversion.changePoints !== 0) {
      insights.push({
        text:
          kpis.conversion.changePoints > 0
            ? "Requests turned into sales rose {points} points (now {now}%)."
            : "Requests turned into sales fell {points} points (now {now}%).",
        params: { points: Math.abs(kpis.conversion.changePoints), now: curConversion ?? 0 },
      });
    }
    // The commonest reason a request was lost, from the running counts.
    const reasons = await ctx.db
      .query("counters")
      .withIndex("by_key", (q) => q.gte("key", "demand_reason:").lt("key", "demand_reason:~"))
      .take(20);
    const lostTotal = reasons.reduce((s, r) => s + Math.max(0, r.value), 0);
    const topReason = [...reasons].sort((a, b) => b.value - a.value)[0];
    if (topReason && lostTotal > 0 && topReason.value > 0) {
      insights.push({
        text: "{share}% of lost requests were lost for this reason: {reason}.",
        params: { share: round2((topReason.value / lostTotal) * 100), reason: topReason.key.slice("demand_reason:".length) },
      });
    }

    return {
      period: { start: args.start, end: args.end, previousStart: prevStart, previousEnd: prevEnd },
      kpis,
      days,
      months,
      forecast,
      categories: categories.slice(0, 8),
      topProducts,
      topCustomers,
      alerts,
      insights: insights.slice(0, 5),
      // What the scenario simulator needs, per category with sales.
      scenarioBase: categories
        .filter((c) => c.revenue > 0)
        .map((c) => ({ categoryId: c.categoryId, name: c.name, qty: c.qty, revenue: c.revenue, profit: c.profit })),
    };
  },
});
