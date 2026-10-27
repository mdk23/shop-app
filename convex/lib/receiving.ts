import { MutationCtx, QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { writeAudit } from "../audit";
import { nextDocumentNumber } from "./numbering";
import { round2 } from "./fiscal";
import { recordVariantPrice } from "./catalog";
import { patchVariant } from "./stockTotals";
import { choiceSetting } from "../settings";
import { assertWholeQuantity } from "./pricing";
import { shipmentItemsOf, shipmentOrderIds, shipmentReceipts } from "./shipping";

export type ReceiptLine = {
  productVariantId: Id<"productVariants">;
  quantityReceived: number;
  unitCost?: number;
};

/**
 * Books goods into stock and creates the receipt document. Shared by the PO receive
 * action and the standalone receipt flow, so there is one place that moves stock for
 * purchases. `allowOver` / `allowUnannounced` let the strict PO action keep refusing
 * what the receipt flow accepts and flags.
 */
export async function receiveIntoStock(
  ctx: MutationCtx,
  actor: Doc<"users">,
  input: {
    purchaseOrder: Doc<"purchaseOrders"> | null;
    supplierId?: Id<"suppliers">;
    branchId: Id<"branches">;
    deliveryNoteRef?: string;
    notes?: string;
    lines: ReceiptLine[];
    allowOver: boolean;
    allowUnannounced: boolean;
    /** The shipment the goods came on. Its lines for this order are what was expected. */
    shipmentId?: Id<"shipments">;
    /** Why what arrived differs from what was expected, kept on the discrepancy rows. */
    discrepancyReason?: string;
  }
): Promise<Id<"purchaseReceipts">> {
  const po = input.purchaseOrder;
  const shipment = input.shipmentId ? await ctx.db.get(input.shipmentId) : null;
  if (input.shipmentId && !shipment) throw new Error("Shipment not found.");
  const shippedLines = shipment && po
    ? (await shipmentItemsOf(ctx, shipment._id)).filter((i) => i.purchaseOrderId === po._id)
    : [];
  if (shipment) {
    if (!po) throw new Error("Goods from a shipment are received against one of its orders.");
    if (!shipmentOrderIds(shipment, await shipmentItemsOf(ctx, shipment._id)).includes(po._id)) {
      throw new Error("This order is not on that shipment.");
    }
    if ((await shipmentReceipts(ctx, shipment)).some((r) => r.purchaseOrderId === po._id)) {
      throw new Error("This order's goods from that shipment were already received.");
    }
  }
  const poItems = po
    ? await ctx.db
        .query("purchaseOrderItems")
        .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
        .collect()
    : [];

  const now = Date.now();
  const merged = new Map<Id<"productVariants">, ReceiptLine>();
  for (const l of input.lines) {
    if (l.quantityReceived === 0) continue;
    assertWholeQuantity(l.quantityReceived, "Received quantities");
    const prev = merged.get(l.productVariantId);
    merged.set(l.productVariantId, prev
      ? { ...prev, quantityReceived: prev.quantityReceived + l.quantityReceived }
      : l);
  }
  const toReceive = [...merged.values()];
  if (toReceive.length === 0) throw new Error("Nothing received.");

  const plan = toReceive.map((rx) => {
    // Orders saved before duplicate items were merged may hold an item twice: fill the line
    // that is still open.
    const lines = poItems.filter((i) => i.productVariantId === rx.productVariantId);
    const line = lines.find((i) => i.quantityReceived < i.quantityOrdered) ?? lines[0];
    if (!line) {
      if (!input.allowUnannounced) {
        throw new Error("A received line is not part of this purchase order.");
      }
      if (rx.unitCost === undefined || rx.unitCost < 0) {
        throw new Error("Unannounced goods need a unit cost.");
      }
      return { rx, line: undefined, outstanding: 0, discrepancy: "UNANNOUNCED" as const, unitCost: rx.unitCost };
    }
    const outstanding = line.quantityOrdered - line.quantityReceived;
    const over = rx.quantityReceived > outstanding;
    if (over && !input.allowOver) {
      throw new Error(
        `Receiving ${rx.quantityReceived} exceeds the ${outstanding} still outstanding on a line.`
      );
    }
    return {
      rx,
      line,
      outstanding,
      discrepancy: over ? ("OVER" as const) : undefined,
      unitCost: line.unitCost,
    };
  });

  const receiptNumber = await nextDocumentNumber(ctx, "PURCHASE_RECEIPT");
  const receiptId = await ctx.db.insert("purchaseReceipts", {
    receiptNumber,
    purchaseOrderId: po?._id,
    // Stored only for goods without an order; with an order, the supplier is the order's.
    supplierId: po ? undefined : input.supplierId,
    branchId: input.branchId,
    shipmentId: shipment?._id,
    deliveryNoteRef: input.deliveryNoteRef?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    unitsTotal: plan.reduce((s, p) => s + p.rx.quantityReceived, 0),
    receivedBy: actor._id,
    receivedByUsername: actor.username,
    receivedAt: now,
    createdAt: now,
  });

  const costMethod = await choiceSetting(ctx, "costMethod");
  for (const p of plan) {
    await ctx.db.insert("purchaseReceiptItems", {
      receiptId,
      productVariantId: p.rx.productVariantId,
      quantityReceived: p.rx.quantityReceived,
      unitCost: p.unitCost,
      purchaseOrderItemId: p.line?._id,
      discrepancy: p.discrepancy,
    });
    if (p.line) {
      await ctx.db.patch(p.line._id, {
        quantityReceived: p.line.quantityReceived + p.rx.quantityReceived,
      });
    }
    // Before the goods go in: a weighted average needs the stock on hand without them.
    if (p.unitCost !== undefined) {
      await applyPurchaseCost(ctx, actor, p.rx.productVariantId, p.rx.quantityReceived, p.unitCost, costMethod, receiptNumber);
    }
    await ctx.runMutation(internal.inventory.mutateStock, {
      productVariantId: p.rx.productVariantId,
      branchId: input.branchId,
      quantity: p.rx.quantityReceived,
      movementType: "PURCHASE",
      referenceType: po ? "purchase_order" : "purchase_receipt",
      referenceId: po ? po._id : receiptId,
      costPerUnit: p.unitCost,
      notes: po
        ? `Received via ${po.orderCode} (${receiptNumber})`
        : `Received without order (${receiptNumber})`,
      userId: actor._id,
      username: actor.username,
    });
  }

  if (po) {
    const updated = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();
    const allComplete = updated.every((i) => i.quantityReceived >= i.quantityOrdered);
    const anyReceived = updated.some((i) => i.quantityReceived > 0);
    const newStatus = allComplete ? "COMPLETED" : anyReceived ? "PARTIALLY_RECEIVED" : po.status;
    await ctx.db.patch(po._id, { status: newStatus });
  }

  // Discrepancies: lines over what the order still had outstanding or not on it at all,
  // and, for a shipment, each of its lines for this order that came in short or over.
  const reason = input.discrepancyReason?.trim() || undefined;
  const supplierId = po?.supplierId ?? input.supplierId;
  const record = async (row: {
    kind: "SHORT" | "OVER" | "UNANNOUNCED";
    expectedFrom: "ORDER" | "SHIPMENT" | "NONE";
    productVariantId: Id<"productVariants">;
    purchaseOrderItemId?: Id<"purchaseOrderItems">;
    expectedQuantity: number;
    receivedQuantity: number;
  }) => {
    await ctx.db.insert("receiptDiscrepancies", {
      ...row,
      supplierId,
      purchaseOrderId: po?._id,
      shipmentId: shipment?._id,
      receiptId,
      reason,
      recordedBy: actor._id,
      recordedByUsername: actor.username,
      recordedAt: now,
    });
  };
  for (const p of plan) {
    if (!p.discrepancy) continue;
    await record({
      kind: p.discrepancy,
      expectedFrom: p.line ? "ORDER" : "NONE",
      productVariantId: p.rx.productVariantId,
      purchaseOrderItemId: p.line?._id,
      expectedQuantity: p.outstanding,
      receivedQuantity: p.rx.quantityReceived,
    });
  }
  for (const shipped of shippedLines) {
    const received = plan
      .filter((p) => p.line?._id === shipped.purchaseOrderItemId)
      .reduce((s, p) => s + p.rx.quantityReceived, 0);
    const flaggedOver = plan.some(
      (p) => p.line?._id === shipped.purchaseOrderItemId && p.discrepancy === "OVER"
    );
    if (received < shipped.quantity || (received > shipped.quantity && !flaggedOver)) {
      await record({
        kind: received < shipped.quantity ? "SHORT" : "OVER",
        expectedFrom: "SHIPMENT",
        productVariantId: shipped.productVariantId,
        purchaseOrderItemId: shipped.purchaseOrderItemId,
        expectedQuantity: shipped.quantity,
        receivedQuantity: received,
      });
    }
  }
  // Goods from a shipment being received means it has arrived.
  if (shipment && shipment.status === "IN_TRANSIT") {
    await ctx.db.patch(shipment._id, { status: "ARRIVED", arrivedAt: now });
  }

  const flagged = plan.filter((p) => p.discrepancy).length;
  await writeAudit(ctx, {
    userId: actor._id,
    username: actor.username,
    action: po ? "purchase_order.received" : "purchase_receipt.created",
    entityType: po ? "purchaseOrder" : "purchaseReceipt",
    entityId: po ? po._id : receiptId,
    details: `${receiptNumber}${po ? ` for ${po.orderCode}` : ""}: ${plan.length} line(s), ${flagged} flagged`,
  });
  return receiptId;
}

/** A receipt's supplier: its order's, or the one recorded on a receipt without an order. */
export async function receiptSupplierId(
  ctx: QueryCtx | MutationCtx,
  receipt: Doc<"purchaseReceipts">
): Promise<Id<"suppliers"> | undefined> {
  if (receipt.purchaseOrderId) {
    return (await ctx.db.get(receipt.purchaseOrderId))?.supplierId;
  }
  return receipt.supplierId;
}

/**
 * Updates a variant's cost price from a purchase, by the costMethod setting:
 *  - WEIGHTED_AVERAGE: (stock on hand × current cost + received × unit cost) ÷ total units,
 *    with stock on hand counted across all branches (the cost is the variant's, not a
 *    branch's); with nothing on hand the purchase cost is taken as is;
 *  - LATEST: the purchase's unit cost;
 *  - MANUAL: unchanged.
 * The change goes into the price history and the audit log, and revalues the stock totals.
 */
async function applyPurchaseCost(
  ctx: MutationCtx,
  actor: Doc<"users">,
  variantId: Id<"productVariants">,
  quantity: number,
  unitCost: number,
  method: string,
  receiptNumber: string
) {
  if (method === "MANUAL") return;
  const variant = await ctx.db.get(variantId);
  if (!variant) return;
  let newCost = unitCost;
  if (method === "WEIGHTED_AVERAGE") {
    const onHand = await unitsOnHand(ctx, variantId);
    if (onHand > 0) newCost = (onHand * variant.costPrice + quantity * unitCost) / (onHand + quantity);
  }
  await setVariantCost(
    ctx,
    actor,
    variant,
    newCost,
    `${method === "LATEST" ? "latest purchase" : "weighted average"}, ${receiptNumber}`
  );
}

/** Units of a variant on hand across all branches (its cost is the variant's, not a branch's). */
export async function unitsOnHand(ctx: QueryCtx, variantId: Id<"productVariants">): Promise<number> {
  const rows = await ctx.db
    .query("variantStock")
    .withIndex("by_variant", (q) => q.eq("productVariantId", variantId))
    .take(200);
  return rows.reduce((s, r) => s + Math.max(0, r.quantity), 0);
}

/** Sets a variant's cost price, with a price-history row and an audit entry saying why. */
export async function setVariantCost(
  ctx: MutationCtx,
  actor: Doc<"users">,
  variant: Doc<"productVariants">,
  cost: number,
  why: string
) {
  const newCost = round2(cost);
  if (newCost === variant.costPrice) return;
  const now = Date.now();
  await patchVariant(ctx, variant._id, { costPrice: newCost, updatedAt: now });
  await recordVariantPrice(ctx, variant._id, { sellingPrice: variant.sellingPrice, costPrice: newCost }, now);
  await writeAudit(ctx, {
    userId: actor._id,
    username: actor.username,
    action: "variant.cost_updated",
    entityType: "productVariant",
    entityId: variant._id,
    details: `${variant.sku}: costPrice ${variant.costPrice} → ${newCost} (${why})`,
  });
}
