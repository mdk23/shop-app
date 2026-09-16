import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

/**
 * When a category is switched off, every product in it (and each product's
 * variants) is deactivated too — a category can't be "off" while its products
 * still show up active in the catalog / POS. Returns how many products were
 * affected, for the audit trail. Turning the category back on does NOT
 * reactivate products, since some may have been individually archived for
 * unrelated reasons.
 */
async function cascadeDeactivateProducts(
  ctx: MutationCtx,
  categoryId: Id<"categories">
): Promise<number> {
  const products = await ctx.db
    .query("products")
    .withIndex("by_category", (q) => q.eq("categoryId", categoryId))
    .collect();
  const now = Date.now();
  let affected = 0;
  for (const p of products) {
    if (p.active) {
      await ctx.db.patch(p._id, { active: false, updatedAt: now });
      affected += 1;
    }
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", p._id))
      .collect();
    for (const variant of variants) {
      if (variant.active) await ctx.db.patch(variant._id, { active: false, updatedAt: now });
    }
  }
  return affected;
}

export const list = query({
  args: { includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = args.includeInactive
      ? await ctx.db.query("categories").collect()
      : await ctx.db
          .query("categories")
          .withIndex("by_active", (q) => q.eq("active", true))
          .collect();
    const sorted = rows.sort(
      (a, b) =>
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name)
    );
    return await Promise.all(
      sorted.map(async (c) => {
        const products = await ctx.db
          .query("products")
          .withIndex("by_category", (q) => q.eq("categoryId", c._id))
          .collect();
        return { ...c, productCount: products.length };
      })
    );
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    if (!args.query.trim()) return [];
    return await ctx.db
      .query("categories")
      .withSearchIndex("search_name", (q) => q.search("name", args.query))
      .take(15);
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Category name is required.");
    const now = Date.now();
    const id = await ctx.db.insert("categories", {
      name,
      description: args.description,
      active: true,
      sortOrder: args.sortOrder,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "category.created",
      entityType: "category",
      entityId: id,
      details: `Created category "${name}"`,
    });
    return id;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("categories"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    active: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Category not found.");
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.active !== undefined) patch.active = args.active;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    await ctx.db.patch(args.id, patch);

    let cascaded = 0;
    if (args.active === false && existing.active) {
      cascaded = await cascadeDeactivateProducts(ctx, args.id);
    }

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "category.updated",
      entityType: "category",
      entityId: args.id,
      details:
        cascaded > 0
          ? `Updated category "${existing.name}" (deactivated ${cascaded} product(s))`
          : `Updated category "${existing.name}"`,
    });
    return { cascadedCount: cascaded };
  },
});

/** Hard delete: only allowed when no product is assigned to this category. */
export const remove = mutation({
  args: { token: v.string(), id: v.id("categories") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Category not found.");

    const inUse = await ctx.db
      .query("products")
      .withIndex("by_category", (q) => q.eq("categoryId", args.id))
      .first();
    if (inUse) {
      throw new Error(
        "This category has products assigned to it and cannot be deleted. Deactivate it instead."
      );
    }

    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "category.deleted",
      entityType: "category",
      entityId: args.id,
      details: `Deleted category "${existing.name}"`,
    });
  },
});

export const deactivate = mutation({
  args: { token: v.string(), id: v.id("categories") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Category not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
    const cascaded = existing.active
      ? await cascadeDeactivateProducts(ctx, args.id)
      : 0;
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "category.deactivated",
      entityType: "category",
      entityId: args.id,
      details:
        cascaded > 0
          ? `Deactivated category "${existing.name}" (deactivated ${cascaded} product(s))`
          : `Deactivated category "${existing.name}"`,
    });
  },
});
