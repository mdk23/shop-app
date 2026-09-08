import {
  internalMutation,
  mutation,
  query,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";

import { authorize } from "./permissions";
import { writeAudit } from "./audit";

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────

function calcExpectedCash(movements: { type: string; amount: number }[]): number {
  let total = 0;
  for (const m of movements) {
    if (m.type === "opening" || m.type === "sale" || m.type === "cash_in") {
      total += m.amount;
    } else if (m.type === "cash_out" || m.type === "refund") {
      total -= m.amount;
    }
    // "closing" movements are not counted
  }
  return total;
}

async function openSessionForBranch(
  ctx: QueryCtx | MutationCtx,
  branchId?: Id<"branches"> | string
): Promise<Doc<"cashRegisterSessions"> | null> {
  const open = await ctx.db
    .query("cashRegisterSessions")
    .withIndex("by_status", (q) => q.eq("status", "open"))
    .collect();
  if (open.length === 0) return null;
  if (branchId) {
    return (
      open.find((s) => s.branchId === branchId) ??
      open.find((s) => !s.branchId) ??
      null
    );
  }
  return open[0] ?? null;
}

// ─────────────────────────────────────────────
// INTERNAL MUTATIONS — called by sales / returns
// ─────────────────────────────────────────────

export const recordCashSale = internalMutation({
  args: {
    sessionId: v.id("cashRegisterSessions"),
    userId: v.id("users"),
    username: v.string(),
    amount: v.number(),
    saleId: v.id("sales"),
    saleNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cashRegisterMovements", {
      sessionId: args.sessionId,
      userId: args.userId,
      username: args.username,
      type: "sale",
      amount: args.amount,
      description: `Cash sale${args.saleNumber ? ` — ${args.saleNumber}` : ""}`,
      saleId: args.saleId,
      createdAt: Date.now(),
    });
  },
});

export const recordCashRefund = internalMutation({
  args: {
    sessionId: v.id("cashRegisterSessions"),
    userId: v.id("users"),
    username: v.string(),
    amount: v.number(),
    returnId: v.id("salesReturns"),
    returnNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("cashRegisterMovements", {
      sessionId: args.sessionId,
      userId: args.userId,
      username: args.username,
      type: "refund",
      amount: args.amount,
      description: `Cash refund${args.returnNumber ? ` — ${args.returnNumber}` : ""}`,
      returnId: args.returnId,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const getActiveSession = query({
  args: {
    token: v.union(v.string(), v.null()),
    branchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.token) return null;
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token as string))
      .unique();
    if (!session || session.expiresAt < Date.now()) return null;

    let targetBranchId =
      args.branchId && args.branchId !== "all" ? args.branchId : undefined;
    if (!targetBranchId) {
      const def = await ctx.db
        .query("branches")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();
      const first = await ctx.db.query("branches").first();
      targetBranchId = def?._id ?? first?._id;
    }
    return await openSessionForBranch(ctx, targetBranchId);
  },
});

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
    return { ...session, movements, expectedCash: calcExpectedCash(movements) };
  },
});

export const listSessions = query({
  args: {
    token: v.string(),
    status: v.optional(v.union(v.literal("open"), v.literal("closed"))),
    limit: v.optional(v.number()),
    branchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "cash_register.reports");
    const limit = args.limit ?? 50;
    let sessions = args.status
      ? await ctx.db
          .query("cashRegisterSessions")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(limit * 2)
      : await ctx.db.query("cashRegisterSessions").order("desc").take(limit * 2);

    if (args.branchId && args.branchId !== "all") {
      sessions = sessions.filter((s) => s.branchId === args.branchId);
    }
    sessions = sessions.slice(0, limit);

    return await Promise.all(
      sessions.map(async (session) => {
        const movements = await ctx.db
          .query("cashRegisterMovements")
          .withIndex("by_session", (q) => q.eq("sessionId", session._id))
          .collect();
        const sum = (t: string) =>
          movements.filter((m) => m.type === t).reduce((s, m) => s + m.amount, 0);
        const user = await ctx.db.get(session.userId);
        return {
          ...session,
          movements,
          expectedCash: calcExpectedCash(movements),
          cashSalesTotal: sum("sale"),
          cashInTotal: sum("cash_in"),
          cashOutTotal: sum("cash_out"),
          cashRefundTotal: sum("refund"),
          userName: user?.name ?? "Unknown User",
        };
      })
    );
  },
});

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

export const openSession = mutation({
  args: {
    token: v.string(),
    openingAmount: v.number(),
    notes: v.optional(v.string()),
    branchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authorize(ctx, args.token, "cash_register.use");

    let targetBranchId =
      args.branchId && args.branchId !== "all"
        ? (args.branchId as Id<"branches">)
        : undefined;
    if (!targetBranchId) {
      const def = await ctx.db
        .query("branches")
        .filter((q) => q.eq(q.field("isDefault"), true))
        .first();
      const first = await ctx.db.query("branches").first();
      targetBranchId = def?._id ?? first?._id;
    }
    if (!targetBranchId) throw new Error("No branch available for the cash register.");

    const open = await ctx.db
      .query("cashRegisterSessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    if (open.some((s) => s.branchId === targetBranchId)) {
      throw new Error(
        "A cash register session is already open for this branch. Close it first."
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
    await ctx.db.insert("cashRegisterMovements", {
      sessionId,
      userId: user._id,
      username: user.username,
      type: "opening",
      amount: args.openingAmount,
      description: args.notes ?? "Cash register opened",
      createdAt: now,
    });
    await writeAudit(ctx, {
      userId: user._id,
      username: user.username,
      action: "cash_register.opened",
      entityType: "cashRegisterSession",
      entityId: sessionId,
      details: `Opened with ${args.openingAmount}`,
    });
    return sessionId;
  },
});

export const closeSession = mutation({
  args: {
    token: v.string(),
    sessionId: v.id("cashRegisterSessions"),
    actualCash: v.number(),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await authorize(ctx, args.token, "cash_register.close");
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Cash register session not found.");
    if (session.status === "closed") throw new Error("Session already closed.");

    const movements = await ctx.db
      .query("cashRegisterMovements")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .collect();
    const expectedCash = calcExpectedCash(movements);
    const difference = args.actualCash - expectedCash;
    const now = Date.now();

    if (Math.abs(difference) > 5 && !args.notes?.trim()) {
      throw new Error(
        `A discrepancy of ${Math.abs(difference).toFixed(2)} was found. A closing note is required.`
      );
    }

    const sum = (t: string) =>
      movements.filter((m) => m.type === t).reduce((s, m) => s + m.amount, 0);
    const salesByUserMap = new Map<string, number>();
    for (const m of movements) {
      if (m.type === "sale")
        salesByUserMap.set(m.username, (salesByUserMap.get(m.username) ?? 0) + m.amount);
    }

    await ctx.db.patch(args.sessionId, {
      status: "closed",
      closedAt: now,
      actualCash: args.actualCash,
      difference,
      closingNotes: args.notes,
      expectedCash,
      cashSalesTotal: sum("sale"),
      cashInTotal: sum("cash_in"),
      cashOutTotal: sum("cash_out"),
      cashRefundTotal: sum("refund"),
      salesByUser: Array.from(salesByUserMap.entries()).map(([username, amount]) => ({
        username,
        amount,
      })),
    });
    await ctx.db.insert("cashRegisterMovements", {
      sessionId: args.sessionId,
      userId: user._id,
      username: user.username,
      type: "closing",
      amount: args.actualCash,
      description: `Closed — Expected ${expectedCash.toFixed(2)} | Actual ${args.actualCash.toFixed(2)} | Diff ${difference >= 0 ? "+" : ""}${difference.toFixed(2)}`,
      createdAt: now,
    });
    await writeAudit(ctx, {
      userId: user._id,
      username: user.username,
      action: "cash_register.closed",
      entityType: "cashRegisterSession",
      entityId: args.sessionId,
      details: `Expected ${expectedCash}, actual ${args.actualCash}, diff ${difference}`,
    });
    return { expectedCash, difference };
  },
});

export const addMovement = mutation({
  args: {
    token: v.string(),
    sessionId: v.id("cashRegisterSessions"),
    type: v.union(v.literal("cash_in"), v.literal("cash_out")),
    amount: v.number(),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await authorize(ctx, args.token, "cash_register.use");
    if (args.amount <= 0) throw new Error("Amount must be greater than zero.");
    if (!args.description.trim()) throw new Error("A description is required.");

    const session = await ctx.db.get(args.sessionId);
    if (!session || session.status === "closed")
      throw new Error("No active cash register session.");

    if (args.type === "cash_out") {
      const movements = await ctx.db
        .query("cashRegisterMovements")
        .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
        .collect();
      const balance = calcExpectedCash(movements);
      if (args.amount > balance) {
        throw new Error(
          `Insufficient funds: tried to withdraw ${args.amount.toFixed(2)}, only ${balance.toFixed(2)} available.`
        );
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
    await writeAudit(ctx, {
      userId: user._id,
      username: user.username,
      action: args.type === "cash_in" ? "cash_register.cash_in" : "cash_register.cash_out",
      entityType: "cashRegisterSession",
      entityId: args.sessionId,
      details: `${args.amount} — ${args.description}`,
    });
  },
});
