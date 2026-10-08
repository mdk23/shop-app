import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

/** Shipments with their purchase order's supplier and their customs documents. */
export const list = query({
  args: {
    status: v.optional(v.union(v.literal("IN_TRANSIT"), v.literal("ARRIVED"))),
    supplierId: v.optional(v.id("suppliers")),
  },
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db
          .query("shipments")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(200)
      : await ctx.db.query("shipments").order("desc").take(200);
    const enriched = await Promise.all(
      rows.map(async (row) => {
        const po = row.purchaseOrderId ? await ctx.db.get(row.purchaseOrderId) : null;
        const supplier = po ? await ctx.db.get(po.supplierId) : null;
        const customs = await ctx.db
          .query("customsDocuments")
          .withIndex("by_shipment", (q) => q.eq("shipmentId", row._id))
          .collect();
        return {
          ...row,
          orderCode: po?.orderCode ?? null,
          supplierId: po?.supplierId ?? null,
          supplierName: supplier?.name ?? null,
          customs,
        };
      })
    );
    return args.supplierId ? enriched.filter((r) => r.supplierId === args.supplierId) : enriched;
  },
});

/**
 * The order a shipment belongs to, checked against its receipt: the receipt records its
 * own order, so a receipt from a different order is refused, and a shipment without an
 * order takes the receipt's.
 */
async function orderForShipment(
  ctx: MutationCtx,
  purchaseOrderId: Id<"purchaseOrders"> | undefined,
  receiptId: Id<"purchaseReceipts"> | undefined
): Promise<Id<"purchaseOrders"> | undefined> {
  if (!receiptId) return purchaseOrderId;
  const receipt = await ctx.db.get(receiptId);
  if (!receipt) throw new Error("Receipt not found.");
  if (purchaseOrderId && receipt.purchaseOrderId && receipt.purchaseOrderId !== purchaseOrderId) {
    throw new Error("That receipt belongs to a different purchase order.");
  }
  return purchaseOrderId ?? receipt.purchaseOrderId;
}

export const create = mutation({
  args: {
    token: v.string(),
    purchaseOrderId: v.optional(v.id("purchaseOrders")),
    receiptId: v.optional(v.id("purchaseReceipts")),
    carrier: v.string(),
    trackingReference: v.optional(v.string()),
    departedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const carrier = args.carrier.trim();
    if (!carrier) throw new Error("Name the carrier.");
    if (args.purchaseOrderId && !(await ctx.db.get(args.purchaseOrderId))) {
      throw new Error("Purchase order not found.");
    }
    const purchaseOrderId = await orderForShipment(ctx, args.purchaseOrderId, args.receiptId);
    const id = await ctx.db.insert("shipments", {
      purchaseOrderId,
      receiptId: args.receiptId,
      carrier,
      trackingReference: args.trackingReference?.trim() || undefined,
      status: "IN_TRANSIT",
      departedAt: args.departedAt ?? Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "shipment.created",
      entityType: "shipment",
      entityId: id,
      details: `${carrier}${args.trackingReference ? ` · ${args.trackingReference}` : ""}`,
    });
    return id;
  },
});

export const markArrived = mutation({
  args: { token: v.string(), id: v.id("shipments"), receiptId: v.optional(v.id("purchaseReceipts")) },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.receive");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Shipment not found.");
    if (row.status === "ARRIVED") throw new Error("This shipment has already arrived.");
    const receiptId = args.receiptId ?? row.receiptId;
    await ctx.db.patch(args.id, {
      status: "ARRIVED",
      arrivedAt: Date.now(),
      receiptId,
      purchaseOrderId: await orderForShipment(ctx, row.purchaseOrderId, receiptId),
    });
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
