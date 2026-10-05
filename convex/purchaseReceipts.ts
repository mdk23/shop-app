import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { receiveIntoStock } from "./lib/receiving";

/**
 * Goods-received note. With `purchaseOrderId`, lines match the order: quantities
 * beyond what is still outstanding are kept and flagged OVER. Without it, every
 * line is UNANNOUNCED and needs a unit cost.
 */
export const create = mutation({
  args: {
    token: v.string(),
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
    supplierId: v.optional(v.id("suppliers")),
    branchId: v.optional(v.id("branches")),
    deliveryNoteRef: v.optional(v.string()),
    notes: v.optional(v.string()),
    lines: v.array(
      v.object({
        productVariantId: v.id("productVariants"),
        quantityReceived: v.number(),
        unitCost: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args): Promise<Id<"purchaseReceipts">> => {
    const actor = await authorize(ctx, args.token, "purchasing.receive");

    let purchaseOrder = null;
    if (args.purchaseOrderId) {
      purchaseOrder = await ctx.db.get(args.purchaseOrderId);
      if (!purchaseOrder) throw new Error("Purchase order not found.");
      if (purchaseOrder.status !== "sent" && purchaseOrder.status !== "partially_received") {
        throw new Error("Only sent or partially received purchase orders can receive stock.");
      }
    } else if (!args.supplierId || !args.branchId) {
      throw new Error("Goods without an order need a supplier and a branch.");
    }

    const branchId = args.branchId ?? purchaseOrder?.branchId;
    if (!branchId) throw new Error("No branch to receive stock into.");
    if (args.supplierId && !(await ctx.db.get(args.supplierId))) {
      throw new Error("Supplier not found.");
    }

    return await receiveIntoStock(ctx, actor, {
      purchaseOrder,
      supplierId: args.supplierId,
      branchId,
      deliveryNoteRef: args.deliveryNoteRef,
      notes: args.notes,
      lines: args.lines,
      allowOver: true,
      allowUnannounced: true,
    });
  },
});

export const listByPurchaseOrder = query({
  args: { purchaseOrderId: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("purchaseReceipts")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("purchaseReceipts") },
  handler: async (ctx, args) => {
    const receipt = await ctx.db.get(args.id);
    if (!receipt) return null;
    const items = await ctx.db
      .query("purchaseReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.id))
      .collect();
    return { ...receipt, items };
  },
});
