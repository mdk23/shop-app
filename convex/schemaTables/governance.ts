import { defineTable } from "convex/server";
import { v } from "convex/values";

// Reference data for currency. People are customers and users; the audit trail is
// auditLogs. Stock is counted in pieces (inventoryMovements.unit is a display label).
export const governanceTables = {
  currencies: defineTable({
    isoCode: v.string(),
    name: v.string(),
    symbol: v.optional(v.string()),
    decimalPlaces: v.number(),
  }).index("by_iso_code", ["isoCode"]),
};
