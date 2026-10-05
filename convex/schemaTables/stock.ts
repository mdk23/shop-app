import { defineTable } from "convex/server";
import { v } from "convex/values";

// Material incidents (damage, loss). Stock effects are the ledger movements they
// point to in `movementId`; the shop's location is `branches`.
export const stockTables = {
  // Where stock physically sits within the business. Stock quantities stay per branch
  // in the ledger; a location names the custody point inside a branch.
  locations: defineTable({
    branchId: v.id("branches"),
    name: v.string(),
    locationType: v.union(v.literal("CENTRAL"), v.literal("STORE"), v.literal("CUSTODY")),
  }).index("by_branch", ["branchId"]),

  materialIncidents: defineTable({
    incidentType: v.string(),
    occurredAt: v.number(),
    knownAt: v.optional(v.number()),
  }),

  materialIncidentItems: defineTable({
    incidentId: v.id("materialIncidents"),
    variantId: v.id("productVariants"),
    movementId: v.optional(v.id("inventoryMovements")),
  })
    .index("by_incident", ["incidentId"])
    .index("by_movement", ["movementId"]),
};
