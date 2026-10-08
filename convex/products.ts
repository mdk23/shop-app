import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { describeChanges, writeAudit } from "./audit";
import { generateSku } from "./productVariants";
import { formatVariantLabel, loadVariantNames } from "./lib/variantNames";
import { recordVariantPrice, resolveColorId, resolveSizeId } from "./lib/catalog";

/**
 * A product's price range, read from its variants (prices live on variants only). Uses the
 * active variants, or all of them when none is active. Nulls when there are no variants.
 */
export function priceRange(variants: Doc<"productVariants">[]) {
  const live = variants.filter((v) => v.active);
  const from = live.length > 0 ? live : variants;
  if (from.length === 0) return { minPrice: null, maxPrice: null, minCost: null, maxCost: null };
  const prices = from.map((v) => v.sellingPrice);
  const costs = from.map((v) => v.costPrice);
  return {
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    minCost: Math.min(...costs),
    maxCost: Math.max(...costs),
  };
}

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const list = query({
  args: {
    categoryId: v.optional(v.id("categories")),
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
    } else {
      products = await ctx.db.query("products").order("desc").take(200);
    }

    if (!args.includeInactive) products = products.filter((p) => p.active);
    if (args.categoryId)
      products = products.filter((p) => p.categoryId === args.categoryId);

    return await Promise.all(
      products.map(async (p) => {
        const variants = await ctx.db
          .query("productVariants")
          .withIndex("by_product", (q) => q.eq("productId", p._id))
          .collect();
        const category = await ctx.db.get(p.categoryId);
        return {
          ...p,
          categoryName: category?.name ?? "—",
          variantCount: variants.length,
          activeVariantCount: variants.filter((v) => v.active).length,
          ...priceRange(variants),
        };
      })
    );
  },
});

/**
 * Cursor-paginated feed for the Products table. Reads only `paginationOpts.numItems`
 * documents per page via an index (or the search index when `search` is set),
 * so browsing a large catalog costs O(page size) document reads, not O(catalog size).
 *
 * Note: combining `search` with `categoryId` still applies the category as an
 * in-memory filter on top of the search page, so that one combination can return
 * fewer than a full page of rows — everything else (default browse, category-only,
 * search-only) returns exact pages straight from an index.
 */
export const listPaged = query({
  args: {
    categoryId: v.optional(v.id("categories")),
    search: v.optional(v.string()),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result =
      args.search && args.search.trim()
        ? await ctx.db
            .query("products")
            .withSearchIndex("search_name", (q) => q.search("name", args.search!))
            .paginate(args.paginationOpts)
        : args.categoryId
          ? await ctx.db
              .query("products")
              .withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
              .order("desc")
              .paginate(args.paginationOpts)
          : await ctx.db.query("products").order("desc").paginate(args.paginationOpts);

    let page = result.page;
    if (args.search && args.categoryId) {
      page = page.filter((p) => p.categoryId === args.categoryId);
    }

    const enriched = await Promise.all(
      page.map(async (p) => {
        const variants = await ctx.db
          .query("productVariants")
          .withIndex("by_product", (q) => q.eq("productId", p._id))
          .collect();
        const category = await ctx.db.get(p.categoryId);
        return {
          ...p,
          categoryName: category?.name ?? "—",
          variantCount: variants.length,
          activeVariantCount: variants.filter((v) => v.active).length,
          ...priceRange(variants),
        };
      })
    );

    return { ...result, page: enriched };
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
    const imagesWithUrls = await Promise.all(
      images
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (img) => ({
          ...img,
          url: await ctx.storage.getUrl(img.storageId),
        }))
    );
    const namesOf = await loadVariantNames(ctx);
    return {
      ...product,
      category,
      ...priceRange(variants),
      variants: variants
        .sort((a, b) => a.sku.localeCompare(b.sku))
        .map((variant) => ({ ...variant, ...namesOf(variant) })),
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
    const catName = new Map(categories.map((c) => [c._id, c.name]));

    const namesOf = await loadVariantNames(ctx);
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
        const names = namesOf(variant);
        activeVariants.push({
          ...variant,
          ...names,
          label: formatVariantLabel(names, variant.sku),
          stock: stock?.quantity ?? 0,
        });
      }
      if (activeVariants.length === 0) continue;
      result.push({
        _id: p._id,
        name: p.name,
        categoryId: p.categoryId,
        categoryName: catName.get(p.categoryId) ?? "—",
        gender: p.gender ?? "unisex",
        ...priceRange(variants),
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
    taxRateId: v.optional(v.id("taxRates")),
    gender: v.optional(v.union(v.literal("women"), v.literal("men"), v.literal("unisex"))),
    // Cost and price for the variants created with the product (each variant may override).
    // Prices are kept on the variants only.
    costPrice: v.optional(v.number()),
    sellingPrice: v.optional(v.number()),
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
      taxRateId: args.taxRateId,
      gender: args.gender ?? "unisex",
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    for (const spec of args.variants ?? []) {
      const sku =
        spec.sku?.trim() ||
        (await generateSku(ctx, name, spec.color, spec.size));
      const sellingPrice = spec.sellingPrice ?? args.sellingPrice;
      const costPrice = spec.costPrice ?? args.costPrice;
      if (sellingPrice === undefined || costPrice === undefined) {
        throw new Error("Enter the cost and selling price for the variants.");
      }
      const variantId = await ctx.db.insert("productVariants", {
        productId,
        sku,
        barcode: spec.barcode?.trim() || undefined,
        sizeId: await resolveSizeId(ctx, spec.size),
        colorId: await resolveColorId(ctx, spec.color),
        costPrice,
        sellingPrice,
        reorderLevel: spec.reorderLevel ?? 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await recordVariantPrice(ctx, variantId, { sellingPrice, costPrice }, now);
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
    taxRateId: v.optional(v.union(v.id("taxRates"), v.null())),
    gender: v.optional(v.union(v.literal("women"), v.literal("men"), v.literal("unisex"))),
    primaryImageId: v.optional(v.union(v.id("_storage"), v.null())),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Product not found.");

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.name !== undefined) patch.name = args.name.trim();
    if (args.description !== undefined) patch.description = args.description;
    if (args.categoryId !== undefined) patch.categoryId = args.categoryId;
    if (args.taxRateId !== undefined) patch.taxRateId = args.taxRateId ?? undefined;
    if (args.gender !== undefined) patch.gender = args.gender;
    if (args.primaryImageId !== undefined)
      patch.primaryImageId = args.primaryImageId ?? undefined;
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(args.id, patch);
    // Log every changed field, old → new, with the category by name.
    const otherChanges = Object.fromEntries(Object.entries(patch).filter(([key]) => key !== "categoryId"));
    const categoryName = async (id: unknown) =>
      id ? (await ctx.db.get(id as Id<"categories">))?.name : undefined;
    const changes = describeChanges(
      { ...existing, category: await categoryName(existing.categoryId) },
      { ...otherChanges, ...("categoryId" in patch ? { category: await categoryName(patch.categoryId) } : {}) }
    );
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "product.updated",
      entityType: "product",
      entityId: args.id,
      details: `"${existing.name}": ${changes || "no changes"}`,
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
