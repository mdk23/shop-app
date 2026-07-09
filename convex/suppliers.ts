import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateToken } from "./auth";

// List suppliers - Optimized with index for status filters
export const list = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return await ctx.db
        .query("suppliers")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .collect();
    }
    // Return all suppliers ordered by creation time if no filter
    return await ctx.db.query("suppliers").collect();
  },
});

// Create a new supplier
export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    paymentTerms: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { token, ...data } = args;
    await validateToken(ctx, token);

    const id = await ctx.db.insert("suppliers", {
      ...data,
      createdAt: Date.now(),
    });
    return id;
  },
});

// Update a supplier's details
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("suppliers"),
    name: v.string(),
    contactName: v.optional(v.string()),
    phone: v.optional(v.string()),
    email: v.optional(v.string()),
    address: v.optional(v.string()),
    status: v.union(v.literal("active"), v.literal("inactive")),
    paymentTerms: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { token, id, ...data } = args;
    await validateToken(ctx, token);

    await ctx.db.patch(id, data);
    return id;
  },
});

// Remove a supplier (Hard Delete)
export const remove = mutation({
  args: {
    token: v.string(),
    id: v.id("suppliers"),
  },
  handler: async (ctx, args) => {
    await validateToken(ctx, args.token);

    // In a future phase, we should prevent deletion if the supplier is linked to Purchase Orders.
    // For Phase 1, we allow direct removal since no purchase orders exist yet.
    await ctx.db.delete(args.id);
    return args.id;
  },
});
