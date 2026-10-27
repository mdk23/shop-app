import { QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { round2 } from "./fiscal";

/**
 * The till's price for a variant: its selling price, or less when an active promotion
 * covers it. A promotion targets a variant, a product, a category or a collection; when
 * several apply, the customer gets the lowest price. This is the price the till charges
 * and the one a changed price is measured against.
 */

type Promotion = Doc<"promotions"> & { targets: Doc<"promotionTargets">[] };

export type PromotionIndex = (
  variant: Doc<"productVariants">,
  product: Doc<"products"> | null
) => { price: number; promotion?: { id: Id<"promotions">; name: string } };

/** Loads the promotions running at `now` once, and prices variants against them. */
export async function loadPromotions(ctx: QueryCtx, now: number): Promise<PromotionIndex> {
  const running: Promotion[] = [];
  const active = await ctx.db
    .query("promotions")
    .withIndex("by_active", (q) => q.eq("active", true))
    .take(500);
  for (const p of active) {
    if (p.validFrom > now || (p.validTo !== undefined && p.validTo <= now)) continue;
    const targets = await ctx.db
      .query("promotionTargets")
      .withIndex("by_promotion", (q) => q.eq("promotionId", p._id))
      .take(2000);
    running.push({ ...p, targets });
  }

  return (variant, product) => {
    let best: { price: number; promotion?: { id: Id<"promotions">; name: string } } = {
      price: variant.sellingPrice,
    };
    for (const p of running) {
      const covers = p.targets.some(
        (t) =>
          t.productVariantId === variant._id ||
          t.productId === variant.productId ||
          (product && t.categoryId === product.categoryId) ||
          (product?.collectionId && t.collectionId === product.collectionId)
      );
      if (!covers) continue;
      const price = round2(
        p.kind === "PERCENT_OFF"
          ? variant.sellingPrice * (1 - p.value / 100)
          : p.kind === "AMOUNT_OFF"
            ? Math.max(0, variant.sellingPrice - p.value)
            : Math.min(variant.sellingPrice, p.value)
      );
      if (price < best.price) best = { price, promotion: { id: p._id, name: p.name } };
    }
    return best;
  };
}
