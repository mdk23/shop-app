import { v } from "convex/values";
import {
  internalMutation,
  mutation,
  query,
  MutationCtx,
  QueryCtx,
} from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { validateToken } from "./auth";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { syncGlobalStockCounters } from "./metrics";

// ─────────────────────────────────────────────
// VARIANT CONTEXT + STOCK CACHE HELPERS
// ─────────────────────────────────────────────

export function variantLabel(variant: {
  size?: string;
  color?: string;
  sku: string;
}): string {
  const parts = [variant.color, variant.size].filter(Boolean);
  return parts.length ? parts.join(" / ") : variant.sku;
}

export async function getVariantContext(
  ctx: QueryCtx | MutationCtx,
  productVariantId: Id<"productVariants">
) {
  const variant = await ctx.db.get(productVariantId);
  if (!variant) throw new Error("Product variant not found");
  const product = await ctx.db.get(variant.productId);
  return {
    variant,
    product,
    productName: product?.name ?? "Unknown product",
    label: variantLabel(variant),
  };
}

async function getOrCreateVariantStock(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  productVariantId: Id<"productVariants">,
  fallbackReorderLevel: number
) {
  const existing = await ctx.db
    .query("variantStock")
    .withIndex("by_branch_and_variant", (q) =>
      q.eq("branchId", branchId).eq("productVariantId", productVariantId)
    )
    .unique();
  if (existing) return existing;
  const id = await ctx.db.insert("variantStock", {
    branchId,
    productVariantId,
    quantity: 0,
    reorderLevel: fallbackReorderLevel,
    updatedAt: Date.now(),
  });
  return (await ctx.db.get(id))!;
}

async function negativeStockAllowed(ctx: MutationCtx): Promise<boolean> {
  const setting = await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", "allowNegativeStock"))
    .unique();
  return setting?.isActive ?? false;
}

async function resolveActor(
  ctx: MutationCtx,
  userId?: Id<"users">,
  username?: string
): Promise<{ userId: Id<"users">; username: string }> {
  if (userId) {
    const u = await ctx.db.get(userId);
    return { userId, username: username ?? u?.username ?? "system" };
  }
  const fallback = await ctx.db
    .query("users")
    .withIndex("by_status", (q) => q.eq("status", "active"))
    .first();
  if (fallback) return { userId: fallback._id, username: fallback.username };
  const systemId = await ctx.db.insert("users", {
    name: "System Agent",
    username: "system",
    passwordHash: "",
    role: "admin",
    status: "active",
    createdAt: Date.now(),
  });
  return { userId: systemId, username: "system" };
}

// ─────────────────────────────────────────────
// CENTRAL STOCK LEDGER ENGINE
// ─────────────────────────────────────────────

/**
 * THE single choke-point for every stock change. Validates, updates the
 * per-branch `variantStock` cache, writes an immutable `inventoryMovements`
 * ledger row and an `auditLogs` row, and syncs the low/out-of-stock counters.
 * Never mutate `variantStock` directly anywhere else.
 */
export const mutateStock = internalMutation({
  args: {
    productVariantId: v.id("productVariants"),
    branchId: v.id("branches"),
    quantity: v.number(), // positive to add, negative to deduct
    movementType: v.string(),
    referenceType: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    costPerUnit: v.optional(v.number()),
    notes: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
    allowNegative: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"inventoryMovements">> => {
    const { variant, productName, label } = await getVariantContext(
      ctx,
      args.productVariantId
    );

    const stock = await getOrCreateVariantStock(
      ctx,
      args.branchId,
      args.productVariantId,
      variant.reorderLevel
    );

    const previousBalance = stock.quantity;
    const newBalance = previousBalance + args.quantity;

    const allowNeg = args.allowNegative || (await negativeStockAllowed(ctx));
    if (newBalance < 0 && !allowNeg) {
      throw new Error(
        `Insufficient stock for ${productName} (${label}). Available: ${previousBalance}, requested change: ${args.quantity}.`
      );
    }

    const reorderLevel = stock.reorderLevel ?? variant.reorderLevel;
    await syncGlobalStockCounters(ctx, previousBalance, newBalance, reorderLevel);

    await ctx.db.patch(stock._id, {
      quantity: newBalance,
      updatedAt: Date.now(),
    });

    const actor = await resolveActor(ctx, args.userId, args.username);
    const now = Date.now();

    const movementId = await ctx.db.insert("inventoryMovements", {
      movementDate: now,
      productVariantId: args.productVariantId,
      productName,
      variantLabel: label,
      sku: variant.sku,
      branchId: args.branchId,
      movementType: args.movementType,
      quantity: args.quantity,
      previousBalance,
      newBalance,
      costPerUnit: args.costPerUnit,
      totalCostImpact:
        args.costPerUnit !== undefined
          ? args.costPerUnit * args.quantity
          : undefined,
      referenceType: args.referenceType,
      referenceId: args.referenceId,
      notes: args.notes,
      userId: actor.userId,
      username: actor.username,
      createdAt: now,
    });

    await writeAudit(ctx, {
      userId: actor.userId,
      username: actor.username,
      action: `inventory.${args.movementType}`,
      entityType: "productVariant",
      entityId: args.productVariantId,
      details: `${productName} (${label}) @ branch ${args.branchId}: ${args.quantity >= 0 ? "+" : ""}${args.quantity} (prev ${previousBalance} → new ${newBalance}). ${args.notes ?? ""}`.trim(),
    });

    return movementId;
  },
});

// ─────────────────────────────────────────────
// LEDGER QUERIES
// ─────────────────────────────────────────────

export const listMovements = query({
  args: {
    start: v.optional(v.number()),
    end: v.optional(v.number()),
    movementType: v.optional(v.string()),
    productVariantId: v.optional(v.id("productVariants")),
    branchId: v.optional(v.id("branches")),
    username: v.optional(v.string()),
    referenceType: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 500;
    let rows;

    if (args.productVariantId) {
      rows = await ctx.db
        .query("inventoryMovements")
        .withIndex("by_variant", (q) =>
          q.eq("productVariantId", args.productVariantId!)
        )
        .order("desc")
        .collect();
    } else {
      rows = await ctx.db
        .query("inventoryMovements")
        .withIndex("by_date", (q) => {
          if (args.start !== undefined && args.end !== undefined)
            return q.gte("movementDate", args.start).lte("movementDate", args.end);
          if (args.start !== undefined) return q.gte("movementDate", args.start);
          if (args.end !== undefined) return q.lte("movementDate", args.end);
          return q;
        })
        .order("desc")
        .take(limit * 3);
    }

    if (args.start !== undefined)
      rows = rows.filter((m) => m.movementDate >= args.start!);
    if (args.end !== undefined)
      rows = rows.filter((m) => m.movementDate <= args.end!);
    if (args.movementType && args.movementType !== "All")
      rows = rows.filter((m) => m.movementType === args.movementType);
    if (args.branchId)
      rows = rows.filter((m) => m.branchId === args.branchId);
    if (args.username && args.username !== "All")
      rows = rows.filter((m) => m.username === args.username);
    if (args.referenceType && args.referenceType !== "All")
      rows = rows.filter((m) => m.referenceType === args.referenceType);

    return rows.slice(0, limit);
  },
});

export const listAuditLogs = query({
  args: { limit: v.optional(v.number()), token: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.token) await validateToken(ctx, args.token);
    return await ctx.db
      .query("auditLogs")
      .order("desc")
      .take(args.limit ?? 250);
  },
});

// ─────────────────────────────────────────────
// MANUAL RESTOCK (used before purchasing is wired for ad-hoc corrections)
// ─────────────────────────────────────────────

export const receiveStock = mutation({
  args: {
    token: v.string(),
    productVariantId: v.id("productVariants"),
    branchId: v.id("branches"),
    quantity: v.number(),
    costPerUnit: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"inventoryMovements">> => {
    const actor = await authorize(ctx, args.token, "inventory.adjust");
    if (args.quantity <= 0) throw new Error("Quantity must be greater than zero.");
    return await ctx.runMutation(internal.inventory.mutateStock, {
      productVariantId: args.productVariantId,
      branchId: args.branchId,
      quantity: args.quantity,
      movementType: "PURCHASE",
      referenceType: "manual",
      costPerUnit: args.costPerUnit,
      notes: args.notes ?? "Manual stock receipt",
      userId: actor._id,
      username: actor.username,
    });
  },
});
