import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Helper to get local date string adjusted for UTC+2 (Mozambique/Maputo time)
export function getLocalDateString(timestamp: number): string {
  const localTimeMs = timestamp + 7200000;
  return new Date(localTimeMs).toISOString().split("T")[0];
}

// Helper to sanitize database keys to satisfy Convex's ASCII constraints
export function sanitizeKey(str: string): string {
  if (!str) return "Unknown";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_\-\s]/g, "");
}

// ─────────────────────────────────────────────
// CORE COUNTERS ENGINE
// ─────────────────────────────────────────────

export async function incrementCounter(
  ctx: MutationCtx,
  key: string,
  amount: number,
  dateString?: string
) {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  const now = Date.now();

  if (!existing) {
    await ctx.db.insert("counters", {
      key,
      value: amount,
      dateString,
      updatedAt: now,
    });
  } else {
    if (dateString && existing.dateString !== dateString) {
      // Date has changed, reset daily counter
      await ctx.db.patch(existing._id, {
        value: amount,
        dateString,
        updatedAt: now,
      });
    } else {
      await ctx.db.patch(existing._id, {
        value: existing.value + amount,
        updatedAt: now,
      });
    }
  }
}

export async function decrementCounter(ctx: MutationCtx, key: string, amount: number) {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();

  if (existing) {
    await ctx.db.patch(existing._id, {
      value: existing.value - amount,
      updatedAt: Date.now(),
    });
  }
}

// ─────────────────────────────────────────────
// STOCK COUNTER HELPERS
// ─────────────────────────────────────────────

export async function syncGlobalStockCounters(
  ctx: MutationCtx,
  previousBalance: number,
  newBalance: number,
  lowStockThreshold: number
) {
  const prevOutOfStock = previousBalance <= 0;
  const newOutOfStock = newBalance <= 0;
  
  const prevLowStock = previousBalance > 0 && previousBalance <= lowStockThreshold;
  const newLowStock = newBalance > 0 && newBalance <= lowStockThreshold;

  // Sync out of stock items count
  if (prevOutOfStock !== newOutOfStock) {
    if (newOutOfStock) {
      await incrementCounter(ctx, "out_of_stock_items", 1);
    } else {
      await decrementCounter(ctx, "out_of_stock_items", 1);
    }
  }

  // Sync low stock items count
  if (prevLowStock !== newLowStock) {
    if (newLowStock) {
      await incrementCounter(ctx, "low_stock_items", 1);
    } else {
      await decrementCounter(ctx, "low_stock_items", 1);
    }
  }
}

// ─────────────────────────────────────────────
// DAILY METRICS ENGINE
// ─────────────────────────────────────────────

interface MetricDeltas {
  grossRevenue: number;
  cashCollected: number;
  outstandingDebt: number;

  deliveryRevenue: number;
  orderCount: number;
  cancelledOrderCount: number;
  deliveryOrdersCount: number;
  pickupOrdersCount: number;
  profileSalesCount: number;
  genericSalesCount: number;
  totalItemsSold: number;
  fullyPaidCount: number;
  partiallyPaidCount: number;
  pendingCount: number;
  wasteCount: number;
  wasteCost: number;
  customerId?: string;
  paymentMethodsDeltas?: Record<string, { amount: number; count: number }>;
  productSalesDeltas?: Record<string, number>;
  categorySalesDeltas?: Record<string, number>;
}

async function getOrCreateDailyMetrics(ctx: MutationCtx, dateString: string) {
  const existing = await ctx.db
    .query("dailyMetrics")
    .withIndex("by_date", (q) => q.eq("dateString", dateString))
    .first();

  if (existing) return existing;

  const newId = await ctx.db.insert("dailyMetrics", {
    dateString,
    grossRevenue: 0,
    cashCollected: 0,
    outstandingDebt: 0,

    deliveryRevenue: 0,
    orderCount: 0,
    cancelledOrderCount: 0,
    deliveryOrdersCount: 0,
    pickupOrdersCount: 0,
    profileSalesCount: 0,
    genericSalesCount: 0,
    totalItemsSold: 0,
    fullyPaidCount: 0,
    partiallyPaidCount: 0,
    pendingCount: 0,
    wasteCount: 0,
    wasteCost: 0,
    customerIds: [],
    paymentMethods: {},
    productSales: {},
    categorySales: {},
  });

  return (await ctx.db.get(newId))!;
}

export async function applyMetricsDeltas(
  ctx: MutationCtx,
  dateString: string,
  deltas: MetricDeltas,
  changeType: "create" | "remove"
) {
  const metric = await getOrCreateDailyMetrics(ctx, dateString);

  // Update primitive totals
  const updatedFields: Partial<typeof metric> = {
    grossRevenue: metric.grossRevenue + deltas.grossRevenue,
    cashCollected: metric.cashCollected + deltas.cashCollected,
    outstandingDebt: metric.outstandingDebt + deltas.outstandingDebt,

    deliveryRevenue: metric.deliveryRevenue + deltas.deliveryRevenue,
    orderCount: metric.orderCount + deltas.orderCount,
    cancelledOrderCount: metric.cancelledOrderCount + deltas.cancelledOrderCount,
    deliveryOrdersCount: metric.deliveryOrdersCount + deltas.deliveryOrdersCount,
    pickupOrdersCount: metric.pickupOrdersCount + deltas.pickupOrdersCount,
    profileSalesCount: metric.profileSalesCount + deltas.profileSalesCount,
    genericSalesCount: metric.genericSalesCount + deltas.genericSalesCount,
    totalItemsSold: metric.totalItemsSold + deltas.totalItemsSold,
    fullyPaidCount: metric.fullyPaidCount + deltas.fullyPaidCount,
    partiallyPaidCount: metric.partiallyPaidCount + deltas.partiallyPaidCount,
    pendingCount: metric.pendingCount + deltas.pendingCount,
    wasteCount: metric.wasteCount + deltas.wasteCount,
    wasteCost: metric.wasteCost + deltas.wasteCost,
  };

  // Update Customer ID unique array
  if (deltas.customerId) {
    const customer = await ctx.db.get(deltas.customerId as Id<"customers">);
    if (customer && !customer.isGeneric) {
      const customerIdsSet = new Set(metric.customerIds || []);
      if (changeType === "create") {
        customerIdsSet.add(deltas.customerId);
      } else {
        // Check if this customer has other active orders on the same day
        const orders = await ctx.db
          .query("orders")
          .withIndex("by_customer", (q) => q.eq("customerId", deltas.customerId as Id<"customers">))
          .collect();
        
        const otherOrdersOnDay = orders.filter(
          (o) => getLocalDateString(o.createdAt) === dateString && o.status !== "Cancelled"
        );
        
        if (otherOrdersOnDay.length <= 1) { // 1 or 0, meaning only this one or none
          customerIdsSet.delete(deltas.customerId);
        }
      }
      updatedFields.customerIds = Array.from(customerIdsSet);
    }
  }

  // Update Payment Methods breakdown object
  if (deltas.paymentMethodsDeltas) {
    const paymentMethods = { ...(metric.paymentMethods || {}) };
    for (const [method, data] of Object.entries(deltas.paymentMethodsDeltas)) {
      if (!paymentMethods[method]) {
        paymentMethods[method] = { amount: 0, count: 0 };
      }
      paymentMethods[method].amount += data.amount;
      paymentMethods[method].count += data.count;
      if (paymentMethods[method].amount === 0 && paymentMethods[method].count === 0) {
        delete paymentMethods[method];
      }
    }
    updatedFields.paymentMethods = paymentMethods;
  }

  // Update Product Sales breakdown object
  if (deltas.productSalesDeltas) {
    const productSales = { ...(metric.productSales || {}) };
    for (const [productName, qty] of Object.entries(deltas.productSalesDeltas)) {
      productSales[productName] = (productSales[productName] || 0) + qty;
      if (productSales[productName] <= 0) {
        delete productSales[productName];
      }
    }
    updatedFields.productSales = productSales;
  }

  // Update Category Sales breakdown object
  if (deltas.categorySalesDeltas) {
    const categorySales = { ...(metric.categorySales || {}) };
    for (const [categoryName, qty] of Object.entries(deltas.categorySalesDeltas)) {
      categorySales[categoryName] = (categorySales[categoryName] || 0) + qty;
      if (categorySales[categoryName] <= 0) {
        delete categorySales[categoryName];
      }
    }
    updatedFields.categorySales = categorySales;
  }

  await ctx.db.patch(metric._id, updatedFields);
}

// ─────────────────────────────────────────────
// HIGH-LEVEL INTEGRATION HANDLERS
// ─────────────────────────────────────────────

export async function recordOrderMetrics(
  ctx: MutationCtx,
  order: any,
  items: any[],
  changeType: "create" | "remove"
) {
  const dateString = getLocalDateString(order.createdAt);
  const sign = changeType === "create" ? 1 : -1;

  // 1. Calculate Items, Product Sales & Category Sales maps
  let totalItemsSold = 0;
  const productSalesDeltas: Record<string, number> = {};
  const categorySalesDeltas: Record<string, number> = {};

  // Load all dishes category mapping
  const allDishes = await ctx.db.query("dishes").collect();
  const categoryMap: Record<string, string> = {};
  allDishes.forEach((d) => {
    categoryMap[d._id] = d.category || "Chicken";
  });

  for (const item of items) {
    const qty = item.quantity * sign;
    totalItemsSold += item.quantity;
    
    const dishId = item.dishId as Id<"dishes">;
    const dishName = item.dishName || (await ctx.db.get(dishId))?.name || "Unknown";
    const sanitizedDishName = sanitizeKey(dishName);
    productSalesDeltas[sanitizedDishName] = (productSalesDeltas[sanitizedDishName] || 0) + qty;
    
    const category = dishId ? (categoryMap[dishId] || "Chicken") : "Chicken";
    const sanitizedCategory = sanitizeKey(category);
    categorySalesDeltas[sanitizedCategory] = (categorySalesDeltas[sanitizedCategory] || 0) + qty;
  }

  // 2. Parse Payment Methods breakdowns
  const paymentMethodsDeltas: Record<string, { amount: number; count: number }> = {};
  if (order.splitPayments && order.splitPayments.length > 0) {
    order.splitPayments.forEach((p: any) => {
      const method = p.method || "Cash";
      if (!paymentMethodsDeltas[method]) {
        paymentMethodsDeltas[method] = { amount: 0, count: 0 };
      }
      paymentMethodsDeltas[method].amount += p.amount * sign;
      paymentMethodsDeltas[method].count += 1 * sign;
    });
  } else if (order.amountPaid > 0) {
    const method = order.paymentMethod || "Cash";
    paymentMethodsDeltas[method] = {
      amount: order.amountPaid * sign,
      count: 1 * sign,
    };
  }

  // 3. Compile Deltas
  const deltas: MetricDeltas = {
    grossRevenue: order.total * sign,
    cashCollected: order.amountPaid * sign,
    outstandingDebt: 0,

    deliveryRevenue: (order.deliveryFeeAmount || 0) * sign,
    orderCount: 1 * sign,
    cancelledOrderCount: changeType === "remove" ? 1 : 0,
    deliveryOrdersCount: (order.orderType === "delivery" ? 1 : 0) * sign,
    pickupOrdersCount: (order.orderType === "pickup" || !order.orderType ? 1 : 0) * sign,
    profileSalesCount: (order.customerName !== "Generic Client" && order.customerName ? 1 : 0) * sign,
    genericSalesCount: (order.customerName === "Generic Client" || !order.customerName ? 1 : 0) * sign,
    totalItemsSold: totalItemsSold * sign,
    fullyPaidCount: (order.status === "Paid" ? 1 : 0) * sign,
    partiallyPaidCount: (order.status === "Partially Paid" ? 1 : 0) * sign,
    pendingCount: (order.status === "Pending" ? 1 : 0) * sign,
    wasteCount: 0,
    wasteCost: 0,
    customerId: order.customerId,
    paymentMethodsDeltas,
    productSalesDeltas,
    categorySalesDeltas,
  };

  // 4. Update Daily Metrics Document
  await applyMetricsDeltas(ctx, dateString, deltas, changeType);

  // 5. Update Live Counters
  const todayDateString = getLocalDateString(Date.now());
  
  // Note: Only update live counters if the order date is today
  if (dateString === todayDateString) {
    await incrementCounter(ctx, "today_gross_revenue", deltas.grossRevenue, dateString);
    await incrementCounter(ctx, "today_cash_collected", deltas.cashCollected, dateString);
    await incrementCounter(ctx, "today_outstanding_debt", deltas.outstandingDebt, dateString);

    await incrementCounter(ctx, "today_delivery_revenue", deltas.deliveryRevenue, dateString);
    
    await incrementCounter(ctx, "today_order_count", deltas.orderCount, dateString);
    if (changeType === "remove") {
      await incrementCounter(ctx, "today_cancelled_orders_count", 1, dateString);
    }
    await incrementCounter(ctx, "today_delivery_orders_count", deltas.deliveryOrdersCount, dateString);
    await incrementCounter(ctx, "today_pickup_orders_count", deltas.pickupOrdersCount, dateString);
    
    await incrementCounter(ctx, "today_profile_sales_count", deltas.profileSalesCount, dateString);
    await incrementCounter(ctx, "today_generic_sales_count", deltas.genericSalesCount, dateString);
    await incrementCounter(ctx, "today_items_sold", deltas.totalItemsSold, dateString);
    
    await incrementCounter(ctx, "today_fully_paid_count", deltas.fullyPaidCount, dateString);
    await incrementCounter(ctx, "today_partially_paid_count", deltas.partiallyPaidCount, dateString);
    await incrementCounter(ctx, "today_pending_count", deltas.pendingCount, dateString);

    for (const [method, info] of Object.entries(paymentMethodsDeltas)) {
      await incrementCounter(ctx, `today_payment_${method}`, info.amount, dateString);
    }
  }

  // Global counter updates: active_orders (unpaid count in the entire system)
  const isUnpaid = order.status !== "Paid";
  if (isUnpaid) {
    if (changeType === "create") {
      await incrementCounter(ctx, "active_orders", 1);
    } else {
      await decrementCounter(ctx, "active_orders", 1);
    }
  }
}

export async function adjustPaymentMetrics(
  ctx: MutationCtx,
  order: any,
  method: string,
  oldAmount: number,
  newAmount: number
) {
  const dateString = getLocalDateString(order.createdAt);
  const diff = newAmount - oldAmount;

  // 1. Compile Deltas
  const paymentMethodsDeltas: Record<string, { amount: number; count: number }> = {
    [method]: {
      amount: diff,
      // If we are transition from 0 amount to >0, count increases by 1.
      // If we go from >0 to 0, count decreases by 1.
      count: (oldAmount === 0 && newAmount > 0) ? 1 : (oldAmount > 0 && newAmount === 0) ? -1 : 0,
    },
  };

  const deltas: MetricDeltas = {
    grossRevenue: 0,
    cashCollected: diff,
    outstandingDebt: -diff,

    deliveryRevenue: 0,
    orderCount: 0,
    cancelledOrderCount: 0,
    deliveryOrdersCount: 0,
    pickupOrdersCount: 0,
    profileSalesCount: 0,
    genericSalesCount: 0,
    totalItemsSold: 0,
    fullyPaidCount: 0,
    partiallyPaidCount: 0,
    pendingCount: 0,
    wasteCount: 0,
    wasteCost: 0,
    paymentMethodsDeltas,
  };

  // 2. Determine order status changes for counts
  const totalPaidAfterOld = order.amountPaid - oldAmount;
  const totalPaidAfterNew = totalPaidAfterOld + newAmount;
  
  const wasFullyPaid = order.amountPaid >= order.total;
  const isFullyPaid = totalPaidAfterNew >= order.total;

  const wasPartiallyPaid = order.amountPaid > 0 && order.amountPaid < order.total;
  const isPartiallyPaid = totalPaidAfterNew > 0 && totalPaidAfterNew < order.total;

  const wasPending = order.amountPaid <= 0;
  const isPending = totalPaidAfterNew <= 0;

  deltas.fullyPaidCount = (isFullyPaid ? 1 : 0) - (wasFullyPaid ? 1 : 0);
  deltas.partiallyPaidCount = (isPartiallyPaid ? 1 : 0) - (wasPartiallyPaid ? 1 : 0);
  deltas.pendingCount = (isPending ? 1 : 0) - (wasPending ? 1 : 0);

  // 3. Apply to Daily Metrics row
  await applyMetricsDeltas(ctx, dateString, deltas, "create");

  // 4. Apply to Live Counters if date is today
  const todayDateString = getLocalDateString(Date.now());
  if (dateString === todayDateString) {
    await incrementCounter(ctx, "today_cash_collected", deltas.cashCollected, dateString);
    await incrementCounter(ctx, "today_outstanding_debt", deltas.outstandingDebt, dateString);
    
    await incrementCounter(ctx, "today_fully_paid_count", deltas.fullyPaidCount, dateString);
    await incrementCounter(ctx, "today_partially_paid_count", deltas.partiallyPaidCount, dateString);
    await incrementCounter(ctx, "today_pending_count", deltas.pendingCount, dateString);

    await incrementCounter(ctx, `today_payment_${method}`, diff, dateString);
  }

  // 5. Global Counter active_orders sync
  if (wasFullyPaid !== isFullyPaid) {
    if (isFullyPaid) {
      // Order became Paid, so it is no longer an active unpaid order
      await decrementCounter(ctx, "active_orders", 1);
    } else {
      // Order is no longer fully paid, so it becomes active again
      await incrementCounter(ctx, "active_orders", 1);
    }
  }
}
