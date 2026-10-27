import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { nextDocumentNumber } from "./lib/numbering";
import { receiveIntoStock } from "./lib/receiving";
import { purchaseOrderMoney } from "./supplierPayments";
import { openRelationFor } from "./supplyRelations";
import { formatVariantLabel, variantNames } from "./lib/variantNames";

const PO_ITEM = v.object({
  productVariantId: v.id("productVariants"),
  quantityOrdered: v.number(),
  unitCost: v.number(),
});

type PoItemInput = { productVariantId: Id<"productVariants">; quantityOrdered: number; unitCost: number };

/**
 * Checks an order's lines and gives each item one line: quantities are whole numbers above
 * 0, costs are not negative, and the same item twice is merged (receiving fills one line
 * per item, so a second line for it would never complete). The same item at two costs is
 * refused.
 */
async function cleanPoItems(ctx: MutationCtx, items: PoItemInput[]): Promise<PoItemInput[]> {
  if (items.length === 0) throw new Error("Add at least one line.");
  const byVariant = new Map<Id<"productVariants">, PoItemInput>();
  for (const item of items) {
    if (!Number.isInteger(item.quantityOrdered) || item.quantityOrdered <= 0) {
      throw new Error("Each line needs a whole quantity above 0.");
    }
    if (!Number.isFinite(item.unitCost) || item.unitCost < 0) {
      throw new Error("A unit cost cannot be negative.");
    }
    const variant = await ctx.db.get(item.productVariantId);
    if (!variant) throw new Error("A product variant on the order was not found.");
    const prev = byVariant.get(item.productVariantId);
    if (prev && prev.unitCost !== item.unitCost) {
      throw new Error(`${variant.sku} is on the order twice at different costs. Use one line.`);
    }
    byVariant.set(
      item.productVariantId,
      prev ? { ...prev, quantityOrdered: prev.quantityOrdered + item.quantityOrdered } : { ...item }
    );
  }
  return [...byVariant.values()];
}

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

/**
 * Cursor-paginated by status (or supplier) index, else by creation order.
 * The other of {supplierId, branchId} not used to pick the index is applied
 * to the page in-memory, so that combination can return a shorter page.
 */
export const listPaged = query({
  args: {
    token: v.string(),
    supplierId: v.optional(v.id("suppliers")),
    branchId: v.optional(v.id("branches")),
    status: v.optional(
      v.union(
        v.literal("DRAFT"),
        v.literal("SENT"),
        v.literal("PARTIALLY_RECEIVED"),
        v.literal("COMPLETED"),
        v.literal("CANCELLED")
      )
    ),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const result = args.status
      ? await ctx.db
          .query("purchaseOrders")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .paginate(args.paginationOpts)
      : args.supplierId
        ? await ctx.db
            .query("purchaseOrders")
            .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId!))
            .order("desc")
            .paginate(args.paginationOpts)
        : await ctx.db.query("purchaseOrders").order("desc").paginate(args.paginationOpts);

    let page = result.page;
    if (args.status && args.supplierId)
      page = page.filter((p) => p.supplierId === args.supplierId);
    if (args.branchId) page = page.filter((p) => p.branchId === args.branchId);

    const enriched = await Promise.all(
      page.map(async (po) => {
        const supplier = await ctx.db.get(po.supplierId);
        return { ...po, supplierName: supplier?.name ?? "Unknown supplier" };
      })
    );
    return { ...result, page: enriched };
  },
});

export const get = query({
  args: { token: v.string(), id: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const po = await ctx.db.get(args.id);
    if (!po) return null;
    const supplier = await ctx.db.get(po.supplierId);
    const branch = po.branchId ? await ctx.db.get(po.branchId) : null;
    const items = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();
    const itemsWithDetails = await Promise.all(
      items.map(async (item) => {
        const variant = item.productVariantId
          ? await ctx.db.get(item.productVariantId)
          : null;
        const product = variant ? await ctx.db.get(variant.productId) : null;
        return {
          ...item,
          sku: variant?.sku ?? "—",
          variantLabel: variant
            ? formatVariantLabel(await variantNames(ctx, variant), variant.sku)
            : "—",
          productName: product?.name ?? "Unknown product",
        };
      })
    );
    return {
      ...po,
      supplierName: supplier?.name ?? "Unknown supplier",
      branchName: branch?.name ?? null,
      items: itemsWithDetails,
      ...(await purchaseOrderMoney(ctx, po)),
    };
  },
});

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

export const create = mutation({
  args: {
    token: v.string(),
    supplierId: v.id("suppliers"),
    branchId: v.id("branches"),
    orderDate: v.number(),
    expectedDeliveryDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    items: v.array(PO_ITEM),
  },
  handler: async (ctx, args): Promise<Id<"purchaseOrders">> => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const items = await cleanPoItems(ctx, args.items);
    if (!(await ctx.db.get(args.supplierId))) throw new Error("Supplier not found.");
    const supplyRelationId = await openRelationFor(ctx, args.supplierId);

    const totalAmount = items.reduce(
      (s, i) => s + i.quantityOrdered * i.unitCost,
      0
    );
    const now = Date.now();
    const orderCode = await nextDocumentNumber(ctx, "PURCHASE_ORDER", now);

    const purchaseOrderId = await ctx.db.insert("purchaseOrders", {
      supplyRelationId,
      supplierId: args.supplierId,
      branchId: args.branchId,
      orderCode,
      orderDate: args.orderDate,
      expectedDeliveryDate: args.expectedDeliveryDate,
      status: "DRAFT",
      paymentStatus: "UNPAID",
      totalAmount,
      notes: args.notes,
      createdAt: now,
    });
    for (const item of items) {
      await ctx.db.insert("purchaseOrderItems", {
        purchaseOrderId,
        productVariantId: item.productVariantId,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: 0,
        unitCost: item.unitCost,
        totalCost: item.quantityOrdered * item.unitCost,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "purchase_order.created",
      entityType: "purchaseOrder",
      entityId: purchaseOrderId,
      details: `${orderCode}: ${items.length} line(s), total ${totalAmount}`,
    });
    return purchaseOrderId;
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
    supplierId: v.id("suppliers"),
    branchId: v.id("branches"),
    orderDate: v.number(),
    expectedDeliveryDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    items: v.array(PO_ITEM),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found.");
    if (po.status !== "DRAFT")
      throw new Error("Only draft purchase orders can be edited.");
    const items = await cleanPoItems(ctx, args.items);

    const totalAmount = items.reduce(
      (s, i) => s + i.quantityOrdered * i.unitCost,
      0
    );
    const supplierChanged = args.supplierId !== po.supplierId;
    if (supplierChanged && !(await ctx.db.get(args.supplierId))) throw new Error("Supplier not found.");
    await ctx.db.patch(args.id, {
      supplierId: args.supplierId,
      supplyRelationId: supplierChanged ? await openRelationFor(ctx, args.supplierId) : po.supplyRelationId,
      branchId: args.branchId,
      orderDate: args.orderDate,
      expectedDeliveryDate: args.expectedDeliveryDate,
      totalAmount,
      notes: args.notes,
    });
    const existing = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", args.id))
      .collect();
    for (const it of existing) await ctx.db.delete(it._id);
    for (const item of items) {
      await ctx.db.insert("purchaseOrderItems", {
        purchaseOrderId: args.id,
        productVariantId: item.productVariantId,
        quantityOrdered: item.quantityOrdered,
        quantityReceived: 0,
        unitCost: item.unitCost,
        totalCost: item.quantityOrdered * item.unitCost,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "purchase_order.updated",
      entityType: "purchaseOrder",
      entityId: args.id,
      details: `${po.orderCode} edited`,
    });
    return args.id;
  },
});

export const updateStatus = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
    status: v.union(v.literal("SENT"), v.literal("CANCELLED")),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found.");
    if (args.status === "SENT" && po.status !== "DRAFT")
      throw new Error("Only a draft can be sent.");
    if (
      args.status === "CANCELLED" &&
      (po.status === "COMPLETED" || po.status === "PARTIALLY_RECEIVED")
    )
      throw new Error("Cannot cancel a purchase order that has received stock.");
    if (args.status === "CANCELLED" && (await purchaseOrderMoney(ctx, po)).paid > 0) {
      throw new Error("Payments were made on this order. Remove them before cancelling it.");
    }
    await ctx.db.patch(args.id, { status: args.status });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: `purchase_order.${args.status}`,
      entityType: "purchaseOrder",
      entityId: args.id,
      details: po.orderCode,
    });
    return args.id;
  },
});

/**
 * Closes a partly received order: the supplier will not send the rest. Every line still
 * short is recorded as a SHORT discrepancy (expected = ordered), and the order completes.
 */
export const closeShort = mutation({
  args: { token: v.string(), id: v.id("purchaseOrders"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found.");
    if (po.status !== "SENT" && po.status !== "PARTIALLY_RECEIVED") {
      throw new Error("Only an order still waiting for goods can be closed short.");
    }
    const reason = args.reason.trim();
    if (!reason) throw new Error("Say why the rest will not arrive.");
    const lines = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .take(500);
    const now = Date.now();
    let short = 0;
    for (const line of lines) {
      if (!line.productVariantId || line.quantityReceived >= line.quantityOrdered) continue;
      short += line.quantityOrdered - line.quantityReceived;
      await ctx.db.insert("receiptDiscrepancies", {
        supplierId: po.supplierId,
        purchaseOrderId: po._id,
        purchaseOrderItemId: line._id,
        productVariantId: line.productVariantId,
        kind: "SHORT",
        expectedFrom: "ORDER",
        expectedQuantity: line.quantityOrdered,
        receivedQuantity: line.quantityReceived,
        reason,
        recordedBy: actor._id,
        recordedByUsername: actor.username,
        recordedAt: now,
      });
    }
    await ctx.db.patch(po._id, { status: "COMPLETED" });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "purchase_order.closed_short",
      entityType: "purchaseOrder",
      entityId: po._id,
      details: `${po.orderCode}: ${short} unit(s) short — ${reason}`,
    });
    return po._id;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found.");
    if (po.status !== "DRAFT" && po.status !== "CANCELLED")
      throw new Error("Only draft or cancelled purchase orders can be deleted.");
    const items = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();
    for (const it of items) await ctx.db.delete(it._id);
    await ctx.db.delete(po._id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "purchase_order.deleted",
      entityType: "purchaseOrder",
      entityId: args.id,
      details: po.orderCode,
    });
    return args.id;
  },
});

/** Receive (partial or full) — increments stock via the ledger with landed cost. */
export const receiveItems = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
    branchId: v.optional(v.id("branches")),
    items: v.array(
      v.object({
        productVariantId: v.id("productVariants"),
        quantityReceived: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.receive");
    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found.");
    if (po.status !== "SENT" && po.status !== "PARTIALLY_RECEIVED")
      throw new Error("Only sent or partially received purchase orders can receive stock.");

    const branchId = args.branchId ?? po.branchId;
    if (!branchId) throw new Error("No branch to receive stock into.");

    await receiveIntoStock(ctx, actor, {
      purchaseOrder: po,
      branchId,
      lines: args.items,
      allowOver: false,
      allowUnannounced: false,
    });
    return po._id;
  },
});

