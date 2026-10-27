import { defineTable } from "convex/server";
import { v } from "convex/values";

// Price adjustments on a customer order (SQL module M03). Order status lives on
// customerOrders; deposits and refunds are payments rows; quantities
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
    promotionId: v.optional(v.id("promotions")),
  })
    .index("by_commitment", ["commitmentId"])
    .index("by_promotion", ["promotionId"]),

  // What happened to a customer order, in order. The order's `status` is where it stands
  // now; this is how it got there. CONFIRMED is when the order became binding: at
  // creation when no deposit is required, otherwise when deposits reach the required one.
  // CHANGED carries the line changes and the totals before and after.
  orderEvents: defineTable({
    orderId: v.id("customerOrders"),
    kind: v.union(
      v.literal("CREATED"),
      v.literal("CONFIRMED"),
      v.literal("CHANGED"),
      v.literal("READY"),
      v.literal("CANCELLED"),
      v.literal("COLLECTED")
    ),
    reason: v.optional(v.string()),
    lineChanges: v.optional(
      v.array(
        v.object({
          productVariantId: v.id("productVariants"),
          label: v.string(),
          quantityBefore: v.number(),
          quantityAfter: v.number(),
          unitPrice: v.number(),
        })
      )
    ),
    totalBefore: v.optional(v.number()),
    totalAfter: v.optional(v.number()),
    saleId: v.optional(v.id("sales")),
    userId: v.id("users"),
    username: v.string(),
    occurredAt: v.number(),
  }).index("by_order_and_occurred_at", ["orderId", "occurredAt"]),

  // Where an order line came from: the customer's demand (request) or a proposal made
  // in answer to one.
  orderItemOrigins: defineTable({
    orderItemId: v.id("customerOrderItems"),
    orderId: v.id("customerOrders"),
    demandId: v.optional(v.id("demands")),
    demandResponseItemId: v.optional(v.id("demandResponseItems")),
  })
    .index("by_order_item", ["orderItemId"])
    .index("by_order", ["orderId"])
    .index("by_demand", ["demandId"]),

  // Taking goods to the customer. A delivery is for a sale (an order collected for
  // delivery becomes one), and its lines say which sale lines, and so which order lines,
  // it carries. A FAILED delivery's lines can go out again on a new delivery.
  deliveries: defineTable({
    deliveryNumber: v.string(),
    saleId: v.id("sales"),
    customerOrderId: v.optional(v.id("customerOrders")),
    branchId: v.id("branches"),
    recipientName: v.string(),
    recipientPhone: v.optional(v.string()),
    address: v.string(),
    status: v.union(v.literal("SCHEDULED"), v.literal("DELIVERED"), v.literal("FAILED")),
    scheduledFor: v.optional(v.number()),
    deliveredAt: v.optional(v.number()),
    receivedBy: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    notes: v.optional(v.string()),
    createdBy: v.id("users"),
    createdByUsername: v.string(),
    createdAt: v.number(),
  })
    .index("by_sale", ["saleId"])
    .index("by_customer_order", ["customerOrderId"])
    .index("by_status_and_created_at", ["status", "createdAt"]),

  deliveryItems: defineTable({
    deliveryId: v.id("deliveries"),
    saleItemId: v.id("saleItems"),
    customerOrderItemId: v.optional(v.id("customerOrderItems")),
    productVariantId: v.id("productVariants"),
    quantity: v.number(),
  })
    .index("by_delivery", ["deliveryId"])
    .index("by_sale_item", ["saleItemId"])
    .index("by_customer_order_item", ["customerOrderItemId"]),
};
