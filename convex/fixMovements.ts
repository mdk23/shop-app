import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export const backfillCashMovements = mutation({
  args: {
    startTime: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Calculate start of today in Mozambique timezone (UTC+2)
    const mozambiqueOffset = 2 * 60 * 60 * 1000;
    const nowLocal = new Date(Date.now() + mozambiqueOffset);
    const year = nowLocal.getUTCFullYear();
    const month = nowLocal.getUTCMonth();
    const day = nowLocal.getUTCDate();
    const startOfTodayLocal = Date.UTC(year, month, day);
    const startOfTodayTimestamp = startOfTodayLocal - mozambiqueOffset;

    const startTime = args.startTime ?? startOfTodayTimestamp;

    // 1. Fetch filtered orders using created_at index
    const filteredOrders = await ctx.db
      .query("orders")
      .withIndex("by_created_at", (q) => q.gte("createdAt", startTime))
      .collect();

    // 2. Fetch all cash register sessions
    const sessions = await ctx.db.query("cashRegisterSessions").collect();

    let addedCount = 0;
    let totalAddedAmount = 0;
    let linkedOrdersCount = 0;

    for (const order of filteredOrders) {
      // Fetch all payments for this order
      const orderPayments = await ctx.db
        .query("payments")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      const totalCashPaymentAmount = orderPayments
        .filter(p => p.method === "Cash")
        .reduce((sum, p) => sum + p.amount, 0);

      if (totalCashPaymentAmount <= 0) {
        continue;
      }

      // Fetch existing cash register movements for this order
      const existingMovements = await ctx.db
        .query("cashRegisterMovements")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      const totalMovementAmount = existingMovements
        .filter(m => m.type === "sale")
        .reduce((sum, m) => sum + m.amount, 0);

      const missingAmount = totalCashPaymentAmount - totalMovementAmount;

      if (missingAmount > 0.01) { // Avoid floating point issues
        // Find the session that was active when the order was created
        let matchedSession = sessions.find(s => 
          s.openedAt <= order.createdAt && 
          (s.closedAt === undefined || s.closedAt >= order.createdAt)
        );

        // Fallback 1: use order's existing cashRegisterSessionId
        if (!matchedSession && order.cashRegisterSessionId) {
          const s = await ctx.db.get(order.cashRegisterSessionId);
          if (s) matchedSession = s;
        }

        // Fallback 2: use the currently open session
        if (!matchedSession) {
          matchedSession = sessions.find(s => s.status === "open");
        }

        // Fallback 3: use the absolute latest session
        if (!matchedSession && sessions.length > 0) {
          const sortedSessions = [...sessions].sort((a, b) => b.openedAt - a.openedAt);
          matchedSession = sortedSessions[0];
        }

        if (!matchedSession) {
          console.log(`Could not find any session to record cash movement of ${missingAmount} MT for Order ${order.orderCode}`);
          continue;
        }

        // Fallback user details
        let userId = order.userId;
        let username = order.username;
        if (!userId || !username) {
          userId = matchedSession.userId;
          const sessionUser = await ctx.db.get(userId);
          username = sessionUser?.username || matchedSession.username || "system";
        }

        // Insert the missing movement
        await ctx.db.insert("cashRegisterMovements", {
          sessionId: matchedSession._id,
          userId: userId,
          username: username,
          type: "sale",
          amount: missingAmount,
          description: `Cash sale — Order #${order.orderCode || order._id.slice(-6).toUpperCase()} (Backfilled)`,
          orderId: order._id,
          createdAt: order.createdAt,
        });

        // Also update the order with the session ID if missing
        if (!order.cashRegisterSessionId) {
          await ctx.db.patch(order._id, {
            cashRegisterSessionId: matchedSession._id
          });
          linkedOrdersCount++;
        }

        addedCount++;
        totalAddedAmount += missingAmount;
      }
    }

    return {
      message: `Successfully backfilled ${addedCount} cash movements for a total of ${totalAddedAmount.toFixed(2)} MT and linked ${linkedOrdersCount} orders.`,
      addedCount,
      totalAddedAmount,
      linkedOrdersCount
    };
  },
});

export const revertBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    const movements = await ctx.db.query("cashRegisterMovements").collect();
    
    // Filter movements that contain "(Backfilled)" in description
    const backfilledMovements = movements.filter(m => 
      m.description && m.description.includes("(Backfilled)")
    );

    let deletedCount = 0;
    let revertedOrdersCount = 0;

    for (const movement of backfilledMovements) {
      if (movement.orderId) {
        const order = await ctx.db.get(movement.orderId);
        if (order && order.cashRegisterSessionId === movement.sessionId) {
          // Revert order linking
          await ctx.db.patch(order._id, {
            cashRegisterSessionId: undefined
          });
          revertedOrdersCount++;
        }
      }
      
      // Delete the movement
      await ctx.db.delete(movement._id);
      deletedCount++;
    }

    return {
      message: `Successfully reverted ${deletedCount} backfilled cash movements and reset ${revertedOrdersCount} order links.`,
      deletedCount,
      revertedOrdersCount
    };
  }
});

export const inspectTodaySales = query({
  args: {},
  handler: async (ctx) => {
    const mozambiqueOffset = 2 * 60 * 60 * 1000;
    const nowLocal = new Date(Date.now() + mozambiqueOffset);
    const startOfTodayTimestamp = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate()) - mozambiqueOffset;

    const todayOrders = await ctx.db
      .query("orders")
      .withIndex("by_created_at", (q) => q.gte("createdAt", startOfTodayTimestamp))
      .collect();

    const result = [];
    for (const order of todayOrders) {
      const payments = await ctx.db
        .query("payments")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      const movements = await ctx.db
        .query("cashRegisterMovements")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      result.push({
        orderCode: order.orderCode,
        paymentMethod: order.paymentMethod,
        total: order.total,
        amountPaid: order.amountPaid,
        splitPayments: order.splitPayments || [],
        paymentsTable: payments.map(p => ({ method: p.method, amount: p.amount })),
        movements: movements.map(m => ({ type: m.type, amount: m.amount, desc: m.description, session: m.sessionId })),
      });
    }
    return result;
  }
});
