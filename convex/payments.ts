import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOpenSession } from "./cashRegister";
import { settleSale } from "./lib/saleMoney";
import { paymentMethodValidator } from "./lib/paymentMethods";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { trackSale } from "./lib/salesMetrics";

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

    const metricsDone = await trackSale(ctx, args.saleId);
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
    await settleSale(ctx, args.saleId);
    await metricsDone();

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
