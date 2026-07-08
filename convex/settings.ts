import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

/**
 * Get a single setting by its key.
 * Returns null if not yet created (treat as default: inactive).
 */
export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
  },
});

/**
 * List all settings (for the admin page).
 */
export const getAll = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("settings").collect();
  },
});

/**
 * Create or update a setting by key.
 */
export const upsert = mutation({
  args: {
    key: v.string(),
    isActive: v.boolean(),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        isActive: args.isActive,
        label: args.label ?? existing.label,
        updatedAt: Date.now(),
      });
      return existing._id;
    } else {
      return await ctx.db.insert("settings", {
        key: args.key,
        isActive: args.isActive,
        label: args.label,
        updatedAt: Date.now(),
      });
    }
  },
});



