import { internalMutation, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getLocalDateString, sanitizeKey } from "./metrics";

export const ordersBackfill = internalMutation({
  args: {
    cursor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const BATCH_SIZE = 50;
    const { page, continueCursor, isDone } = await ctx.db
      .query("orders")
      .paginate({ cursor: args.cursor ?? null, numItems: BATCH_SIZE });

    let updatedCount = 0;

    for (const order of page) {
      if (order.itemSummary !== undefined && order.customerName !== undefined) {
        continue;
      }

      // Fetch customer
      const customer = await ctx.db.get(order.customerId);
      const customerName = customer ? customer.name : "Generic Client";

      // Fetch items
      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();

      const itemSummary = [];
      for (const item of items) {
        const dish = await ctx.db.get(item.dishId);
        itemSummary.push({
          dishId: item.dishId,
          dishName: dish ? dish.name : "Unknown Dish",
          quantity: item.quantity,
        });
      }

      await ctx.db.patch(order._id, {
        customerName,
        itemSummary,
      });

      updatedCount++;
    }

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.backfill.ordersBackfill, {
        cursor: continueCursor,
      });
    }

    return {
      isDone,
      continueCursor,
      updatedCount,
    };
  },
});

// ─────────────────────────────────────────────
// ANALYTICS BACKFILL & COUNTERS SEEDING
// ─────────────────────────────────────────────

export const runAnalyticsBackfill = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Delete all existing counters (safe to reset since they are transient daily sequences and status counters)
    const counters = await ctx.db.query("counters").collect();
    for (const c of counters) {
      await ctx.db.delete(c._id);
    }

    // 2. Delete all existing dailyMetrics to rebuild them from scratch
    const metrics = await ctx.db.query("dailyMetrics").collect();
    for (const m of metrics) {
      await ctx.db.delete(m._id);
    }

    // 3. Seed Global Counters: low_stock_items & out_of_stock_items
    const ingredients = await ctx.db.query("ingredients").collect();
    let lowStockCount = 0;
    let outOfStockCount = 0;
    for (const ing of ingredients) {
      if (ing.stockQuantity <= 0) {
        outOfStockCount++;
      } else if (ing.stockQuantity <= ing.lowStockThreshold) {
        lowStockCount++;
      }
    }
    
    await ctx.db.insert("counters", {
      key: "low_stock_items",
      value: lowStockCount,
      updatedAt: Date.now(),
    });
    await ctx.db.insert("counters", {
      key: "out_of_stock_items",
      value: outOfStockCount,
      updatedAt: Date.now(),
    });

    // 4. Rebuild Daily Metrics and Seed Today's Counters
    const allOrders = await ctx.db.query("orders").collect();
    const allDishes = await ctx.db.query("dishes").collect();
    
    // Map category details
    const categoryMap: Record<string, string> = {};
    allDishes.forEach((d) => {
      categoryMap[d._id] = d.category || "Chicken";
    });

    // Load waste logs
    const allWaste = await ctx.db.query("wasteLogs").collect();
    const wasteByDate: Record<string, { count: number; cost: number }> = {};
    for (const w of allWaste) {
      const dStr = getLocalDateString(w.createdAt);
      if (!wasteByDate[dStr]) {
        wasteByDate[dStr] = { count: 0, cost: 0 };
      }
      wasteByDate[dStr].count += 1;
      wasteByDate[dStr].cost += w.costImpact || 0;
    }

    // Group active orders by local date
    const ordersByDate: Record<string, typeof allOrders> = {};
    let unpaidOrdersCount = 0;

    for (const o of allOrders) {
      if (o.status === "Cancelled") continue;
      
      // Global active orders check
      if (o.status !== "Paid") {
        unpaidOrdersCount++;
      }

      const dStr = getLocalDateString(o.createdAt);
      if (!ordersByDate[dStr]) {
        ordersByDate[dStr] = [];
      }
      ordersByDate[dStr].push(o);
    }

    // Insert active orders global count
    await ctx.db.insert("counters", {
      key: "active_orders",
      value: unpaidOrdersCount,
      updatedAt: Date.now(),
    });

    const todayDateString = getLocalDateString(Date.now());
    let processedDaysCount = 0;

    for (const [dateString, dayOrders] of Object.entries(ordersByDate)) {
      let grossRevenue = 0;
      let cashCollected = 0;
      let outstandingDebt = 0;
      let deliveryRevenue = 0;
      let orderCount = 0;
      let deliveryOrdersCount = 0;
      let pickupOrdersCount = 0;
      let profileSalesCount = 0;
      let genericSalesCount = 0;
      let totalItemsSold = 0;
      let fullyPaidCount = 0;
      let partiallyPaidCount = 0;
      let pendingCount = 0;
      const customerIdsSet = new Set<string>();
      const paymentMethods: Record<string, { amount: number; count: number }> = {};
      const productSales: Record<string, number> = {};
      const categorySales: Record<string, number> = {};

      for (const o of dayOrders) {
        grossRevenue += o.total;
        cashCollected += Math.max(0, o.total - o.remainingAmount);
        outstandingDebt += o.remainingAmount;
        deliveryRevenue += o.deliveryFeeAmount || 0;
        orderCount += 1;
        
        if (o.orderType === "delivery") {
          deliveryOrdersCount += 1;
        } else {
          pickupOrdersCount += 1;
        }

        if (o.customerName !== "Generic Client" && o.customerName) {
          profileSalesCount += 1;
        } else {
          genericSalesCount += 1;
        }

        customerIdsSet.add(o.customerId);

        if (o.status === "Paid") {
          fullyPaidCount += 1;
        } else if (o.status === "Partially Paid") {
          partiallyPaidCount += 1;
        } else {
          pendingCount += 1;
        }

        // Split payments breakdown
        if (o.splitPayments && o.splitPayments.length > 0) {
          o.splitPayments.forEach((p: any) => {
            const method = p.method || "Cash";
            const sanitizedMethod = sanitizeKey(method);
            if (!paymentMethods[sanitizedMethod]) {
              paymentMethods[sanitizedMethod] = { amount: 0, count: 0 };
            }
            paymentMethods[sanitizedMethod].amount += p.amount;
            paymentMethods[sanitizedMethod].count += 1;
          });
        } else if (o.amountPaid > 0) {
          const method = o.paymentMethod || "Cash";
          const sanitizedMethod = sanitizeKey(method);
          if (!paymentMethods[sanitizedMethod]) {
            paymentMethods[sanitizedMethod] = { amount: 0, count: 0 };
          }
          paymentMethods[sanitizedMethod].amount += o.amountPaid;
          paymentMethods[sanitizedMethod].count += 1;
        }

        // Product sales and categories breakdown
        if (o.itemSummary) {
          for (const item of o.itemSummary) {
            totalItemsSold += item.quantity;
            const sanitizedDishName = sanitizeKey(item.dishName);
            productSales[sanitizedDishName] = (productSales[sanitizedDishName] || 0) + item.quantity;
            const dishId = item.dishId;
            const category = dishId ? (categoryMap[dishId] || "Chicken") : "Chicken";
            const sanitizedCategory = sanitizeKey(category);
            categorySales[sanitizedCategory] = (categorySales[sanitizedCategory] || 0) + item.quantity;
          }
        }
      }

      const waste = wasteByDate[dateString] || { count: 0, cost: 0 };

      // Insert daily metrics
      await ctx.db.insert("dailyMetrics", {
        dateString,
        grossRevenue,
        cashCollected,
        outstandingDebt,
        deliveryRevenue,
        orderCount,
        cancelledOrderCount: 0,
        deliveryOrdersCount,
        pickupOrdersCount,
        profileSalesCount,
        genericSalesCount,
        totalItemsSold,
        fullyPaidCount,
        partiallyPaidCount,
        pendingCount,
        wasteCount: waste.count,
        wasteCost: waste.cost,
        customerIds: Array.from(customerIdsSet),
        paymentMethods,
        productSales,
        categorySales,
      });

      // If the day processed is today, also seed today's live counters
      if (dateString === todayDateString) {
        await ctx.db.insert("counters", { key: "today_gross_revenue", value: grossRevenue, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_cash_collected", value: cashCollected, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_outstanding_debt", value: outstandingDebt, dateString, updatedAt: Date.now() });

        await ctx.db.insert("counters", { key: "today_delivery_revenue", value: deliveryRevenue, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_order_count", value: orderCount, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_delivery_orders_count", value: deliveryOrdersCount, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_pickup_orders_count", value: pickupOrdersCount, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_profile_sales_count", value: profileSalesCount, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_generic_sales_count", value: genericSalesCount, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_items_sold", value: totalItemsSold, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_fully_paid_count", value: fullyPaidCount, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_partially_paid_count", value: partiallyPaidCount, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "today_pending_count", value: pendingCount, dateString, updatedAt: Date.now() });
        await ctx.db.insert("counters", { key: "daily_order_sequence", value: orderCount, dateString, updatedAt: Date.now() });

        for (const [method, info] of Object.entries(paymentMethods)) {
          await ctx.db.insert("counters", {
            key: `today_payment_${method}`,
            value: info.amount,
            dateString,
            updatedAt: Date.now(),
          });
        }
      }

      processedDaysCount++;
    }

    return {
      status: "success",
      message: "Analytics backfill and counters seeding completed.",
      processedDaysCount,
    };
  },
});

export const removeDebtFields = mutation({
  args: {},
  handler: async (ctx) => {
    // Remove storeCreditBalance from all customers
    const customers = await ctx.db.query("customers").collect();
    for (const c of customers) {
      if ((c as any).storeCreditBalance !== undefined) {
        await ctx.db.patch(c._id, { storeCreditBalance: undefined } as any);
      }
    }

    // Remove debtSettled and storeCreditAdded from dailyMetrics
    const metrics = await ctx.db.query("dailyMetrics").collect();
    for (const m of metrics) {
      if ((m as any).debtSettled !== undefined || (m as any).storeCreditAdded !== undefined) {
        await ctx.db.patch(m._id, { debtSettled: undefined, storeCreditAdded: undefined } as any);
      }
    }

    // Remove previousDebt, debtSettled, storeCreditAdded from orders
    const orders = await ctx.db.query("orders").collect();
    for (const o of orders) {
      if ((o as any).previousDebt !== undefined || (o as any).debtSettled !== undefined || (o as any).storeCreditAdded !== undefined) {
        await ctx.db.patch(o._id, { previousDebt: undefined, debtSettled: undefined, storeCreditAdded: undefined } as any);
      }
    }
  },
});
