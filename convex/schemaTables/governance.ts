import { defineTable } from "convex/server";
import { v } from "convex/values";

// Reference data for units and currency. People are customers and users; the audit
// trail is auditLogs.
export const governanceTables = {
  units: defineTable({
    name: v.string(),
    symbol: v.string(),
    dimension: v.string(),
    baseUnitId: v.optional(v.id("units")),
    conversionFactor: v.optional(v.number()),
  })
    .index("by_dimension_and_symbol", ["dimension", "symbol"])
    .index("by_base_unit", ["baseUnitId"]),

  currencies: defineTable({
    isoCode: v.string(),
    name: v.string(),
    symbol: v.optional(v.string()),
    decimalPlaces: v.number(),
  }).index("by_iso_code", ["isoCode"]),
};
