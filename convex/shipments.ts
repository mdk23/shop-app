import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { formatVariantLabel, variantNames } from "./lib/variantNames";
import { assertWholeQuantity } from "./lib/pricing";
import { inTransitQuantity, shipmentItemsOf, shipmentOrderIds, shipmentReceipts } from "./lib/shipping";

/**
 * Shipments with what they carry (lines from one or more orders), their suppliers, the
 * receipts made from them and their customs documents.
 */
export const list = query({
  args: {
    token: v.string(),
    status: v.optional(v.union(v.literal("IN_TRANSIT"), v.literal("ARRIVED"))),
    supplierId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const rows = args.status
      ? await ctx.db
          .query("shipments")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(200)
      : await ctx.db.query("shipments").order("desc").take(200);
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const rawItems = await shipmentItemsOf(ctx, row._id);
        const orders = (
          await Promise.all(shipmentOrderIds(row, rawItems).map((id) => ctx.db.get(id)))
        ).filter((o): o is Doc<"purchaseOrders"> => o !== null);
        const suppliers = (
          await Promise.all([...new Set(orders.map((o) => o.supplierId))].map((id) => ctx.db.get(id)))
        ).filter((s): s is Doc<"suppliers"> => s !== null);
        const codeOf = new Map(orders.map((o) => [o._id, o.orderCode]));
        const items = await Promise.all(
          rawItems.map(async (item) => {
            const variant = await ctx.db.get(item.productVariantId);
            const product = variant ? await ctx.db.get(variant.productId) : null;
            return {
              ...item,
              orderCode: codeOf.get(item.purchaseOrderId) ?? "—",
              label: variant
                ? `${product?.name ?? "—"} ${formatVariantLabel(await variantNames(ctx, variant), variant.sku)}`
                : "—",
            };
          })
        );
        const receipts = await shipmentReceipts(ctx, row);
        const customs = await ctx.db
          .query("customsDocuments")
          .withIndex("by_shipment", (q) => q.eq("shipmentId", row._id))
          .take(50);
        return {
          ...row,
          items,
          orders: orders.map((o) => ({
            _id: o._id,
            orderCode: o.orderCode,
            received: receipts.some((r) => r.purchaseOrderId === o._id),
          })),
          orderCode: orders.map((o) => o.orderCode).join(", ") || null,
          supplierIds: suppliers.map((s) => s._id),
          supplierName: suppliers.map((s) => s.name).join(", ") || null,
          receipts: receipts.map((r) => ({ _id: r._id, receiptNumber: r.receiptNumber })),
          customs,
        };
      })
    );
    return args.supplierId
      ? enriched.filter((r) => r.supplierIds.includes(args.supplierId!))
      : enriched;
  },
});

const itemInput = v.object({
  purchaseOrderItemId: v.id("purchaseOrderItems"),
  quantity: v.number(),
});

/**
 * The lines a new shipment carries. Each must be on a sent or partly received order, and
 * cannot carry more than the line still has outstanding less what is already on its way.
 */
async function planShipmentItems(
  ctx: MutationCtx,
  input: { purchaseOrderItemId: Id<"purchaseOrderItems">; quantity: number }[]
) {
  const merged = new Map<Id<"purchaseOrderItems">, number>();
  for (const i of input) {
    if (i.quantity <= 0) throw new Error("Shipped quantities must be positive.");
    assertWholeQuantity(i.quantity, "Shipped quantities");
    merged.set(i.purchaseOrderItemId, (merged.get(i.purchaseOrderItemId) ?? 0) + i.quantity);
  }
  const planned = [];
  for (const [lineId, quantity] of merged) {
    const line = await ctx.db.get(lineId);
    if (!line || !line.productVariantId) throw new Error("Order line not found.");
    const po = await ctx.db.get(line.purchaseOrderId);
    if (!po) throw new Error("Purchase order not found.");
    if (po.status !== "SENT" && po.status !== "PARTIALLY_RECEIVED") {
      throw new Error(`${po.orderCode} is not waiting for goods.`);
    }
    const free = line.quantityOrdered - line.quantityReceived - (await inTransitQuantity(ctx, line));
    if (quantity > free) {
      throw new Error(
        `${po.orderCode}: only ${Math.max(0, free)} unit(s) of a line are left to ship (ordered, less received and already on the way).`
      );
    }
    planned.push({
      purchaseOrderId: po._id,
      purchaseOrderItemId: line._id,
      productVariantId: line.productVariantId,
      quantity,
    });
  }
  return planned;
}

/** Every line of an order that is still free to ship, in full. */
async function wholeOrderItems(ctx: MutationCtx, purchaseOrderId: Id<"purchaseOrders">) {
  const lines = await ctx.db
    .query("purchaseOrderItems")
    .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", purchaseOrderId))
    .take(500);
  const items = [];
  for (const line of lines) {
    const free = line.quantityOrdered - line.quantityReceived - (await inTransitQuantity(ctx, line));
    if (free > 0) items.push({ purchaseOrderItemId: line._id, quantity: free });
  }
  return items;
}

export const create = mutation({
  args: {
    token: v.string(),
    /** What the shipment carries; lines may come from several orders. */
    items: v.optional(v.array(itemInput)),
    /** Shorthand for one order: ships everything it still has to send. */
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
    carrier: v.string(),
    trackingReference: v.optional(v.string()),
    departedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const carrier = args.carrier.trim();
    if (!carrier) throw new Error("Name the carrier.");
    let input = args.items ?? [];
    if (input.length === 0 && args.purchaseOrderId) {
      if (!(await ctx.db.get(args.purchaseOrderId))) throw new Error("Purchase order not found.");
      input = await wholeOrderItems(ctx, args.purchaseOrderId);
      if (input.length === 0) throw new Error("Everything on this order is received or already on its way.");
    }
    const planned = await planShipmentItems(ctx, input);

    const id = await ctx.db.insert("shipments", {
      carrier,
      trackingReference: args.trackingReference?.trim() || undefined,
      status: "IN_TRANSIT",
      departedAt: args.departedAt ?? Date.now(),
    });
    for (const item of planned) await ctx.db.insert("shipmentItems", { shipmentId: id, ...item });
    const orderCount = new Set(planned.map((p) => p.purchaseOrderId)).size;
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "shipment.created",
      entityType: "shipment",
      entityId: id,
      details: `${carrier}${args.trackingReference ? ` · ${args.trackingReference}` : ""}: ${planned.length} line(s) from ${orderCount} order(s)`,
    });
    return id;
  },
});

/**
 * Marks a shipment as arrived. Receiving its goods does this too; `receiptId` links a
 * receipt made without naming the shipment, which must be for one of its orders.
 */
export const markArrived = mutation({
  args: { token: v.string(), id: v.id("shipments"), receiptId: v.optional(v.id("purchaseReceipts")) },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.receive");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Shipment not found.");
    if (row.status === "ARRIVED") throw new Error("This shipment has already arrived.");
    if (args.receiptId) {
      const receipt = await ctx.db.get(args.receiptId);
      if (!receipt) throw new Error("Receipt not found.");
      const orders = shipmentOrderIds(row, await shipmentItemsOf(ctx, row._id));
      if (!receipt.purchaseOrderId || !orders.includes(receipt.purchaseOrderId)) {
        throw new Error("That receipt is for a different purchase order than this shipment carries.");
      }
      if (receipt.shipmentId && receipt.shipmentId !== row._id) {
        throw new Error("That receipt already belongs to another shipment.");
      }
      await ctx.db.patch(receipt._id, { shipmentId: row._id });
    }
    await ctx.db.patch(args.id, { status: "ARRIVED", arrivedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "shipment.arrived",
      entityType: "shipment",
      entityId: args.id,
    });
  },
});

export const addCustomsDocument = mutation({
  args: {
    token: v.string(),
    shipmentId: v.id("shipments"),
    documentType: v.string(),
    reference: v.string(),
    issuedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    if (!(await ctx.db.get(args.shipmentId))) throw new Error("Shipment not found.");
    const reference = args.reference.trim();
    const documentType = args.documentType.trim();
    if (!reference || !documentType) throw new Error("Type and reference are required.");
    const id = await ctx.db.insert("customsDocuments", {
      shipmentId: args.shipmentId,
      documentType,
      reference,
      issuedAt: args.issuedAt,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "shipment.customs_added",
      entityType: "shipment",
      entityId: args.shipmentId,
      details: `${documentType} ${reference}`,
    });
    return id;
  },
});
