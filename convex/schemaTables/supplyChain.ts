import { defineTable } from "convex/server";
import { v } from "convex/values";

// Supplier side: evaluation, supply relations and their partnership terms, receipt
// inspection, shipments and customs. Every purchase order is placed under a supply
// relation (purchaseOrders.supplyRelationId); its progress is purchaseOrders.status plus
// purchaseReceipts. Defects in received goods are `qualityIssues` with source RECEIPT.
export const supplyChainTables = {
  supplierEvaluations: defineTable({
    supplierId: v.id("suppliers"),
    qualityScore: v.number(),
    punctualityPercent: v.number(),
    costScore: v.optional(v.number()),
    notes: v.optional(v.string()),
    evaluatedBy: v.id("users"),
    evaluatedByUsername: v.string(),
    evaluatedAt: v.number(),
  }).index("by_supplier", ["supplierId", "evaluatedAt"]),

  supplyRelations: defineTable({
    supplierId: v.id("suppliers"),
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
  }).index("by_supplier", ["supplierId"]),

  partnershipTerms: defineTable({
    supplyRelationId: v.id("supplyRelations"),
    termType: v.union(
      v.literal("PRODUCTS"),
      v.literal("PRICES"),
      v.literal("DEADLINES"),
      v.literal("RESPONSIBILITIES"),
      v.literal("CUSTOMIZATION"),
      v.literal("PAYMENT")
    ),
    content: v.string(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  }).index("by_relation", ["supplyRelationId"]),

  receiptInspections: defineTable({
    receiptId: v.id("purchaseReceipts"),
    result: v.union(v.literal("OK"), v.literal("DISCREPANCY")),
    notes: v.optional(v.string()),
    inspectedBy: v.id("users"),
    inspectedByUsername: v.string(),
    inspectedAt: v.number(),
  }).index("by_receipt", ["receiptId"]),

  shipments: defineTable({
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
    receiptId: v.optional(v.id("purchaseReceipts")),
    carrier: v.string(),
    trackingReference: v.optional(v.string()),
    status: v.union(v.literal("IN_TRANSIT"), v.literal("ARRIVED")),
    departedAt: v.optional(v.number()),
    arrivedAt: v.optional(v.number()),
  })
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_receipt", ["receiptId"])
    .index("by_status", ["status"]),

  customsDocuments: defineTable({
    shipmentId: v.id("shipments"),
    documentType: v.string(),
    reference: v.string(),
    issuedAt: v.optional(v.number()),
  }).index("by_shipment", ["shipmentId"]),
};
