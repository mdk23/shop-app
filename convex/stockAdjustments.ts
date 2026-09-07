import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { variantLabel } from "./inventory";

const REASON = v.union(
  v.literal("PHYSICAL_COUNT"),
  v.literal("DAMAGED"),
  v.literal("MISSING"),
  v.literal("FOUND"),
  v.literal("INITIAL_STOCK"),
  v.literal("CORRECTION")
);

const MOVEMENT_TYPE_FOR_REASON: Record<string, string> = {
  PHYSICAL_COUNT: "STOCK_ADJUSTMENT",
  DAMAGED: "DAMAGE",
  MISSING: "LOSS",
  FOUND: "FOUND",
  INITIAL_STOCK: "INITIAL_STOCK",
  CORRECTION: "STOCK_ADJUSTMENT",
};

/**
 * Correct on-hand stock for a variant at a branch. Provide EITHER `newQuantity`
 * (absolute — physical counts) OR `adjustmentQuantity` (signed delta). Records
 * the adjustment, drives the ledger via `mutateStock`, and writes an audit row.
 */
export const create = mutation({
  args: {
    token: v.string(),
    branchId: v.id("branches"),
    productVariantId: v.id("productVariants"),
    reason: REASON,
    newQuantity: v.optional(v.number()),
    adjustmentQuantity: v.optional(v.number()),
    notes: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"stockAdjustments">> => {
    const actor = await authorize(ctx, args.token, "inventory.adjust");
    if (!args.notes.trim()) throw new Error("A reason note is required.");
    if (
      (args.newQuantity === undefined) === (args.adjustmentQuantity === undefined)
    ) {
      throw new Error(
        "Provide exactly one of newQuantity or adjustmentQuantity."
      );
    }

    const variant = await ctx.db.get(args.productVariantId);
    if (!variant) throw new Error("Variant not found.");
    const product = await ctx.db.get(variant.productId);
    const resolvedName = product?.name ?? "Unknown product";
    const resolvedLabel = variantLabel(variant);

    const stock = await ctx.db
      .query("variantStock")
      .withIndex("by_branch_and_variant", (q) =>
        q.eq("branchId", args.branchId).eq("productVariantId", args.productVariantId)
      )
      .unique();
    const previousQuantity = stock?.quantity ?? 0;

    const delta =
      args.adjustmentQuantity !== undefined
        ? args.adjustmentQuantity
        : (args.newQuantity as number) - previousQuantity;
    if (delta === 0) throw new Error("Adjustment resolves to no change.");
    const newQuantity = previousQuantity + delta;

    const movementId = await ctx.runMutation(internal.inventory.mutateStock, {
      productVariantId: args.productVariantId,
      branchId: args.branchId,
      quantity: delta,
      movementType: MOVEMENT_TYPE_FOR_REASON[args.reason] ?? "STOCK_ADJUSTMENT",
      referenceType: "stock_adjustment",
      notes: `${args.reason}: ${args.notes}`,
      userId: actor._id,
      username: actor.username,
      allowNegative: true, // corrections may legitimately set any value
    });

    const adjustmentId = await ctx.db.insert("stockAdjustments", {
      branchId: args.branchId,
      productVariantId: args.productVariantId,
      userId: actor._id,
      username: actor.username,
      reason: args.reason,
      previousQuantity,
      adjustmentQuantity: delta,
      newQuantity,
      notes: args.notes,
      movementId,
      createdAt: Date.now(),
    });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "stock.adjusted",
      entityType: "productVariant",
      entityId: args.productVariantId,
      details: `${resolvedName} (${resolvedLabel}) @ ${args.branchId}: ${previousQuantity} → ${newQuantity} [${args.reason}] ${args.notes}`,
    });

    return adjustmentId;
  },
});

export const listRecent = query({
  args: {
    limit: v.optional(v.number()),
    branchId: v.optional(v.id("branches")),
    productVariantId: v.optional(v.id("productVariants")),
  },
  handler: async (ctx, args) => {
    let rows;
    if (args.productVariantId) {
      rows = await ctx.db
        .query("stockAdjustments")
        .withIndex("by_variant", (q) =>
          q.eq("productVariantId", args.productVariantId!)
        )
        .order("desc")
        .take(args.limit ?? 100);
    } else if (args.branchId) {
      rows = await ctx.db
        .query("stockAdjustments")
        .withIndex("by_branch", (q) => q.eq("branchId", args.branchId!))
        .order("desc")
        .take(args.limit ?? 100);
    } else {
      rows = await ctx.db
        .query("stockAdjustments")
        .withIndex("by_created_at")
        .order("desc")
        .take(args.limit ?? 100);
    }
    return rows;
  },
});
