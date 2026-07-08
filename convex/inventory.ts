import { v } from "convex/values";
import { mutation, query, internalMutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { validateToken } from "./auth";
import { internal } from "./_generated/api";
import { syncGlobalStockCounters, incrementCounter, applyMetricsDeltas, getLocalDateString } from "./metrics";

// ─────────────────────────────────────────────
// CENTRAL MUTATION ENGINE
// ─────────────────────────────────────────────

export const mutateStock = internalMutation({
  args: {
    itemId: v.id("ingredients"),
    quantity: v.number(), // positive to add stock, negative to deduct
    movementType: v.string(), // e.g. purchase_in, sale_consumption, wastage, etc.
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ingredient = await ctx.db.get(args.itemId);
    if (!ingredient) {
      throw new Error(`Ingredient with ID ${args.itemId} not found`);
    }

    const previousBalance = ingredient.stockQuantity;
    const newBalance = previousBalance + args.quantity;

    if (newBalance < 0 && args.movementType !== "inventory_count_adjustment") {
      throw new Error(`Insufficient stock for ${ingredient.name}. Available: ${previousBalance}, requested adjustment: ${args.quantity}`);
    }

    // 1. Update ingredient stock level and sync global stock alert counters
    await syncGlobalStockCounters(ctx, previousBalance, newBalance, ingredient.lowStockThreshold);
    await ctx.db.patch(args.itemId, {
      stockQuantity: newBalance,
    });

    // Resolve a user record for the mandatory audit log reference
    let resolvedUserId = args.userId;
    let resolvedUsername = args.username || "system";

    if (!resolvedUserId) {
      // Find the first active user (typically an admin or system fallback)
      const fallbackUser = await ctx.db
        .query("users")
        .withIndex("by_status", (q) => q.eq("status", "active"))
        .first();
      if (fallbackUser) {
        resolvedUserId = fallbackUser._id;
        resolvedUsername = fallbackUser.username;
      } else {
        // Create a basic system fallback user if somehow none exists
        const systemId = await ctx.db.insert("users", {
          name: "System Agent",
          username: "system",
          passwordHash: "",
          role: "admin",
          status: "active",
          createdAt: Date.now(),
        });
        resolvedUserId = systemId;
      }
    }

    // 2. Write to inventoryMovements ledger
    const movementId = await ctx.db.insert("inventoryMovements", {
      movementDate: Date.now(),
      itemId: args.itemId,
      itemName: ingredient.name,
      sku: undefined,
      movementType: args.movementType,
      quantity: args.quantity,
      unit: ingredient.unit,
      previousBalance,
      newBalance,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      notes: args.notes,
      userId: resolvedUserId,
      username: resolvedUsername,
      createdAt: Date.now(),
    });

    // 3. Write to auditLogs
    await ctx.db.insert("auditLogs", {
      userId: resolvedUserId,
      username: resolvedUsername,
      action: `inventory_${args.movementType}`,
      details: `Stock adjustment for "${ingredient.name}": Changed by ${args.quantity} ${ingredient.unit} (Prev: ${previousBalance}, New: ${newBalance}). Notes: ${args.notes || "N/A"}. Reference: ${args.referenceType || "None"} ${args.referenceId || ""}`,
      createdAt: Date.now(),
    });

    return movementId;
  },
});

// ─────────────────────────────────────────────
// WASTE LOG MUTATIONS
// ─────────────────────────────────────────────

export const logWastage = mutation({
  args: {
    token: v.string(),
    itemId: v.id("ingredients"),
    quantity: v.number(),
    wasteType: v.string(), // Spoiled, Burnt, Expired, Damaged, Theft, Preparation Waste, Unknown Loss
    reason: v.string(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);
    
    // Permission constraint: POS Sellers cannot log waste
    if (actor.role === "pos_seller") {
      throw new Error("Access Denied: POS Sellers are not permitted to log wastage.");
    }

    const ingredient = await ctx.db.get(args.itemId);
    if (!ingredient) {
      throw new Error("Ingredient not found");
    }

    if (ingredient.stockQuantity < args.quantity) {
      throw new Error("Cannot log more waste than available stock.");
    }

    // Insert the waste log record
    const wasteLogId = await ctx.db.insert("wasteLogs", {
      itemId: args.itemId,
      itemName: ingredient.name,
      quantity: args.quantity,
      unit: ingredient.unit,
      wasteType: args.wasteType,
      reason: args.reason,
      costImpact: 0, // No price tracking requested for now
      notes: args.notes,
      userId: actor._id,
      username: actor.username,
      createdAt: Date.now(),
    });

    // Record wastage metrics
    const dateString = getLocalDateString(Date.now());
    await incrementCounter(ctx, "today_waste_items_count", 1, dateString);
    await incrementCounter(ctx, "today_waste_cost", 0, dateString);
    await applyMetricsDeltas(ctx, dateString, {
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
      wasteCount: 1,
      wasteCost: 0,
    }, "create");

    // Deduct stock and write to movements ledger via centralized internal mutation
    await ctx.runMutation(internal.inventory.mutateStock, {
      itemId: args.itemId,
      quantity: -args.quantity,
      movementType: "wastage",
      referenceType: "wasteLog",
      referenceId: wasteLogId,
      notes: `Waste logged. Type: ${args.wasteType}. Reason: ${args.reason}`,
      userId: actor._id,
      username: actor.username,
    });

    return wasteLogId;
  },
});

// ─────────────────────────────────────────────
// MANUAL STOCK ADJUSTMENT (MANAGERS & ADMINS)
// ─────────────────────────────────────────────

export const logAdjustment = mutation({
  args: {
    token: v.string(),
    itemId: v.id("ingredients"),
    quantity: v.number(), // positive or negative
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);
    
    if (actor.role === "pos_seller") {
      throw new Error("Access Denied: POS Sellers are not permitted to log manual adjustments.");
    }

    const type = args.quantity >= 0 ? "stock_adjustment_in" : "stock_adjustment_out";

    await ctx.runMutation(internal.inventory.mutateStock, {
      itemId: args.itemId,
      quantity: args.quantity,
      movementType: type,
      referenceType: "manual",
      notes: args.notes,
      userId: actor._id,
      username: actor.username,
    });
  },
});

// ─────────────────────────────────────────────
// SOFT DELETE ADJUSTMENTS (ADMIN ONLY)
// ─────────────────────────────────────────────

export const softDeleteAdjustment = mutation({
  args: {
    token: v.string(),
    movementId: v.id("inventoryMovements"),
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);
    if (actor.role !== "admin") {
      throw new Error("Access Denied: Only Admins can soft delete adjustments.");
    }

    const movement = await ctx.db.get(args.movementId);
    if (!movement) {
      throw new Error("Movement record not found");
    }

    // Soft delete by updating notes/flag (we'll prepend [DELETED] to the notes field)
    await ctx.db.patch(args.movementId, {
      notes: `[DELETED BY ADMIN @${actor.username}] ${movement.notes || ""}`,
    });

    await ctx.db.insert("auditLogs", {
      userId: actor._id,
      username: actor.username,
      action: "inventory_adjustment_deleted",
      details: `Soft-deleted movement audit record ${args.movementId}`,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────
// QUERY LEDGER & LOGS
// ─────────────────────────────────────────────

export const listMovements = query({
  args: {
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    movementType: v.optional(v.string()),
    itemId: v.optional(v.id("ingredients")),
    username: v.optional(v.string()),
    referenceType: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let movements;
    if (args.itemId) {
      movements = await ctx.db.query("inventoryMovements")
        .withIndex("by_item", (q) => q.eq("itemId", args.itemId!))
        .collect();
      if (args.start !== undefined) {
        movements = movements.filter((m) => m.movementDate >= args.start!);
      }
      if (args.end !== undefined) {
        movements = movements.filter((m) => m.movementDate <= args.end!);
      }
      movements.sort((a, b) => b.movementDate - a.movementDate);
    } else {
      movements = await ctx.db.query("inventoryMovements")
        .withIndex("by_date", (q) => {
          if (args.start !== undefined && args.end !== undefined) {
            return q.gte("movementDate", args.start).lte("movementDate", args.end);
          } else if (args.start !== undefined) {
            return q.gte("movementDate", args.start);
          } else if (args.end !== undefined) {
            return q.lte("movementDate", args.end);
          }
          return q;
        })
        .order("desc")
        .collect();
    }

    // In-memory filters for fields not supported by the primary date index
    if (args.movementType && args.movementType !== "All") {
      movements = movements.filter((m) => m.movementType === args.movementType);
    }
    if (args.itemId) {
      movements = movements.filter((m) => m.itemId === args.itemId);
    }
    if (args.username && args.username !== "All") {
      movements = movements.filter((m) => m.username === args.username);
    }
    if (args.referenceType && args.referenceType !== "All") {
      movements = movements.filter((m) => m.referenceType === args.referenceType);
    }

    return movements;
  },
});

export const listWastage = query({
  args: {
    start: v.optional(v.number()),
    end: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let logs = await ctx.db.query("wasteLogs")
      .withIndex("by_created", (q) => {
        if (args.start !== undefined && args.end !== undefined) {
          return q.gte("createdAt", args.start).lte("createdAt", args.end);
        } else if (args.start !== undefined) {
          return q.gte("createdAt", args.start);
        } else if (args.end !== undefined) {
          return q.lte("createdAt", args.end);
        }
        return q;
      })
      .order("desc")
      .collect();

    return logs;
  },
});

export const listAuditLogs = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("auditLogs").order("desc").take(250);
  },
});

// ─────────────────────────────────────────────
// METRICS & ANALYTICS
// ─────────────────────────────────────────────

export const getWastageMetrics = query({
  args: {
    start: v.number(),
    end: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const endVal = args.end ?? Date.now() + 86400000;
    
    const now = Date.now();
    const startOfToday = new Date().setHours(0, 0, 0, 0);
    const startOfWeek = now - 7 * 24 * 60 * 60 * 1000;
    const startOfMonth = now - 30 * 24 * 60 * 60 * 1000;
    
    const earliestNeeded = Math.min(args.start, startOfMonth);

    const logs = await ctx.db.query("wasteLogs")
      .withIndex("by_created", (q) => q.gte("createdAt", earliestNeeded).lte("createdAt", endVal))
      .collect();

    const rangeLogs = logs.filter((l) => l.createdAt >= args.start && l.createdAt <= endVal);

    const todayLogs = logs.filter((l) => l.createdAt >= startOfToday && l.createdAt <= endVal);
    const weekLogs = logs.filter((l) => l.createdAt >= startOfWeek && l.createdAt <= endVal);
    const monthLogs = logs.filter((l) => l.createdAt >= startOfMonth && l.createdAt <= endVal);

    const totalTodayQty = todayLogs.reduce((acc, l) => acc + l.quantity, 0);
    const totalWeekQty = weekLogs.reduce((acc, l) => acc + l.quantity, 0);
    const totalMonthQty = monthLogs.reduce((acc, l) => acc + l.quantity, 0);

    // Calculate Top Wasted Items
    const wastageByItem: Record<string, { name: string; quantity: number; occurrences: number; unit: string }> = {};
    logs.forEach((log) => {
      if (!wastageByItem[log.itemId]) {
        wastageByItem[log.itemId] = { name: log.itemName, quantity: 0, occurrences: 0, unit: log.unit };
      }
      wastageByItem[log.itemId].quantity += log.quantity;
      wastageByItem[log.itemId].occurrences += 1;
    });

    const topWasted = Object.values(wastageByItem)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 10);

    // Calculate Waste % = (Waste Qty) / (Total Inventory Consumed) * 100
    // Total Inventory Consumed = Sum of all negative movements in the selected range
    const rangeMovements = await ctx.db.query("inventoryMovements")
      .withIndex("by_date", (q) => q.gte("movementDate", args.start).lte("movementDate", endVal))
      .collect();

    const consumedMovements = rangeMovements.filter((m) => m.quantity < 0);
    const totalConsumed = Math.abs(consumedMovements.reduce((acc, m) => acc + m.quantity, 0));

    const totalWastedRange = rangeLogs.reduce((acc, l) => acc + l.quantity, 0);
    const wastePercentage = totalConsumed > 0 ? (totalWastedRange / totalConsumed) * 100 : 0;

    // Movement Breakdown for Charting
    const breakdown: Record<string, number> = {
      purchase_in: 0,
      sale_consumption: 0,
      production_usage: 0,
      adjustments: 0,
      waste: 0,
    };

    rangeMovements.forEach((m) => {
      const type = m.movementType;
      const q = Math.abs(m.quantity);
      if (type === "purchase_in") breakdown.purchase_in += q;
      else if (type === "sale_consumption") breakdown.sale_consumption += q;
      else if (type === "production_consumption" || type === "production_output") breakdown.production_usage += q;
      else if (type === "wastage" || type === "spoilage" || type === "damaged" || type === "expired") breakdown.waste += q;
      else breakdown.adjustments += q;
    });

    const breakdownChartData = Object.entries(breakdown).map(([name, value]) => ({ name, value }));

    return {
      totalTodayQty,
      totalWeekQty,
      totalMonthQty,
      wastePercentage,
      topWasted,
      breakdownChartData,
    };
  },
});
