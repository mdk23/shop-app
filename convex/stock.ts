import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { variantLabel } from "./inventory";

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function stockStatus(quantity: number, reorderLevel: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= reorderLevel) return "LOW_STOCK";
  return "IN_STOCK";
}

async function stockRowsForBranch(
  ctx: QueryCtx,
  branchId: Id<"branches">,
  variantId: Id<"productVariants">
) {
  return await ctx.db
    .query("variantStock")
    .withIndex("by_branch_and_variant", (q) =>
      q.eq("branchId", branchId).eq("productVariantId", variantId)
    )
    .unique();
}

export const getForVariant = query({
  args: { productVariantId: v.id("productVariants"), branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const variant = await ctx.db.get(args.productVariantId);
    if (!variant) return null;
    const row = await stockRowsForBranch(
      ctx,
      args.branchId,
      args.productVariantId
    );
    const quantity = row?.quantity ?? 0;
    const reorderLevel = row?.reorderLevel ?? variant.reorderLevel;
    return {
      productVariantId: args.productVariantId,
      branchId: args.branchId,
      quantity,
      available: quantity, // reservations not modelled yet
      reorderLevel,
      status: stockStatus(quantity, reorderLevel),
    };
  },
});

/**
 * Inventory screen feed: every active variant with this branch's stock level,
 * product/category/brand context and computed status.
 */
export const listInventory = query({
  args: {
    branchId: v.id("branches"),
    categoryId: v.optional(v.id("categories")),
    brandId: v.optional(v.id("brands")),
    status: v.optional(
      v.union(
        v.literal("IN_STOCK"),
        v.literal("LOW_STOCK"),
        v.literal("OUT_OF_STOCK")
      )
    ),
    search: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(limit * 4);

    const productCache = new Map<Id<"products">, Doc<"products"> | null>();
    const categoryName = new Map<string, string>();
    const brandName = new Map<string, string>();
    for (const c of await ctx.db.query("categories").collect())
      categoryName.set(c._id, c.name);
    for (const b of await ctx.db.query("brands").collect())
      brandName.set(b._id, b.name);

    const rows = [];
    const search = args.search?.trim().toLowerCase();
    for (const variant of variants) {
      let product = productCache.get(variant.productId);
      if (product === undefined) {
        product = await ctx.db.get(variant.productId);
        productCache.set(variant.productId, product);
      }
      if (!product || !product.active) continue;
      if (args.categoryId && product.categoryId !== args.categoryId) continue;
      if (args.brandId && product.brandId !== args.brandId) continue;

      const stock = await stockRowsForBranch(ctx, args.branchId, variant._id);
      const quantity = stock?.quantity ?? 0;
      const reorderLevel = stock?.reorderLevel ?? variant.reorderLevel;
      const status = stockStatus(quantity, reorderLevel);
      if (args.status && status !== args.status) continue;

      const label = variantLabel(variant);
      if (
        search &&
        !product.name.toLowerCase().includes(search) &&
        !variant.sku.toLowerCase().includes(search) &&
        !(variant.barcode ?? "").toLowerCase().includes(search) &&
        !label.toLowerCase().includes(search)
      )
        continue;

      rows.push({
        productId: product._id,
        productName: product.name,
        categoryName: categoryName.get(product.categoryId) ?? "—",
        brandName: product.brandId
          ? brandName.get(product.brandId) ?? null
          : null,
        productVariantId: variant._id,
        sku: variant.sku,
        barcode: variant.barcode ?? null,
        size: variant.size ?? null,
        color: variant.color ?? null,
        label,
        costPrice: variant.costPrice,
        sellingPrice: variant.sellingPrice,
        quantity,
        reorderLevel,
        status,
      });
      if (rows.length >= limit) break;
    }
    return rows;
  },
});

export const lowStockSummary = query({
  args: { branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    const stockRows = args.branchId
      ? await ctx.db
          .query("variantStock")
          .withIndex("by_branch", (q) => q.eq("branchId", args.branchId!))
          .collect()
      : await ctx.db.query("variantStock").collect();

    let low = 0;
    let out = 0;
    const items: {
      productVariantId: Id<"productVariants">;
      label: string;
      quantity: number;
      reorderLevel: number;
      status: StockStatus;
    }[] = [];
    for (const row of stockRows) {
      const variant = await ctx.db.get(row.productVariantId);
      if (!variant || !variant.active) continue;
      const reorderLevel = row.reorderLevel ?? variant.reorderLevel;
      const status = stockStatus(row.quantity, reorderLevel);
      if (status === "IN_STOCK") continue;
      if (status === "LOW_STOCK") low += 1;
      else out += 1;
      const product = await ctx.db.get(variant.productId);
      items.push({
        productVariantId: row.productVariantId,
        label: `${product?.name ?? "?"} — ${variantLabel(variant)}`,
        quantity: row.quantity,
        reorderLevel,
        status,
      });
    }
    items.sort((a, b) => a.quantity - b.quantity);
    return { lowStockCount: low, outOfStockCount: out, items: items.slice(0, 50) };
  },
});
