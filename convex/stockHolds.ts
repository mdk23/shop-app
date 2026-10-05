import { v } from "convex/values";
import { query } from "./_generated/server";

/** Quantity held for customer orders per variant at a branch, for the stock screens. */
export const activeByBranch = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    const holds = await ctx.db
      .query("stockHolds")
      .withIndex("by_branch_variant_status", (q) => q.eq("branchId", args.branchId))
      .collect();
    const held: Record<string, number> = {};
    for (const hold of holds) {
      if (hold.status !== "ACTIVE") continue;
      held[hold.productVariantId] = (held[hold.productVariantId] ?? 0) + hold.quantity;
    }
    return held;
  },
});
