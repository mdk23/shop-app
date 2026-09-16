import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

/**
 * Configurable colour taxonomy used when creating variants. Keeps colour
 * labels consistent across products instead of free text typed per-product.
 */

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = args.includeInactive
      ? await ctx.db.query("colors").collect()
      : await ctx.db
          .query("colors")
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
    hex: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Color name is required.");
    const existing = await ctx.db.query("colors").collect();
    if (existing.some((c) => c.name.toLowerCase() === name.toLowerCase())) {
      throw new Error(`Color "${name}" already exists.`);
    }
    const now = Date.now();
    const id = await ctx.db.insert("colors", {
      name,
      hex: args.hex || undefined,
      active: true,
      sortOrder: args.sortOrder ?? existing.length,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "color.created",
      entityType: "color",
      entityId: id,
      details: `Created color "${name}"`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("colors"),
    name: v.optional(v.string()),
    hex: v.optional(v.string()),
    active: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Color not found.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.hex !== undefined) patch.hex = args.hex || undefined;
    if (args.active !== undefined) patch.active = args.active;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "color.updated",
      entityType: "color",
      entityId: args.id,
      details: `Updated color "${existing.name}"`,
    });
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("colors") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Color not found.");
    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "color.deleted",
      entityType: "color",
      entityId: args.id,
      details: `Deleted color "${existing.name}"`,
    });
  },
});
