import { v } from "convex/values";
import { internalMutation, MutationCtx } from "./_generated/server";
import { recordReturnMetrics, recordSaleMetrics } from "./lib/salesMetrics";
import { addStockRow } from "./lib/stockTotals";


// ─────────────────────────────────────────────
// TIME / KEY HELPERS
// ─────────────────────────────────────────────

/** Local calendar date ("YYYY-MM-DD") adjusted for UTC+2 (Maputo). */
export function getLocalDateString(timestamp: number): string {
  const localTimeMs = timestamp + 2 * 60 * 60 * 1000;
  return new Date(localTimeMs).toISOString().split("T")[0];
}

// ─────────────────────────────────────────────
// COUNTERS ENGINE
// ─────────────────────────────────────────────

/** Atomic O(1) sequence: bump `key` and return the new value. Daily-reset when `dateString` given. */
export async function nextSequence(
  ctx: MutationCtx,
  key: string,
  dateString?: string
): Promise<number> {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const now = Date.now();
  if (!existing) {
    await ctx.db.insert("counters", { key, value: 1, dateString, updatedAt: now });
    return 1;
  }
  if (dateString && existing.dateString !== dateString) {
    await ctx.db.patch(existing._id, { value: 1, dateString, updatedAt: now });
    return 1;
  }
  const value = existing.value + 1;
  await ctx.db.patch(existing._id, { value, updatedAt: now });
  return value;
}

// ─────────────────────────────────────────────
// TOTALS REBUILD (sales and stock)
// ─────────────────────────────────────────────

/**
 * Rebuilds `dailyMetrics` / `monthlyMetrics` from the sales and returns, a page at a time.
 * Run the phases in order, each until `isDone`, passing back `cursor`:
 * clearDaily → clearMonthly → sales → returns.
 *   npx convex run metrics:rebuildSalesMetrics '{"phase":"clearDaily","cursor":null}'
 */
export const rebuildSalesMetrics = internalMutation({
  args: {
    phase: v.union(
      v.literal("clearDaily"),
      v.literal("clearMonthly"),
      v.literal("sales"),
      v.literal("returns")
    ),
    cursor: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    const opts = { numItems: 100, cursor: args.cursor };
    let page;
    if (args.phase === "clearDaily") {
      page = await ctx.db.query("dailyMetrics").paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
    } else if (args.phase === "clearMonthly") {
      page = await ctx.db.query("monthlyMetrics").paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
    } else if (args.phase === "sales") {
      page = await ctx.db.query("sales").paginate(opts);
      for (const sale of page.page) await recordSaleMetrics(ctx, sale._id);
    } else {
      page = await ctx.db.query("salesReturns").paginate(opts);
      for (const ret of page.page) await recordReturnMetrics(ctx, ret._id);
    }
    return { processed: page.page.length, cursor: page.continueCursor, isDone: page.isDone };
  },
});

/**
 * Rebuilds `stockTotals` and every stock row's `status` from the stock rows, a page at a
 * time: phase "clear" then "rows", each until `isDone`.
 *   npx convex run metrics:rebuildStockTotals '{"phase":"clear","cursor":null}'
 */
export const rebuildStockTotals = internalMutation({
  args: { phase: v.union(v.literal("clear"), v.literal("rows")), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const opts = { numItems: 200, cursor: args.cursor };
    if (args.phase === "clear") {
      const page = await ctx.db.query("stockTotals").paginate(opts);
      for (const row of page.page) await ctx.db.delete(row._id);
      return { processed: page.page.length, cursor: page.continueCursor, isDone: page.isDone };
    }
    const page = await ctx.db.query("variantStock").paginate(opts);
    for (const row of page.page) await addStockRow(ctx, row);
    return { processed: page.page.length, cursor: page.continueCursor, isDone: page.isDone };
  },
});
