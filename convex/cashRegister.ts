import {
  mutation,
  query,
  QueryCtx,
  MutationCtx,
} from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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

export async function openSessionForBranch(
  ctx: QueryCtx | MutationCtx,
  branchId?: Id<"branches"> | string
): Promise<Doc<"cashRegisterSessions"> | null> {
  const open = await ctx.db
    .query("cashRegisterSessions")
    .withIndex("by_status", (q) => q.eq("status", "OPEN"))
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

/**
 * The branch's open register. Every payment (any method) goes through one, so the
 * session records all money taken and given back. Throws when none is open.
 */
export async function requireOpenSession(
  ctx: QueryCtx | MutationCtx,
  branchId: Id<"branches"> | string
): Promise<Doc<"cashRegisterSessions">> {
  const session = await openSessionForBranch(ctx, branchId);
  if (!session) {
    throw new Error("No open cash register for this branch. Open the register before taking or returning a payment.");
  }
  return session;
}

/** One line in a drawer's history: a drawer movement, or a cash payment / refund on a sale. */
export type DrawerEntry = {
  _id: string;
  type: "opening" | "sale" | "refund" | "cash_in" | "cash_out" | "closing";
  amount: number;
  description: string;
  username: string;
  createdAt: number;
};

/**
 * The drawer's full history: its own movements (opening, cash in/out, closing) plus the
 * cash payments and refunds taken on sales through this session, read from `payments`.
 * Cash on a sale is recorded once, on the payment row; nothing is copied here.
 */
async function drawerEntries(
  ctx: QueryCtx | MutationCtx,
  sessionId: Id<"cashRegisterSessions">
): Promise<DrawerEntry[]> {
  const movements = await ctx.db
    .query("cashRegisterMovements")
    .withIndex("by_session", (q) => q.eq("sessionId", sessionId))
    .collect();
  // Every payment carries its session; only cash ones are in the drawer.
  const cash = (
    await ctx.db
      .query("payments")
      .withIndex("by_session", (q) => q.eq("cashRegisterSessionId", sessionId))
      .collect()
  ).filter((p) => p.method === "CASH");
  const entries: DrawerEntry[] = movements.map((m) => ({
    _id: m._id,
    type: m.type,
    amount: m.amount,
    description: m.description,
    username: m.username,
    createdAt: m.createdAt,
  }));
  for (const p of cash) {
    const sale = p.saleId ? await ctx.db.get(p.saleId) : null;
    const order = !sale && p.customerOrderId ? await ctx.db.get(p.customerOrderId) : null;
    const refund = p.amount < 0;
    const what = refund ? "Cash refund" : order ? "Cash deposit" : "Cash sale";
    const ref = sale?.saleNumber ?? order?.orderNumber;
    entries.push({
      _id: p._id,
      type: refund ? "refund" : "sale",
      amount: Math.abs(p.amount),
      description: `${what}${ref ? ` — ${ref}` : ""}`,
      username: p.username ?? "—",
      createdAt: p.createdAt,
    });
  }
  return entries.sort((a, b) => b.createdAt - a.createdAt);
}

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
    const movements = await drawerEntries(ctx, args.sessionId);
    return { ...session, movements, expectedCash: calcExpectedCash(movements) };
  },
});

/** Cursor-paginated by status index, else by creation order; branch is a page-local filter. */
export const listSessionsPaged = query({
  args: {
    token: v.string(),
    status: v.optional(v.union(v.literal("OPEN"), v.literal("CLOSED"))),
    branchId: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "cash_register.reports");
    const result = args.status
      ? await ctx.db
          .query("cashRegisterSessions")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db.query("cashRegisterSessions").order("desc").paginate(args.paginationOpts);

    const filtered =
      args.branchId && args.branchId !== "all"
        ? result.page.filter((s) => s.branchId === args.branchId)
        : result.page;

    const page = await Promise.all(
      filtered.map(async (session) => {
        const movements = await drawerEntries(ctx, session._id);
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

    return { ...result, page };
  },
});

/**
 * Lightweight aggregate for the reports header cards — sums cash sales/refunds/
 * shortages over matching sessions without shipping full session+movement rows
 * to the client (the paginated `listSessionsPaged` above handles the table).
 * Capped at 500 sessions so a very long history still costs a bounded read.
 */
export const sessionTotals = query({
  args: {
    token: v.string(),
    status: v.optional(v.union(v.literal("OPEN"), v.literal("CLOSED"))),
    branchId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "cash_register.reports");
    let sessions = args.status
      ? await ctx.db
          .query("cashRegisterSessions")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(500)
      : await ctx.db.query("cashRegisterSessions").order("desc").take(500);
    if (args.branchId && args.branchId !== "all")
      sessions = sessions.filter((s) => s.branchId === args.branchId);

    let sales = 0;
    let refunds = 0;
    let shortages = 0;
    for (const session of sessions) {
      const movements = await drawerEntries(ctx, session._id);
      sales += movements.filter((m) => m.type === "sale").reduce((s, m) => s + m.amount, 0);
      refunds += movements
        .filter((m) => m.type === "refund")
        .reduce((s, m) => s + m.amount, 0);
      if (session.difference !== undefined && session.difference < 0)
        shortages += -session.difference;
    }
    return { sales, refunds, shortages };
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
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
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
      status: "OPEN",
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
    if (session.status === "CLOSED") throw new Error("Session already closed.");

    const movements = await drawerEntries(ctx, args.sessionId);
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
      status: "CLOSED",
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
    if (!session || session.status === "CLOSED")
      throw new Error("No active cash register session.");

    if (args.type === "cash_out") {
      const movements = await drawerEntries(ctx, args.sessionId);
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
