import { QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";

/** A shipment's lines. */
export async function shipmentItemsOf(ctx: QueryCtx, shipmentId: Id<"shipments">) {
  return await ctx.db
    .query("shipmentItems")
    .withIndex("by_shipment", (q) => q.eq("shipmentId", shipmentId))
    .take(500);
}

/**
 * The orders a shipment carries: those of its lines, or the single order of a shipment
 * recorded before lines existed.
 */
export function shipmentOrderIds(
  shipment: Doc<"shipments">,
  items: Doc<"shipmentItems">[]
): Id<"purchaseOrders">[] {
  const ids = new Set(items.map((i) => i.purchaseOrderId));
  if (shipment.purchaseOrderId) ids.add(shipment.purchaseOrderId);
  return [...ids];
}

/** Receipts made from a shipment: those carrying its id, plus the one an old shipment pointed to. */
export async function shipmentReceipts(ctx: QueryCtx, shipment: Doc<"shipments">) {
  const rows = await ctx.db
    .query("purchaseReceipts")
    .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
    .take(100);
  if (shipment.receiptId && !rows.some((r) => r._id === shipment.receiptId)) {
    const legacy = await ctx.db.get(shipment.receiptId);
    if (legacy) rows.push(legacy);
  }
  return rows;
}

/**
 * Units of an order line that are on a shipment whose goods for that order have not been
 * received yet. `exceptShipmentId` leaves one shipment out.
 */
export async function inTransitQuantity(
  ctx: QueryCtx,
  line: Doc<"purchaseOrderItems">,
  exceptShipmentId?: Id<"shipments">
): Promise<number> {
  const items = await ctx.db
    .query("shipmentItems")
    .withIndex("by_purchase_order_item", (q) => q.eq("purchaseOrderItemId", line._id))
    .take(100);
  let total = 0;
  for (const item of items) {
    if (item.shipmentId === exceptShipmentId) continue;
    const received = await ctx.db
      .query("purchaseReceipts")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", item.shipmentId))
      .take(100);
    if (!received.some((r) => r.purchaseOrderId === line.purchaseOrderId)) total += item.quantity;
  }
  return total;
}
