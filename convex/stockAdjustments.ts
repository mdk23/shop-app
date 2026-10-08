import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { variantLabel } from "./inventory";
import { adjustmentReasonValidator, type InventoryMovementType } from "./schema";

const MOVEMENT_TYPE_FOR_REASON: Record<string, InventoryMovementType> = {
  PHYSICAL_COUNT: "STOCK_ADJUSTMENT",
  DAMAGED: "DAMAGE",
  MISSING: "LOSS",
  FOUND: "FOUND",
  INITIAL_STOCK: "INITIAL_STOCK",
  CORRECTION: "STOCK_ADJUSTMENT",
};

/**
 * Correct on-hand stock for a variant at a branch. Provide EITHER `newQuantity`
 * (absolute — physical counts) OR `adjustmentQuantity` (signed delta). The stock
 * movement (referenceType "stock_adjustment", with its reason) is the adjustment's
 * record; before / change / after are its previousBalance / quantity / newBalance.
 */
export const create = mutation({
  args: {
    token: v.string(),
    branchId: v.id("branches"),
    productVariantId: v.id("productVariants"),
    reason: adjustmentReasonValidator,
    newQuantity: v.optional(v.number()),
    adjustmentQuantity: v.optional(v.number()),
    notes: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"inventoryMovements">> => {
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
    const resolvedLabel = await variantLabel(ctx, variant);

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
      adjustmentReason: args.reason,
      notes: args.notes.trim(),
      userId: actor._id,
      username: actor.username,
      allowNegative: true, // corrections may legitimately set any value
    });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "stock.adjusted",
      entityType: "productVariant",
      entityId: args.productVariantId,
      details: `${resolvedName} (${resolvedLabel}) @ ${args.branchId}: ${previousQuantity} → ${newQuantity} [${args.reason}] ${args.notes}`,
    });

    return movementId;
  },
});

/** Stock adjustments, newest first: the ledger's movements of the adjustment kind. */
export const listPaged = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const result = await ctx.db
      .query("inventoryMovements")
      .withIndex("by_reference_type_and_date", (q) => q.eq("referenceType", "stock_adjustment"))
      .order("desc")
      .paginate(args.paginationOpts);
    return {
      ...result,
      page: result.page.map((m) => ({
        _id: m._id,
        createdAt: m.createdAt,
        branchId: m.branchId,
        productVariantId: m.productVariantId,
        productName: m.productName,
        variantLabel: m.variantLabel,
        reason: m.adjustmentReason ?? "CORRECTION",
        previousQuantity: m.previousBalance,
        adjustmentQuantity: m.quantity,
        newQuantity: m.newBalance,
        username: m.username,
        notes: m.notes,
      })),
    };
  },
});
