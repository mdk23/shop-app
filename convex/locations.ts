import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const listByBranch = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("locations")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    branchId: v.id("branches"),
    name: v.string(),
    locationType: v.union(v.literal("CENTRAL"), v.literal("STORE"), v.literal("CUSTODY")),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Name the location.");
    if (!(await ctx.db.get(args.branchId))) throw new Error("Branch not found.");
    const id = await ctx.db.insert("locations", {
      branchId: args.branchId,
      name,
      locationType: args.locationType,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "location.created",
      entityType: "location",
      entityId: id,
      details: `${name} (${args.locationType})`,
    });
    return id;
  },
});
