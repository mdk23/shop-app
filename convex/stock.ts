import { authorize } from "./permissions";
import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { variantLabel } from "./inventory";
import { formatVariantLabel, loadVariantNames } from "./lib/variantNames";

import { stockStatus, type StockStatus } from "./lib/stockTotals";
export { stockStatus, type StockStatus };

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
  args: {
    token: v.string(), productVariantId: v.id("productVariants"), branchId: v.id("branches") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "inventory.view");
    const variant = await ctx.db.get(args.productVariantId);
    if (!variant) return null;
    const row = await stockRowsForBranch(
      ctx,
      args.branchId,
      args.productVariantId
    );
    const quantity = row?.quantity ?? 0;
    const reorderLevel = variant.reorderLevel;
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
 * product/category context and computed status.
 */
export const listInventory = query({
  args: {
    token: v.string(),
    branchId: v.id("branches"),
    categoryId: v.optional(v.id("categories")),
    size: v.optional(v.string()),
    color: v.optional(v.string()),
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
    await authorize(ctx, args.token, "inventory.view");
    const limit = args.limit ?? 500;
    const variants = await ctx.db
      .query("productVariants")
      .withIndex("by_active", (q) => q.eq("active", true))
      .take(limit * 4);

    const productCache = new Map<Id<"products">, Doc<"products"> | null>();
    const categoryName = new Map<string, string>();
    for (const c of await ctx.db.query("categories").collect())
      categoryName.set(c._id, c.name);

    const namesOf = await loadVariantNames(ctx);
    const rows = [];
    const search = args.search?.trim().toLowerCase();
    for (const variant of variants) {
      const names = namesOf(variant);
      if (args.size && names.size !== args.size) continue;
      if (args.color && names.color !== args.color) continue;

      let product = productCache.get(variant.productId);
      if (product === undefined) {
        product = await ctx.db.get(variant.productId);
        productCache.set(variant.productId, product);
      }
      if (!product || !product.active) continue;
      if (args.categoryId && product.categoryId !== args.categoryId) continue;

      const stock = await stockRowsForBranch(ctx, args.branchId, variant._id);
      const quantity = stock?.quantity ?? 0;
      const reorderLevel = variant.reorderLevel;
      const status = stockStatus(quantity, reorderLevel);
      if (args.status && status !== args.status) continue;

      const label = formatVariantLabel(names, variant.sku);
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
        productVariantId: variant._id,
        sku: variant.sku,
        barcode: variant.barcode ?? null,
        size: names.size ?? null,
        color: names.color ?? null,
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
  args: {
    token: v.string(), branchId: v.optional(v.id("branches")) },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "inventory.view");
    // Only the low and out-of-stock rows are read, through the status index; the counts
    // are the running stock totals.
    const statusRows = (status: StockStatus) =>
      args.branchId
        ? ctx.db
            .query("variantStock")
            .withIndex("by_branch_and_status", (q) =>
              q.eq("branchId", args.branchId!).eq("status", status)
            )
            .take(200)
        : ctx.db
            .query("variantStock")
            .withIndex("by_status", (q) => q.eq("status", status))
            .take(200);
    const stockRows = [...(await statusRows("OUT_OF_STOCK")), ...(await statusRows("LOW_STOCK"))];
    const totals = (
      args.branchId
        ? await ctx.db
            .query("stockTotals")
            .withIndex("by_branch", (q) => q.eq("branchId", args.branchId!))
            .collect()
        : await ctx.db.query("stockTotals").collect()
    ).reduce((s, r) => ({ low: s.low + r.lowCount, out: s.out + r.outCount }), { low: 0, out: 0 });

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
      const reorderLevel = variant.reorderLevel;
      const status = stockStatus(row.quantity, reorderLevel);
      if (status === "IN_STOCK") continue;
      const product = await ctx.db.get(variant.productId);
      items.push({
        productVariantId: row.productVariantId,
        label: `${product?.name ?? "?"} — ${await variantLabel(ctx, variant)}`,
        quantity: row.quantity,
        reorderLevel,
        status,
      });
    }
    items.sort((a, b) => a.quantity - b.quantity);
    return { lowStockCount: totals.low, outOfStockCount: totals.out, items: items.slice(0, 50) };
  },
});
