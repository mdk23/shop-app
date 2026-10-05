import { MutationCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { writeAudit } from "../audit";
import { nextSequence } from "../metrics";

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
    if (l.quantityReceived <= 0) continue;
    const prev = merged.get(l.productVariantId);
    merged.set(l.productVariantId, prev
      ? { ...prev, quantityReceived: prev.quantityReceived + l.quantityReceived }
      : l);
  }
  const toReceive = [...merged.values()];
  if (toReceive.length === 0) throw new Error("Nothing received.");

  const plan = toReceive.map((rx) => {
    const line = po ? poItems.find((i) => i.productVariantId === rx.productVariantId) : undefined;
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

  const receiptNumber = `RC-${String(await nextSequence(ctx, "purchase_receipt_sequence")).padStart(5, "0")}`;
  const receiptId = await ctx.db.insert("purchaseReceipts", {
    receiptNumber,
    purchaseOrderId: po?._id,
    supplierId: input.supplierId ?? po?.supplierId,
    branchId: input.branchId,
    deliveryNoteRef: input.deliveryNoteRef?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    unitsTotal: plan.reduce((s, p) => s + p.rx.quantityReceived, 0),
    receivedByUsername: actor.username,
    receivedAt: now,
    createdAt: now,
  });

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
    const newStatus = allComplete ? "completed" : anyReceived ? "partially_received" : po.status;
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
