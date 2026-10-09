import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { getLocalDateString } from "../metrics";
import { round2 } from "./fiscal";

/**
 * Sales totals per branch per day (`dailyMetrics`) and per month (`monthlyMetrics`), so
 * the dashboard and reports read a few rows instead of every sale.
 *
 * The sales are the source of truth; these rows are their sum. A sale's share is always
 * worked out from the sale as it stands (its lines, payments and state), never from
 * hand-written increments: a new sale adds its share, and a change to a sale
 * (payment, cancellation, return) swaps its old share for its new one — see `trackSale`.
 * A sale counts on the day it was made; a return counts on the day it was made.
 */

type Agg = { qty: number; revenue: number; profit: number };
type MethodAgg = { amount: number; count: number };
type HourAgg = { revenue: number; sales: number };

export type Totals = {
  revenue: number;
  salesCount: number;
  itemsSold: number;
  discount: number;
  tax: number;
  profit: number;
  collected: number;
  outstanding: number;
  paidCount: number;
  partlyPaidCount: number;
  unpaidCount: number;
  returnsCount: number;
  returnValue: number;
  returnedItems: number;
  paymentMethods: Record<string, MethodAgg>;
  categories: Record<string, Agg>;
  products: Record<string, Agg>;
  sizes: Record<string, Agg>;
  colors: Record<string, Agg>;
  customers: Record<string, number>;
  hours: Record<string, HourAgg>;
};

const SCALARS = [
  "revenue",
  "salesCount",
  "itemsSold",
  "discount",
  "tax",
  "profit",
  "collected",
  "outstanding",
  "paidCount",
  "partlyPaidCount",
  "unpaidCount",
  "returnsCount",
  "returnValue",
  "returnedItems",
] as const;
const AGG_MAPS = ["categories", "products", "sizes", "colors"] as const;

export function emptyTotals(): Totals {
  return {
    revenue: 0,
    salesCount: 0,
    itemsSold: 0,
    discount: 0,
    tax: 0,
    profit: 0,
    collected: 0,
    outstanding: 0,
    paidCount: 0,
    partlyPaidCount: 0,
    unpaidCount: 0,
    returnsCount: 0,
    returnValue: 0,
    returnedItems: 0,
    paymentMethods: {},
    categories: {},
    products: {},
    sizes: {},
    colors: {},
    customers: {},
    hours: {},
  };
}

const isZero = (n: number) => Math.abs(n) < 0.005;

/** `into += sign × add`, dropping map entries that come back to zero. */
export function addTotals(into: Totals, add: Totals, sign: 1 | -1 = 1): Totals {
  for (const k of SCALARS) into[k] = round2(into[k] + sign * add[k]);
  for (const [k, a] of Object.entries(add.paymentMethods)) {
    const cur = into.paymentMethods[k] ?? { amount: 0, count: 0 };
    cur.amount = round2(cur.amount + sign * a.amount);
    cur.count += sign * a.count;
    if (isZero(cur.amount) && cur.count === 0) delete into.paymentMethods[k];
    else into.paymentMethods[k] = cur;
  }
  for (const m of AGG_MAPS) {
    for (const [k, a] of Object.entries(add[m])) {
      const cur = into[m][k] ?? { qty: 0, revenue: 0, profit: 0 };
      cur.qty += sign * a.qty;
      cur.revenue = round2(cur.revenue + sign * a.revenue);
      cur.profit = round2(cur.profit + sign * a.profit);
      if (cur.qty === 0 && isZero(cur.revenue) && isZero(cur.profit)) delete into[m][k];
      else into[m][k] = cur;
    }
  }
  for (const [k, n] of Object.entries(add.customers)) {
    const cur = (into.customers[k] ?? 0) + sign * n;
    if (cur === 0) delete into.customers[k];
    else into.customers[k] = cur;
  }
  for (const [k, h] of Object.entries(add.hours)) {
    const cur = into.hours[k] ?? { revenue: 0, sales: 0 };
    cur.revenue = round2(cur.revenue + sign * h.revenue);
    cur.sales += sign * h.sales;
    if (isZero(cur.revenue) && cur.sales === 0) delete into.hours[k];
    else into.hours[k] = cur;
  }
  return into;
}

function bump(map: Record<string, Agg>, key: string | undefined, qty: number, revenue: number, profit: number) {
  if (!key) return;
  const cur = map[key] ?? { qty: 0, revenue: 0, profit: 0 };
  cur.qty += qty;
  cur.revenue += revenue;
  cur.profit += profit;
  map[key] = cur;
}

type Slot = { branchId: Id<"branches">; dateString: string };

/** A sale's share of the totals, read from the sale as it stands. A cancelled sale has none. */
async function saleShare(ctx: QueryCtx, sale: Doc<"sales">): Promise<Totals> {
  const t = emptyTotals();
  if (sale.status === "CANCELLED") return t;
  t.revenue = sale.total;
  t.salesCount = 1;
  t.discount = sale.discount;
  t.tax = sale.tax;
  t.collected = sale.paidAmount;
  t.outstanding = sale.balance;
  if (sale.paymentStatus === "PAID") t.paidCount = 1;
  else if (sale.paymentStatus === "PARTIALLY_PAID") t.partlyPaidCount = 1;
  else if (sale.paymentStatus === "UNPAID") t.unpaidCount = 1;

  const items = await ctx.db
    .query("saleItems")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect();
  for (const it of items) {
    const lineRevenue = it.netAmount ?? it.total;
    const lineProfit = lineRevenue - it.costPriceAtSale * it.quantity;
    t.itemsSold += it.quantity;
    t.profit += lineProfit;
    const variant = await ctx.db.get(it.productVariantId);
    if (!variant) continue;
    const product = await ctx.db.get(variant.productId);
    bump(t.products, variant.productId, it.quantity, lineRevenue, lineProfit);
    bump(t.categories, product?.categoryId, it.quantity, lineRevenue, lineProfit);
    bump(t.sizes, variant.sizeId, it.quantity, lineRevenue, lineProfit);
    bump(t.colors, variant.colorId, it.quantity, lineRevenue, lineProfit);
  }

  const payments = await ctx.db
    .query("payments")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect();
  for (const p of payments) {
    if (p.kind === "refund") continue;
    const cur = t.paymentMethods[p.method] ?? { amount: 0, count: 0 };
    cur.amount += p.amount;
    cur.count += 1;
    t.paymentMethods[p.method] = cur;
  }

  const customer = await ctx.db.get(sale.customerId);
  if (customer && !customer.isGeneric) t.customers[sale.customerId] = 1;
  const hour = new Date(sale.createdAt + 2 * 60 * 60 * 1000).getUTCHours();
  t.hours[String(hour).padStart(2, "0")] = { revenue: sale.total, sales: 1 };
  return addTotals(emptyTotals(), t); // rounds
}

/** A return's share: counted on the day it was made. */
async function returnShare(ctx: QueryCtx, ret: Doc<"salesReturns">): Promise<Totals> {
  const t = emptyTotals();
  if (ret.status !== "COMPLETED") return t;
  const items = await ctx.db
    .query("salesReturnItems")
    .withIndex("by_return", (q) => q.eq("returnId", ret._id))
    .collect();
  t.returnsCount = 1;
  t.returnValue = items.reduce((s, i) => s + i.refundAmount, 0);
  t.returnedItems = items.reduce((s, i) => s + i.quantity, 0);
  return addTotals(emptyTotals(), t);
}

const monthOf = (dateString: string) => dateString.slice(0, 7);

async function applyToRows(ctx: MutationCtx, slot: Slot, delta: Totals, sign: 1 | -1) {
  const now = Date.now();
  const day = await ctx.db
    .query("dailyMetrics")
    .withIndex("by_branch_and_date", (q) =>
      q.eq("branchId", slot.branchId).eq("dateString", slot.dateString)
    )
    .unique();
  if (day) {
    const { _id, _creationTime, dateString, branchId, updatedAt, ...current } = day;
    await ctx.db.patch(_id, { ...addTotals(current, delta, sign), updatedAt: now });
  } else {
    await ctx.db.insert("dailyMetrics", {
      dateString: slot.dateString,
      branchId: slot.branchId,
      ...addTotals(emptyTotals(), delta, sign),
      updatedAt: now,
    });
  }

  const month = monthOf(slot.dateString);
  const mrow = await ctx.db
    .query("monthlyMetrics")
    .withIndex("by_branch_and_month", (q) => q.eq("branchId", slot.branchId).eq("month", month))
    .unique();
  if (mrow) {
    const { _id, _creationTime, month: _m, branchId, updatedAt, ...current } = mrow;
    await ctx.db.patch(_id, { ...addTotals(current, delta, sign), updatedAt: now });
  } else {
    await ctx.db.insert("monthlyMetrics", {
      month,
      branchId: slot.branchId,
      ...addTotals(emptyTotals(), delta, sign),
      updatedAt: now,
    });
  }
}

const saleSlot = (sale: Doc<"sales">): Slot => ({
  branchId: sale.branchId,
  dateString: getLocalDateString(sale.createdAt),
});

/** Adds a new sale to the totals. */
export async function recordSaleMetrics(ctx: MutationCtx, saleId: Id<"sales">) {
  const sale = await ctx.db.get(saleId);
  if (!sale) return;
  await applyToRows(ctx, saleSlot(sale), await saleShare(ctx, sale), 1);
}

/** Adds a new return to the totals. */
export async function recordReturnMetrics(ctx: MutationCtx, returnId: Id<"salesReturns">) {
  const ret = await ctx.db.get(returnId);
  if (!ret) return;
  await applyToRows(
    ctx,
    { branchId: ret.branchId, dateString: getLocalDateString(ret.createdAt) },
    await returnShare(ctx, ret),
    1
  );
}

/**
 * Call before changing an existing sale; call the returned function after. The sale's old
 * share comes off the totals and its new share goes on.
 */
export async function trackSale(ctx: MutationCtx, saleId: Id<"sales">) {
  const before = await ctx.db.get(saleId);
  const beforeShare = before ? await saleShare(ctx, before) : emptyTotals();
  return async () => {
    const after = await ctx.db.get(saleId);
    if (!before || !after) return;
    const delta = addTotals(await saleShare(ctx, after), beforeShare, -1);
    await applyToRows(ctx, saleSlot(after), delta, 1);
  };
}

// ─────────────────────────────────────────────
// READING
// ─────────────────────────────────────────────

type MetricsRow = Doc<"dailyMetrics"> | Doc<"monthlyMetrics">;

function totalsOf(row: MetricsRow): Totals {
  const t = emptyTotals();
  for (const k of SCALARS) t[k] = row[k];
  t.paymentMethods = row.paymentMethods;
  for (const m of AGG_MAPS) t[m] = row[m];
  t.customers = row.customers;
  t.hours = row.hours;
  return t;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDayOf = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`;
};
const nextMonth = (month: string) => {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
};

/** The day rows from `from` to `to` (local dates, inclusive), for one branch or all. */
export async function dayRows(
  ctx: QueryCtx,
  from: string,
  to: string,
  branchId?: Id<"branches">
): Promise<Doc<"dailyMetrics">[]> {
  return branchId
    ? await ctx.db
        .query("dailyMetrics")
        .withIndex("by_branch_and_date", (q) =>
          q.eq("branchId", branchId).gte("dateString", from).lte("dateString", to)
        )
        .collect()
    : await ctx.db
        .query("dailyMetrics")
        .withIndex("by_date", (q) => q.gte("dateString", from).lte("dateString", to))
        .collect();
}

/**
 * Totals per branch for the local dates `from`–`to`. Whole months are read from their
 * month row; the days at either end from their day rows — a year is about 12 rows per
 * branch, not 365 or every sale.
 */
export async function totalsByBranch(
  ctx: QueryCtx,
  from: string,
  to: string,
  branchId?: Id<"branches">
): Promise<Map<Id<"branches">, Totals>> {
  const rows: MetricsRow[] = [];
  for (let month = monthOf(from); month <= monthOf(to); month = nextMonth(month)) {
    const first = `${month}-01`;
    const last = lastDayOf(month);
    if (from <= first && to >= last) {
      rows.push(
        ...(branchId
          ? await ctx.db
              .query("monthlyMetrics")
              .withIndex("by_branch_and_month", (q) => q.eq("branchId", branchId).eq("month", month))
              .collect()
          : await ctx.db
              .query("monthlyMetrics")
              .withIndex("by_month", (q) => q.eq("month", month))
              .collect())
      );
    } else {
      rows.push(...(await dayRows(ctx, from > first ? from : first, to < last ? to : last, branchId)));
    }
  }
  const out = new Map<Id<"branches">, Totals>();
  for (const row of rows) {
    out.set(row.branchId, addTotals(out.get(row.branchId) ?? emptyTotals(), totalsOf(row)));
  }
  return out;
}

export function sumTotals(totals: Iterable<Totals>): Totals {
  const out = emptyTotals();
  for (const t of totals) addTotals(out, t);
  return out;
}

export { totalsOf };
