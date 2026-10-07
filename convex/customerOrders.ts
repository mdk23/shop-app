import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { nextSequence } from "./metrics";
import { adjustCustomerCredit } from "./customerCredits";
import { performSale } from "./sales";
import { variantLabel } from "./inventory";

const EPSILON = 0.005;

async function activeHoldQty(
  ctx: MutationCtx,
  branchId: Id<"branches">,
  productVariantId: Id<"productVariants">
): Promise<number> {
  const holds = await ctx.db
    .query("stockHolds")
    .withIndex("by_branch_variant_status", (q) =>
      q.eq("branchId", branchId).eq("productVariantId", productVariantId).eq("status", "ACTIVE")
    )
    .collect();
  return holds.reduce((s, h) => s + h.quantity, 0);
}

async function releaseHolds(ctx: MutationCtx, orderId: Id<"customerOrders">): Promise<void> {
  const holds = await ctx.db
    .query("stockHolds")
    .withIndex("by_order", (q) => q.eq("orderId", orderId))
    .collect();
  const now = Date.now();
  for (const hold of holds) {
    if (hold.status === "ACTIVE") {
      await ctx.db.patch(hold._id, { status: "RELEASED", releasedAt: now });
    }
  }
}

async function loadOpenOrder(ctx: MutationCtx, orderId: Id<"customerOrders">) {
  const order = await ctx.db.get(orderId);
  if (!order) throw new Error("Order not found.");
  return order;
}

export const get = query({
  args: { id: v.id("customerOrders") },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.id);
    if (!order) return null;
    const items = await ctx.db
      .query("customerOrderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.id))
      .collect();
    const deposits = await ctx.db
      .query("customerDeposits")
      .withIndex("by_order", (q) => q.eq("orderId", args.id))
      .collect();
    const depositsTotal = deposits.reduce((s, d) => s + d.amount, 0);
    const customer = await ctx.db.get(order.customerId);
    return {
      ...order,
      customerName: customer?.name ?? "—",
      items,
      deposits,
      depositsTotal,
      balance: Math.max(0, order.totalAmount - depositsTotal),
    };
  },
});

export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    const open = await ctx.db
      .query("customerOrders")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .collect();
    const ready = await ctx.db
      .query("customerOrders")
      .withIndex("by_status", (q) => q.eq("status", "READY"))
      .collect();
    return [...ready, ...open].sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const list = query({
  args: {
    status: v.optional(
      v.union(v.literal("OPEN"), v.literal("READY"), v.literal("COLLECTED"), v.literal("CANCELLED"))
    ),
  },
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db
          .query("customerOrders")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(200)
      : await ctx.db.query("customerOrders").order("desc").take(200);
    return await Promise.all(
      rows.map(async (row) => ({
        ...row,
        customerName: (await ctx.db.get(row.customerId))?.name ?? "—",
      }))
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    customerId: v.id("customers"),
    branchId: v.id("branches"),
    items: v.array(
      v.object({
        productVariantId: v.id("productVariants"),
        quantity: v.number(),
        unitPrice: v.optional(v.number()),
      })
    ),
    reserve: v.optional(v.boolean()),
    expectedDate: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"customerOrders">> => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found.");
    if (customer.isGeneric) throw new Error("Orders need a named customer.");
    if (args.items.length === 0) throw new Error("An order needs at least one item.");
    if (!(await ctx.db.get(args.branchId))) throw new Error("Branch not found.");

    const priced = [];
    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantities must be positive.");
      const variant = await ctx.db.get(item.productVariantId);
      if (!variant || !variant.active) throw new Error("A selected product variant is unavailable.");
      const product = await ctx.db.get(variant.productId);
      const unitPrice = item.unitPrice ?? variant.sellingPrice;
      priced.push({
        productVariantId: item.productVariantId,
        productName: product?.name ?? "Unknown product",
        variantLabel: variantLabel(variant),
        quantity: item.quantity,
        unitPrice,
        lineTotal: Math.round(unitPrice * item.quantity * 100) / 100,
      });
    }

    if (args.reserve) {
      for (const line of priced) {
        const stock = await ctx.db
          .query("variantStock")
          .withIndex("by_branch_and_variant", (q) =>
            q.eq("branchId", args.branchId).eq("productVariantId", line.productVariantId)
          )
          .unique();
        const available = (stock?.quantity ?? 0) - (await activeHoldQty(ctx, args.branchId, line.productVariantId));
        if (line.quantity > available) {
          throw new Error(
            `Only ${Math.max(0, available)} of ${line.productName} available to reserve; requested ${line.quantity}.`
          );
        }
      }
    }

    const now = Date.now();
    const seq = await nextSequence(ctx, "customer_order_sequence");
    const orderNumber = `CE-${String(seq).padStart(5, "0")}`;
    const totalAmount = Math.round(priced.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    const orderId = await ctx.db.insert("customerOrders", {
      orderNumber,
      customerId: args.customerId,
      branchId: args.branchId,
      status: "OPEN",
      totalAmount,
      expectedDate: args.expectedDate,
      notes: args.notes?.trim() || undefined,
      createdBy: actor._id,
      createdByUsername: actor.username,
      createdAt: now,
      updatedAt: now,
    });
    for (const line of priced) {
      await ctx.db.insert("customerOrderItems", { orderId, ...line });
      if (args.reserve) {
        await ctx.db.insert("stockHolds", {
          orderId,
          branchId: args.branchId,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          status: "ACTIVE",
          createdAt: now,
        });
      }
    }

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer_order.created",
      entityType: "customerOrder",
      entityId: orderId,
      details: `${orderNumber}: ${priced.length} line(s), total ${totalAmount}${args.reserve ? ", stock reserved" : ""}`,
    });
    return orderId;
  },
});

export const addDeposit = mutation({
  args: {
    token: v.string(),
    orderId: v.id("customerOrders"),
    amount: v.number(),
    method: v.string(),
    referenceExternal: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const order = await loadOpenOrder(ctx, args.orderId);
    if (order.status !== "OPEN" && order.status !== "READY") throw new Error("This order is closed.");
    if (args.amount <= 0) throw new Error("A deposit must be a positive amount.");

    const deposits = await ctx.db
      .query("customerDeposits")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const paid = deposits.reduce((s, d) => s + d.amount, 0);
    if (paid + args.amount > order.totalAmount + EPSILON) {
      throw new Error(`Deposits cannot exceed the order total of ${order.totalAmount}.`);
    }

    await ctx.db.insert("customerDeposits", {
      orderId: args.orderId,
      customerId: order.customerId,
      amount: args.amount,
      method: args.method,
      referenceExternal: args.referenceExternal?.trim() || undefined,
      receivedBy: actor._id,
      receivedByUsername: actor.username,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer_order.deposit",
      entityType: "customerOrder",
      entityId: args.orderId,
      details: `${order.orderNumber}: deposit ${args.amount} via ${args.method}`,
    });
  },
});

export const markReady = mutation({
  args: { token: v.string(), orderId: v.id("customerOrders") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const order = await loadOpenOrder(ctx, args.orderId);
    if (order.status !== "OPEN") throw new Error("Only an open order can be marked ready.");
    await ctx.db.patch(args.orderId, { status: "READY", updatedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer_order.ready",
      entityType: "customerOrder",
      entityId: args.orderId,
      details: order.orderNumber,
    });
  },
});

/** Cancelling releases any holds and returns deposits as store credit. */
export const cancel = mutation({
  args: { token: v.string(), orderId: v.id("customerOrders"), reason: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const order = await loadOpenOrder(ctx, args.orderId);
    if (order.status !== "OPEN" && order.status !== "READY") throw new Error("This order is closed.");
    if (!args.reason.trim()) throw new Error("A reason is required to cancel an order.");

    await releaseHolds(ctx, args.orderId);
    const deposits = await ctx.db
      .query("customerDeposits")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const refundable = Math.round(deposits.reduce((s, d) => s + d.amount, 0) * 100) / 100;
    if (refundable > 0) {
      await adjustCustomerCredit(ctx, {
        customerId: order.customerId,
        delta: refundable,
        reason: "RETURN_REFUND",
        referenceType: "customer_order",
        referenceId: args.orderId,
        userId: actor._id,
        username: actor.username,
        notes: `Deposits returned on cancelled ${order.orderNumber}`,
      });
    }

    const now = Date.now();
    await ctx.db.patch(args.orderId, { status: "CANCELLED", closedAt: now, updatedAt: now });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer_order.cancelled",
      entityType: "customerOrder",
      entityId: args.orderId,
      details: `${order.orderNumber}: ${args.reason}${refundable ? `, ${refundable} credited` : ""}`,
    });
  },
});

/**
 * Turns an order into a sale through the normal POS path. Every deposit counts as a
 * payment, and the balance must be covered by `payments` in this call.
 */
export const collect = mutation({
  args: {
    token: v.string(),
    orderId: v.id("customerOrders"),
    payments: v.array(v.object({ method: v.string(), amount: v.number() })),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
  },
  handler: async (ctx, args): Promise<Id<"sales">> => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const order = await loadOpenOrder(ctx, args.orderId);
    if (order.status !== "OPEN" && order.status !== "READY") throw new Error("This order is closed.");

    const items = await ctx.db
      .query("customerOrderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const deposits = await ctx.db
      .query("customerDeposits")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();

    const byMethod = new Map<string, number>();
    for (const d of deposits) byMethod.set(d.method, (byMethod.get(d.method) ?? 0) + d.amount);
    const balancePayments = args.payments.filter((p) => p.amount > 0);
    for (const p of balancePayments) byMethod.set(p.method, (byMethod.get(p.method) ?? 0) + p.amount);
    const paid = [...byMethod.values()].reduce((s, a) => s + a, 0);
    if (paid + EPSILON < order.totalAmount) {
      throw new Error(
        `Pay the balance before collecting: ${(order.totalAmount - paid).toFixed(2)} still due.`
      );
    }

    await releaseHolds(ctx, args.orderId);
    const saleId = await performSale(ctx, actor, {
      branchId: order.branchId,
      customerId: order.customerId,
      items: items.map((i) => ({
        productVariantId: i.productVariantId,
        quantity: i.quantity,
        unitPrice: i.unitPrice,
      })),
      payments: [...byMethod.entries()].map(([method, amount]) => ({ method, amount })),
      cashRegisterSessionId: args.cashRegisterSessionId,
    });

    const now = Date.now();
    await ctx.db.patch(args.orderId, { status: "COLLECTED", saleId, closedAt: now, updatedAt: now });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer_order.collected",
      entityType: "customerOrder",
      entityId: args.orderId,
      details: `${order.orderNumber} collected as a sale`,
    });
    return saleId;
  },
});
