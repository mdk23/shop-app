import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Records a variant's prices in its history: closes the open row and opens a new one, only
 * when the selling price or the cost actually changed.
 */
export async function recordVariantPrice(
  ctx: MutationCtx,
  productVariantId: Id<"productVariants">,
  prices: { sellingPrice: number; costPrice: number },
  now: number = Date.now()
): Promise<void> {
  const latest = await ctx.db
    .query("variantPrices")
    .withIndex("by_variant_and_from", (q) => q.eq("productVariantId", productVariantId))
    .order("desc")
    .first();

  if (latest && latest.validTo === undefined) {
    if (latest.sellingPrice === prices.sellingPrice && latest.costPrice === prices.costPrice) return;
    await ctx.db.patch(latest._id, { validTo: now });
  }
  await ctx.db.insert("variantPrices", {
    productVariantId,
    sellingPrice: prices.sellingPrice,
    costPrice: prices.costPrice,
    validFrom: now,
    createdAt: now,
  });
}

/**
 * The size with this name (case-insensitive), or undefined for no size. A variant keeps
 * only the id, so an unknown name is refused rather than silently dropped.
 */
export async function resolveSizeId(
  ctx: MutationCtx,
  name: string | undefined
): Promise<Id<"sizes"> | undefined> {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return undefined;
  const sizes = await ctx.db.query("sizes").collect();
  const match = sizes.find((s) => s.name.trim().toLowerCase() === wanted);
  if (!match) throw new Error(`Size "${name!.trim()}" does not exist. Add it in Settings → Sizes first.`);
  return match._id;
}

/** The colour with this name (case-insensitive), or undefined for no colour. Unknown names are refused. */
export async function resolveColorId(
  ctx: MutationCtx,
  name: string | undefined
): Promise<Id<"colors"> | undefined> {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return undefined;
  const colors = await ctx.db.query("colors").collect();
  const match = colors.find((c) => c.name.trim().toLowerCase() === wanted);
  if (!match) throw new Error(`Color "${name!.trim()}" does not exist. Add it in Settings → Colors first.`);
  return match._id;
}

/** The size with this name, created (active, unscaled) if the list does not have it yet. */
export async function findOrCreateSize(ctx: MutationCtx, name: string): Promise<Id<"sizes">> {
  const wanted = name.trim();
  const existing = (await ctx.db.query("sizes").collect()).find(
    (s) => s.name.trim().toLowerCase() === wanted.toLowerCase()
  );
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("sizes", { name: wanted, active: true, createdAt: now, updatedAt: now });
}

/** The colour with this name, created (active) if the list does not have it yet. */
export async function findOrCreateColor(ctx: MutationCtx, name: string): Promise<Id<"colors">> {
  const wanted = name.trim();
  const existing = (await ctx.db.query("colors").collect()).find(
    (c) => c.name.trim().toLowerCase() === wanted.toLowerCase()
  );
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("colors", { name: wanted, active: true, createdAt: now, updatedAt: now });
}

/**
 * The product of a product / variant pair. A variant decides its product: the variant's
 * product is returned, and a different `productId` is refused. Without a variant, the
 * product given (if any) stands: interest in a product without a specific size/colour.
 */
export async function productOfPair(
  ctx: MutationCtx,
  productId: Id<"products"> | undefined,
  productVariantId: Id<"productVariants"> | undefined
): Promise<Id<"products"> | undefined> {
  if (!productVariantId) {
    if (productId && !(await ctx.db.get(productId))) throw new Error("Product not found.");
    return productId;
  }
  const variant = await ctx.db.get(productVariantId);
  if (!variant) throw new Error("Product variant not found.");
  if (productId && productId !== variant.productId) {
    throw new Error("That variant belongs to a different product.");
  }
  return variant.productId;
}
