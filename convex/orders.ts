import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { recordOrderMetrics } from "./metrics";

export const create = mutation({
  args: {
    items: v.array(
      v.object({
        dishId: v.id("dishes"),
        quantity: v.number(),
        priceAtTime: v.number(),
        modifiers: v.optional(v.array(v.object({
          name: v.string(),
          price: v.number(),
        }))),
        comboSelections: v.optional(v.array(v.object({
          category: v.string(),
          dishId: v.optional(v.id("dishes")),
          name: v.string(),
          extraCharge: v.number(),
        }))),
      })
    ),
    total: v.number(),
    customerId: v.id("customers"),
    paymentMethod: v.string(),
    amountPaid: v.number(),
    change: v.number(),
    // Auth & Caixa integration (optional for backward compat)
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
    
    // Delivery integration
    orderType: v.optional(v.string()), // "pickup" | "delivery"
    deliveryFeeId: v.optional(v.id("deliveryFees")),
    deliveryFeeName: v.optional(v.string()),
    deliveryFeeAmount: v.optional(v.number()),

    // Split Payments
    splitPayments: v.optional(v.array(v.object({
      method: v.string(),
      amount: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found");

    // Resolve user identity: ensure both userId and username are populated if either is provided
    let userId = args.userId;
    let username = args.username;
    if (userId && !username) {
      const user = await ctx.db.get(userId);
      if (user) {
        username = user.username;
      }
    } else if (username && !userId) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username!))
        .unique();
      if (user) {
        userId = user._id;
      }
    }

    // Check if there is any cash payment (either paymentMethod is Cash or any split payment uses Cash)
    const hasCashPayment = args.paymentMethod === "Cash" || 
      (args.splitPayments && args.splitPayments.some(p => p.method === "Cash"));

    // Resolve cash register session for Cash payment
    let cashRegisterSessionId = args.cashRegisterSessionId;
    if (hasCashPayment) {
      if (!cashRegisterSessionId) {
        // Query active session
        const activeSession = await ctx.db
          .query("cashRegisterSessions")
          .withIndex("by_status", (q) => q.eq("status", "open"))
          .unique();
        if (!activeSession) {
          throw new Error("No active cash register session found. Please open the register first.");
        }
        cashRegisterSessionId = activeSession._id;
      } else {
        // Validate that the provided session exists and is open
        const sessionObj = await ctx.db.get(cashRegisterSessionId);
        if (!sessionObj || sessionObj.status !== "open") {
          throw new Error("The selected cash register session is invalid or already closed.");
        }
      }
    }

    // Robust fallback: if cash register session is resolved but user info is missing
    if (cashRegisterSessionId && (!userId || !username)) {
      const sessionObj = await ctx.db.get(cashRegisterSessionId);
      if (sessionObj) {
        if (!userId) userId = sessionObj.userId;
        if (!username) username = sessionObj.username;
      }
    }

    // 1. Calculate total ingredient usage
    const ingredientUsage: Map<Id<"ingredients">, number> = new Map();
    
    // Helper to add usage
    const addUsage = (id: Id<"ingredients">, qty: number) => {
      const current = ingredientUsage.get(id) || 0;
      ingredientUsage.set(id, current + qty);
    };

    const allIngredients = await ctx.db.query("ingredients").collect();
    const eggsIngredient = allIngredients.find(i => 
      i.name.toLowerCase() === "ovos" || 
      i.name.toLowerCase() === "eggs" ||
      i.name.toLowerCase() === "eggs (pcs)"
    );
    
    const itemSummary: Array<{ dishId: Id<"dishes">; dishName: string; quantity: number }> = [];

    for (const item of args.items) {
      const dish = await ctx.db.get(item.dishId);
      if (!dish) continue;

      itemSummary.push({
        dishId: item.dishId,
        dishName: dish.name,
        quantity: item.quantity,
      });

      // A. Packaging Deduction
      if (dish.isCombo) {
        // Combo uses its own packaging (Array first, fallback to legacy)
        if (dish.comboPackaging && dish.comboPackaging.length > 0) {
          for (const pack of dish.comboPackaging) {
            addUsage(pack.ingredientId, pack.quantity * item.quantity);
          }
        } else if (dish.comboPackagingIngredientId && dish.comboPackagingQuantity) {
          addUsage(dish.comboPackagingIngredientId, dish.comboPackagingQuantity * item.quantity);
        }
      } else {
        // Standalone dish uses its own packaging (Array first, fallback to legacy)
        if (dish.standalonePackaging && dish.standalonePackaging.length > 0) {
          for (const pack of dish.standalonePackaging) {
            addUsage(pack.ingredientId, pack.quantity * item.quantity);
          }
        } else if (dish.standalonePackagingIngredientId && dish.standalonePackagingQuantity) {
          addUsage(dish.standalonePackagingIngredientId, dish.standalonePackagingQuantity * item.quantity);
        }
      }

      // B. Raw Ingredients Deduction
      // NOTE: We skip this for combos - their raw ingredients come from comboSelections (Section C)
      // Running this for combos would cause double-deduction if packaging or ingredients were added to the recipe.
      const name = dish.name.toLowerCase();
      const isEggDish = name.includes("ovo ") || name === "ovo" || name.includes("egg");

      if (!dish.isCombo) {
        if (isEggDish && eggsIngredient) {
          addUsage(eggsIngredient._id, item.quantity);
        } else {
          const dishIngredients = await ctx.db
            .query("dishIngredients")
            .withIndex("by_dish", (q) => q.eq("dishId", item.dishId))
            .collect();
            
          for (const di of dishIngredients) {
            addUsage(di.ingredientId, di.quantity * item.quantity);
          }
        }
      }

      // C. Combo Selections Deduction
      if (item.comboSelections) {
        for (const comboItem of item.comboSelections) {
          if (comboItem.dishId) {
            const selectedDish = await ctx.db.get(comboItem.dishId as Id<"dishes">);
            if (!selectedDish) continue;

            const comboDishIngredients = await ctx.db
              .query("dishIngredients")
              .withIndex("by_dish", (q) => q.eq("dishId", comboItem.dishId as Id<"dishes">))
              .collect();
            
            for (const di of comboDishIngredients) {
              // CRITICAL: Skip packaging ingredients — the combo handles its own packaging via comboPackaging (Section A).
              // Deducting packaging here would double-count it.
              const ing = await ctx.db.get(di.ingredientId);
              if (ing?.category === "Packaging") continue;
              
              addUsage(di.ingredientId, di.quantity * item.quantity);
            }
            
            // NOTE: We EXPLICITLY skip the selectedDish.standalonePackaging here
            // based on the "Contextual Packaging Logic" requirement.
          }
        }
      }
    }
    
    // 2. Check stock sufficiency
    for (const [ingId, needed] of ingredientUsage.entries()) {
      const ingredient = await ctx.db.get(ingId);
      if (!ingredient || ingredient.stockQuantity < needed) {
        throw new Error(`Insufficient stock for ${ingredient?.name || "unknown ingredient"}`);
      }
    }
    
    // 3. Deduct stock (deferred until orderId is generated below)
    
    // 4. Generate daily order code
    const now = Date.now();
    
    // Create an ISO date string adjusted for UTC+2 (Mozambique/Maputo time)
    // Date.now() is UTC. Adding 2 hours (2 * 60 * 60 * 1000) = 7200000 ms
    const localTimeMs = now + 7200000;
    const dateString = new Date(localTimeMs).toISOString().split("T")[0];

    let sequenceNumber = 1;
    const counter = await ctx.db
      .query("counters")
      .withIndex("by_key", (q) => q.eq("key", "daily_order_sequence"))
      .first();

    if (!counter) {
      await ctx.db.insert("counters", {
        key: "daily_order_sequence",
        value: 1,
        dateString,
        updatedAt: now,
      });
    } else {
      if (counter.dateString !== dateString) {
        // Reset counter for new day
        sequenceNumber = 1;
        await ctx.db.patch(counter._id, {
          value: 1,
          dateString,
          updatedAt: now,
        });
      } else {
        sequenceNumber = counter.value + 1;
        await ctx.db.patch(counter._id, {
          value: sequenceNumber,
          updatedAt: now,
        });
      }
    }

    const orderCode = `ORD-${String(sequenceNumber).padStart(3, "0")}`;

    // 5. Enforce Full Payment & Calculate Change
    if (args.amountPaid < args.total) {
      throw new Error(`Insufficient payment. All orders must be paid in full (Total: ${args.total}, Provided: ${args.amountPaid}).`);
    }

    const changeReturned = args.amountPaid - args.total;

    // 6. Calculate Sale Status
    const status = "Paid";

    // 7. Create Sale (Order)
    const orderId = await ctx.db.insert("orders", {
      total: args.total,
      status,
      paymentMethod: args.paymentMethod,
      amountPaid: args.amountPaid,
      remainingAmount: Math.max(0, args.total - args.amountPaid),
      change: changeReturned,
      customerId: args.customerId,
      createdAt: now,
      orderCode,
      prepStatus: "pending",
      userId: userId,
      username: username,
      cashRegisterSessionId: cashRegisterSessionId,
      orderType: args.orderType ?? "pickup",
      deliveryFeeId: args.deliveryFeeId,
      deliveryFeeName: args.deliveryFeeName,
      deliveryFeeAmount: args.deliveryFeeAmount,
      splitPayments: args.splitPayments,
      customerName: customer.name,
      itemSummary: itemSummary,
    });
    
    // 8.5 Deduct stock and write to movements ledger
    for (const [ingId, needed] of ingredientUsage.entries()) {
      await ctx.runMutation(internal.inventory.mutateStock, {
        itemId: ingId,
        quantity: -needed,
        movementType: "sale_consumption",
        referenceType: "order",
        referenceId: orderId,
        userId: userId,
        username: username,
        notes: `POS sale checkout for Order ${orderCode}`,
      });
    }
    
    // 9. Record initial payment(s) if amount > 0
    if (args.splitPayments && args.splitPayments.length > 0) {
      let changeRemaining = changeReturned;
      let paymentsToRecord = args.splitPayments.map(p => ({ ...p }));
      
      // Deduct change from Cash first if possible
      for (const p of paymentsToRecord) {
        if (p.method === "Cash" && changeRemaining > 0 && p.amount > 0) {
          const deduct = Math.min(p.amount, changeRemaining);
          p.amount -= deduct;
          changeRemaining -= deduct;
        }
      }
      // Deduct remaining change from other methods if any
      for (const p of paymentsToRecord) {
        if (changeRemaining > 0 && p.amount > 0) {
          const deduct = Math.min(p.amount, changeRemaining);
          p.amount -= deduct;
          changeRemaining -= deduct;
        }
      }

      for (const p of paymentsToRecord) {
        if (p.amount > 0) {
          await ctx.db.insert("payments", {
            orderId,
            method: p.method,
            amount: p.amount,
            createdAt: now,
          });
        }
      }
    } else if (args.amountPaid > 0) {
      await ctx.db.insert("payments", {
        orderId,
        method: args.paymentMethod,
        amount: args.total,
        createdAt: now,
      });
    }

    // 10. Create Order Items
    for (const item of args.items) {
      await ctx.db.insert("orderItems", {
        orderId,
        dishId: item.dishId,
        quantity: item.quantity,
        priceAtTime: item.priceAtTime,
        modifiers: item.modifiers,
        comboSelections: item.comboSelections,
      });
    }
    
    // 11. Record cash movement if payment is Cash and a register session is open
    if (cashRegisterSessionId && userId && username) {
      const insertedPayments = await ctx.db
        .query("payments")
        .withIndex("by_order", (q) => q.eq("orderId", orderId))
        .collect();

      const cashPaymentAmount = insertedPayments
        .filter(p => p.method === "Cash")
        .reduce((sum, p) => sum + p.amount, 0);

      if (cashPaymentAmount > 0) {
        await ctx.runMutation(internal.caixa.recordCashSale, {
          sessionId: cashRegisterSessionId,
          userId: userId,
          username: username,
          amount: cashPaymentAmount,
          orderId,
          orderCode,
        });
      }
    }


    // 13. Record live counters and daily metrics
    const orderDoc = await ctx.db.get(orderId);
    if (orderDoc) {
      await recordOrderMetrics(ctx, orderDoc, args.items, "create");
    }

    return orderId;
  },
});

export const listRecent = query({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .order("desc")
      .take(args.limit);
      
    return orders.map((order) => ({
      ...order,
      items: order.itemSummary || [],
      customer: { name: order.customerName || "Generic Client" }
    }));
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const getCounterVal = async (key: string) => {
      const doc = await ctx.db
        .query("counters")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      return doc?.value ?? 0;
    };

    const totalSalesToday = await getCounterVal("today_gross_revenue");
    const orderCountToday = await getCounterVal("today_order_count");
    const lowStockCount = await getCounterVal("low_stock_items");
    const outOfStockCount = await getCounterVal("out_of_stock_items");

    // Simplified top dish calculation
    // In a real app, this would be more complex or pre-aggregated
    return {
      totalSalesToday,
      orderCountToday,
      lowStockCount,
      outOfStockCount,
    };
  },
});

export const getSalesPerformance = query({
  args: {},
  handler: async (ctx) => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const todayOrders = await ctx.db
      .query("orders")
      .withIndex("by_created_at", (q) => q.gte("createdAt", startOfDay.getTime()))
      .collect();

    // Group sales by hour
    const hourlyMap: Record<number, number> = {};
    for (const order of todayOrders) {
      const hour = new Date(order.createdAt).getHours();
      hourlyMap[hour] = (hourlyMap[hour] || 0) + order.total;
    }

    // Build array for all hours that had sales, formatted as "HH:00"
    const result = Object.entries(hourlyMap)
      .map(([hour, sales]) => ({
        time: `${String(hour).padStart(2, "0")}:00`,
        sales: Math.round(sales * 100) / 100,
      }))
      .sort((a, b) => a.time.localeCompare(b.time));

    return result;
  },
});



export const remove = mutation({
  args: {
    id: v.id("orders"),
  },
  handler: async (ctx, args) => {
    // 1. Get the order to ensure it exists
    const order = await ctx.db.get(args.id);
    if (!order) throw new Error("Order not found");

    // 2. Fetch all order items
    const orderItems = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.id))
      .collect();

    // 2.5 Record metrics removal before any order/items deletions
    await recordOrderMetrics(ctx, order, orderItems, "remove");

    // 3. Calculate ingredients to restore
    const ingredientsToRestore: Map<Id<"ingredients">, number> = new Map();
    
    for (const item of orderItems) {
      const dish = await ctx.db.get(item.dishId);
      if (!dish) continue;

      // 1. Restore Packaging
      if (dish.isCombo) {
        if (dish.comboPackaging && dish.comboPackaging.length > 0) {
          for (const pack of dish.comboPackaging) {
            const current = ingredientsToRestore.get(pack.ingredientId) || 0;
            ingredientsToRestore.set(pack.ingredientId, current + (pack.quantity * item.quantity));
          }
        } else if (dish.comboPackagingIngredientId && dish.comboPackagingQuantity) {
          const current = ingredientsToRestore.get(dish.comboPackagingIngredientId) || 0;
          ingredientsToRestore.set(dish.comboPackagingIngredientId, current + (dish.comboPackagingQuantity * item.quantity));
        }
      } else {
        if (dish.standalonePackaging && dish.standalonePackaging.length > 0) {
          for (const pack of dish.standalonePackaging) {
            const current = ingredientsToRestore.get(pack.ingredientId) || 0;
            ingredientsToRestore.set(pack.ingredientId, current + (pack.quantity * item.quantity));
          }
        } else if (dish.standalonePackagingIngredientId && dish.standalonePackagingQuantity) {
          const current = ingredientsToRestore.get(dish.standalonePackagingIngredientId) || 0;
          ingredientsToRestore.set(dish.standalonePackagingIngredientId, current + (dish.standalonePackagingQuantity * item.quantity));
        }
      }

      // 2. Restore Raw Ingredients
      // NOTE: Skip for combos - their ingredients are restored via combo selections (Section 3)
      if (!dish.isCombo) {
        const dishIngredients = await ctx.db
          .query("dishIngredients")
          .withIndex("by_dish", (q) => q.eq("dishId", item.dishId))
          .collect();
          
        for (const di of dishIngredients) {
          const current = ingredientsToRestore.get(di.ingredientId) || 0;
          ingredientsToRestore.set(di.ingredientId, current + (di.quantity * item.quantity));
        }
      }

      // 3. Restore Combo Selections
      if (item.comboSelections) {
        for (const comboItem of item.comboSelections) {
          if (comboItem.dishId) {
            const selectedDish = await ctx.db.get(comboItem.dishId as Id<"dishes">);
            if (!selectedDish) continue;

            const comboDishIngredients = await ctx.db
              .query("dishIngredients")
              .withIndex("by_dish", (q) => q.eq("dishId", comboItem.dishId as Id<"dishes">))
              .collect();
            
            for (const di of comboDishIngredients) {
              // CRITICAL: Skip packaging ingredients — combo packaging is restored via comboPackaging (Section 1).
              const ing = await ctx.db.get(di.ingredientId);
              if (ing?.category === "Packaging") continue;

              const current = ingredientsToRestore.get(di.ingredientId) || 0;
              ingredientsToRestore.set(di.ingredientId, current + (di.quantity * item.quantity));
            }
          }
        }
      }
    }

    // 4. Restore the stock and log reversal in inventoryMovements ledger
    for (const [ingId, amountToRestore] of ingredientsToRestore.entries()) {
      await ctx.runMutation(internal.inventory.mutateStock, {
        itemId: ingId,
        quantity: amountToRestore,
        movementType: "sale_reversal",
        referenceType: "order",
        referenceId: args.id,
        notes: `Order cancellation reversal for Order ${order.orderCode || args.id}`,
      });
    }

    // 5. Delete order items
    for (const item of orderItems) {
      await ctx.db.delete(item._id);
    }

    // 6. Delete associated payments
    const payments = await ctx.db
      .query("payments")
      .withIndex("by_order", (q) => q.eq("orderId", args.id))
      .collect();
    
    for (const p of payments) {
      await ctx.db.delete(p._id);
    }

    // 6.5 Remove any associated cash register movements and adjust sessions
    const caixaMovements = await ctx.db
      .query("cashRegisterMovements")
      .withIndex("by_order", (q) => q.eq("orderId", args.id))
      .collect();

    for (const movement of caixaMovements) {
      const session = await ctx.db.get(movement.sessionId);
      if (session && session.status === "closed" && session.difference !== undefined) {
        // Reversing a cash-in movement means the expected cash goes DOWN, 
        // so the recorded difference (actual - expected) goes UP.
        const multiplier = (movement.type === "sale" || movement.type === "cash_in" || movement.type === "opening") ? 1 : -1;
        await ctx.db.patch(session._id, {
          difference: session.difference + (movement.amount * multiplier)
        });
      }
      await ctx.db.delete(movement._id);
    }

    // 7. Delete the order
    await ctx.db.delete(args.id);


  },
});
export const getById = query({
  args: { id: v.id("orders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id);
    if (!order) return null;

    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .collect();

    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        const dish = await ctx.db.get(item.dishId);
        return { ...item, dishName: dish?.name || "Unknown Dish" };
      })
    );

    const customer = await ctx.db.get(order.customerId);
    
    return { ...order, items: itemsWithDetails, customer };
  },
});

export const listByRange = query({
  args: { 
    start: v.number(), 
    end: v.number() 
  },
  handler: async (ctx, args) => {
    const orders = await ctx.db
      .query("orders")
      .withIndex("by_created_at", (q) => q.gte("createdAt", args.start).lte("createdAt", args.end))
      .order("desc")
      .collect();
      
    return orders.map((order) => ({
      ...order,
      items: order.itemSummary || [],
      customer: { name: order.customerName || "Generic Client" },
      payments: order.splitPayments || []
    }));
  },
});

export const listByCustomer = query({
  args: { 
    customerId: v.id("customers"),
    limit: v.optional(v.number())
  },
  handler: async (ctx, args) => {
    let q = ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc");
    
    const limit = args.limit ?? 100;
    const orders = await q.take(limit);
    
    return orders.map((order) => ({
      ...order,
      items: order.itemSummary || [],
      customer: { name: order.customerName || "Generic Client" }
    }));
  },
});

export const getOrderItems = query({
  args: { orderId: v.id("orders") },
  handler: async (ctx, args) => {
    const items = await ctx.db
      .query("orderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    return await Promise.all(
      items.map(async (item) => {
        const dish = await ctx.db.get(item.dishId);
        return { ...item, dishName: dish?.name || "Unknown Dish" };
      })
    );
  },
});

export const updatePrepStatus = mutation({
  args: {
    orderId: v.id("orders"),
    status: v.union(v.literal("pending"), v.literal("preparing"), v.literal("ready"), v.literal("completed")),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    await ctx.db.patch(args.orderId, { prepStatus: args.status });
  },
});

export const listActiveOrders = query({
  args: {},
  handler: async (ctx) => {
    const orders = await ctx.db
      .query("orders")
      .filter((q) => 
        q.or(
          q.eq(q.field("prepStatus"), "pending"),
          q.eq(q.field("prepStatus"), "preparing"),
          q.eq(q.field("prepStatus"), "ready")
        )
      )
      .collect();
      
    // Sort by created time ascending (oldest first)
    return orders.sort((a, b) => a.createdAt - b.createdAt);
  },
});
