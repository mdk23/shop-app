import { defineTable } from "convex/server";
import { v } from "convex/values";

// Procurement planning and landed cost. Order and receiving progress come from
// purchaseOrders / purchaseOrderItems and purchaseReceipts / purchaseReceiptItems.
export const procurementTables = {
  procurementNeeds: defineTable({
    recognizedAt: v.number(),
  }),

  procurementNeedItems: defineTable({
    needId: v.id("procurementNeeds"),
    productId: v.optional(v.id("products")),
    productVariantId: v.optional(v.id("productVariants")),
    quantityRecognized: v.optional(v.number()),
  }).index("by_need", ["needId"]),

  procurementDecisions: defineTable({
    decisionType: v.string(),
    decidedAt: v.number(),
  }),

  procurementDecisionItems: defineTable({
    decisionId: v.id("procurementDecisions"),
    productId: v.optional(v.id("products")),
    productVariantId: v.optional(v.id("productVariants")),
    quantityDecided: v.optional(v.number()),
  }).index("by_decision", ["decisionId"]),

  decisionNeedCoverages: defineTable({
    decisionItemId: v.id("procurementDecisionItems"),
    needItemId: v.id("procurementNeedItems"),
    coveredQuantity: v.optional(v.number()),
  })
    .index("by_decision_item", ["decisionItemId"])
    .index("by_need_item", ["needItemId"]),

  landedCosts: defineTable({
    calculatedFor: v.number(),
    methodVersion: v.string(),
  }),

  landedCostComponents: defineTable({
    landedCostId: v.id("landedCosts"),
    componentType: v.string(),
    componentValue: v.number(),
  }).index("by_landed_cost", ["landedCostId"]),
};
