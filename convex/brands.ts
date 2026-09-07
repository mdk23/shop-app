import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = args.includeInactive
      ? await ctx.db.query("brands").collect()
      : await ctx.db
          .query("brands")
          .withIndex("by_active", (q) => q.eq("active", true))
          .collect();
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    return await ctx.db
      .query("brands")
      .withSearchIndex("search_name", (q) => q.search("name", args.query))
      .take(15);
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Brand name is required.");
    const now = Date.now();
    const id = await ctx.db.insert("brands", {
      name,
      description: args.description,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "brand.created",
      entityType: "brand",
      entityId: id,
      details: `Created brand "${name}"`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("brands"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Brand not found.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.active !== undefined) patch.active = args.active;
    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "brand.updated",
      entityType: "brand",
      entityId: args.id,
      details: `Updated brand "${existing.name}"`,
    });
  },
});

export const deactivate = mutation({
  args: { token: v.string(), id: v.id("brands") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Brand not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "brand.deactivated",
      entityType: "brand",
      entityId: args.id,
      details: `Deactivated brand "${existing.name}"`,
    });
  },
});
