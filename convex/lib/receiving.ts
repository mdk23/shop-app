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
  }
): Promise<Id<"purchaseReceipts">> {
  const po = input.purchaseOrder;
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
      return { rx, line: undefined, discrepancy: "UNANNOUNCED" as const, unitCost: rx.unitCost };
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
    const rows = await ctx.db
      .query("variantStock")
      .withIndex("by_variant", (q) => q.eq("productVariantId", variantId))
      .collect();
    const onHand = rows.reduce((s, r) => s + Math.max(0, r.quantity), 0);
    if (onHand > 0) newCost = (onHand * variant.costPrice + quantity * unitCost) / (onHand + quantity);
  }
  newCost = round2(newCost);
  if (newCost === variant.costPrice) return;
  const now = Date.now();
  await patchVariant(ctx, variantId, { costPrice: newCost, updatedAt: now });
  await recordVariantPrice(ctx, variantId, { sellingPrice: variant.sellingPrice, costPrice: newCost }, now);
  await writeAudit(ctx, {
    userId: actor._id,
    username: actor.username,
    action: "variant.cost_updated",
    entityType: "productVariant",
    entityId: variantId,
    details: `${variant.sku}: costPrice ${variant.costPrice} → ${newCost} (${method === "LATEST" ? "latest purchase" : "weighted average"}, ${receiptNumber})`,
  });
}
