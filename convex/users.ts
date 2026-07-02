import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { validateToken } from "./auth";


const ROLE_VALIDATOR = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("pos_seller")
);

const STATUS_VALIDATOR = v.union(v.literal("active"), v.literal("disabled"));

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
      status: "active",
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
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").order("desc").collect();
    // Strip password hash from public response
    return users.map(({ passwordHash: _h, ...rest }) => rest);
  },
});

export const getById = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.id);
    if (!user) return null;
    const { passwordHash: _h, ...rest } = user;
    return rest;
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

    await ctx.db.patch(args.id, { name: args.name, role: args.role });

    await ctx.db.insert("auditLogs", {
      userId: actor._id,
      username: actor.username,
      action: "user_updated",
      details: `Updated user "${target.username}": name="${args.name}", role="${args.role}"`,
      createdAt: Date.now(),
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
    if (args.status === "disabled") {
      const sessions = await ctx.db
        .query("userSessions")
        .withIndex("by_user", (q) => q.eq("userId", args.id))
        .collect();
      for (const s of sessions) {
        await ctx.db.delete(s._id);
      }
    }

    await ctx.db.insert("auditLogs", {
      userId: actor._id,
      username: actor.username,
      action: args.status === "active" ? "user_enabled" : "user_disabled",
      details: `User "${target.username}" ${args.status === "active" ? "enabled" : "disabled"}`,
      createdAt: Date.now(),
    });
  },
});

