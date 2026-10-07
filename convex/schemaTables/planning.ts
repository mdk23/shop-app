import { defineTable } from "convex/server";
import { v } from "convex/values";

// Sales planning: positioning and pricing policy, and payment terms the shop offers.
// Customer interest that may become an order is `demands` (stage OPEN/PROCEEDING).
export const planningTables = {
  productPositioning: defineTable({
    productId: v.id("products"),
    positioning: v.union(v.literal("ESSENTIAL"), v.literal("CORE"), v.literal("PREMIUM")),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  }).index("by_product", ["productId", "validFrom"]),

  pricingPolicies: defineTable({
    name: v.string(),
    marginPercent: v.optional(v.number()),
    roundingRule: v.optional(v.string()),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  }),

  paymentTerms: defineTable({
    name: v.string(),
    days: v.number(),
    depositPercent: v.optional(v.number()),
    active: v.boolean(),
  }).index("by_active", ["active"]),
};
