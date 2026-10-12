import { authorize } from "./permissions";
import { v } from "convex/values";
import { internalMutation, query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { writeAudit } from "./audit";

/**
 * Stock held for a customer order counts until the order is collected or cancelled, or
 * until it expires (`expiresAt`, set from the reservationDays setting). An expired hold
 * stops counting at once; `expireHolds` (hourly cron) then marks it EXPIRED.
 */
export async function activeHeldQuantity(
  ctx: QueryCtx,
  branchId: Id<"branches">,
  productVariantId: Id<"productVariants">,
  now: number = Date.now()
): Promise<number> {
  const holds = await ctx.db
    .query("stockHolds")
    .withIndex("by_branch_variant_status", (q) =>
      q.eq("branchId", branchId).eq("productVariantId", productVariantId).eq("status", "ACTIVE")
    )
    .collect();
  return holds.filter((h) => h.expiresAt > now).reduce((s, h) => s + h.quantity, 0);
}

/** Quantity held for customer orders per variant at a branch, for the stock screens. */
export const activeByBranch = query({
  args: {
    token: v.string(), branchId: v.id("branches") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "inventory.view");
    const now = Date.now();
    const holds = await ctx.db
      .query("stockHolds")
      .withIndex("by_branch_variant_status", (q) => q.eq("branchId", args.branchId))
      .collect();
    const held: Record<string, number> = {};
    for (const hold of holds) {
      if (hold.status !== "ACTIVE" || hold.expiresAt <= now) continue;
      held[hold.productVariantId] = (held[hold.productVariantId] ?? 0) + hold.quantity;
    }
    return held;
  },
});

/** Marks holds past their expiry as EXPIRED, logging each order once. Run hourly. */
export const expireHolds = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const expired = await ctx.db
      .query("stockHolds")
      .withIndex("by_status_and_expires", (q) => q.eq("status", "ACTIVE").lt("expiresAt", now))
      .take(500);
    const orders = new Set<Id<"customerOrders">>();
    for (const hold of expired) {
      await ctx.db.patch(hold._id, { status: "EXPIRED", releasedAt: now });
      orders.add(hold.orderId);
    }
    for (const orderId of orders) {
      const order = await ctx.db.get(orderId);
      if (!order) continue;
      // No one acts here: the entry is the system's, against the order's creator.
      await writeAudit(ctx, {
        userId: order.createdBy,
        username: "system",
        action: "customer_order.reservation_expired",
        entityType: "customerOrder",
        entityId: orderId,
        details: `${order?.orderNumber ?? orderId}: reserved stock went back on sale`,
      });
    }
    return expired.length;
  },
});
