import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("sizeScales").collect();
    return rows.filter((r) => r.active).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    scaleType: v.union(v.literal("CLOTHING"), v.literal("SHOE"), v.literal("GENERAL")),
    region: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Scale name is required.");
    const now = Date.now();
    const id = await ctx.db.insert("sizeScales", {
      name,
      scaleType: args.scaleType,
      region: args.region?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "sizeScale.created",
      entityType: "sizeScale",
      entityId: id,
      details: `Created size scale "${name}"`,
    });
    return id;
  },
});
