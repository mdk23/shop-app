"use node";

import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import bcrypt from "bcryptjs";
import { api, internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";

const ROLE_VALIDATOR = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("pos_seller")
);

/**
 * Create a new user with a hashed password.
 * Requires bcrypt → must run in Node.js.
 */
export const createUser = action({
  args: {
    token: v.string(),
    name: v.string(),
    username: v.string(),
    password: v.string(),
    role: ROLE_VALIDATOR,
  },
  handler: async (ctx, args) => {
    // Validate session token
    const session = (await ctx.runQuery(api.auth.getSession, { token: args.token })) as any;
    if (!session) {
      throw new ConvexError("Session expired. Please log in again.");
    }
    if (session.role !== "admin" && session.role !== "manager") {
      throw new ConvexError("Unauthorized. Only admins and managers can create users.");
    }
    if (session.role === "manager" && args.role !== "pos_seller") {
      throw new ConvexError("Managers can only create POS Sellers.");
    }

    if (args.password.length < 4) {
      throw new ConvexError("Password must be at least 4 characters");
    }

    const passwordHash = await bcrypt.hash(args.password, 10);

    const userId = (await ctx.runMutation(internal.users.insertUser, {
      name: args.name,
      username: args.username.trim().toLowerCase(),
      passwordHash,
      role: args.role,
    })) as Id<"users">;

    await ctx.runMutation(internal.auth.logAudit, {
      userId: session.userId,
      username: session.username,
      action: "user_created",
      details: `Created user "${args.username}" with role "${args.role}"`,
    });

    return userId;
  },
});

/**
 * Reset a user's password.
 * Requires bcrypt → must run in Node.js.
 */
export const resetPassword = action({
  args: {
    token: v.string(),
    id: v.id("users"),
    newPassword: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate session token
    const session = (await ctx.runQuery(api.auth.getSession, { token: args.token })) as any;
    if (!session) {
      throw new ConvexError("Session expired. Please log in again.");
    }
    if (session.role !== "admin" && session.role !== "manager") {
      throw new ConvexError("Unauthorized. Only admins and managers can reset passwords.");
    }

    // Managers can only reset passwords for POS Sellers
    const targetUser = (await ctx.runQuery(api.users.getById, { id: args.id })) as any;
    if (!targetUser) {
      throw new ConvexError("User not found");
    }
    if (session.role === "manager" && targetUser.role !== "pos_seller") {
      throw new ConvexError("Managers can only reset passwords for POS Sellers.");
    }

    if (args.newPassword.length < 4) {
      throw new ConvexError("Password must be at least 4 characters");
    }

    const passwordHash = await bcrypt.hash(args.newPassword, 10);

    await ctx.runMutation(internal.users.updatePasswordHash, {
      id: args.id,
      passwordHash,
    });

    await ctx.runMutation(internal.auth.logAudit, {
      userId: session.userId,
      username: session.username,
      action: "password_reset",
      details: `Password reset for user @${targetUser.username}`,
    });
  },
});

/**
 * Seed the first admin user. Only works if no users exist.
 * Use this once to bootstrap the system.
 */
export const seedAdmin = action({
  args: {
    name: v.string(),
    username: v.string(),
    password: v.string(),
  },
  handler: async (ctx, args) => {
    // Check if any users exist
    const existingCheck = await ctx.runQuery(internal.users.getByUsername, {
      username: args.username.trim().toLowerCase(),
    });

    if (existingCheck) {
      throw new ConvexError("Admin user already exists with that username");
    }

    const passwordHash = await bcrypt.hash(args.password, 10);

    // We need a userId for audit log, but we're creating the first user.
    // Insert without audit for bootstrap.
    const userId = (await ctx.runMutation(internal.users.insertUser, {
      name: args.name,
      username: args.username.trim().toLowerCase(),
      passwordHash,
      role: "admin",
    })) as Id<"users">;

    return userId;
  },
});
