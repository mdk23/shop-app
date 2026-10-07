import { defineTable } from "convex/server";
import { v } from "convex/values";

// Customer relations and demand responses (SQL module M01), plus offers and
// assortments (M02). Demand is `demands`; supplier identity is suppliers.
export const relationTables = {
  contactMeans: defineTable({
    personId: v.id("customers"),
    contactType: v.string(),
    contactValue: v.string(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    registeredAt: v.number(),
  }).index("by_person", ["personId"]),

  businessRelations: defineTable({
    startedAt: v.number(),
    endedAt: v.optional(v.number()),
    registeredAt: v.number(),
  }),

  relationParticipants: defineTable({
    relationId: v.id("businessRelations"),
    personId: v.id("customers"),
    role: v.string(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  })
    .index("by_relation", ["relationId"])
    .index("by_person", ["personId"]),

  interactionDemands: defineTable({
    interactionId: v.id("customerInteractions"),
    demandId: v.id("demands"),
    role: v.string(),
    registeredAt: v.number(),
  })
    .index("by_interaction", ["interactionId"])
    .index("by_demand", ["demandId"]),

  demandResponses: defineTable({
    demandId: v.id("demands"),
    interactionId: v.optional(v.id("customerInteractions")),
    outcome: v.union(
      v.literal("DISPONIVEL"),
      v.literal("ALTERNATIVA"),
      v.literal("PROPOSTA_FUTURA"),
      v.literal("SEM_SOLUCAO_ADEQUADA")
    ),
    presentedAt: v.number(),
    registeredAt: v.number(),
  })
    .index("by_demand", ["demandId"])
    .index("by_interaction", ["interactionId"]),

  demandResponseItems: defineTable({
    responseId: v.id("demandResponses"),
    productId: v.optional(v.id("products")),
    variantId: v.optional(v.id("productVariants")),
    presentedDescription: v.string(),
    proposedQuantity: v.optional(v.number()),
    proposedPrice: v.optional(v.number()),
    currencyId: v.optional(v.id("currencies")),
  })
    .index("by_response", ["responseId"])
    .index("by_variant", ["variantId"]),

  offers: defineTable({
    description: v.string(),
    constitutedAt: v.number(),
  }),

  assortments: defineTable({
    name: v.string(),
    constitutedAt: v.number(),
  }),

  offerAssortments: defineTable({
    offerId: v.id("offers"),
    assortmentId: v.id("assortments"),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  })
    .index("by_offer", ["offerId"])
    .index("by_assortment", ["assortmentId"]),

  assortmentItems: defineTable({
    assortmentId: v.id("assortments"),
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  })
    .index("by_assortment", ["assortmentId"])
    .index("by_product", ["productId"]),
};
