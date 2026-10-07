import { defineTable } from "convex/server";
import { v } from "convex/values";

// Stock locations inside a branch. Damage and loss are recorded as stockAdjustments
// (reasons DAMAGED / MISSING), which write the matching ledger movements.
export const stockTables = {
  // Where stock physically sits within the business. Stock quantities stay per branch
  // in the ledger; a location names the custody point inside a branch.
  locations: defineTable({
    branchId: v.id("branches"),
    name: v.string(),
    locationType: v.union(v.literal("CENTRAL"), v.literal("STORE"), v.literal("CUSTODY")),
  }).index("by_branch", ["branchId"]),
};
