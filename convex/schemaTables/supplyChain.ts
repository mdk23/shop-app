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
      v.literal("CUSTOMIZATION")
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
    // A shipment's contents are its `shipmentItems`, which may come from several orders
    // (one container, many POs); goods received from it are receipts with its
    // `shipmentId`. `purchaseOrderId` / `receiptId` are only set on shipments recorded
    // before items existed, which carried exactly one order and one receipt.
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

  // What a shipment carries: a quantity of one purchase order line. The order and
  // variant are copied from the line for lookups.
  shipmentItems: defineTable({
    shipmentId: v.id("shipments"),
    purchaseOrderId: v.id("purchaseOrders"),
    purchaseOrderItemId: v.id("purchaseOrderItems"),
    productVariantId: v.id("productVariants"),
    quantity: v.number(),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_purchase_order_item", ["purchaseOrderItemId"])
    .index("by_purchase_order", ["purchaseOrderId"]),

  // A difference between what was expected and what arrived. SHORT is found against a
  // shipment's lines on receipt or when an order is closed short; OVER and UNANNOUNCED
  // come from receipt lines (purchaseReceiptItems.discrepancy).
  receiptDiscrepancies: defineTable({
    supplierId: v.optional(v.id("suppliers")),
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
    purchaseOrderItemId: v.optional(v.id("purchaseOrderItems")),
    shipmentId: v.optional(v.id("shipments")),
    receiptId: v.optional(v.id("purchaseReceipts")),
    productVariantId: v.id("productVariants"),
    kind: v.union(v.literal("SHORT"), v.literal("OVER"), v.literal("UNANNOUNCED")),
    // Where the expectation came from: the order line, the shipment line, or nothing
    // (unannounced goods, expected 0).
    expectedFrom: v.union(v.literal("ORDER"), v.literal("SHIPMENT"), v.literal("NONE")),
    expectedQuantity: v.number(),
    receivedQuantity: v.number(),
    reason: v.optional(v.string()),
    recordedBy: v.id("users"),
    recordedByUsername: v.string(),
    recordedAt: v.number(),
  })
    .index("by_supplier_and_recorded_at", ["supplierId", "recordedAt"])
    .index("by_receipt", ["receiptId"])
    .index("by_purchase_order", ["purchaseOrderId"])
    .index("by_shipment", ["shipmentId"]),

  // Stored copies that no longer match their source, found by the daily check
  // (integrity.ts). Only the latest run's findings are kept.
  integrityIssues: defineTable({
    kind: v.union(
      v.literal("STOCK"),
      v.literal("SALE_MONEY"),
      v.literal("PO_RECEIVED"),
      v.literal("PO_PAYMENT")
    ),
    entityId: v.string(),
    label: v.string(),
    // What the stored copy says and what its source says (a quantity, an amount or a status).
    stored: v.string(),
    expected: v.string(),
    foundAt: v.number(),
  }).index("by_found_at", ["foundAt"]),

  customsDocuments: defineTable({
    shipmentId: v.id("shipments"),
    documentType: v.string(),
    reference: v.string(),
    issuedAt: v.optional(v.number()),
  }).index("by_shipment", ["shipmentId"]),
};
