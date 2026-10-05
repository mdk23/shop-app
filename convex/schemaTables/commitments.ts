import { defineTable } from "convex/server";
import { v } from "convex/values";

// Price adjustments on a customer order (SQL module M03). Order status lives on
// customerOrders; deposits and refunds are customerDeposits and payments; quantities
// come from purchaseOrderItems and customerOrderItems.
export const commitmentTables = {
  commitmentAdjustments: defineTable({
    commitmentId: v.id("customerOrders"),
    adjustmentType: v.string(),
    calculationMode: v.union(
      v.literal("VALOR"),
      v.literal("PERCENTAGEM"),
      v.literal("PRECO_FIXO")
    ),
    adjustmentValue: v.number(),
    currencyId: v.id("currencies"),
    promotionId: v.optional(v.id("promotions")),
  })
    .index("by_commitment", ["commitmentId"])
    .index("by_promotion", ["promotionId"]),
};
