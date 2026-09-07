import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { variantLabel } from "./inventory";

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
    return { ...variant, product, label: variantLabel(variant) };
  },
});

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

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
    const id = await ctx.db.insert("productVariants", {
      productId: args.productId,
      sku,
      barcode: args.barcode?.trim() || undefined,
      size: args.size?.trim() || undefined,
      color: args.color?.trim() || undefined,
      costPrice: args.costPrice ?? product.defaultCostPrice,
      sellingPrice: args.sellingPrice ?? product.defaultSellingPrice,
      reorderLevel: args.reorderLevel ?? 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
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
    const seen = new Set(
      existing.map((v) => `${v.color ?? ""}|${v.size ?? ""}`)
    );

    const sizes = args.sizes.length ? args.sizes : [""];
    const colors = args.colors.length ? args.colors : [""];
    let created = 0;
    let skipped = 0;
    const now = Date.now();

    for (const color of colors) {
      for (const size of sizes) {
        const key = `${color.trim()}|${size.trim()}`;
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
        await ctx.db.insert("productVariants", {
          productId: args.productId,
          sku,
          size: size.trim() || undefined,
          color: color.trim() || undefined,
          costPrice: args.costPrice ?? product.defaultCostPrice,
          sellingPrice: args.sellingPrice ?? product.defaultSellingPrice,
          reorderLevel: args.reorderLevel ?? 0,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
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

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.size !== undefined) patch.size = args.size.trim() || undefined;
    if (args.color !== undefined) patch.color = args.color.trim() || undefined;
    if (args.barcode !== undefined)
      patch.barcode = args.barcode.trim() || undefined;
    if (args.sellingPrice !== undefined) patch.sellingPrice = args.sellingPrice;
    if (args.costPrice !== undefined) patch.costPrice = args.costPrice;
    if (args.reorderLevel !== undefined) patch.reorderLevel = args.reorderLevel;
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(args.id, patch);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action:
        args.costPrice !== undefined && args.costPrice !== existing.costPrice
          ? "variant.cost_changed"
          : "variant.updated",
      entityType: "productVariant",
      entityId: args.id,
      details:
        args.costPrice !== undefined && args.costPrice !== existing.costPrice
          ? `Cost ${existing.costPrice} → ${args.costPrice} for ${existing.sku}`
          : `Updated variant ${existing.sku}`,
    });
  },
});
