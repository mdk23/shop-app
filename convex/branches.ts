import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// List all branches (Admin view)
export const listAll = query({
  handler: async (ctx) => {
    return await ctx.db.query("branches").collect();
  },
});

// List active branches (Selection view)
export const listActive = query({
  handler: async (ctx) => {
    const branches = await ctx.db
      .query("branches")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();

    // If no branches exist, return empty array
    return branches;
  },
});

// Create a new store branch
export const create = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existingCode = await ctx.db
      .query("branches")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (existingCode) {
      throw new Error(`Branch with code '${args.code}' already exists.`);
    }

    if (args.isDefault) {
      // Unset previous defaults
      const allBranches = await ctx.db.query("branches").collect();
      for (const b of allBranches) {
        if (b.isDefault) {
          await ctx.db.patch(b._id, { isDefault: false });
        }
      }
    }

    const branchId = await ctx.db.insert("branches", {
      name: args.name,
      code: args.code.toUpperCase(),
      address: args.address,
      phone: args.phone,
      status: "active",
      isDefault: args.isDefault ?? false,
      createdAt: Date.now(),
    });

    return branchId;
  },
});

// Update branch details or status
export const update = mutation({
  args: {
    id: v.id("branches"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const branch = await ctx.db.get(args.id);
    if (!branch) {
      throw new Error("Branch not found.");
    }

    if (args.isDefault) {
      const allBranches = await ctx.db.query("branches").collect();
      for (const b of allBranches) {
        if (b._id !== args.id && b.isDefault) {
          await ctx.db.patch(b._id, { isDefault: false });
        }
      }
    }

    const patchData: Partial<typeof branch> = {};
    if (args.name !== undefined) patchData.name = args.name;
    if (args.code !== undefined) patchData.code = args.code.toUpperCase();
    if (args.address !== undefined) patchData.address = args.address;
    if (args.phone !== undefined) patchData.phone = args.phone;
    if (args.status !== undefined) patchData.status = args.status;
    if (args.isDefault !== undefined) patchData.isDefault = args.isDefault;

    await ctx.db.patch(args.id, patchData);
  },
});

// Ensure a default branch exists (seed fallback)
export const ensureDefaultBranch = mutation({
  handler: async (ctx) => {
    const branches = await ctx.db.query("branches").collect();
    if (branches.length === 0) {
      const defaultId = await ctx.db.insert("branches", {
        name: "Main Store",
        code: "MAIN",
        address: "Headquarters",
        status: "active",
        isDefault: true,
        createdAt: Date.now(),
      });
      return defaultId;
    }
    return branches[0]._id;
  },
});
