import { defineTable } from "convex/server";
import { v } from "convex/values";

// Sales planning: opportunities (interest that may become an order), positioning and
// pricing policy, and payment terms the shop offers.
export const planningTables = {
  opportunities: defineTable({
    customerId: v.optional(v.id("customers")),
    description: v.string(),
    productId: v.optional(v.id("products")),
    variantId: v.optional(v.id("productVariants")),
    stage: v.union(
      v.literal("OPEN"),
      v.literal("PROCEEDING"),
      v.literal("NOT_PROCEEDING"),
      v.literal("CONVERTED")
    ),
    estimatedValue: v.optional(v.number()),
    conditions: v.optional(v.string()),
    reasonNotProceeding: v.optional(
      v.union(
        v.literal("PRICE"),
        v.literal("SIZE"),
        v.literal("COLOR"),
        v.literal("STOCK"),
        v.literal("OTHER")
      )
    ),
    convertedOrderId: v.optional(v.id("customerOrders")),
    createdByUsername: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_customer", ["customerId"])
    .index("by_stage", ["stage"]),

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
