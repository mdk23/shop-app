import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOpenSession } from "./cashRegister";
import { saleMoney, settleSale } from "./lib/saleMoney";
import { settleTendered } from "./sales";
import { salePaymentMethodValidator } from "./lib/paymentMethods";
import { adjustCustomerCredit } from "./customerCredits";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { trackSale } from "./lib/salesMetrics";
import { namedCustomer } from "./customers";

export const listBySale = query({
  args: { token: v.string(), saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "sales.view");
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
    method: salePaymentMethodValidator,
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    if (args.amount <= 0) throw new Error("Payment amount must be positive.");
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found.");
    if (sale.status === "CANCELLED")
      throw new Error("Cannot add a payment to a cancelled sale.");
    // Only what is owed is taken; cash over it is change handed back.
    const owed = (await saleMoney(ctx, sale)).balance;
    if (owed <= 0) throw new Error("Nothing is owed on this sale.");
    const { payments: kept, change } = settleTendered(
      [{ method: args.method, amount: args.amount }],
      owed,
      false,
      true
    );
    const amount = kept[0].amount;

    const metricsDone = await trackSale(ctx, args.saleId);
    const now = Date.now();
    // Every payment goes through the branch's open register, except store credit, which is
    // taken off the customer's credit balance instead.
    const byCredit = args.method === "STORE_CREDIT";
    const session = byCredit ? null : await requireOpenSession(ctx, sale.branchId);
    if (byCredit) {
      const customer = await namedCustomer(ctx, sale.customerId);
      if (!customer) throw new Error("Store credit needs a named customer.");
      await adjustCustomerCredit(ctx, {
        customerId: customer._id,
        delta: -amount,
        reason: "REDEEMED_ON_SALE",
        referenceType: "sale",
        referenceId: args.saleId,
        userId: actor._id,
        username: actor.username,
        notes: `Paid ${sale.saleNumber} with store credit`,
      });
    }
    await ctx.db.insert("payments", {
      saleId: args.saleId,
      method: args.method,
      amount,
      kind: "payment",
      cashRegisterSessionId: session?._id,
      userId: actor._id,
      username: actor.username,
      createdAt: now,
    });
    await settleSale(ctx, args.saleId);
    await metricsDone();

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "payment.added",
      entityType: "sale",
      entityId: args.saleId,
      details: `${args.method} ${amount} on ${sale.saleNumber}${change > 0 ? ` (change ${change.toFixed(2)})` : ""}`,
    });
    return { recorded: amount, change };
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
    // Only a payment taken by mistake in a register that is still open can be removed: a
    // closed register's count is final, and refunds and store-credit transfers belong to
    // the return, exchange or cancellation that made them.
    if (payment.kind === "refund") {
      throw new Error("A refund belongs to its return or cancellation and cannot be removed.");
    }
    if (payment.method === "STORE_CREDIT") {
      throw new Error("A store-credit payment cannot be removed.");
    }
    if (sale.status === "CANCELLED") throw new Error("The sale is cancelled.");
    const session = payment.cashRegisterSessionId
      ? await ctx.db.get(payment.cashRegisterSessionId)
      : null;
    if (!session || session.status !== "OPEN") {
      throw new Error(
        "This payment is in a closed register session and can no longer be removed. Correct the sale with a return or a cancellation."
      );
    }

    const metricsDone = await trackSale(ctx, payment.saleId);
    await ctx.db.delete(args.paymentId);
    await settleSale(ctx, payment.saleId);
    await metricsDone();

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
