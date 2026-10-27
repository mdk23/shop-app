import { query, mutation, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { authorize, validateToken } from "./permissions";
import { writeAudit } from "./audit";
import { getSetting } from "./settings";

// List all branches (Admin view)
export const listAll = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await validateToken(ctx, args.token);
    return await ctx.db.query("branches").take(1000);
  },
});

// List active branches (Selection view)
export const listActive = query({
  handler: async (ctx) => {
    const branches = await ctx.db
      .query("branches")
      .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
      .take(1000);

    // If no branches exist, return empty array
    return branches;
  },
});

// With multi-branch mode off the shop runs a single active branch.
async function assertCanAddActiveBranch(ctx: MutationCtx, exceptId?: Id<"branches">) {
  const multiBranch = (await getSetting(ctx, "multiBranchEnabled"))?.isActive ?? true;
  if (multiBranch) return;
  const active = await ctx.db
    .query("branches")
    .withIndex("by_status", (q) => q.eq("status", "ACTIVE"))
    .take(1000);
  if (active.some((b) => b._id !== exceptId)) {
    throw new Error("Multi-branch mode is off. Turn it on in Settings to add another branch.");
  }
}

// Create a new store branch
export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    code: v.string(),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    await assertCanAddActiveBranch(ctx);
    const existingCode = await ctx.db
      .query("branches")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .first();

    if (existingCode) {
      throw new Error(`Branch with code '${args.code}' already exists.`);
    }

    if (args.isDefault) {
      // Unset previous defaults
      const allBranches = await ctx.db.query("branches").take(1000);
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
      status: "ACTIVE",
      isDefault: args.isDefault ?? false,
      createdAt: Date.now(),
    });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "branch.created",
      entityType: "branch",
      entityId: branchId,
      details: `${args.name} (${args.code.toUpperCase()})`,
    });
    return branchId;
  },
});

// Update branch details or status
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("branches"),
    name: v.optional(v.string()),
    code: v.optional(v.string()),
    address: v.optional(v.string()),
    phone: v.optional(v.string()),
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("INACTIVE"))),
    isDefault: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const branch = await ctx.db.get(args.id);
    if (!branch) {
      throw new Error("Branch not found.");
    }
    if (args.status === "ACTIVE" && branch.status !== "ACTIVE") {
      await assertCanAddActiveBranch(ctx, args.id);
    }

    if (args.isDefault) {
      const allBranches = await ctx.db.query("branches").take(1000);
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
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "branch.updated",
      entityType: "branch",
      entityId: args.id,
      details: branch.name,
    });
  },
});

// Ensure a default branch exists (seed fallback)
export const ensureDefaultBranch = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    const branches = await ctx.db.query("branches").take(1000);
    if (branches.length === 0) {
      const defaultId = await ctx.db.insert("branches", {
        name: "Main Store",
        code: "MAIN",
        address: "Headquarters",
        status: "ACTIVE",
        isDefault: true,
        createdAt: Date.now(),
      });
      return defaultId;
    }
    return branches[0]._id;
  },
});
