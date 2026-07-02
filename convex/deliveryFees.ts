import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { validateToken } from "./auth";

export const list = query({
  args: {
    activeOnly: v.optional(v.boolean()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let fees = await ctx.db.query("deliveryFees").collect();

    // Filtering active
    if (args.activeOnly) {
      fees = fees.filter((f) => f.active);
    }

    // Filtering search
    if (args.search) {
      const q = args.search.toLowerCase();
      fees = fees.filter((f) => f.name.toLowerCase().includes(q));
    }

    // Sort by name
    return fees.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const getById = query({
  args: { id: v.id("deliveryFees") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    fee: v.number(),
    description: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);
    if (actor.role !== "admin" && actor.role !== "manager") {
      throw new Error("Only Admin and Manager can create delivery fees.");
    }

    if (!args.name || args.name.trim() === "") {
      throw new Error("Name is required.");
    }

    if (args.fee <= 0) {
      throw new Error("Delivery fee must be greater than 0.");
    }

    // Check duplicate name
    const existing = await ctx.db
      .query("deliveryFees")
      .withIndex("by_name", (q) => q.eq("name", args.name.trim()))
      .unique();

    if (existing) {
      throw new Error(`Delivery fee zone "${args.name}" already exists.`);
    }

    const newId = await ctx.db.insert("deliveryFees", {
      name: args.name.trim(),
      fee: args.fee,
      description: args.description,
      active: args.active,
      createdBy: actor.name,
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      userId: actor._id,
      username: actor.username,
      action: "delivery_fee_created",
      details: `Created delivery fee "${args.name}" of ${args.fee} MT`,
      createdAt: Date.now(),
    });

    return newId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("deliveryFees"),
    name: v.string(),
    fee: v.number(),
    description: v.optional(v.string()),
    active: v.boolean(),
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);
    if (actor.role !== "admin" && actor.role !== "manager") {
      throw new Error("Only Admin and Manager can edit delivery fees.");
    }

    if (!args.name || args.name.trim() === "") {
      throw new Error("Name is required.");
    }

    if (args.fee <= 0) {
      throw new Error("Delivery fee must be greater than 0.");
    }

    const existingFee = await ctx.db.get(args.id);
    if (!existingFee) {
      throw new Error("Delivery fee not found.");
    }

    // Check duplicate name if name changed
    if (existingFee.name !== args.name.trim()) {
      const duplicate = await ctx.db
        .query("deliveryFees")
        .withIndex("by_name", (q) => q.eq("name", args.name.trim()))
        .unique();
      if (duplicate) {
        throw new Error(`Delivery fee zone "${args.name}" already exists.`);
      }
    }

    await ctx.db.patch(args.id, {
      name: args.name.trim(),
      fee: args.fee,
      description: args.description,
      active: args.active,
    });

    await ctx.db.insert("auditLogs", {
      userId: actor._id,
      username: actor.username,
      action: "delivery_fee_updated",
      details: `Updated delivery fee "${args.name}" to ${args.fee} MT (Active: ${args.active})`,
      createdAt: Date.now(),
    });
  },
});

export const remove = mutation({
  args: {
    token: v.string(),
    id: v.id("deliveryFees"),
  },
  handler: async (ctx, args) => {
    const actor = await validateToken(ctx, args.token);
    if (actor.role !== "admin" && actor.role !== "manager") {
      throw new Error("Only Admin and Manager can delete delivery fees.");
    }

    const fee = await ctx.db.get(args.id);
    if (!fee) {
      throw new Error("Delivery fee not found.");
    }

    // Check if used in any orders
    const usedInOrders = await ctx.db
      .query("orders")
      .withIndex("by_delivery_fee", (q) => q.eq("deliveryFeeId", args.id))
      .first();

    if (usedInOrders) {
      throw new Error("Cannot delete this delivery fee because it is already used in orders. Please deactivate it instead.");
    }

    await ctx.db.delete(args.id);

    await ctx.db.insert("auditLogs", {
      userId: actor._id,
      username: actor.username,
      action: "delivery_fee_deleted",
      details: `Deleted delivery fee "${fee.name}"`,
      createdAt: Date.now(),
    });
  },
});
