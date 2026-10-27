import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { receiveIntoStock, receiptSupplierId } from "./lib/receiving";
import { formatVariantLabel, variantNames } from "./lib/variantNames";
import { inTransitQuantity } from "./lib/shipping";

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
    shipmentId: v.optional(v.id("shipments")),
    discrepancyReason: v.optional(v.string()),
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
      if (purchaseOrder.status !== "SENT" && purchaseOrder.status !== "PARTIALLY_RECEIVED") {
        throw new Error("Only sent or partially received purchase orders can receive stock.");
      }
    } else if (!args.supplierId || !args.branchId) {
      throw new Error("Goods without an order need a supplier and a branch.");
    }

    // A receipt for an order takes the order's supplier; naming another one is refused.
    if (purchaseOrder && args.supplierId && args.supplierId !== purchaseOrder.supplierId) {
      throw new Error("This order is from a different supplier.");
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
      shipmentId: args.shipmentId,
      discrepancyReason: args.discrepancyReason,
    });
  },
});

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const rows = await ctx.db.query("purchaseReceipts").order("desc").take(200);
    return await Promise.all(
      rows.map(async (row) => {
        const po = row.purchaseOrderId ? await ctx.db.get(row.purchaseOrderId) : null;
        const supplierId = await receiptSupplierId(ctx, row);
        const supplier = supplierId ? await ctx.db.get(supplierId) : null;
        return {
          ...row,
          orderCode: po?.orderCode ?? null,
          supplierName: supplier?.name ?? "—",
        };
      })
    );
  },
});

/** Orders still waiting for goods, with what is outstanding on each line. */
export const openOrders = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const sent = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_status", (q) => q.eq("status", "SENT"))
      .take(1000);
    const partial = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_status", (q) => q.eq("status", "PARTIALLY_RECEIVED"))
      .take(1000);
    return await Promise.all(
      [...sent, ...partial].map(async (po) => {
        const supplier = await ctx.db.get(po.supplierId);
        const lines = await ctx.db
          .query("purchaseOrderItems")
          .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
          .collect();
        const withNames = await Promise.all(
          lines.map(async (line) => {
            const variant = line.productVariantId ? await ctx.db.get(line.productVariantId) : null;
            const product = variant ? await ctx.db.get(variant.productId) : null;
            return {
              _id: line._id,
              productVariantId: line.productVariantId,
              productName: product?.name ?? "—",
              variantLabel: variant ? formatVariantLabel(await variantNames(ctx, variant), variant.sku) : "—",
              outstanding: line.quantityOrdered - line.quantityReceived,
              // Of the outstanding units, those already on a shipment not yet received.
              inTransit: await inTransitQuantity(ctx, line),
              unitCost: line.unitCost,
            };
          })
        );
        return {
          _id: po._id,
          orderCode: po.orderCode,
          branchId: po.branchId,
          supplierName: supplier?.name ?? "—",
          lines: withNames.filter((l) => l.outstanding > 0),
        };
      })
    );
  },
});

export const listByPurchaseOrder = query({
  args: { token: v.string(), purchaseOrderId: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    return await ctx.db
      .query("purchaseReceipts")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", args.purchaseOrderId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("purchaseReceipts") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const receipt = await ctx.db.get(args.id);
    if (!receipt) return null;
    const rawItems = await ctx.db
      .query("purchaseReceiptItems")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.id))
      .collect();
    const items = await Promise.all(
      rawItems.map(async (item) => {
        const variant = await ctx.db.get(item.productVariantId);
        const product = variant ? await ctx.db.get(variant.productId) : null;
        return {
          ...item,
          productName: product?.name ?? "—",
          variantLabel: variant ? formatVariantLabel(await variantNames(ctx, variant), variant.sku) : "—",
        };
      })
    );
    const supplierId = await receiptSupplierId(ctx, receipt);
    const supplier = supplierId ? await ctx.db.get(supplierId) : null;
    const po = receipt.purchaseOrderId ? await ctx.db.get(receipt.purchaseOrderId) : null;
    const shipment = receipt.shipmentId ? await ctx.db.get(receipt.shipmentId) : null;
    const rawDiscrepancies = await ctx.db
      .query("receiptDiscrepancies")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.id))
      .take(200);
    const labelOf = new Map(items.map((i) => [i.productVariantId, `${i.productName} ${i.variantLabel}`]));
    const discrepancies = await Promise.all(
      rawDiscrepancies.map(async (d) => {
        let label = labelOf.get(d.productVariantId);
        if (!label) {
          // A line that was shipped but never arrived is not among the receipt's items.
          const variant = await ctx.db.get(d.productVariantId);
          const product = variant ? await ctx.db.get(variant.productId) : null;
          label = variant
            ? `${product?.name ?? "—"} ${formatVariantLabel(await variantNames(ctx, variant), variant.sku)}`
            : "—";
        }
        return { ...d, label };
      })
    );
    return {
      ...receipt,
      items,
      discrepancies,
      shipmentCarrier: shipment?.carrier ?? null,
      shipmentTracking: shipment?.trackingReference ?? null,
      supplierName: supplier?.name ?? "—",
      supplierId: supplierId ?? null,
      orderCode: po?.orderCode ?? null,
    };
  },
});
