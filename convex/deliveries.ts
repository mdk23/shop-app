import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { nextDocumentNumber } from "./lib/numbering";
import { assertWholeQuantity } from "./lib/pricing";
import { namedCustomer } from "./customers";

/**
 * Per sale line: what was sold, returned, and is out on (or already reached the customer
 * through) a delivery that has not failed — and so what is still to deliver.
 */
async function deliverableLines(ctx: QueryCtx, sale: Doc<"sales">) {
  const saleItems = await ctx.db
    .query("saleItems")
    .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
    .take(500);
  const out = [];
  for (const item of saleItems) {
    const returnRows = await ctx.db
      .query("salesReturnItems")
      .withIndex("by_sale_item", (q) => q.eq("saleItemId", item._id))
      .take(100);
    let returned = 0;
    for (const r of returnRows) {
      const ret = await ctx.db.get(r.returnId);
      if (ret?.status === "COMPLETED") returned += r.quantity;
    }
    const deliveryRows = await ctx.db
      .query("deliveryItems")
      .withIndex("by_sale_item", (q) => q.eq("saleItemId", item._id))
      .take(100);
    let onDeliveries = 0;
    for (const d of deliveryRows) {
      const delivery = await ctx.db.get(d.deliveryId);
      if (delivery && delivery.status !== "FAILED") onDeliveries += d.quantity;
    }
    out.push({
      saleItem: item,
      returned,
      onDeliveries,
      toDeliver: Math.max(0, item.quantity - returned - onDeliveries),
    });
  }
  return out;
}

/** The order a sale was collected from, if any. */
async function orderOfSale(ctx: QueryCtx, saleId: Id<"sales">) {
  return await ctx.db
    .query("customerOrders")
    .withIndex("by_sale", (q) => q.eq("saleId", saleId))
    .first();
}

async function withLines(ctx: QueryCtx, delivery: Doc<"deliveries">) {
  const items = await ctx.db
    .query("deliveryItems")
    .withIndex("by_delivery", (q) => q.eq("deliveryId", delivery._id))
    .take(200);
  const sale = await ctx.db.get(delivery.saleId);
  const order = delivery.customerOrderId ? await ctx.db.get(delivery.customerOrderId) : null;
  return {
    ...delivery,
    saleNumber: sale?.saleNumber ?? "—",
    orderNumber: order?.orderNumber ?? null,
    items: await Promise.all(
      items.map(async (i) => {
        const saleItem = await ctx.db.get(i.saleItemId);
        return {
          ...i,
          label: saleItem ? `${saleItem.productName} ${saleItem.variantLabel ?? ""}`.trim() : "—",
        };
      })
    ),
  };
}

export const list = query({
  args: {
    token: v.string(),
    status: v.optional(v.union(v.literal("SCHEDULED"), v.literal("DELIVERED"), v.literal("FAILED"))),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "sales.view");
    const rows = args.status
      ? await ctx.db
          .query("deliveries")
          .withIndex("by_status_and_created_at", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(200)
      : await ctx.db.query("deliveries").order("desc").take(200);
    return await Promise.all(rows.map((r) => withLines(ctx, r)));
  },
});

/** A sale's deliveries and, per line, what is still to deliver. */
export const forSale = query({
  args: { token: v.string(), saleId: v.id("sales") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "sales.view");
    const sale = await ctx.db.get(args.saleId);
    if (!sale) return null;
    const deliveries = await ctx.db
      .query("deliveries")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .take(50);
    const lines = await deliverableLines(ctx, sale);
    const customer = await namedCustomer(ctx, sale.customerId);
    return {
      deliveries: await Promise.all(deliveries.map((d) => withLines(ctx, d))),
      lines: lines.map((l) => ({
        saleItemId: l.saleItem._id,
        label: `${l.saleItem.productName} ${l.saleItem.variantLabel ?? ""}`.trim(),
        sold: l.saleItem.quantity,
        returned: l.returned,
        onDeliveries: l.onDeliveries,
        toDeliver: l.toDeliver,
      })),
      // Suggested recipient: the customer on the sale, when named.
      recipient: customer
        ? { name: customer.name, phone: customer.phone1, address: customer.address ?? "" }
        : null,
    };
  },
});

/**
 * Schedules a delivery of a sale's goods. Without `lines`, everything still to deliver
 * goes. Lines from an order collected into the sale are tied back to the order lines.
 */
export const create = mutation({
  args: {
    token: v.string(),
    saleId: v.id("sales"),
    recipientName: v.string(),
    recipientPhone: v.optional(v.string()),
    address: v.string(),
    scheduledFor: v.optional(v.number()),
    notes: v.optional(v.string()),
    lines: v.optional(v.array(v.object({ saleItemId: v.id("saleItems"), quantity: v.number() }))),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const sale = await ctx.db.get(args.saleId);
    if (!sale) throw new Error("Sale not found.");
    if (sale.status === "CANCELLED") throw new Error("The sale is cancelled.");
    const recipientName = args.recipientName.trim();
    const address = args.address.trim();
    if (!recipientName || !address) throw new Error("A delivery needs a recipient and an address.");

    const lines = await deliverableLines(ctx, sale);
    const byItem = new Map(lines.map((l) => [l.saleItem._id, l]));
    const wanted = args.lines
      ? args.lines.filter((l) => l.quantity > 0)
      : lines.filter((l) => l.toDeliver > 0).map((l) => ({ saleItemId: l.saleItem._id, quantity: l.toDeliver }));
    if (wanted.length === 0) throw new Error("Nothing on this sale is left to deliver.");
    for (const w of wanted) {
      assertWholeQuantity(w.quantity, "Delivered quantities");
      const line = byItem.get(w.saleItemId);
      if (!line) throw new Error("That line is not on this sale.");
      if (w.quantity > line.toDeliver) {
        throw new Error(`Only ${line.toDeliver} of ${line.saleItem.productName} are left to deliver.`);
      }
    }

    // The order behind the sale, to tie each line back to the order line it fulfils.
    const order = await orderOfSale(ctx, sale._id);
    const orderItems = order
      ? await ctx.db
          .query("customerOrderItems")
          .withIndex("by_order", (q) => q.eq("orderId", order._id))
          .take(500)
      : [];

    const now = Date.now();
    const deliveryNumber = await nextDocumentNumber(ctx, "DELIVERY", now);
    const id = await ctx.db.insert("deliveries", {
      deliveryNumber,
      saleId: sale._id,
      customerOrderId: order?._id,
      branchId: sale.branchId,
      recipientName,
      recipientPhone: args.recipientPhone?.trim() || undefined,
      address,
      status: "SCHEDULED",
      scheduledFor: args.scheduledFor,
      notes: args.notes?.trim() || undefined,
      createdBy: actor._id,
      createdByUsername: actor.username,
      createdAt: now,
    });
    for (const w of wanted) {
      const saleItem = byItem.get(w.saleItemId)!.saleItem;
      await ctx.db.insert("deliveryItems", {
        deliveryId: id,
        saleItemId: w.saleItemId,
        customerOrderItemId: orderItems.find((o) => o.productVariantId === saleItem.productVariantId)?._id,
        productVariantId: saleItem.productVariantId,
        quantity: w.quantity,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "delivery.scheduled",
      entityType: "delivery",
      entityId: id,
      details: `${deliveryNumber} for ${sale.saleNumber}: ${wanted.length} line(s) to ${recipientName}`,
    });
    return id;
  },
});

/** The goods reached the customer. */
export const markDelivered = mutation({
  args: { token: v.string(), id: v.id("deliveries"), receivedBy: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new Error("Delivery not found.");
    if (delivery.status !== "SCHEDULED") throw new Error("This delivery is already closed.");
    await ctx.db.patch(args.id, {
      status: "DELIVERED",
      deliveredAt: Date.now(),
      receivedBy: args.receivedBy?.trim() || delivery.recipientName,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "delivery.delivered",
      entityType: "delivery",
      entityId: args.id,
      details: delivery.deliveryNumber,
    });
  },
});

/** The delivery did not happen; its lines can go out on a new delivery. */
export const markFailed = mutation({
  args: { token: v.string(), id: v.id("deliveries"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const delivery = await ctx.db.get(args.id);
    if (!delivery) throw new Error("Delivery not found.");
    if (delivery.status !== "SCHEDULED") throw new Error("This delivery is already closed.");
    const reason = args.reason.trim();
    if (!reason) throw new Error("Say why the delivery failed.");
    await ctx.db.patch(args.id, { status: "FAILED", failureReason: reason });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "delivery.failed",
      entityType: "delivery",
      entityId: args.id,
      details: `${delivery.deliveryNumber}: ${reason}`,
    });
  },
});
