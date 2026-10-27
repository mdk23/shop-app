import { authorize } from "./permissions";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
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
 * The stock list for a branch, a page at a time, so no item is ever left out however big
 * the catalogue. Which rows a page reads depends on the filter:
 *  - a search: product names (search index) plus an exact SKU or barcode — one page;
 *  - a stock status: that branch's stock rows with that status (index), a page of rows;
 *  - otherwise: products (in a category, or all active ones), a page of products with
 *    their variants.
 * Size and colour narrow the rows of the page, so a page can come out short — never wrong.
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
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "inventory.view");
    const namesOf = await loadVariantNames(ctx);
    const categoryName = new Map<string, string>();
    for (const c of await ctx.db.query("categories").take(1000)) categoryName.set(c._id, c.name);

    const productCache = new Map<Id<"products">, Doc<"products"> | null>();
    const productOf = async (id: Id<"products">) => {
      if (!productCache.has(id)) productCache.set(id, await ctx.db.get(id));
      return productCache.get(id)!;
    };

    /** One row, or null when the variant is filtered out. */
    const rowFor = async (variant: Doc<"productVariants">, stockRow?: Doc<"variantStock"> | null) => {
      if (!variant.active) return null;
      const product = await productOf(variant.productId);
      if (!product || !product.active) return null;
      if (args.categoryId && product.categoryId !== args.categoryId) return null;
      const names = namesOf(variant);
      if (args.size && names.size !== args.size) return null;
      if (args.color && names.color !== args.color) return null;
      const stock = stockRow === undefined ? await stockRowsForBranch(ctx, args.branchId, variant._id) : stockRow;
      const quantity = stock?.quantity ?? 0;
      const status = stockStatus(quantity, variant.reorderLevel);
      if (args.status && status !== args.status) return null;
      return {
        productId: product._id,
        productName: product.name,
        categoryName: categoryName.get(product.categoryId) ?? "—",
        productVariantId: variant._id,
        sku: variant.sku,
        barcode: variant.barcode ?? null,
        size: names.size ?? null,
        color: names.color ?? null,
        label: formatVariantLabel(names, variant.sku),
        costPrice: variant.costPrice,
        sellingPrice: variant.sellingPrice,
        quantity,
        reorderLevel: variant.reorderLevel,
        status,
      };
    };
    type Row = NonNullable<Awaited<ReturnType<typeof rowFor>>>;
    const keep = (rows: (Row | null)[]) => rows.filter((r): r is Row => r !== null);
    const variantsOf = (productId: Id<"products">) =>
      ctx.db
        .query("productVariants")
        .withIndex("by_product", (q) => q.eq("productId", productId))
        .collect();

    const search = args.search?.trim();
    if (search) {
      const exact = [
        ...(await ctx.db.query("productVariants").withIndex("by_sku", (q) => q.eq("sku", search)).take(5)),
        ...(await ctx.db.query("productVariants").withIndex("by_barcode", (q) => q.eq("barcode", search)).take(5)),
      ];
      const named = await ctx.db
        .query("products")
        .withSearchIndex("search_name", (q) => q.search("name", search))
        .take(30);
      const variants = [...exact, ...(await Promise.all(named.map((p) => variantsOf(p._id)))).flat()];
      const seen = new Set<string>();
      const unique = variants.filter((v) => !seen.has(v._id) && !!seen.add(v._id));
      return { page: keep(await Promise.all(unique.map((v) => rowFor(v)))), isDone: true, continueCursor: "" };
    }

    if (args.status) {
      const result = await ctx.db
        .query("variantStock")
        .withIndex("by_branch_and_status", (q) => q.eq("branchId", args.branchId).eq("status", args.status!))
        .paginate(args.paginationOpts);
      const rows = await Promise.all(
        result.page.map(async (s) => {
          const variant = await ctx.db.get(s.productVariantId);
          return variant ? rowFor(variant, s) : null;
        })
      );
      return { ...result, page: keep(rows) };
    }

    const products = args.categoryId
      ? ctx.db.query("products").withIndex("by_category", (q) => q.eq("categoryId", args.categoryId!))
      : ctx.db.query("products").withIndex("by_active", (q) => q.eq("active", true));
    const result = await products.order("desc").paginate(args.paginationOpts);
    const rows: (Row | null)[] = [];
    for (const product of result.page) {
      productCache.set(product._id, product);
      for (const variant of await variantsOf(product._id)) rows.push(await rowFor(variant));
    }
    return { ...result, page: keep(rows) };
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
