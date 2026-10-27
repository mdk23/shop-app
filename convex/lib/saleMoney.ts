import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { round2 } from "./fiscal";
import { userHasPermission } from "../permissions";
import { namedCustomer } from "../customers";

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

/** Money still held on a sale per method: what came in by it, less what went back by it. */
export function keptByMethod(rows: Doc<"payments">[]): Map<Doc<"payments">["method"], number> {
  const kept = new Map<Doc<"payments">["method"], number>();
  for (const p of rows) kept.set(p.method, round2((kept.get(p.method) ?? 0) + p.amount));
  return kept;
}

/**
 * Money goes back the way it came in: a refund by a method needs that method to still hold
 * the amount on the sale (goods bought with store credit go back as store credit, a card
 * sale is not paid out from the drawer). Store credit is always allowed for a named
 * customer — it moves no money — and never for the walk-in customer, who cannot spend it.
 * Any other method needs `returns.approve`.
 */
export async function assertRefundMethod(
  ctx: MutationCtx,
  actor: Doc<"users">,
  sale: Doc<"sales">,
  method: Doc<"payments">["method"],
  amount: number
) {
  if (amount <= 0) return;
  const customer = await namedCustomer(ctx, sale.customerId);
  if (method === "STORE_CREDIT") {
    if (!customer) {
      throw new Error("A sale without a customer cannot be refunded as store credit. Refund another way.");
    }
    return;
  }
  const rows = await ctx.db
    .query("payments")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .collect();
  const held = keptByMethod(rows).get(method) ?? 0;
  if (held + 0.005 >= amount) return;
  if (userHasPermission(actor, "returns.approve")) return;
  const paidWith = [...keptByMethod(rows).entries()]
    .filter(([, v]) => v > 0.005)
    .map(([m, v]) => `${m} ${v.toFixed(2)}`)
    .join(", ");
  throw new Error(
    `This sale was paid with ${paidWith || "nothing"}: a refund of ${amount.toFixed(2)} by ${method} needs a manager (returns.approve).`
  );
}
