import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { generateSku } from "./productVariants";
import { variantLabel } from "./inventory";

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const list = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    brandId: v.optional(v.id("brands")),
    search: v.optional(v.string()),
    includeInactive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let products;
    if (args.search && args.search.trim()) {
      products = await ctx.db
        .query("products")
        .withSearchIndex("search_name", (q) => q.search("name", args.search!))
        .take(100);
    } else if (args.categoryId) {
      products = await ctx.db
        .query("products")
        .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
        .collect();
    } else if (args.brandId) {
      products = await ctx.db
        .query("products")
        .withIndex("by_brand", (q) => q.eq("brandId", args.brandId!))
        .collect();
    } else {
      products = await ctx.db.query("products").order("desc").take(200);
    }

    if (!args.includeInactive) products = products.filter((p) => p.active);
    if (args.categoryId)
      products = products.filter((p) => p.categoryId === args.categoryId);
    if (args.brandId)
      products = products.filter((p) => p.brandId === args.brandId);

    return await Promise.all(
      products.map(async (p) => {
        const variants = await ctx.db
          .query("productVariants")
          .withIndex("by_product", (q) => q.eq("productId", p._id))
          .collect();
        const category = await ctx.db.get(p.categoryId);
        const brand = p.brandId ? await ctx.db.get(p.brandId) : null;
        return {
          ...p,
          categoryName: category?.name ?? "—",
          brandName: brand?.name ?? null,
          variantCount: variants.length,
          activeVariantCount: variants.filter((v) => v.active).length,
        };
      })
    );
  },
});

export const get = query({
  args: { id: v.id("products") },
  handler: async (ctx, args) => {
    const product = await ctx.db.get(args.id);
    if (!product) return null;
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", args.id))
      .collect();
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_product", (q) => q.eq("productId", args.id))
      .collect();
    const category = await ctx.db.get(product.categoryId);
    const brand = product.brandId ? await ctx.db.get(product.brandId) : null;
    const imagesWithUrls = await Promise.all(
      images
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (img) => ({
          ...img,
          url: await ctx.storage.getUrl(img.storageId),
        }))
    );
    return {
      ...product,
      category,
      brand,
      variants: variants.sort((a, b) => a.sku.localeCompare(b.sku)),
      images: imagesWithUrls,
    };
  },
});

/**
 * POS catalog feed: active products + active variants + this branch's stock,
 * shaped for the register grid. Lookup by name is done client-side against this
 * list; `productVariants.getBySkuOrBarcode` handles exact SKU/barcode entry.
 */
export const listForPos = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const products = await ctx.db
      .query("products")
      .withIndex("by_active", (q) => q.eq("active", true))
      .collect();

    const categories = await ctx.db.query("categories").collect();
    const brands = await ctx.db.query("brands").collect();
    const catName = new Map(categories.map((c) => [c._id, c.name]));
    const brandName = new Map(brands.map((b) => [b._id, b.name]));

    const result = [];
    for (const p of products) {
      const variants = await ctx.db
        .query("productVariants")
        .withIndex("by_product", (q) => q.eq("productId", p._id))
        .collect();
      const activeVariants = [];
      for (const variant of variants.filter((v) => v.active)) {
        const stock = await ctx.db
          .query("variantStock")
          .withIndex("by_branch_and_variant", (q) =>
            q.eq("branchId", args.branchId).eq("productVariantId", variant._id)
          )
          .unique();
        activeVariants.push({
          ...variant,
          label: variantLabel(variant),
          stock: stock?.quantity ?? 0,
        });
      }
      if (activeVariants.length === 0) continue;
      result.push({
        _id: p._id,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: catName.get(p.categoryId) ?? "—",
        brandId: p.brandId ?? null,
        brandName: p.brandId ? brandName.get(p.brandId) ?? null : null,
        defaultSellingPrice: p.defaultSellingPrice,
        variants: activeVariants,
      });
    }
    return result;
  },
});

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    categoryId: v.id("categories"),
    brandId: v.optional(v.id("brands")),
    defaultCostPrice: v.number(),
    defaultSellingPrice: v.number(),
    variants: v.optional(
      v.array(
        v.object({
          size: v.optional(v.string()),
          color: v.optional(v.string()),
          sku: v.optional(v.string()),
          barcode: v.optional(v.string()),
          costPrice: v.optional(v.number()),
          sellingPrice: v.optional(v.number()),
          reorderLevel: v.optional(v.number()),
        })
      )
    ),
  },
  handler: async (ctx, args): Promise<Id<"products">> => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Product name is required.");
    const now = Date.now();

    const productId = await ctx.db.insert("products", {
      name,
      description: args.description,
      categoryId: args.categoryId,
      brandId: args.brandId,
      defaultCostPrice: args.defaultCostPrice,
      defaultSellingPrice: args.defaultSellingPrice,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    for (const spec of args.variants ?? []) {
      const sku =
        spec.sku?.trim() ||
        (await generateSku(ctx, name, spec.color, spec.size));
      await ctx.db.insert("productVariants", {
        productId,
        sku,
        barcode: spec.barcode?.trim() || undefined,
        size: spec.size?.trim() || undefined,
        color: spec.color?.trim() || undefined,
        costPrice: spec.costPrice ?? args.defaultCostPrice,
        sellingPrice: spec.sellingPrice ?? args.defaultSellingPrice,
        reorderLevel: spec.reorderLevel ?? 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "product.created",
      entityType: "product",
      entityId: productId,
      details: `Created product "${name}" with ${args.variants?.length ?? 0} variant(s)`,
    });
    return productId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("products"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    categoryId: v.optional(v.id("categories")),
    brandId: v.optional(v.union(v.id("brands"), v.null())),
    defaultCostPrice: v.optional(v.number()),
    defaultSellingPrice: v.optional(v.number()),
    primaryImageId: v.optional(v.union(v.id("_storage"), v.null())),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found.");

    if (
      args.defaultCostPrice !== undefined &&
      args.defaultCostPrice !== existing.defaultCostPrice
    ) {
      await authorize(ctx, args.token, "products.change_cost");
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.categoryId !== undefined) patch.categoryId = args.categoryId;
    if (args.brandId !== undefined)
      patch.brandId = args.brandId ?? undefined;
    if (args.defaultCostPrice !== undefined)
      patch.defaultCostPrice = args.defaultCostPrice;
    if (args.defaultSellingPrice !== undefined)
      patch.defaultSellingPrice = args.defaultSellingPrice;
    if (args.primaryImageId !== undefined)
      patch.primaryImageId = args.primaryImageId ?? undefined;
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "product.updated",
      entityType: "product",
      entityId: args.id,
      details: `Updated product "${existing.name}"`,
    });
  },
});

/** Soft delete: deactivate the product and all its variants. */
export const archive = mutation({
  args: { token: v.string(), id: v.id("products") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", args.id))
      .collect();
    for (const variant of variants) {
      await ctx.db.patch(variant._id, { active: false, updatedAt: Date.now() });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "product.archived",
      entityType: "product",
      entityId: args.id,
      details: `Archived product "${existing.name}" (${variants.length} variants)`,
    });
  },
});

/** Hard delete: only allowed when the product has never been sold. */
export const remove = mutation({
  args: { token: v.string(), id: v.id("products") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.delete");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found.");

    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", args.id))
      .collect();
    for (const variant of variants) {
      const soldLine = await ctx.db
        .query("saleItems")
        .withIndex("by_variant", (q) => q.eq("productVariantId", variant._id))
        .first();
      if (soldLine) {
        throw new Error(
          "This product has sales history and cannot be deleted. Archive it instead."
        );
      }
    }

    for (const variant of variants) {
      const stockRows = await ctx.db
        .query("variantStock")
        .withIndex("by_variant", (q) => q.eq("productVariantId", variant._id))
        .collect();
      for (const s of stockRows) await ctx.db.delete(s._id);
      await ctx.db.delete(variant._id);
    }
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_product", (q) => q.eq("productId", args.id))
      .collect();
    for (const img of images) {
      await ctx.storage.delete(img.storageId);
      await ctx.db.delete(img._id);
    }
    await ctx.db.delete(args.id);

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "product.deleted",
      entityType: "product",
      entityId: args.id,
      details: `Deleted product "${existing.name}"`,
    });
  },
});
