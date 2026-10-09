import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { round2 } from "./fiscal";

/**
 * A sale's money, in one place. The sources are the sale's `total`, its returned goods
 * (salesReturnItems.refundAmount) and its `payments` rows (refunds are negative). The
 * sale's `paidAmount`, `balance` and `paymentStatus` are a cache of what is read here,
 * rewritten by `settleSale` whenever one of the sources changes.
 *
 *  - netTotal: what the customer bought and kept (total − returned goods; 0 once cancelled)
 *  - paid:     money kept against it (received − refunded, capped at netTotal — anything
 *              over was turned into store credit when it was paid)
 *  - balance:  what the customer still owes (netTotal − paid)
 */

export function paymentStatusFor(paid: number, total: number): Doc<"sales">["paymentStatus"] {
  if (paid <= 0) return "UNPAID";
  if (paid + 1e-6 >= total) return "PAID";
  return "PARTIALLY_PAID";
}

/** Value of the goods returned from a sale so far, across all its returns. */
export async function returnedValueOfSale(ctx: QueryCtx, saleId: Id<"sales">): Promise<number> {
  const returns = await ctx.db
    .query("salesReturns")
    .withIndex("by_sale", (q) => q.eq("saleId", saleId))
    .collect();
  let value = 0;
  for (const r of returns) {
    if (r.status !== "COMPLETED") continue;
    const items = await ctx.db
      .query("salesReturnItems")
      .withIndex("by_return", (q) => q.eq("returnId", r._id))
      .collect();
    value += items.reduce((s, i) => s + i.refundAmount, 0);
  }
  return round2(value);
}

export async function saleMoney(ctx: QueryCtx, sale: Doc<"sales">) {
  const rows = await ctx.db
    .query("payments")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect();
  const received = round2(rows.filter((p) => p.kind !== "refund").reduce((s, p) => s + p.amount, 0));
  const refunded = round2(rows.filter((p) => p.kind === "refund").reduce((s, p) => s - p.amount, 0));
  const returned = await returnedValueOfSale(ctx, sale._id);
  const netTotal = sale.status === "CANCELLED" ? 0 : round2(Math.max(0, sale.total - returned));
  const paid = round2(Math.min(Math.max(0, received - refunded), netTotal));
  const balance = round2(netTotal - paid);
  return { rows, received, refunded, returned, netTotal, paid, balance };
}

/**
 * How returned goods worth `value` are settled: first they cancel what the customer still
 * owes on the sale, and only the rest is money to give back. A customer who never paid
 * gets nothing back — the debt just goes away.
 */
export async function splitReturnValue(ctx: QueryCtx, sale: Doc<"sales">, value: number) {
  const { paid, balance } = await saleMoney(ctx, sale);
  const debtCleared = round2(Math.min(value, balance));
  const refund = round2(Math.min(Math.max(0, value - debtCleared), paid));
  return { debtCleared, refund };
}

/** Rewrites the sale's cached money fields from their sources. */
export async function settleSale(ctx: MutationCtx, saleId: Id<"sales">) {
  const sale = await ctx.db.get(saleId);
  if (!sale) throw new Error("Sale not found.");
  const money = await saleMoney(ctx, sale);
  let paymentStatus: Doc<"sales">["paymentStatus"];
  if (sale.status === "CANCELLED") {
    paymentStatus = money.refunded > 0 ? "REFUNDED" : sale.paymentStatus;
  } else if (money.balance > 0) {
    paymentStatus = paymentStatusFor(money.paid, money.netTotal);
  } else if (money.refunded > 0) {
    paymentStatus = sale.status === "RETURNED" ? "REFUNDED" : "PARTIALLY_REFUNDED";
  } else {
    // Nothing owed and nothing given back.
    paymentStatus = "PAID";
  }
  await ctx.db.patch(saleId, {
    paidAmount: money.paid,
    balance: money.balance,
    paymentStatus,
    updatedAt: Date.now(),
  });
  return {
    sale,
    before: { paidAmount: sale.paidAmount, balance: sale.balance },
    after: { paidAmount: money.paid, balance: money.balance, paymentStatus },
  };
}

/**
 * What one unit of a sale line cost the customer: the line after its share of the
 * sale-level discount, plus its IVA. Lines from before `netAmount` was stored get their
 * share of the discount back proportionally.
 */
export function unitValueOfLine(
  item: Doc<"saleItems">,
  sale: Doc<"sales">,
  saleItems: Doc<"saleItems">[]
): number {
  let net = item.netAmount;
  if (net === undefined) {
    const taxableBase = sale.total - sale.tax - (sale.deliveryFeeAmount ?? 0);
    const grossSum = saleItems.reduce((s, i) => s + i.total, 0);
    net = grossSum > 0 ? (item.total * taxableBase) / grossSum : 0;
  }
  return (net + (item.taxAmount ?? 0)) / item.quantity;
}
