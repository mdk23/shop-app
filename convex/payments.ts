import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { requireOpenSession } from "./cashRegister";
import { paymentMethodValidator } from "./lib/paymentMethods";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import {
  applyDailyMetrics,
  applyTodayCounters,
  getLocalDateString,
  sanitizeKey,
  zeroDeltas,
} from "./metrics";

const isCash = (m: string) => m === "CASH";

function paymentStatusFor(paid: number, total: number): Doc<"sales">["paymentStatus"] {
  if (paid <= 0) return "UNPAID";
  if (paid + 1e-6 >= total) return "PAID";
  return "PARTIALLY_PAID";
}

/** Recompute a sale's paidAmount/balance/paymentStatus from its payment rows. Returns before/after snapshot. */
async function recomputeSale(ctx: MutationCtx, saleId: Id<"sales">) {
  const sale = await ctx.db.get(saleId);
  if (!sale) throw new Error("Sale not found.");
  const rows = await ctx.db
    .query("payments")
    .withIndex("by_sale", (q) => q.eq("saleId", saleId))
    .collect();
  const netPaid = rows.reduce((s, p) => s + p.amount, 0); // refunds are negative
  const applied = Math.min(Math.max(0, netPaid), sale.total);
  const balance = Math.max(0, sale.total - applied);

  // A refund (from a return or a cancellation) is final for the payment state.
  const keepPaymentStatus =
    sale.paymentStatus === "REFUNDED" ||
    sale.paymentStatus === "PARTIALLY_REFUNDED" ||
    sale.status === "CANCELLED";
  const paymentStatus = keepPaymentStatus
    ? sale.paymentStatus
    : paymentStatusFor(applied, sale.total);

  await ctx.db.patch(saleId, {
    paidAmount: applied,
    balance,
    paymentStatus,
    updatedAt: Date.now(),
  });
  return { sale, before: { paidAmount: sale.paidAmount, balance: sale.balance } };
}

export const listBySale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .collect();
  },
});

export const add = mutation({
  args: {
    token: v.string(),
    saleId: v.id("sales"),
    method: paymentMethodValidator,
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    if (args.amount <= 0) throw new Error("Payment amount must be positive.");
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found.");
    if (sale.status === "CANCELLED")
      throw new Error("Cannot add a payment to a cancelled sale.");

    const now = Date.now();
    // Every payment goes through the branch's open register.
    const session = await requireOpenSession(ctx, sale.branchId);
    await ctx.db.insert("payments", {
      saleId: args.saleId,
      method: args.method,
      amount: args.amount,
      kind: "payment",
      cashRegisterSessionId: session._id,
      userId: actor._id,
      username: actor.username,
      createdAt: now,
    });
    await recomputeSale(ctx, args.saleId);

    const dateString = getLocalDateString(sale.createdAt);
    await applyDailyMetrics(ctx, dateString, {
      ...zeroDeltas(),
      cashCollected: isCash(args.method) ? args.amount : 0,
      outstandingDebt: -args.amount,
      totalPending: -args.amount,
      paymentMethods: { [sanitizeKey(args.method)]: { amount: args.amount, count: 1 } },
    });
    await applyTodayCounters(ctx, dateString, {
      ...zeroDeltas(),
      cashCollected: isCash(args.method) ? args.amount : 0,
      outstandingDebt: -args.amount,
      paymentMethods: { [sanitizeKey(args.method)]: { amount: args.amount, count: 1 } },
    });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "payment.added",
      entityType: "sale",
      entityId: args.saleId,
      details: `${args.method} ${args.amount} on ${sale.saleNumber}`,
    });
  },
});

export const remove = mutation({
  args: { token: v.string(), paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "payments.modify");
    const payment = await ctx.db.get(args.paymentId);
    if (!payment || !payment.saleId) throw new Error("Payment not found.");
    const sale = await ctx.db.get(payment.saleId);
    if (!sale) throw new Error("Sale not found.");

    await ctx.db.delete(args.paymentId);
    await recomputeSale(ctx, payment.saleId);

    const dateString = getLocalDateString(sale.createdAt);
    await applyDailyMetrics(ctx, dateString, {
      ...zeroDeltas(),
      cashCollected: isCash(payment.method) ? -payment.amount : 0,
      outstandingDebt: payment.amount,
      totalPending: payment.amount,
      paymentMethods: {
        [sanitizeKey(payment.method)]: { amount: -payment.amount, count: -1 },
      },
    });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "payment.removed",
      entityType: "sale",
      entityId: payment.saleId,
      details: `Removed ${payment.method} ${payment.amount} from ${sale.saleNumber}`,
    });
  },
});
