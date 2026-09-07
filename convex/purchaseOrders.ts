import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { nextSequence } from "./metrics";

const PO_ITEM = v.object({
  productVariantId: v.id("productVariants"),
  quantityOrdered: v.number(),
  unitCost: v.number(),
});

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const list = query({
  args: {
    supplierId: v.optional(v.id("suppliers")),
    branchId: v.optional(v.id("branches")),
    status: v.optional(
      v.union(
        v.literal("draft"),
        v.literal("sent"),
        v.literal("partially_received"),
        v.literal("completed"),
        v.literal("cancelled")
      )
    ),
  },
  handler: async (ctx, args) => {
    let rows;
    if (args.status) {
      rows = await ctx.db
        .query("purchaseOrders")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .collect();
    } else if (args.supplierId) {
      rows = await ctx.db
        .query("purchaseOrders")
        .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId!))
        .order("desc")
        .collect();
    } else {
      rows = await ctx.db.query("purchaseOrders").order("desc").take(300);
    }
    if (args.supplierId)
      rows = rows.filter((p) => p.supplierId === args.supplierId);
    if (args.branchId) rows = rows.filter((p) => p.branchId === args.branchId);

    return await Promise.all(
      rows.map(async (po) => {
        const supplier = await ctx.db.get(po.supplierId);
        return { ...po, supplierName: supplier?.name ?? "Unknown supplier" };
      })
    );
  },
});

export const get = query({
  args: { id: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
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
            ? [variant.color, variant.size].filter(Boolean).join(" / ") || variant.sku
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
    if (args.items.length === 0) throw new Error("Add at least one line.");

    const totalAmount = args.items.reduce(
      (s, i) => s + i.quantityOrdered * i.unitCost,
      0
    );
    const seq = await nextSequence(ctx, "purchase_order_sequence");
    const now = Date.now();
    const orderCode = `PO-${String(seq).padStart(5, "0")}`;

    const purchaseOrderId = await ctx.db.insert("purchaseOrders", {
      supplierId: args.supplierId,
      branchId: args.branchId,
      orderCode,
      orderDate: args.orderDate,
      expectedDeliveryDate: args.expectedDeliveryDate,
      status: "draft",
      paymentStatus: "unpaid",
      totalAmount,
      notes: args.notes,
      createdAt: now,
    });
    for (const item of args.items) {
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
      details: `${orderCode}: ${args.items.length} line(s), total ${totalAmount}`,
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
    if (po.status !== "draft")
      throw new Error("Only draft purchase orders can be edited.");

    const totalAmount = args.items.reduce(
      (s, i) => s + i.quantityOrdered * i.unitCost,
      0
    );
    await ctx.db.patch(args.id, {
      supplierId: args.supplierId,
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
    for (const item of args.items) {
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
    status: v.union(v.literal("sent"), v.literal("cancelled")),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found.");
    if (args.status === "sent" && po.status !== "draft")
      throw new Error("Only a draft can be sent.");
    if (
      args.status === "cancelled" &&
      (po.status === "completed" || po.status === "partially_received")
    )
      throw new Error("Cannot cancel a purchase order that has received stock.");
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

export const remove = mutation({
  args: { token: v.string(), id: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found.");
    if (po.status !== "draft" && po.status !== "cancelled")
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
    if (po.status !== "sent" && po.status !== "partially_received")
      throw new Error("Only sent or partially received purchase orders can receive stock.");

    const branchId = args.branchId ?? po.branchId;
    if (!branchId) throw new Error("No branch to receive stock into.");

    const poItems = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();

    for (const rx of args.items) {
      if (rx.quantityReceived <= 0) continue;
      const line = poItems.find(
        (i) => i.productVariantId === rx.productVariantId
      );
      if (!line)
        throw new Error("A received line is not part of this purchase order.");
      const outstanding = line.quantityOrdered - line.quantityReceived;
      if (rx.quantityReceived > outstanding)
        throw new Error(
          `Receiving ${rx.quantityReceived} exceeds the ${outstanding} still outstanding on a line.`
        );

      await ctx.db.patch(line._id, {
        quantityReceived: line.quantityReceived + rx.quantityReceived,
      });
      await ctx.runMutation(internal.inventory.mutateStock, {
        productVariantId: rx.productVariantId,
        branchId,
        quantity: rx.quantityReceived,
        movementType: "PURCHASE",
        referenceType: "purchase_order",
        referenceId: po._id,
        costPerUnit: line.unitCost,
        notes: `Received via ${po.orderCode}`,
        userId: actor._id,
        username: actor.username,
      });
    }

    const updated = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", po._id))
      .collect();
    const allComplete = updated.every(
      (i) => i.quantityReceived >= i.quantityOrdered
    );
    const anyReceived = updated.some((i) => i.quantityReceived > 0);
    const newStatus = allComplete
      ? "completed"
      : anyReceived
        ? "partially_received"
        : po.status;
    await ctx.db.patch(po._id, { status: newStatus });

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "purchase_order.received",
      entityType: "purchaseOrder",
      entityId: po._id,
      details: `${po.orderCode}: received into branch ${branchId}, status ${newStatus}`,
    });
    return po._id;
  },
});

export const updatePaymentStatus = mutation({
  args: {
    token: v.string(),
    id: v.id("purchaseOrders"),
    paymentStatus: v.union(
      v.literal("unpaid"),
      v.literal("partially_paid"),
      v.literal("paid")
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const po = await ctx.db.get(args.id);
    if (!po) throw new Error("Purchase order not found.");
    await ctx.db.patch(args.id, { paymentStatus: args.paymentStatus });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "purchase_order.payment_status",
      entityType: "purchaseOrder",
      entityId: args.id,
      details: `${po.orderCode} → ${args.paymentStatus}`,
    });
    return args.id;
  },
});
