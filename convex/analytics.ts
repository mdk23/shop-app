import { v } from "convex/values";
import { query } from "./_generated/server";
import { getLocalDateString } from "./metrics";

export const getDashboardMetrics = query({
  args: {
    start: v.number(),
    end: v.number(),
  },
  handler: async (ctx, args) => {
    const { start, end } = args;
    const rangeLength = end - start;
    const startForQuery = start - rangeLength;

    const startDateString = getLocalDateString(start);
    const endDateString = getLocalDateString(end);
    const prevStartDateString = getLocalDateString(startForQuery);

    // Fetch all daily metrics for the entire range (current + previous period)
    const metrics = await ctx.db
      .query("dailyMetrics")
      .withIndex("by_date", (q) =>
        q.gte("dateString", prevStartDateString).lte("dateString", endDateString)
      )
      .collect();

    // Split metrics into current and previous periods
    const currentMetrics = metrics.filter(
      (m) => m.dateString >= startDateString && m.dateString <= endDateString
    );
    const previousMetrics = metrics.filter(
      (m) => m.dateString >= prevStartDateString && m.dateString < startDateString
    );

    // 1. Current Period Aggregations
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
    const methodsBreakdown: Record<string, { amount: number; count: number }> = {
      "Cash": { amount: 0, count: 0 },
      "POS": { amount: 0, count: 0 },
      "M-Pesa": { amount: 0, count: 0 },
      "eMola": { amount: 0, count: 0 },
      "BIM": { amount: 0, count: 0 },
      "Moza": { amount: 0, count: 0 },
      "Store Credit": { amount: 0, count: 0 },
    };

    const productSalesMap: Record<string, number> = {};
    const categorySalesMap: Record<string, number> = {};

    for (const m of currentMetrics) {
      grossRevenue += m.grossRevenue;
      cashCollected += m.cashCollected;
      outstandingDebt += m.outstandingDebt;

      deliveryRevenue += m.deliveryRevenue;
      orderCount += m.orderCount;
      deliveryOrdersCount += m.deliveryOrdersCount;
      pickupOrdersCount += m.pickupOrdersCount;
      profileSalesCount += m.profileSalesCount;
      genericSalesCount += m.genericSalesCount;
      totalItemsSold += m.totalItemsSold;
      fullyPaidCount += m.fullyPaidCount;
      partiallyPaidCount += m.partiallyPaidCount;
      pendingCount += m.pendingCount;

      if (m.customerIds) {
        m.customerIds.forEach((cid) => customerIdsSet.add(cid));
      }

      if (m.paymentMethods) {
        for (const [method, info] of Object.entries(m.paymentMethods)) {
          if (methodsBreakdown[method]) {
            methodsBreakdown[method].amount += (info as any).amount;
            methodsBreakdown[method].count += (info as any).count;
          } else {
            methodsBreakdown[method] = {
              amount: (info as any).amount,
              count: (info as any).count,
            };
          }
        }
      }

      if (m.productSales) {
        for (const [prod, qty] of Object.entries(m.productSales)) {
          productSalesMap[prod] = (productSalesMap[prod] || 0) + (qty as number);
        }
      }

      if (m.categorySales) {
        for (const [cat, qty] of Object.entries(m.categorySales)) {
          categorySalesMap[cat] = (categorySalesMap[cat] || 0) + (qty as number);
        }
      }
    }

    // 2. Previous Period Aggregations
    let prevGrossRevenue = 0;
    for (const m of previousMetrics) {
      prevGrossRevenue += m.grossRevenue;
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

    // Keep response signature identical to original so frontend dashboard works unchanged
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
      fullyPaidValue: 0, // not used in UI, kept for signature compatibility
      pendingCount,
      pendingBalance: outstandingDebt, // maps to pendingBalance
      creditCount: pendingCount, // pending count maps to creditCount
      creditDebtValue: outstandingDebt, // maps to creditDebtValue

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
