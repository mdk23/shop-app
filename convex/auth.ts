import { internalMutation, internalQuery, mutation, query, QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours

// ─────────────────────────────────────────────
// INTERNAL QUERIES
// ─────────────────────────────────────────────

export const getUserByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
  },
});

// ─────────────────────────────────────────────
// INTERNAL MUTATIONS
// ─────────────────────────────────────────────

export const createSession = internalMutation({
  args: {
    userId: v.id("users"),
    userAgent: v.optional(v.string()),
    device: v.optional(v.string()),
    browser: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Invalidate any existing sessions for this user
    const existing = await ctx.db
      .query("userSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    const user = await ctx.db.get(args.userId);
    const username = user ? user.username : "Unknown";

    for (const s of existing) {
      // Log forced logout audit trail
      await ctx.db.insert("auditLogs", {
        userId: args.userId,
        username,
        action: "user_forced_logout",
        details: `Forced logout of previous session. Browser: ${s.browser || "Unknown"} (${s.device || "Unknown"}).`,
        createdAt: Date.now(),
      });
      await ctx.db.delete(s._id);
    }

    // Generate a secure random token using the Web Crypto API
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    const token = Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");

    const now = Date.now();
    await ctx.db.insert("userSessions", {
      userId: args.userId,
      token,
      expiresAt: now + SESSION_DURATION_MS,
      createdAt: now,
      userAgent: args.userAgent,
      device: args.device,
      browser: args.browser,
      lastActivity: now,
    });

    return token;
  },
});

export const updateLastLogin = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { lastLogin: Date.now() });
  },
});

export const logAudit = internalMutation({
  args: {
    userId: v.id("users"),
    username: v.string(),
    action: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      userId: args.userId,
      username: args.username,
      action: args.action,
      details: args.details,
      createdAt: Date.now(),
    });
  },
});

// ─────────────────────────────────────────────
// PUBLIC QUERIES
// ─────────────────────────────────────────────

/**
 * Returns the current user associated with the session token, or null.
 * Used by AuthContext as a reactive subscription.
 */
export const getSession = query({
  args: { token: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    if (!args.token) return null;
    const token = args.token;

    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", token))
      .unique();

    if (!session || session.expiresAt < Date.now()) return null;

    const user = await ctx.db.get(session.userId);
    if (!user || user.status === "disabled") return null;

    return {
      sessionId: session._id,
      userId: user._id,
      name: user.name,
      username: user.username,
      role: user.role,
      expiresAt: session.expiresAt,
    };
  },
});

export const getAuditLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditLogs")
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const getAuditLogsByUser = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("auditLogs")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ─────────────────────────────────────────────
// PUBLIC MUTATIONS
// ─────────────────────────────────────────────

export const logout = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (session) {
      const user = await ctx.db.get(session.userId);
      if (user) {
        await ctx.db.insert("auditLogs", {
          userId: user._id,
          username: user.username,
          action: "user_logout",
          details: "User logged out",
          createdAt: Date.now(),
        });
      }
      await ctx.db.delete(session._id);
    }
  },
});

export const refreshSession = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (session && session.expiresAt > Date.now()) {
      await ctx.db.patch(session._id, {
        expiresAt: Date.now() + SESSION_DURATION_MS,
        lastActivity: Date.now(),
      });
    }
  },
});

/**
 * List all active sessions with user metadata.
 * Only readable by admins or managers.
 */
export const listActiveSessions = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    // Authenticate caller and check roles
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Unauthorized");
    }

    const caller = await ctx.db.get(session.userId);
    if (!caller || caller.status === "disabled" || (caller.role !== "admin" && caller.role !== "manager")) {
      throw new Error("Unauthorized");
    }

    // Fetch all active sessions
    const activeSessions = await ctx.db
      .query("userSessions")
      .withIndex("by_expires_at", (q) => q.gt("expiresAt", Date.now()))
      .collect();
    const results = [];

    for (const s of activeSessions) {
      const user = await ctx.db.get(s.userId);
      if (user) {
          results.push({
            sessionId: s._id,
            userId: user._id,
            name: user.name,
            username: user.username,
            role: user.role,
            createdAt: s.createdAt,
            lastActivity: s.lastActivity || s.createdAt,
            browser: s.browser || "Unknown",
            device: s.device || "Unknown",
            isCurrent: s.token === args.token,
          });
        }
    }

    return results.sort((a, b) => b.lastActivity - a.lastActivity);
  },
});

/**
 * Terminate a session remotely (Force Logout).
 * Only admins or managers can call this.
 */
export const terminateSession = mutation({
  args: {
    token: v.string(),
    sessionId: v.id("userSessions"),
  },
  handler: async (ctx, args) => {
    // Authenticate caller and check roles
    const session = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!session || session.expiresAt < Date.now()) {
      throw new Error("Unauthorized");
    }

    const caller = await ctx.db.get(session.userId);
    if (!caller || caller.status === "disabled" || (caller.role !== "admin" && caller.role !== "manager")) {
      throw new Error("Unauthorized");
    }

    const targetSession = await ctx.db.get(args.sessionId);
    if (targetSession) {
      const targetUser = await ctx.db.get(targetSession.userId);
      const targetUsername = targetUser ? targetUser.username : "Unknown";

      // Log audit trail
      await ctx.db.insert("auditLogs", {
        userId: caller._id,
        username: caller.username,
        action: "user_session_terminated",
        details: `Force terminated session remotely for user @${targetUsername}`,
        createdAt: Date.now(),
      });

      await ctx.db.delete(args.sessionId);
    }
  },
});

export async function validateToken(ctx: QueryCtx | MutationCtx, token: string) {
  const session = await ctx.db
    .query("userSessions")
    .withIndex("by_token", (q) => q.eq("token", token))
    .unique();

  if (!session || session.expiresAt < Date.now()) {
    throw new Error("Session expired. Please log in again.");
  }

  const user = await ctx.db.get(session.userId);
  if (!user || user.status === "disabled") {
    throw new Error("Your account is disabled.");
  }

  return user;
}
