import { MutationCtx } from "./_generated/server";


// ─────────────────────────────────────────────
// TIME / KEY HELPERS
// ─────────────────────────────────────────────

/** Local calendar date ("YYYY-MM-DD") adjusted for UTC+2 (Maputo). */
export function getLocalDateString(timestamp: number): string {
  const localTimeMs = timestamp + 2 * 60 * 60 * 1000;
  return new Date(localTimeMs).toISOString().split("T")[0];
}

/** Strip accents / non-ASCII so a string is a valid Convex record key. */
export function sanitizeKey(str: string): string {
  if (!str) return "Unknown";
  return str
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .trim() || "Unknown";
}

// ─────────────────────────────────────────────
// COUNTERS ENGINE
// ─────────────────────────────────────────────

export async function incrementCounter(
  ctx: MutationCtx,
  key: string,
  amount: number,
  dateString?: string
) {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  const now = Date.now();
  if (!existing) {
    await ctx.db.insert("counters", { key, value: amount, dateString, updatedAt: now });
    return;
  }
  if (dateString && existing.dateString !== dateString) {
    await ctx.db.patch(existing._id, { value: amount, dateString, updatedAt: now });
  } else {
    await ctx.db.patch(existing._id, { value: existing.value + amount, updatedAt: now });
  }
}

export async function decrementCounter(ctx: MutationCtx, key: string, amount: number) {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, {
      value: existing.value - amount,
      updatedAt: Date.now(),
    });
  }
}

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

export async function getCounter(ctx: MutationCtx, key: string): Promise<number> {
  const row = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  return row?.value ?? 0;
}

// ─────────────────────────────────────────────
// STOCK COUNTER HELPERS
// ─────────────────────────────────────────────

export async function syncGlobalStockCounters(
  ctx: MutationCtx,
  previousBalance: number,
  newBalance: number,
  reorderLevel: number
) {
  const prevOut = previousBalance <= 0;
  const newOut = newBalance <= 0;
  const prevLow = previousBalance > 0 && previousBalance <= reorderLevel;
  const newLow = newBalance > 0 && newBalance <= reorderLevel;

  if (prevOut !== newOut) {
    if (newOut) await incrementCounter(ctx, "out_of_stock_items", 1);
    else await decrementCounter(ctx, "out_of_stock_items", 1);
  }
  if (prevLow !== newLow) {
    if (newLow) await incrementCounter(ctx, "low_stock_items", 1);
    else await decrementCounter(ctx, "low_stock_items", 1);
  }
}

// ─────────────────────────────────────────────
// DAILY METRICS ENGINE (retail)
// ─────────────────────────────────────────────

type NumRecord = Record<string, number>;
type MethodRecord = Record<string, { amount: number; count: number }>;

export interface SaleMetricDeltas {
  totalRevenue: number;
  totalSales: number; // count of sales
  totalItemsSold: number;
  totalDiscount: number;
  totalTax: number;
  totalProfit: number;
  totalPending: number;
  cashCollected: number;
  outstandingDebt: number;
  totalReturns: number; // count of return transactions
  refundAmount: number;
  fullyPaidCount: number;
  partiallyPaidCount: number;
  pendingCount: number;
  customerId?: string;
  paymentMethods?: MethodRecord;
  categorySales?: NumRecord;
  brandSales?: NumRecord;
  productSales?: NumRecord;
  sizeSales?: NumRecord;
  colorSales?: NumRecord;
}

const ZERO: SaleMetricDeltas = {
  totalRevenue: 0,
  totalSales: 0,
  totalItemsSold: 0,
  totalDiscount: 0,
  totalTax: 0,
  totalProfit: 0,
  totalPending: 0,
  cashCollected: 0,
  outstandingDebt: 0,
  totalReturns: 0,
  refundAmount: 0,
  fullyPaidCount: 0,
  partiallyPaidCount: 0,
  pendingCount: 0,
};

export function zeroDeltas(): SaleMetricDeltas {
  return { ...ZERO };
}

async function getOrCreateDailyMetrics(ctx: MutationCtx, dateString: string) {
  const existing = await ctx.db
    .query("dailyMetrics")
    .withIndex("by_date", (q) => q.eq("dateString", dateString))
    .first();
  if (existing) return existing;
  const id = await ctx.db.insert("dailyMetrics", {
    dateString,
    totalRevenue: 0,
    totalSales: 0,
    totalItemsSold: 0,
    totalDiscount: 0,
    totalTax: 0,
    totalReturns: 0,
    refundAmount: 0,
    totalProfit: 0,
    totalPending: 0,
    cashCollected: 0,
    outstandingDebt: 0,
    paymentMethods: {},
    categorySales: {},
    brandSales: {},
    productSales: {},
    sizeSales: {},
    colorSales: {},
    customerIds: [],
  });
  return (await ctx.db.get(id))!;
}

function mergeNumRecord(base: NumRecord | undefined, delta: NumRecord | undefined): NumRecord {
  const out: NumRecord = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(delta ?? {})) {
    out[k] = (out[k] ?? 0) + v;
    if (out[k] === 0) delete out[k];
  }
  return out;
}

function mergeMethodRecord(base: MethodRecord | undefined, delta: MethodRecord | undefined): MethodRecord {
  const out: MethodRecord = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(delta ?? {})) {
    const cur = out[k] ?? { amount: 0, count: 0 };
    cur.amount += v.amount;
    cur.count += v.count;
    if (cur.amount === 0 && cur.count === 0) delete out[k];
    else out[k] = cur;
  }
  return out;
}

export async function applyDailyMetrics(
  ctx: MutationCtx,
  dateString: string,
  d: SaleMetricDeltas
) {
  const m = await getOrCreateDailyMetrics(ctx, dateString);
  const patch: Record<string, unknown> = {
    totalRevenue: (m.totalRevenue ?? 0) + d.totalRevenue,
    totalSales: (m.totalSales ?? 0) + d.totalSales,
    totalItemsSold: (m.totalItemsSold ?? 0) + d.totalItemsSold,
    totalDiscount: (m.totalDiscount ?? 0) + d.totalDiscount,
    totalTax: (m.totalTax ?? 0) + d.totalTax,
    totalProfit: (m.totalProfit ?? 0) + d.totalProfit,
    totalPending: (m.totalPending ?? 0) + d.totalPending,
    cashCollected: (m.cashCollected ?? 0) + d.cashCollected,
    outstandingDebt: (m.outstandingDebt ?? 0) + d.outstandingDebt,
    totalReturns: (m.totalReturns ?? 0) + d.totalReturns,
    refundAmount: (m.refundAmount ?? 0) + d.refundAmount,
    fullyPaidCount: (m.fullyPaidCount ?? 0) + d.fullyPaidCount,
    partiallyPaidCount: (m.partiallyPaidCount ?? 0) + d.partiallyPaidCount,
    pendingCount: (m.pendingCount ?? 0) + d.pendingCount,
    paymentMethods: mergeMethodRecord(m.paymentMethods, d.paymentMethods),
    categorySales: mergeNumRecord(m.categorySales, d.categorySales),
    brandSales: mergeNumRecord(m.brandSales, d.brandSales),
    productSales: mergeNumRecord(m.productSales, d.productSales),
    sizeSales: mergeNumRecord(m.sizeSales, d.sizeSales),
    colorSales: mergeNumRecord(m.colorSales, d.colorSales),
  };

  if (d.customerId) {
    const set = new Set(m.customerIds ?? []);
    if (d.totalSales > 0) set.add(d.customerId);
    patch.customerIds = Array.from(set);
  }

  await ctx.db.patch(m._id, patch);
}

// ─────────────────────────────────────────────
// LIVE "today_*" COUNTERS
// ─────────────────────────────────────────────

export async function applyTodayCounters(
  ctx: MutationCtx,
  dateString: string,
  d: SaleMetricDeltas
) {
  if (dateString !== getLocalDateString(Date.now())) return;
  await incrementCounter(ctx, "today_revenue", d.totalRevenue, dateString);
  await incrementCounter(ctx, "today_sales_count", d.totalSales, dateString);
  await incrementCounter(ctx, "today_items_sold", d.totalItemsSold, dateString);
  await incrementCounter(ctx, "today_discount", d.totalDiscount, dateString);
  await incrementCounter(ctx, "today_returns_count", d.totalReturns, dateString);
  await incrementCounter(ctx, "today_refund_amount", d.refundAmount, dateString);
  await incrementCounter(ctx, "today_cash_collected", d.cashCollected, dateString);
  await incrementCounter(ctx, "today_outstanding_debt", d.outstandingDebt, dateString);
  await incrementCounter(ctx, "today_gross_profit", d.totalProfit, dateString);
  for (const [method, info] of Object.entries(d.paymentMethods ?? {})) {
    await incrementCounter(ctx, `today_payment_${sanitizeKey(method)}`, info.amount, dateString);
  }
}
