import type { QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/**
 * A variant's size and colour live only as `sizeId` / `colorId`; the names come from
 * the `sizes` and `colors` lists. These helpers turn the ids back into names.
 */
export type VariantNames = { size?: string; color?: string };

type VariantRefs = Pick<Doc<"productVariants">, "sizeId" | "colorId">;

/**
 * Loads every size and colour name once and returns a resolver. Use this when naming
 * many variants in one function (catalogue lists, analytics); both lists are small.
 */
export async function loadVariantNames(ctx: QueryCtx) {
  const sizes = new Map((await ctx.db.query("sizes").collect()).map((s) => [s._id, s.name]));
  const colors = new Map((await ctx.db.query("colors").collect()).map((c) => [c._id, c.name]));
  return (variant: VariantRefs): VariantNames => ({
    size: variant.sizeId ? sizes.get(variant.sizeId) : undefined,
    color: variant.colorId ? colors.get(variant.colorId) : undefined,
  });
}

/** Names for a single variant (two point reads). */
export async function variantNames(ctx: QueryCtx, variant: VariantRefs): Promise<VariantNames> {
  const size = variant.sizeId ? await ctx.db.get(variant.sizeId) : null;
  const color = variant.colorId ? await ctx.db.get(variant.colorId) : null;
  return { size: size?.name, color: color?.name };
}

/** "Black / M", or the SKU when the variant has neither. */
export function formatVariantLabel(names: VariantNames, sku: string): string {
  const parts = [names.color, names.size].filter(Boolean);
  return parts.length ? parts.join(" / ") : sku;
}
