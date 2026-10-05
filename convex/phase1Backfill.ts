import { internalMutation } from "./_generated/server";
import { ensureDefaultPriceList, recordVariantPrice } from "./lib/catalog";

const DEFAULT_SCALE_NAME = "Geral";

/**
 * One-off, idempotent: opens price history for variants that predate it, adds a
 * default size scale for existing sizes, and links variants to their size/colour
 * rows by name. Safe to re-run; it only writes what is still missing.
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

    const colors = await ctx.db.query("colors").collect();
    const sizeIdByName = new Map(
      sizes.map((s) => [s.name.trim().toLowerCase(), s._id] as const)
    );
    const colorIdByName = new Map(
      colors.map((c) => [c.name.trim().toLowerCase(), c._id] as const)
    );

    let variantsSized = 0;
    let variantsColored = 0;
    for (const variant of variants) {
      const sizeKey = variant.size?.trim().toLowerCase();
      const colorKey = variant.color?.trim().toLowerCase();
      const patch: { sizeId?: (typeof sizes)[number]["_id"]; colorId?: (typeof colors)[number]["_id"] } = {};
      if (variant.sizeId === undefined && sizeKey && sizeIdByName.has(sizeKey)) {
        patch.sizeId = sizeIdByName.get(sizeKey);
        variantsSized += 1;
      }
      if (variant.colorId === undefined && colorKey && colorIdByName.has(colorKey)) {
        patch.colorId = colorIdByName.get(colorKey);
        variantsColored += 1;
      }
      if (Object.keys(patch).length > 0) await ctx.db.patch(variant._id, patch);
    }

    return {
      variantsChecked: variants.length,
      sizesScoped,
      variantsSized,
      variantsColored,
    };
  },
});
