import { defineTable } from "convex/server";
import { v } from "convex/values";

// Procurement planning and landed cost. Order and receiving progress come from
// purchaseOrders / purchaseOrderItems and purchaseReceipts / purchaseReceiptItems.
export const procurementTables = {
  // The branch the need is for. Optional only for needs recorded before it was asked.
  procurementNeeds: defineTable({
    recognizedAt: v.number(),
    branchId: v.optional(v.id("branches")),
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

  // A decision carried out: a quantity of a decision item placed on a purchase order line.
  decisionOrderLines: defineTable({
    decisionItemId: v.id("procurementDecisionItems"),
    purchaseOrderItemId: v.id("purchaseOrderItems"),
    quantity: v.number(),
  })
    .index("by_decision_item", ["decisionItemId"])
    .index("by_purchase_order_item", ["purchaseOrderItemId"]),

  // The cost of getting goods in (freight, insurance, duties, handling) for a shipment or
  // a receipt. Applying it spreads the total over the receipt lines (landedCostAllocations)
  // and adds it to the variants' cost price; once applied it can no longer change.
  landedCosts: defineTable({
    calculatedFor: v.number(),
    methodVersion: v.string(),
    shipmentId: v.optional(v.id("shipments")),
    receiptId: v.optional(v.id("purchaseReceipts")),
    // How the total is spread: by each line's goods value, or by units.
    allocationMethod: v.optional(v.union(v.literal("VALUE"), v.literal("QUANTITY"))),
    appliedAt: v.optional(v.number()),
  })
    .index("by_shipment", ["shipmentId"])
    .index("by_receipt", ["receiptId"]),

  landedCostComponents: defineTable({
    landedCostId: v.id("landedCosts"),
    componentType: v.string(),
    componentValue: v.number(),
  }).index("by_landed_cost", ["landedCostId"]),

  // One receipt line's share of a landed cost.
  landedCostAllocations: defineTable({
    landedCostId: v.id("landedCosts"),
    receiptItemId: v.id("purchaseReceiptItems"),
    productVariantId: v.id("productVariants"),
    quantity: v.number(),
    amount: v.number(),
    unitAmount: v.number(),
  })
    .index("by_landed_cost", ["landedCostId"])
    .index("by_receipt_item", ["receiptItemId"]),
};
