import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { describeChanges, writeAudit } from "./audit";
import { variantLabel } from "./inventory";
import { recordVariantPrice, resolveColorId, resolveSizeId } from "./lib/catalog";
import { variantNames } from "./lib/variantNames";

// ─────────────────────────────────────────────
// SKU HELPERS
// ─────────────────────────────────────────────

const COMBINING_MARKS = new RegExp("[\\u0300-\\u036f]", "g");

export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function skuPart(value?: string): string {
  if (!value) return "";
  return slugify(value).replace(/-/g, "").slice(0, 6);
}

/** Build a unique SKU from product name + colour + size, adding a numeric suffix on collision. */
export async function generateSku(
  ctx: MutationCtx,
  productName: string,
  color?: string,
  size?: string
): Promise<string> {
  const base = [slugify(productName), skuPart(color), skuPart(size)]
    .filter(Boolean)
    .join("-");
  let candidate = base || `SKU-${Date.now().toString(36).toUpperCase()}`;
  let n = 1;
  while (
    await ctx.db
      .query("productVariants")
      .withIndex("by_sku", (q) => q.eq("sku", candidate))
      .unique()
  ) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const listByProduct = query({
  args: { productId: v.id("products"), includeInactive: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    return (args.includeInactive ? rows : rows.filter((r) => r.active)).sort(
      (a, b) => a.sku.localeCompare(b.sku)
    );
  },
});

export const getBySkuOrBarcode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = args.code.trim();
    if (!code) return null;
    const bySku = await ctx.db
      .query("productVariants")
      .withIndex("by_sku", (q) => q.eq("sku", code))
      .unique();
    const variant =
      bySku ??
      (await ctx.db
        .query("productVariants")
        .withIndex("by_barcode", (q) => q.eq("barcode", code))
        .unique());
    if (!variant) return null;
    const product = await ctx.db.get(variant.productId);
    return { ...variant, product, label: await variantLabel(ctx, variant) };
  },
});

/** A variant's selling price and cost over time, newest first. */
export const priceHistory = query({
  args: { productVariantId: v.id("productVariants") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("variantPrices")
      .withIndex("by_variant_and_from", (q) => q.eq("productVariantId", args.productVariantId))
      .order("desc")
      .take(200);
  },
});

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

/**
 * Cost and price for a new variant: as given, otherwise copied from an existing variant of
 * the same product (an active one when possible). Prices are kept on variants only.
 */
async function startingPrices(
  ctx: MutationCtx,
  productId: Id<"products">,
  given: { costPrice?: number; sellingPrice?: number }
) {
  const siblings = await ctx.db
    .query("productVariants")
    .withIndex("by_product", (q) => q.eq("productId", productId))
    .collect();
  const sibling = siblings.find((v) => v.active) ?? siblings[0];
  const costPrice = given.costPrice ?? sibling?.costPrice;
  const sellingPrice = given.sellingPrice ?? sibling?.sellingPrice;
  if (costPrice === undefined || sellingPrice === undefined) {
    throw new Error("Enter the cost and selling price: this product has no other variant to copy them from.");
  }
  return { costPrice, sellingPrice };
}

export const create = mutation({
  args: {
    token: v.string(),
    productId: v.id("products"),
    size: v.optional(v.string()),
    color: v.optional(v.string()),
    sku: v.optional(v.string()),
    barcode: v.optional(v.string()),
    costPrice: v.optional(v.number()),
    sellingPrice: v.optional(v.number()),
    reorderLevel: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"productVariants">> => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found.");

    const sku =
      args.sku?.trim() ||
      (await generateSku(ctx, product.name, args.color, args.size));
    const existing = await ctx.db
      .query("productVariants")
      .withIndex("by_sku", (q) => q.eq("sku", sku))
      .unique();
    if (existing) throw new Error(`SKU "${sku}" is already in use.`);

    const now = Date.now();
    const { costPrice, sellingPrice } = await startingPrices(ctx, args.productId, args);
    const id = await ctx.db.insert("productVariants", {
      productId: args.productId,
      sku,
      barcode: args.barcode?.trim() || undefined,
      sizeId: await resolveSizeId(ctx, args.size),
      colorId: await resolveColorId(ctx, args.color),
      costPrice,
      sellingPrice,
      reorderLevel: args.reorderLevel ?? 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await recordVariantPrice(ctx, id, { sellingPrice, costPrice }, now);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "variant.created",
      entityType: "productVariant",
      entityId: id,
      details: `Variant ${sku} for "${product.name}"`,
    });
    return id;
  },
});

/** Create a size × colour grid of variants, skipping combinations that already exist. */
export const generateMatrix = mutation({
  args: {
    token: v.string(),
    productId: v.id("products"),
    sizes: v.array(v.string()),
    colors: v.array(v.string()),
    costPrice: v.optional(v.number()),
    sellingPrice: v.optional(v.number()),
    reorderLevel: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<{ created: number; skipped: number }> => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found.");

    const existing = await ctx.db
      .query("productVariants")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    const seen = new Set(existing.map((v) => `${v.colorId ?? ""}|${v.sizeId ?? ""}`));

    const sizes = args.sizes.length ? args.sizes : [""];
    const colors = args.colors.length ? args.colors : [""];
    let created = 0;
    let skipped = 0;
    const now = Date.now();
    const prices = await startingPrices(ctx, args.productId, args);

    for (const color of colors) {
      for (const size of sizes) {
        const sizeId = await resolveSizeId(ctx, size);
        const colorId = await resolveColorId(ctx, color);
        const key = `${colorId ?? ""}|${sizeId ?? ""}`;
        if (seen.has(key)) {
          skipped += 1;
          continue;
        }
        seen.add(key);
        const sku = await generateSku(
          ctx,
          product.name,
          color || undefined,
          size || undefined
        );
        const { costPrice, sellingPrice } = prices;
        const variantId = await ctx.db.insert("productVariants", {
          productId: args.productId,
          sku,
          sizeId,
          colorId,
          costPrice,
          sellingPrice,
          reorderLevel: args.reorderLevel ?? 0,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        await recordVariantPrice(ctx, variantId, { sellingPrice, costPrice }, now);
        created += 1;
      }
    }

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "variant.matrix_generated",
      entityType: "product",
      entityId: args.productId,
      details: `Generated ${created} variant(s) for "${product.name}" (${skipped} skipped)`,
    });
    return { created, skipped };
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("productVariants"),
    size: v.optional(v.string()),
    color: v.optional(v.string()),
    barcode: v.optional(v.string()),
    sellingPrice: v.optional(v.number()),
    costPrice: v.optional(v.number()),
    reorderLevel: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Variant not found.");

    if (args.costPrice !== undefined && args.costPrice !== existing.costPrice) {
      // Changing cost price is a sensitive, separately-gated action.
      await authorize(ctx, args.token, "products.change_cost");
    }

    const now = Date.now();
    const patch: Record<string, unknown> = { updatedAt: now };
    if (args.size !== undefined) {
      patch.sizeId = await resolveSizeId(ctx, args.size);
    }
    if (args.color !== undefined) {
      patch.colorId = await resolveColorId(ctx, args.color);
    }
    if (args.barcode !== undefined)
      patch.barcode = args.barcode.trim() || undefined;
    if (args.sellingPrice !== undefined) patch.sellingPrice = args.sellingPrice;
    if (args.costPrice !== undefined) patch.costPrice = args.costPrice;
    if (args.reorderLevel !== undefined) patch.reorderLevel = args.reorderLevel;
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(args.id, patch);
    if (args.sellingPrice !== undefined || args.costPrice !== undefined) {
      await recordVariantPrice(
        ctx,
        args.id,
        {
          sellingPrice: args.sellingPrice ?? existing.sellingPrice,
          costPrice: args.costPrice ?? existing.costPrice,
        },
        now
      );
    }
    // Log every changed field, old → new, with size and colour by name.
    const otherChanges = Object.fromEntries(
      Object.entries(patch).filter(([key]) => key !== "sizeId" && key !== "colorId")
    );
    const namesBefore = await variantNames(ctx, existing);
    const namesAfter = await variantNames(ctx, {
      sizeId: "sizeId" in patch ? (patch.sizeId as Id<"sizes"> | undefined) : existing.sizeId,
      colorId: "colorId" in patch ? (patch.colorId as Id<"colors"> | undefined) : existing.colorId,
    });
    const changes = describeChanges(
      { ...existing, size: namesBefore.size, color: namesBefore.color },
      {
        ...otherChanges,
        ...("sizeId" in patch ? { size: namesAfter.size } : {}),
        ...("colorId" in patch ? { color: namesAfter.color } : {}),
      }
    );
    const costChanged = args.costPrice !== undefined && args.costPrice !== existing.costPrice;
    const priceChanged = args.sellingPrice !== undefined && args.sellingPrice !== existing.sellingPrice;
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: costChanged ? "variant.cost_changed" : priceChanged ? "variant.price_changed" : "variant.updated",
      entityType: "productVariant",
      entityId: args.id,
      details: `${existing.sku}: ${changes || "no changes"}`,
    });
  },
});

/** Hard delete: only allowed when the variant has never been sold. */
export const remove = mutation({
  args: { token: v.string(), id: v.id("productVariants") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.delete");
    const existing = await ctx.db.get(args.id);
    if (!existing) throw new Error("Variant not found.");

    const soldLine = await ctx.db
      .query("saleItems")
      .withIndex("by_variant", (q) => q.eq("productVariantId", args.id))
      .first();
    if (soldLine) {
      throw new Error(
        "This variant has sales history and cannot be deleted. Deactivate it instead."
      );
    }

    const stockRows = await ctx.db
      .query("variantStock")
      .withIndex("by_variant", (q) => q.eq("productVariantId", args.id))
      .collect();
    for (const s of stockRows) await ctx.db.delete(s._id);

    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "variant.deleted",
      entityType: "productVariant",
      entityId: args.id,
      details: `Deleted variant ${existing.sku}`,
    });
  },
});
