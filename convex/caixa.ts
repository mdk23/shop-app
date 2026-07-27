import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { QueryCtx, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

import { validateToken } from "./auth";

function calcExpectedCash(movements: { type: string; amount: number }[]): number {
  let total = 0;
  for (const m of movements) {
    if (m.type === "opening" || m.type === "sale" || m.type === "cash_in") {
      total += m.amount;
    } else if (m.type === "cash_out") {
      total -= m.amount;
    }
    // "closing" movements are not counted in expected cash
  }
  return total;
}

// ─────────────────────────────────────────────
// INTERNAL MUTATIONS
// ─────────────────────────────────────────────

/**
 * Called internally when a cash payment is recorded on an order.
 */
export const recordCashSale = internalMutation({
  args: {
    sessionId: v.id("cashRegisterSessions"),
    userId: v.id("users"),
    username: v.string(),
    amount: v.number(),
    orderId: v.id("orders"),
    orderCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cashRegisterMovements", {
      sessionId: args.sessionId,
      userId: args.userId,
      username: args.username,
      type: "sale",
      amount: args.amount,
      description: `Cash sale${args.orderCode ? ` — Order #${args.orderCode}` : ""}`,
      orderId: args.orderId,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────
// PUBLIC QUERIES
// ─────────────────────────────────────────────

/**
 * Get the active cash register session for the logged-in user.
 */
export const getActiveSession = query({
  args: { 
    token: v.union(v.string(), v.null()),
    branchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const token = args.token;
    if (!token) return null;

    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!session || session.expiresAt < Date.now()) return null;

    const openSessions = await ctx.db
      .query("cashRegisterSessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    if (openSessions.length === 0) return null;

    let targetBranchId = args.branchId && args.branchId !== "all" ? args.branchId : undefined;
    if (!targetBranchId) {
      const defaultBranch = await ctx.db
        .query("branches")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();
      const firstBranch = await ctx.db.query("branches").first();
      targetBranchId = defaultBranch?._id || firstBranch?._id;
    }

    if (targetBranchId) {
      const match = openSessions.find((s) => s.branchId === targetBranchId);
      if (match) return match;
      // Fallback for legacy sessions created without branchId
      const fallbackUnassigned = openSessions.find((s) => !s.branchId);
      if (fallbackUnassigned) return fallbackUnassigned;
      return null;
    }

    return openSessions[0] || null;
  },
});

/**
 * Get a cash register session with all its movements + expected cash total.
 */
export const getSessionWithMovements = query({
  args: { sessionId: v.id("cashRegisterSessions") },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) return null;

    const movements = await ctx.db
      .query("cashRegisterMovements")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .collect();

    const expectedCash = calcExpectedCash(movements);

    return { ...session, movements, expectedCash };
  },
});

/**
 * List cash register sessions. Used for admin/manager reports.
 */
export const listSessions = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("closed"))),
    limit: v.optional(v.number()),
    branchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 50;
    let sessions;

    if (args.status) {
      sessions = await ctx.db
        .query("cashRegisterSessions")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit * 2);
    } else {
      sessions = await ctx.db
        .query("cashRegisterSessions")
        .order("desc")
        .take(limit * 2);
    }

    if (args.branchId && args.branchId !== "all") {
      const targetBranch = await ctx.db.get(args.branchId as Id<"branches">);
      const defaultBranch = await ctx.db
        .query("branches")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();
      const isDefault = targetBranch?.isDefault || defaultBranch?._id === args.branchId;

      sessions = sessions.filter((s) => {
        if (s.branchId === args.branchId) return true;
        if (!s.branchId && isDefault) return true;
        return false;
      });
    }

    sessions = sessions.slice(0, limit);

    return await Promise.all(
      sessions.map(async (session) => {
        // Fallback rule for denormalized cash register sessions
        if (session.status === "closed" && session.expectedCash !== undefined) {
          const user = await ctx.db.get(session.userId);
          return {
            ...session,
            movements: [], // Closed sessions don't need line items rendered by default
            userName: user?.name || "Unknown User",
          };
        }

        const movements = await ctx.db
          .query("cashRegisterMovements")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .collect();

        const cashSalesTotal = movements
          .filter((m) => m.type === "sale")
          .reduce((sum, m) => sum + m.amount, 0);

        const cashInTotal = movements
          .filter((m) => m.type === "cash_in")
          .reduce((sum, m) => sum + m.amount, 0);

        const cashOutTotal = movements
          .filter((m) => m.type === "cash_out")
          .reduce((sum, m) => sum + m.amount, 0);

        const expectedCash = calcExpectedCash(movements);

        const salesByUserMap = new Map<string, number>();
        movements.forEach((m) => {
          if (m.type === "sale") {
            const current = salesByUserMap.get(m.username) || 0;
            salesByUserMap.set(m.username, current + m.amount);
          }
        });
        const salesByUser = Array.from(salesByUserMap.entries()).map(([username, amount]) => ({
          username,
          amount,
        }));

        const user = await ctx.db.get(session.userId);
        return {
          ...session,
          movements,
          expectedCash,
          cashSalesTotal,
          cashInTotal,
          cashOutTotal,
          salesByUser,
          userName: user?.name || "Unknown User",
        };
      })
    );
  },
});

// ─────────────────────────────────────────────
// PUBLIC MUTATIONS
// ─────────────────────────────────────────────

/**
 * Open a new cash register session.
 */
export const openSession = mutation({
  args: {
    token: v.string(),
    openingAmount: v.number(),
    notes: v.optional(v.string()),
    branchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await validateToken(ctx, args.token);

    if (user.role !== "admin" && user.role !== "manager" && user.role !== "pos_seller") {
      throw new Error("Only an Admin, Manager, or POS Seller can open the store cash register.");
    }

    // Resolve branchId
    let targetBranchId = args.branchId && args.branchId !== "all" ? (args.branchId as Id<"branches">) : undefined;
    if (!targetBranchId) {
      const defaultBranch = await ctx.db
        .query("branches")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();
      const firstBranch = await ctx.db.query("branches").first();
      targetBranchId = defaultBranch?._id || firstBranch?._id;
    }

    if (!targetBranchId) {
      throw new Error("No valid store branch found to associate with cash register session.");
    }

    // Check if there is already an open session in THIS specific branch
    const openSessions = await ctx.db
      .query("cashRegisterSessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();

    const existingInBranch = openSessions.find((s) => s.branchId === targetBranchId);

    if (existingInBranch) {
      throw new Error(
        "A store cash register session is already open for this branch. Please close it first."
      );
    }

    const now = Date.now();

    const sessionId = await ctx.db.insert("cashRegisterSessions", {
      userId: user._id,
      username: user.username,
      openingAmount: args.openingAmount,
      openedAt: now,
      status: "open",
      notes: args.notes,
      branchId: targetBranchId,
    });

    // Opening movement
    await ctx.db.insert("cashRegisterMovements", {
      sessionId,
      userId: user._id,
      username: user.username,
      type: "opening",
      amount: args.openingAmount,
      description: args.notes ?? "Cash register opened",
      createdAt: now,
    });

    // Audit
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      username: user.username,
      action: "caixa_opened",
      details: `Cash register opened with ${args.openingAmount} MT`,
      createdAt: now,
    });

    return sessionId;
  },
});

/**
 * Close an active cash register session.
 */
export const closeSession = mutation({
  args: {
    token: v.string(),
    sessionId: v.id("cashRegisterSessions"),
    actualCash: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await validateToken(ctx, args.token);

    if (user.role !== "admin" && user.role !== "manager" && user.role !== "pos_seller") {
      throw new Error("Only an Admin, Manager, or POS Seller can close the store cash register.");
    }

    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Cash register session not found.");
    if (session.status === "closed") throw new Error("This session is already closed.");

    // Calculate expected cash from movements
    const movements = await ctx.db
      .query("cashRegisterMovements")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    const expectedCash = calcExpectedCash(movements);
    const difference = args.actualCash - expectedCash;
    const now = Date.now();

    if (Math.abs(difference) > 5 && (!args.notes || args.notes.trim() === "")) {
      throw new Error(`A discrepancy of ${Math.abs(difference).toFixed(2)} MT was found. A closing note explaining this difference is mandatory.`);
    }

    // Denormalize totals
    const cashSalesTotal = movements.filter((m) => m.type === "sale").reduce((sum, m) => sum + m.amount, 0);
    const cashInTotal = movements.filter((m) => m.type === "cash_in").reduce((sum, m) => sum + m.amount, 0);
    const cashOutTotal = movements.filter((m) => m.type === "cash_out").reduce((sum, m) => sum + m.amount, 0);
    
    const salesByUserMap = new Map<string, number>();
    movements.forEach((m) => {
      if (m.type === "sale") {
        const current = salesByUserMap.get(m.username) || 0;
        salesByUserMap.set(m.username, current + m.amount);
      }
    });
    const salesByUser = Array.from(salesByUserMap.entries()).map(([username, amount]) => ({
      username,
      amount,
    }));

    await ctx.db.patch(args.sessionId, {
      status: "closed",
      closedAt: now,
      actualCash: args.actualCash,
      difference,
      closingNotes: args.notes,
      expectedCash,
      cashSalesTotal,
      cashInTotal,
      cashOutTotal,
      salesByUser,
    });

    // Closing movement
    await ctx.db.insert("cashRegisterMovements", {
      sessionId: args.sessionId,
      userId: user._id,
      username: user.username,
      type: "closing",
      amount: args.actualCash,
      description: `Closed — Expected: ${expectedCash.toFixed(2)} MT | Actual: ${args.actualCash.toFixed(2)} MT | Diff: ${difference >= 0 ? "+" : ""}${difference.toFixed(2)} MT`,
      createdAt: now,
    });

    // Audit
    await ctx.db.insert("auditLogs", {
      userId: user._id,
      username: user.username,
      action: "caixa_closed",
      details: `Cash register closed. Expected: ${expectedCash} MT, Actual: ${args.actualCash} MT, Difference: ${difference} MT`,
      createdAt: now,
    });

    return { expectedCash, difference };
  },
});

/**
 * Add a manual cash movement (Cash In or Cash Out).
 */
export const addMovement = mutation({
  args: {
    token: v.string(),
    sessionId: v.id("cashRegisterSessions"),
    type: v.union(v.literal("cash_in"), v.literal("cash_out")),
    amount: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) throw new Error("Amount must be greater than zero.");
    if (!args.description.trim()) throw new Error("A description is required.");

    const user = await validateToken(ctx, args.token);

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status === "closed") {
      throw new Error("No active cash register session found.");
    }

    if (args.type === "cash_out") {
      const movements = await ctx.db
        .query("cashRegisterMovements")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect();
      const currentBalance = calcExpectedCash(movements);
      if (args.amount > currentBalance) {
        throw new Error(`Insufficient funds in register. Attempted to withdraw ${args.amount.toFixed(2)} MT, but only ${currentBalance.toFixed(2)} MT is available.`);
      }
    }

    const now = Date.now();

    await ctx.db.insert("cashRegisterMovements", {
      sessionId: args.sessionId,
      userId: user._id,
      username: user.username,
      type: args.type,
      amount: args.amount,
      description: args.description,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      userId: user._id,
      username: user.username,
      action: args.type === "cash_in" ? "cash_in" : "cash_out",
      details: `${args.type === "cash_in" ? "Cash In" : "Cash Out"}: ${args.amount} MT — ${args.description}`,
      createdAt: now,
    });
  },
});
