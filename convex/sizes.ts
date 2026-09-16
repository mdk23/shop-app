import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

/**
 * Configurable size taxonomy (e.g. XS, S, M, L, XL, or numeric sizes like
 * 30/32/34). Keeps variant size labels consistent across products instead of
 * free text typed per-product.
 */

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = args.includeInactive
      ? await ctx.db.query("sizes").collect()
      : await ctx.db
          .query("sizes")
          .withIndex("by_active", (q) => q.eq("active", true))
          .collect();
    return rows.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Size name is required.");
    const existing = await ctx.db.query("sizes").collect();
    if (existing.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Size "${name}" already exists.`);
    }
    const now = Date.now();
    const id = await ctx.db.insert("sizes", {
      name,
      active: true,
      sortOrder: args.sortOrder ?? existing.length,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "size.created",
      entityType: "size",
      entityId: id,
      details: `Created size "${name}"`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("sizes"),
    name: v.optional(v.string()),
    active: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Size not found.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.active !== undefined) patch.active = args.active;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "size.updated",
      entityType: "size",
      entityId: args.id,
      details: `Updated size "${existing.name}"`,
    });
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("sizes") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Size not found.");
    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "size.deleted",
      entityType: "size",
      entityId: args.id,
      details: `Deleted size "${existing.name}"`,
    });
  },
});
