import { MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

const DEFAULT_PRICE_LIST_NAME = "Preço de venda";

export async function ensureDefaultPriceList(ctx: MutationCtx): Promise<Id<"priceLists">> {
  const existing = await ctx.db
    .query("priceLists")
    .withIndex("by_default", (q) => q.eq("isDefault", true))
    .first();
  if (existing) return existing._id;
  const now = Date.now();
  return await ctx.db.insert("priceLists", {
    name: DEFAULT_PRICE_LIST_NAME,
    isDefault: true,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
}

/** Closes the open price row and opens a new one, only when the price actually changes. */
export async function recordVariantPrice(
  ctx: MutationCtx,
  productVariantId: Id<"productVariants">,
  price: number,
  now: number = Date.now()
): Promise<void> {
  const priceListId = await ensureDefaultPriceList(ctx);
  const latest = await ctx.db
    .query("variantPrices")
    .withIndex("by_variant_list_from", (q) =>
      q.eq("productVariantId", productVariantId).eq("priceListId", priceListId)
    )
    .order("desc")
    .first();

  if (latest && latest.validTo === undefined) {
    if (latest.price === price) return;
    await ctx.db.patch(latest._id, { validTo: now });
  }
  await ctx.db.insert("variantPrices", {
    productVariantId,
    priceListId,
    price,
    validFrom: now,
    createdAt: now,
  });
}

export async function resolveSizeId(
  ctx: MutationCtx,
  name: string | undefined
): Promise<Id<"sizes"> | undefined> {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return undefined;
  const sizes = await ctx.db.query("sizes").collect();
  return sizes.find((s) => s.name.trim().toLowerCase() === wanted)?._id;
}

export async function resolveColorId(
  ctx: MutationCtx,
  name: string | undefined
): Promise<Id<"colors"> | undefined> {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return undefined;
  const colors = await ctx.db.query("colors").collect();
  return colors.find((c) => c.name.trim().toLowerCase() === wanted)?._id;
}
