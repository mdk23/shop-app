import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { adjustPaymentMetrics } from "./metrics";

export const listByOrder = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
  },
});

export const remove = mutation({
  args: { paymentId: v.id("payments") },
  handler: async (ctx, args) => {
    // 1. Fetch the payment
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");

    // 2. Fetch the order
    const order = await ctx.db.get(payment.orderId);
    if (!order) throw new Error("Associated order not found");

    // 3. Handle cash register movement if this was a Cash payment
    if (payment.method === "Cash") {
      const caixaMovements = await ctx.db
        .query("cashRegisterMovements")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      // Find a "sale" movement that we can deduct this payment from
      const saleMovement = caixaMovements.find(m => m.type === "sale" && m.amount >= payment.amount);
      
      if (saleMovement) {
        const session = await ctx.db.get(saleMovement.sessionId);
        
        // If session is closed, adjusting expected cash downwards means difference (actual - expected) goes up
        if (session && session.status === "closed" && session.difference !== undefined) {
          await ctx.db.patch(session._id, {
            difference: session.difference + payment.amount
          });
        }

        // Either reduce the movement amount or delete it if it matches exactly
        if (saleMovement.amount === payment.amount) {
          await ctx.db.delete(saleMovement._id);
        } else {
          await ctx.db.patch(saleMovement._id, { amount: saleMovement.amount - payment.amount });
        }
      }
    }

    // 4. Adjust payment metrics for removal
    await adjustPaymentMetrics(ctx, order, payment.method, payment.amount, 0);

    // Delete the payment record
    await ctx.db.delete(args.paymentId);

    // 5. Update the order
    const remainingPayments = await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const newAmountPaid = remainingPayments.reduce((sum, p) => sum + p.amount, 0);
    const newRemainingAmount = Math.max(0, order.total - newAmountPaid);

    let newStatus = "Pending";
    if (newAmountPaid >= order.total) {
      newStatus = "Paid";
    } else if (newAmountPaid > 0) {
      newStatus = "Partially Paid";
    }

    // Handle splitPayments array update
    let updatedSplitPayments = order.splitPayments;
    if (updatedSplitPayments) {
      const index = updatedSplitPayments.findIndex(p => p.method === payment.method && p.amount === payment.amount);
      if (index !== -1) {
        updatedSplitPayments = [...updatedSplitPayments];
        updatedSplitPayments.splice(index, 1);
      }
    }

    let newMethod = order.paymentMethod;
    if (updatedSplitPayments && updatedSplitPayments.length > 0) {
      newMethod = updatedSplitPayments.length === 1 ? updatedSplitPayments[0].method : "Split";
    } else {
      newMethod = "Debt";
    }

    await ctx.db.patch(order._id, {
      amountPaid: newAmountPaid,
      remainingAmount: newRemainingAmount,
      status: newStatus,
      splitPayments: updatedSplitPayments,
      paymentMethod: newMethod,
    });


  },
});

export const add = mutation({
  args: {
    orderId: v.id("orders"),
    amount: v.number(),
    method: v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");

    const now = Date.now();

    // 1. Insert payment
    const newPaymentId = await ctx.db.insert("payments", {
      orderId: args.orderId,
      amount: args.amount,
      method: args.method,
      createdAt: now,
    });

    // 2. Update order totals
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const newAmountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const newRemainingAmount = Math.max(0, order.total - newAmountPaid);

    let newStatus = "Pending";
    if (newAmountPaid >= order.total) {
      newStatus = "Paid";
    } else if (newAmountPaid > 0) {
      newStatus = "Partially Paid";
    }

    let updatedSplitPayments = order.splitPayments || [];
    updatedSplitPayments.push({ method: args.method, amount: args.amount });

    let newMethod = "Debt";
    if (updatedSplitPayments.length === 1) {
      newMethod = updatedSplitPayments[0].method;
    } else if (updatedSplitPayments.length > 1) {
      newMethod = "Split";
    }

    // Adjust payment metrics for addition
    await adjustPaymentMetrics(ctx, order, args.method, 0, args.amount);

    await ctx.db.patch(args.orderId, {
      amountPaid: newAmountPaid,
      remainingAmount: newRemainingAmount,
      status: newStatus,
      splitPayments: updatedSplitPayments,
      paymentMethod: newMethod,
    });

    // 3. Handle cash register movement if this is a Cash payment
    if (args.method === "Cash") {
      const activeSession = await ctx.db
        .query("cashRegisterSessions")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .unique();
      if (!activeSession) {
        throw new Error("No active cash register session found. Please open the register first.");
      }

      let userId = order.userId;
      let username = order.username;
      if (!userId || !username) {
        userId = activeSession.userId;
        const sessionUser = await ctx.db.get(userId);
        username = sessionUser?.username || activeSession.username || "system";
      }

      await ctx.runMutation(internal.caixa.recordCashSale, {
        sessionId: activeSession._id,
        userId: userId,
        username: username,
        amount: args.amount,
        orderId: args.orderId,
        orderCode: order.orderCode,
      });

      if (!order.cashRegisterSessionId) {
        await ctx.db.patch(args.orderId, { cashRegisterSessionId: activeSession._id });
      }
    }

    
    return newPaymentId;
  },
});

export const update = mutation({
  args: {
    paymentId: v.id("payments"),
    amount: v.number(),
    method: v.string(),
  },
  handler: async (ctx, args) => {
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found");

    const order = await ctx.db.get(payment.orderId);
    if (!order) throw new Error("Associated order not found");

    // 1. Handle Cash Register Reversal for the OLD payment
    if (payment.method === "Cash") {
      const caixaMovements = await ctx.db
        .query("cashRegisterMovements")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      const saleMovement = caixaMovements.find(m => m.type === "sale" && m.amount >= payment.amount);
      if (saleMovement) {
        const session = await ctx.db.get(saleMovement.sessionId);
        if (session && session.status === "closed" && session.difference !== undefined) {
          await ctx.db.patch(session._id, {
            difference: session.difference + payment.amount
          });
        }
        if (saleMovement.amount === payment.amount) {
          await ctx.db.delete(saleMovement._id);
        } else {
          await ctx.db.patch(saleMovement._id, { amount: saleMovement.amount - payment.amount });
        }
      }
    }

    // 2. Update the payment record
    await ctx.db.patch(args.paymentId, {
      amount: args.amount,
      method: args.method,
    });

    // 3. Handle Cash Register Addition for the NEW payment
    if (args.method === "Cash") {
      const activeSession = await ctx.db
        .query("cashRegisterSessions")
        .withIndex("by_status", (q) => q.eq("status", "open"))
        .unique();
      if (!activeSession) {
        throw new Error("No active cash register session found. Please open the register first.");
      }

      let userId = order.userId;
      let username = order.username;
      if (!userId || !username) {
        userId = activeSession.userId;
        const sessionUser = await ctx.db.get(userId);
        username = sessionUser?.username || activeSession.username || "system";
      }

      await ctx.runMutation(internal.caixa.recordCashSale, {
        sessionId: activeSession._id,
        userId: userId,
        username: username,
        amount: args.amount,
        orderId: order._id,
        orderCode: order.orderCode,
      });

      if (!order.cashRegisterSessionId) {
        await ctx.db.patch(order._id, { cashRegisterSessionId: activeSession._id });
      }
    }

    // 4. Update order totals
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const newAmountPaid = payments.reduce((sum, p) => sum + p.amount, 0);
    const newRemainingAmount = Math.max(0, order.total - newAmountPaid);

    let newStatus = "Pending";
    if (newAmountPaid >= order.total) {
      newStatus = "Paid";
    } else if (newAmountPaid > 0) {
      newStatus = "Partially Paid";
    }

    // Rebuild split payments array
    const updatedSplitPayments = payments.map(p => ({ method: p.method, amount: p.amount }));

    let newMethod = "Debt";
    if (updatedSplitPayments.length === 1) {
      newMethod = updatedSplitPayments[0].method;
    } else if (updatedSplitPayments.length > 1) {
      newMethod = "Split";
    }

    // Adjust payment metrics for update
    if (payment.method !== args.method) {
      await adjustPaymentMetrics(ctx, order, payment.method, payment.amount, 0);
      await adjustPaymentMetrics(ctx, order, args.method, 0, args.amount);
    } else {
      await adjustPaymentMetrics(ctx, order, args.method, payment.amount, args.amount);
    }

    await ctx.db.patch(order._id, {
      amountPaid: newAmountPaid,
      remainingAmount: newRemainingAmount,
      status: newStatus,
      splitPayments: updatedSplitPayments,
      paymentMethod: newMethod,
    });


  },
});
