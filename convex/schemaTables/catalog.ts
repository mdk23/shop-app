import { defineTable } from "convex/server";
import { v } from "convex/values";

// Catalogue and fiscal identity. Tax on a sale is the line-level tax on saleItems;
// fiscal document numbers come from documentSeries and counters.
// Brands are not modelled: the shop sells one brand, and customers.preferredBrands is
// free text.
export const catalogTables = {
  sizeEquivalences: defineTable({
    fromSizeId: v.id("sizes"),
    toSizeId: v.id("sizes"),
    certainty: v.string(),
  })
    .index("by_from", ["fromSizeId"])
    .index("by_to", ["toSizeId"]),

  fiscalIdentities: defineTable({
    customerId: v.optional(v.id("customers")),
    branchId: v.optional(v.id("branches")),
    identificationType: v.string(),
    number: v.string(),
    country: v.string(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
  })
    .index("by_customer", ["customerId"])
    .index("by_branch", ["branchId"]),
};
