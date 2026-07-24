import { v } from "convex/values";
import { query } from "./_generated/server";
import { getLocalDateString } from "./metrics";
import { Id } from "./_generated/dataModel";

export const getDashboardMetrics = query({
  args: {
    start: v.number(),
    end: v.number(),
    branchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { start, end, branchId } = args;
    const rangeLength = end - start;
    const startForQuery = start - rangeLength;

    // Fetch current period orders
    let currentOrders = await ctx.db
      .query("orders")
      .withIndex("by_created_at", (q) => q.gte("createdAt", start).lte("createdAt", end))
      .collect();

    // Fetch previous period orders for revenue growth calculation
    let previousOrders = await ctx.db
      .query("orders")
      .withIndex("by_created_at", (q) => q.gte("createdAt", startForQuery).lt("createdAt", start))
      .collect();

    // Filter by branch if specified and not "all"
    if (branchId && branchId !== "all") {
      const targetBranch = await ctx.db.get(branchId as Id<"branches">);
      const isDefaultBranch = targetBranch?.isDefault ?? false;

      currentOrders = currentOrders.filter((o) => {
        if (o.branchId === branchId) return true;
        if (!o.branchId && isDefaultBranch) return true;
        return false;
      });

      previousOrders = previousOrders.filter((o) => {
        if (o.branchId === branchId) return true;
        if (!o.branchId && isDefaultBranch) return true;
        return false;
      });
    }

    // 1. Current Period Aggregations
    let grossRevenue = 0;
    let cashCollected = 0;
    let outstandingDebt = 0;

    let deliveryRevenue = 0;
    let orderCount = currentOrders.length;
    let deliveryOrdersCount = 0;
    let pickupOrdersCount = 0;
    let profileSalesCount = 0;
    let genericSalesCount = 0;
    let totalItemsSold = 0;
    let fullyPaidCount = 0;
    let partiallyPaidCount = 0;
    let pendingCount = 0;

    const customerIdsSet = new Set<string>();
    const methodsBreakdown: Record<string, { amount: number; count: number }> = {
      "Cash": { amount: 0, count: 0 },
      "POS": { amount: 0, count: 0 },
      "M-Pesa": { amount: 0, count: 0 },
      "eMola": { amount: 0, count: 0 },
      "BIM": { amount: 0, count: 0 },
      "Moza": { amount: 0, count: 0 },
    };

    const productSalesMap: Record<string, number> = {};
    const categorySalesMap: Record<string, number> = {};

    for (const order of currentOrders) {
      if (order.status === "Cancelled") continue;

      grossRevenue += order.total;
      cashCollected += order.amountPaid;
      const debt = Math.max(0, order.total - order.amountPaid);
      outstandingDebt += debt;

      if (order.orderType === "delivery") {
        deliveryOrdersCount++;
        deliveryRevenue += order.deliveryFeeAmount || 0;
      } else {
        pickupOrdersCount++;
      }

      if (order.customerId) {
        customerIdsSet.add(order.customerId.toString());
        profileSalesCount++;
      } else {
        genericSalesCount++;
      }

      if (order.status === "Paid") {
        fullyPaidCount++;
      } else if (order.status === "Partially Paid") {
        partiallyPaidCount++;
      } else {
        pendingCount++;
      }

      // Process payment methods
      if (order.splitPayments && order.splitPayments.length > 0) {
        for (const p of order.splitPayments) {
          if (!methodsBreakdown[p.method]) {
            methodsBreakdown[p.method] = { amount: 0, count: 0 };
          }
          methodsBreakdown[p.method].amount += p.amount;
          methodsBreakdown[p.method].count += 1;
        }
      } else if (order.paymentMethod) {
        const pm = order.paymentMethod;
        if (!methodsBreakdown[pm]) {
          methodsBreakdown[pm] = { amount: 0, count: 0 };
        }
        methodsBreakdown[pm].amount += order.amountPaid;
        methodsBreakdown[pm].count += 1;
      }

      // Process item summary
      if (order.itemSummary) {
        for (const item of order.itemSummary) {
          totalItemsSold += item.quantity;
          productSalesMap[item.dishName] = (productSalesMap[item.dishName] || 0) + item.quantity;
        }
      }
    }

    // 2. Previous Period Aggregations
    let prevGrossRevenue = 0;
    for (const order of previousOrders) {
      if (order.status !== "Cancelled") {
        prevGrossRevenue += order.total;
      }
    }

    // 3. Derived Metrics
    let revenueGrowth = 0;
    if (prevGrossRevenue > 0) {
      revenueGrowth = ((grossRevenue - prevGrossRevenue) / prevGrossRevenue) * 100;
    } else if (grossRevenue > 0) {
      revenueGrowth = 100;
    }

    const collectedPercentage = grossRevenue > 0 ? (cashCollected / grossRevenue) * 100 : 0;
    const debtOrderCount = partiallyPaidCount + pendingCount;
    const completedTransactions = fullyPaidCount;
    const aov = orderCount > 0 ? grossRevenue / orderCount : 0;
    const avgItemsPerOrder = orderCount > 0 ? totalItemsSold / orderCount : 0;
    const avgDeliveryFee = deliveryOrdersCount > 0 ? deliveryRevenue / deliveryOrdersCount : 0;

    let paymentCount = 0;
    Object.values(methodsBreakdown).forEach((m) => {
      paymentCount += m.count;
    });

    const topProducts = Object.entries(productSalesMap)
      .map(([name, qty]) => ({
        name,
        qty,
        percentage: totalItemsSold > 0 ? (qty / totalItemsSold) * 100 : 0,
      }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);

    const categoryData = Object.entries(categorySalesMap)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    return {
      grossRevenue,
      orderCount,
      revenueGrowth,
      cashCollected,
      collectedPercentage,
      paymentCount,
      outstandingDebt,
      debtOrderCount,

      completedTransactions,
      aov,
      totalItemsSold,
      avgItemsPerOrder,
      activeCustomersCount: customerIdsSet.size,
      profileSalesCount,
      genericSalesCount,

      fullyPaidCount,
      fullyPaidValue: 0,
      pendingCount,
      pendingBalance: outstandingDebt,
      creditCount: pendingCount,
      creditDebtValue: outstandingDebt,

      paymentMethodsBreakdown: methodsBreakdown,
      topProducts,
      categoryData,
      deliveryRevenue,
      deliveryOrdersCount,
      pickupOrdersCount,
      avgDeliveryFee,
    };
  },
});
