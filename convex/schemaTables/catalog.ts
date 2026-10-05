import { defineTable } from "convex/server";
import { v } from "convex/values";

// Catalogue and fiscal identity. Tax on a sale is the line-level tax on saleItems;
// fiscal document numbers come from documentSeries and counters.
export const catalogTables = {
  brands: defineTable({
    name: v.string(),
    createdAt: v.number(),
  }).index("by_name", ["name"]),

  sizeEquivalences: defineTable({
    fromSizeId: v.id("sizes"),
    toSizeId: v.id("sizes"),
    certainty: v.string(),
  })
    .index("by_from", ["fromSizeId"])
    .index("by_to", ["toSizeId"]),

  fiscalIdentities: defineTable({
    personId: v.optional(v.id("customers")),
    branchId: v.optional(v.id("branches")),
    identificationType: v.string(),
    number: v.string(),
    country: v.string(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  })
    .index("by_person", ["personId"])
    .index("by_branch", ["branchId"]),
};
