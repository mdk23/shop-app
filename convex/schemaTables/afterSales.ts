import { defineTable } from "convex/server";
import { v } from "convex/values";

// After-sales and follow-up (SQL module M06). Requests are `demands` and complaints
// (after-sales); both already exist. Resolutions are the one decision record that
// complaints and returns point to.
export const afterSalesTables = {
  // A defect in goods, wherever it was found: on receipt from a supplier (RECEIPT),
  // in the shop (STOCK) or reported by a customer (CUSTOMER). One treatment closes
  // it; an issue without a treatment is open.
  qualityIssues: defineTable({
    source: v.union(v.literal("RECEIPT"), v.literal("STOCK"), v.literal("CUSTOMER")),
    description: v.string(),
    // With a receipt line, the supplier is the receipt's (checked on write); kept as the
    // key of the supplier's quality list (by_supplier).
    supplierId: v.optional(v.id("suppliers")),
    receiptItemId: v.optional(v.id("purchaseReceiptItems")),
    treatment: v.optional(
      v.union(
        v.literal("RETURN_TO_SUPPLIER"),
        v.literal("DISCOUNT"),
        v.literal("ACCEPT_AS_IS"),
        v.literal("DESTROY")
      )
    ),
    treatmentNotes: v.optional(v.string()),
    treatedAt: v.optional(v.number()),
    recognizedAt: v.number(),
    createdBy: v.id("users"),
    createdByUsername: v.string(),
  })
    .index("by_supplier", ["supplierId"])
    .index("by_source", ["source"]),

  qualityIssueItems: defineTable({
    issueId: v.id("qualityIssues"),
    productVariantId: v.id("productVariants"),
    affectedQuantity: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_variant", ["productVariantId"]),

  complaintQualityIssues: defineTable({
    complaintId: v.id("complaints"),
    qualityIssueId: v.id("qualityIssues"),
  })
    .index("by_complaint", ["complaintId"])
    .index("by_issue", ["qualityIssueId"]),

  resolutions: defineTable({
    resolutionType: v.union(
      v.literal("TROCA"),
      v.literal("DEVOLUCAO"),
      v.literal("REEMBOLSO"),
      v.literal("CREDITO"),
      v.literal("REPARACAO"),
      v.literal("RECUSA")
    ),
    decidedAt: v.number(),
  }),

  resolutionSuccessions: defineTable({
    previousResolutionId: v.id("resolutions"),
    nextResolutionId: v.id("resolutions"),
  })
    .index("by_previous", ["previousResolutionId"])
    .index("by_next", ["nextResolutionId"]),

  followUpCommitments: defineTable({
    relationId: v.id("businessRelations"),
    description: v.string(),
    assumedAt: v.number(),
    dueAt: v.optional(v.number()),
  }).index("by_relation", ["relationId"]),

  followUpOrigins: defineTable({
    followUpId: v.id("followUpCommitments"),
    complaintId: v.optional(v.id("complaints")),
    salesReturnId: v.optional(v.id("salesReturns")),
  })
    .index("by_follow_up", ["followUpId"])
    .index("by_complaint", ["complaintId"])
    .index("by_sales_return", ["salesReturnId"]),

  followUpSatisfactions: defineTable({
    followUpId: v.id("followUpCommitments"),
    satisfiedAt: v.number(),
    registeredAt: v.number(),
  }).index("by_follow_up", ["followUpId"]),
};
