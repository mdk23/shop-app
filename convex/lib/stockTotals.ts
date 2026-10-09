import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { round2 } from "./fiscal";

/**
 * Stock totals per branch (`stockTotals`): units, value at cost and at selling price, and
 * how many stock rows are low or out. They are the sum of each `variantStock` row's share,
 * worked out from the row's quantity and its variant (an inactive variant has no share).
 * Every change to a row's quantity or to a variant swaps the old share for the new one, so
 * the totals never drift from the rows. A row's `status` is kept with its quantity.
 */

export type StockStatus = "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";

export function stockStatus(quantity: number, reorderLevel: number): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= reorderLevel) return "LOW_STOCK";
  return "IN_STOCK";
}

type Share = { units: number; costValue: number; retailValue: number; lowCount: number; outCount: number };

function shareOf(quantity: number, variant: Doc<"productVariants"> | null): Share {
  if (!variant || !variant.active) {
    return { units: 0, costValue: 0, retailValue: 0, lowCount: 0, outCount: 0 };
  }
  const status = stockStatus(quantity, variant.reorderLevel);
  return {
    units: quantity,
    costValue: quantity * variant.costPrice,
    retailValue: quantity * variant.sellingPrice,
    lowCount: status === "LOW_STOCK" ? 1 : 0,
    outCount: status === "OUT_OF_STOCK" ? 1 : 0,
  };
}

async function applyShare(ctx: MutationCtx, branchId: Id<"branches">, after: Share, before: Share) {
  const d = {
    units: after.units - before.units,
    costValue: after.costValue - before.costValue,
    retailValue: after.retailValue - before.retailValue,
    lowCount: after.lowCount - before.lowCount,
    outCount: after.outCount - before.outCount,
  };
  if (Object.values(d).every((x) => Math.abs(x) < 1e-9)) return;
  const row = await ctx.db
    .query("stockTotals")
    .withIndex("by_branch", (q) => q.eq("branchId", branchId))
    .unique();
  const now = Date.now();
  if (!row) {
    await ctx.db.insert("stockTotals", {
      branchId,
      units: d.units,
      costValue: round2(d.costValue),
      retailValue: round2(d.retailValue),
      lowCount: d.lowCount,
      outCount: d.outCount,
      updatedAt: now,
    });
    return;
  }
  await ctx.db.patch(row._id, {
    units: row.units + d.units,
    costValue: round2(row.costValue + d.costValue),
    retailValue: round2(row.retailValue + d.retailValue),
    lowCount: row.lowCount + d.lowCount,
    outCount: row.outCount + d.outCount,
    updatedAt: now,
  });
}

/** Sets a stock row's quantity (and status), keeping the branch totals right. */
export async function setStockQuantity(
  ctx: MutationCtx,
  row: Doc<"variantStock">,
  quantity: number,
  variant: Doc<"productVariants">
) {
  await ctx.db.patch(row._id, {
    quantity,
    status: stockStatus(quantity, variant.reorderLevel),
    updatedAt: Date.now(),
  });
  await applyShare(ctx, row.branchId, shareOf(quantity, variant), shareOf(row.quantity, variant));
}

/**
 * Patches a variant. When its prices, reorder level or active flag change, each of its
 * stock rows gets its status and its share of the branch totals redone.
 */
export async function patchVariant(
  ctx: MutationCtx,
  variantId: Id<"productVariants">,
  patch: Partial<Doc<"productVariants">>
) {
  const before = await ctx.db.get(variantId);
  if (!before) throw new Error("Variant not found.");
  await ctx.db.patch(variantId, patch);
  const after = (await ctx.db.get(variantId))!;
  if (
    before.costPrice === after.costPrice &&
    before.sellingPrice === after.sellingPrice &&
    before.reorderLevel === after.reorderLevel &&
    before.active === after.active
  ) {
    return;
  }
  const rows = await ctx.db
    .query("variantStock")
    .withIndex("by_variant", (q) => q.eq("productVariantId", variantId))
    .collect();
  for (const row of rows) {
    const status = stockStatus(row.quantity, after.reorderLevel);
    if (row.status !== status) await ctx.db.patch(row._id, { status });
    await applyShare(ctx, row.branchId, shareOf(row.quantity, after), shareOf(row.quantity, before));
  }
}

/** Deletes a variant's stock rows (the variant is being deleted), taking them off the totals. */
export async function deleteStockRowsOf(ctx: MutationCtx, variant: Doc<"productVariants">) {
  const rows = await ctx.db
    .query("variantStock")
    .withIndex("by_variant", (q) => q.eq("productVariantId", variant._id))
    .collect();
  for (const row of rows) {
    await applyShare(ctx, row.branchId, shareOf(0, null), shareOf(row.quantity, variant));
    await ctx.db.delete(row._id);
  }
}

/** Adds one stock row to the totals and sets its status (used by the rebuild). */
export async function addStockRow(ctx: MutationCtx, row: Doc<"variantStock">) {
  const variant = await ctx.db.get(row.productVariantId);
  const status = stockStatus(row.quantity, variant?.reorderLevel ?? 0);
  if (row.status !== status) await ctx.db.patch(row._id, { status });
  await applyShare(ctx, row.branchId, shareOf(row.quantity, variant), shareOf(0, null));
}
