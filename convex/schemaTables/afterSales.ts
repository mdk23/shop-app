import { defineTable } from "convex/server";
import { v } from "convex/values";

// After-sales and follow-up (SQL module M06). Requests are wantList (demand) and
// complaints (after-sales); both already exist. Resolutions are the one decision
// record that complaints and returns point to.
export const afterSalesTables = {
  qualityIncidents: defineTable({
    description: v.string(),
    recognizedAt: v.number(),
  }),

  qualityIncidentItems: defineTable({
    incidentId: v.id("qualityIncidents"),
    productId: v.optional(v.id("products")),
    variantId: v.optional(v.id("productVariants")),
    affectedQuantity: v.optional(v.number()),
  }).index("by_incident", ["incidentId"]),

  complaintQualityIncidents: defineTable({
    complaintId: v.id("complaints"),
    qualityIncidentId: v.id("qualityIncidents"),
  })
    .index("by_complaint", ["complaintId"])
    .index("by_incident", ["qualityIncidentId"]),

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
