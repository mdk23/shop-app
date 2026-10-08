import { authorize } from "./permissions";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { validateToken } from "./auth";
import { describeChanges, writeAudit } from "./audit";


const ROLE_VALIDATOR = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("pos_seller")
);

// Returns the user document without its password hash.
function withoutPasswordHash<T extends { passwordHash: string }>(user: T): Omit<T, "passwordHash"> {
  return Object.fromEntries(Object.entries(user).filter(([key]) => key !== "passwordHash")) as Omit<T, "passwordHash">;
}

const STATUS_VALIDATOR = v.union(v.literal("ACTIVE"), v.literal("DISABLED"));

// ─────────────────────────────────────────────
// INTERNAL QUERIES / MUTATIONS
// ─────────────────────────────────────────────

export const getByUsername = internalQuery({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();
  },
});

export const insertUser = internalMutation({
  args: {
    name: v.string(),
    username: v.string(),
    passwordHash: v.string(),
    role: ROLE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    // Enforce unique username
    const existing = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", args.username))
      .unique();

    if (existing) {
      throw new Error(`Username "${args.username}" is already taken`);
    }

    return await ctx.db.insert("users", {
      name: args.name,
      username: args.username,
      passwordHash: args.passwordHash,
      role: args.role,
      status: "ACTIVE",
      createdAt: Date.now(),
    });
  },
});

export const updatePasswordHash = internalMutation({
  args: { id: v.id("users"), passwordHash: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, { passwordHash: args.passwordHash });
  },
});

// ─────────────────────────────────────────────
// PUBLIC QUERIES
// ─────────────────────────────────────────────

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "users.manage");
    const users = await ctx.db.query("users").order("desc").collect();
    // Strip password hash from public response
    return users.map(withoutPasswordHash);
  },
});

export const getById = query({
  args: {
    token: v.string(),
    id: v.id("users"),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "users.manage");
    const user = await ctx.db.get(args.id);
    if (!user) return null;
    return withoutPasswordHash(user);
  },
});

/** Used by the password-reset action, which has already checked the caller's session. */
export const getUserForReset = internalQuery({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) return null;
    return withoutPasswordHash(user);
  },
});

// ─────────────────────────────────────────────
// PUBLIC MUTATIONS
// ─────────────────────────────────────────────

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("users"),
    name: v.string(),
    role: ROLE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);
    if (actor.role !== "admin" && actor.role !== "manager") {
      throw new Error("Only admins and managers can modify users.");
    }

    const target = await ctx.db.get(args.id);
    if (!target) throw new Error("User not found");

    if (actor.role === "manager") {
      if (target.role !== "pos_seller" || args.role !== "pos_seller") {
        throw new Error("Managers can only manage POS Sellers.");
      }
    }

    const changes = { name: args.name, role: args.role };
    await ctx.db.patch(args.id, changes);

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "user_updated",
      entityType: "user",
      entityId: args.id,
      details: `@${target.username}: ${describeChanges(target, changes) || "no changes"}`,
    });
  },
});

export const setStatus = mutation({
  args: {
    token: v.string(),
    id: v.id("users"),
    status: STATUS_VALIDATOR,
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);
    if (actor.role !== "admin" && actor.role !== "manager") {
      throw new Error("Only admins and managers can modify user status.");
    }

    const target = await ctx.db.get(args.id);
    if (!target) throw new Error("User not found");

    if (actor.role === "manager" && target.role !== "pos_seller") {
      throw new Error("Managers can only modify POS Sellers.");
    }

    await ctx.db.patch(args.id, { status: args.status });

    // If disabling, invalidate all active sessions
    if (args.status === "DISABLED") {
      const sessions = await ctx.db
        .query("userSessions")
        .withIndex("by_user", (q) => q.eq("userId", args.id))
        .collect();
      for (const s of sessions) {
        await ctx.db.delete(s._id);
      }
    }

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: args.status === "ACTIVE" ? "user_enabled" : "user_disabled",
      entityType: "user",
      entityId: args.id,
      details: `User "${target.username}" ${args.status === "ACTIVE" ? "enabled" : "disabled"}`,
    });
  },
});

