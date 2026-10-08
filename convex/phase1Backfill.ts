import { internalMutation } from "./_generated/server";
import { ensureDefaultPriceList, recordVariantPrice } from "./lib/catalog";

const DEFAULT_SCALE_NAME = "Geral";

/**
 * One-off, idempotent: opens price history for variants that predate it and adds a
 * default size scale for existing sizes. Safe to re-run; it only writes what is
 * still missing.
 */
export const run = internalMutation({
  args: {},
  handler: async (ctx) => {
    await ensureDefaultPriceList(ctx);

    const variants = await ctx.db.query("productVariants").collect();
    for (const variant of variants) {
      await recordVariantPrice(ctx, variant._id, variant.sellingPrice, variant.createdAt);
    }

    let defaultScale = (await ctx.db.query("sizeScales").collect()).find(
      (s) => s.name === DEFAULT_SCALE_NAME
    );
    if (!defaultScale) {
      const now = Date.now();
      const id = await ctx.db.insert("sizeScales", {
        name: DEFAULT_SCALE_NAME,
        scaleType: "GENERAL",
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      defaultScale = (await ctx.db.get(id))!;
    }

    const sizes = await ctx.db.query("sizes").collect();
    let sizesScoped = 0;
    for (const size of sizes) {
      if (size.scaleId === undefined) {
        await ctx.db.patch(size._id, { scaleId: defaultScale._id });
        sizesScoped += 1;
      }
    }

    return {
      variantsChecked: variants.length,
      sizesScoped,
    };
  },
});
