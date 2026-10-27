import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { authorize, requirePermission } from "./permissions";
import { numberSetting } from "./settings";
import { priceSale } from "./lib/pricing";
import { availableToSell } from "./stockHolds";
import { writeAudit } from "./audit";
import { nextDocumentNumber } from "./lib/numbering";
import { adjustCustomerCredit } from "./customerCredits";
import { performSale } from "./sales";
import { variantLabel } from "./inventory";
import { paymentMethodValidator } from "./lib/paymentMethods";
import { requireOpenSession } from "./cashRegister";
import { assertCustomerCanBuy } from "./customers";
import { round2 } from "./lib/fiscal";

const EPSILON = 0.005;

/** What has been paid on an order: the sum of its deposit payment rows. */
function sumDeposits(deposits: Doc<"payments">[]): number {
  return round2(deposits.reduce((s, d) => s + d.amount, 0));
}

async function orderPaid(ctx: QueryCtx, orderId: Id<"customerOrders">): Promise<number> {
  return sumDeposits(await orderDeposits(ctx, orderId));
}

/** Deposits on an order: the payment rows recorded against it. */
async function orderDeposits(ctx: QueryCtx, orderId: Id<"customerOrders">) {
  return await ctx.db
    .query("payments")
    .withIndex("by_customer_order", (q) => q.eq("customerOrderId", orderId))
    .take(1000);
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

type OrderEventKind = Doc<"orderEvents">["kind"];

/** Appends one step to an order's history. */
async function logEvent(
  ctx: MutationCtx,
  actor: Doc<"users">,
  orderId: Id<"customerOrders">,
  kind: OrderEventKind,
  extra: Partial<Pick<Doc<"orderEvents">, "reason" | "lineChanges" | "totalBefore" | "totalAfter" | "saleId">> = {}
) {
  await ctx.db.insert("orderEvents", {
    orderId,
    kind,
    ...extra,
    userId: actor._id,
    username: actor.username,
    occurredAt: Date.now(),
  });
}

/** The deposit the order's rule asks for before it is binding. */
export function requiredDeposit(order: Doc<"customerOrders">): number {
  return round2((order.totalAmount * (order.depositPercent ?? 0)) / 100);
}

/** Binding: confirmed, or from before the deposit rule (which needed no confirmation). */
export function isConfirmed(order: Doc<"customerOrders">): boolean {
  return order.confirmedAt !== undefined || order.depositPercent === undefined;
}

/** Confirms the order once what was paid covers the required deposit. */
async function confirmIfDue(ctx: MutationCtx, actor: Doc<"users">, orderId: Id<"customerOrders">) {
  const order = await ctx.db.get(orderId);
  if (!order || order.confirmedAt !== undefined) return;
  const paid = await orderPaid(ctx, orderId);
  if (paid + EPSILON < requiredDeposit(order)) return;
  const now = Date.now();
  await ctx.db.patch(orderId, { confirmedAt: now, updatedAt: now });
  await logEvent(ctx, actor, orderId, "CONFIRMED", {
    reason: order.depositPercent ? `Deposit of ${requiredDeposit(order)} reached` : undefined,
  });
}

/**
 * Where an order line comes from: a demand of this customer that is still open, and
 * optionally the proposal made in answer to it, which must be for the same product.
 * The demand is marked converted into the order.
 */
async function recordOrigin(
  ctx: MutationCtx,
  order: Doc<"customerOrders">,
  item: Doc<"customerOrderItems">,
  origin: { demandId?: Id<"demands">; demandResponseItemId?: Id<"demandResponseItems"> }
) {
  let demandId = origin.demandId;
  if (origin.demandResponseItemId) {
    const responseItem = await ctx.db.get(origin.demandResponseItemId);
    if (!responseItem) throw new Error("Proposal not found.");
    if (responseItem.productVariantId && responseItem.productVariantId !== item.productVariantId) {
      throw new Error("An order line can only come from a proposal for the same product variant.");
    }
    const response = await ctx.db.get(responseItem.responseId);
    if (!response) throw new Error("Proposal not found.");
    if (demandId && demandId !== response.demandId) throw new Error("That proposal answers a different request.");
    demandId = response.demandId;
  }
  if (!demandId) return;
  const demand = await ctx.db.get(demandId);
  if (!demand) throw new Error("Request not found.");
  if (demand.customerId && demand.customerId !== order.customerId) {
    throw new Error("That request is from a different customer.");
  }
  await ctx.db.insert("orderItemOrigins", {
    orderItemId: item._id,
    orderId: order._id,
    demandId,
    demandResponseItemId: origin.demandResponseItemId,
  });
  if (demand.stage !== "CONVERTED" && demand.stage !== "FULFILLED" && demand.stage !== "LOST") {
    const now = Date.now();
    await ctx.db.patch(demandId, {
      stage: "CONVERTED",
      convertedOrderId: order._id,
      proceededAt: demand.proceededAt ?? now,
      closedAt: now,
      updatedAt: now,
    });
  }
}

async function loadOpenOrder(ctx: MutationCtx, orderId: Id<"customerOrders">) {
  const order = await ctx.db.get(orderId);
  if (!order) throw new Error("Order not found.");
  return order;
}

export const get = query({
  args: { token: v.string(), id: v.id("customerOrders") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "pos.use");
    const order = await ctx.db.get(args.id);
    if (!order) return null;
    const items = await ctx.db
      .query("customerOrderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.id))
      .collect();
    const deposits = await orderDeposits(ctx, args.id);
    const depositsTotal = sumDeposits(deposits);
    const customer = await ctx.db.get(order.customerId);
    const events = await ctx.db
      .query("orderEvents")
      .withIndex("by_order_and_occurred_at", (q) => q.eq("orderId", args.id))
      .take(200);
    const origins = await ctx.db
      .query("orderItemOrigins")
      .withIndex("by_order", (q) => q.eq("orderId", args.id))
      .take(200);
    const originOf = new Map<Id<"customerOrderItems">, string[]>();
    for (const o of origins) {
      const demand = o.demandId ? await ctx.db.get(o.demandId) : null;
      const label = demand ? demand.description : "—";
      originOf.set(o.orderItemId, [...(originOf.get(o.orderItemId) ?? []), label]);
    }
    const paymentTerm = order.paymentTermId ? await ctx.db.get(order.paymentTermId) : null;
    return {
      ...order,
      customerName: customer?.name ?? "—",
      paymentTermName: paymentTerm?.name ?? null,
      items: items.map((i) => ({ ...i, origins: originOf.get(i._id) ?? [] })),
      events,
      requiredDeposit: requiredDeposit(order),
      confirmed: isConfirmed(order),
      deposits,
      depositsTotal,
      balance: Math.max(0, order.totalAmount - depositsTotal),
    };
  },
});

export const listOpen = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "pos.use");
    const open = await ctx.db
      .query("customerOrders")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .take(2000);
    const ready = await ctx.db
      .query("customerOrders")
      .withIndex("by_status", (q) => q.eq("status", "READY"))
      .take(2000);
    return [...ready, ...open].sort((a, b) => b.createdAt - a.createdAt);
  },
});

export const list = query({
  args: {
    token: v.string(),
    status: v.optional(
      v.union(v.literal("OPEN"), v.literal("READY"), v.literal("COLLECTED"), v.literal("CANCELLED"))
    ),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "pos.use");
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
        // The request (and the proposal answering it) this line comes from.
        demandId: v.optional(v.id("demands")),
        demandResponseItemId: v.optional(v.id("demandResponseItems")),
      })
    ),
    reserve: v.optional(v.boolean()),
    expectedDate: v.optional(v.number()),
    notes: v.optional(v.string()),
    // The deposit rule: a payment term's deposit %, or a % given for this order.
    paymentTermId: v.optional(v.id("paymentTerms")),
    depositPercent: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"customerOrders">> => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found.");
    assertCustomerCanBuy(customer);
    if (customer.isGeneric) throw new Error("Orders need a named customer.");
    if (args.items.length === 0) throw new Error("An order needs at least one item.");
    if (!(await ctx.db.get(args.branchId))) throw new Error("Branch not found.");

    // Priced like a sale (till prices, tier discount, IVA), so the order total is what the
    // customer will pay. Prices are agreed now and kept at collection, so a changed price is
    // checked here, like a discount at the till.
    const paymentTerm = args.paymentTermId ? await ctx.db.get(args.paymentTermId) : null;
    if (args.paymentTermId && (!paymentTerm || !paymentTerm.active)) throw new Error("Payment term not found.");
    const depositPercent = args.depositPercent ?? paymentTerm?.depositPercent ?? 0;
    if (depositPercent < 0 || depositPercent > 100) throw new Error("The deposit must be from 0 to 100%.");

    // One line per product: the same product twice is added up into one line.
    const items: typeof args.items = [];
    for (const i of args.items) {
      const same = items.find((x) => x.productVariantId === i.productVariantId);
      if (!same) {
        items.push({ ...i });
        continue;
      }
      if (same.unitPrice !== i.unitPrice) throw new Error("A product appears twice at different prices. Use one line.");
      same.quantity += i.quantity;
      same.demandId ??= i.demandId;
      same.demandResponseItemId ??= i.demandResponseItemId;
    }

    const quote = await priceSale(ctx, {
      customerId: args.customerId,
      items: items.map((i) => ({ productVariantId: i.productVariantId, quantity: i.quantity, unitPrice: i.unitPrice })),
    });
    if (quote.overriddenLines > 0) {
      const maxWithoutApproval = await numberSetting(ctx, "discountMaxPercentWithoutApproval");
      const listValue = quote.subtotal + quote.priceCut;
      const cutPct = listValue > 0 ? (quote.priceCut / listValue) * 100 : 0;
      requirePermission(actor, cutPct > maxWithoutApproval ? "sales.discount_large" : "sales.discount");
    }
    const priced = quote.lines.map((l) => ({
      productVariantId: l.productVariantId,
      productName: l.productName,
      variantLabel: l.label,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: Math.round(l.unitPrice * l.quantity * 100) / 100,
    }));

    if (args.reserve) {
      for (const line of priced) {
        const { available } = await availableToSell(ctx, args.branchId, line.productVariantId);
        if (line.quantity > available) {
          throw new Error(
            `Only ${Math.max(0, available)} of ${line.productName} available to reserve; requested ${line.quantity}.`
          );
        }
      }
    }

    const now = Date.now();
    const orderNumber = await nextDocumentNumber(ctx, "CUSTOMER_ORDER", now);
    const totalAmount = quote.total;
    const expiresAt = now + (await numberSetting(ctx, "reservationDays")) * 24 * 60 * 60 * 1000;
    const orderId = await ctx.db.insert("customerOrders", {
      orderNumber,
      customerId: args.customerId,
      branchId: args.branchId,
      status: "OPEN",
      totalAmount,
      expectedDate: args.expectedDate,
      notes: args.notes?.trim() || undefined,
      paymentTermId: paymentTerm?._id,
      depositPercent,
      createdBy: actor._id,
      createdByUsername: actor.username,
      createdAt: now,
      updatedAt: now,
    });
    const order = (await ctx.db.get(orderId))!;
    for (const [index, line] of priced.entries()) {
      const itemId = await ctx.db.insert("customerOrderItems", { orderId, ...line });
      // priceSale keeps the input order, so the line and its input share an index.
      const input = items[index];
      if (input?.demandId || input?.demandResponseItemId) {
        await recordOrigin(ctx, order, (await ctx.db.get(itemId))!, input);
      }
      if (args.reserve) {
        await ctx.db.insert("stockHolds", {
          orderId,
          branchId: args.branchId,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          status: "ACTIVE",
          createdAt: now,
          expiresAt,
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
    await logEvent(ctx, actor, orderId, "CREATED", { totalAfter: totalAmount });
    await confirmIfDue(ctx, actor, orderId);
    return orderId;
  },
});

export const addDeposit = mutation({
  args: {
    token: v.string(),
    orderId: v.id("customerOrders"),
    amount: v.number(),
    method: paymentMethodValidator,
    referenceExternal: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const order = await loadOpenOrder(ctx, args.orderId);
    if (order.status !== "OPEN" && order.status !== "READY") throw new Error("This order is closed.");
    if (args.amount <= 0) throw new Error("A deposit must be a positive amount.");

    const deposits = await orderDeposits(ctx, args.orderId);
    const paid = sumDeposits(deposits);
    if (paid + args.amount > order.totalAmount + EPSILON) {
      throw new Error(`Deposits cannot exceed the order total of ${order.totalAmount}.`);
    }

    // A deposit is a payment row on the order; every payment goes through the open register.
    const session = await requireOpenSession(ctx, order.branchId);
    await ctx.db.insert("payments", {
      customerOrderId: args.orderId,
      method: args.method,
      amount: args.amount,
      kind: "payment",
      reference: args.referenceExternal?.trim() || undefined,
      cashRegisterSessionId: session._id,
      userId: actor._id,
      username: actor.username,
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
    await confirmIfDue(ctx, actor, args.orderId);
  },
});

export const markReady = mutation({
  args: { token: v.string(), orderId: v.id("customerOrders") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const order = await loadOpenOrder(ctx, args.orderId);
    if (order.status !== "OPEN") throw new Error("Only an open order can be marked ready.");
    if (!isConfirmed(order)) {
      throw new Error(`The order is not confirmed yet: a deposit of ${requiredDeposit(order)} is required.`);
    }
    await ctx.db.patch(args.orderId, { status: "READY", updatedAt: Date.now() });
    await logEvent(ctx, actor, args.orderId, "READY");
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
    const deposits = await orderDeposits(ctx, args.orderId);
    const refundable = sumDeposits(deposits);
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
    await logEvent(ctx, actor, args.orderId, "CANCELLED", {
      reason: args.reason.trim(),
      totalBefore: order.totalAmount,
    });
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
    payments: v.array(v.object({ method: paymentMethodValidator, amount: v.number() })),
    cashRegisterSessionId: v.optional(v.id("cashRegisterSessions")),
    // Collected for delivery: the sale carries the delivery fee; the delivery itself is
    // recorded with deliveries.create.
    isDelivery: v.optional(v.boolean()),
    deliveryFeeId: v.optional(v.id("deliveryFees")),
  },
  handler: async (ctx, args): Promise<Id<"sales">> => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const order = await loadOpenOrder(ctx, args.orderId);
    if (order.status !== "OPEN" && order.status !== "READY") throw new Error("This order is closed.");

    const items = await ctx.db
      .query("customerOrderItems")
      .withIndex("by_order", (q) => q.eq("orderId", args.orderId))
      .collect();
    const deposits = await orderDeposits(ctx, args.orderId);

    const balancePayments = args.payments.filter((p) => p.amount > 0);
    const paid =
      sumDeposits(deposits) + balancePayments.reduce((s, p) => s + p.amount, 0);
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
      payments: balancePayments,
      priorPayments: deposits,
      agreedPrices: true,
      cashRegisterSessionId: args.cashRegisterSessionId,
      isDelivery: args.isDelivery,
      deliveryFeeId: args.isDelivery ? args.deliveryFeeId : undefined,
    });
    // The sale is priced now (IVA and the tier discount as they stand today): if that comes
    // to more than was paid, collecting is refused and nothing is saved.
    const sale = await ctx.db.get(saleId);
    if (sale && sale.balance > EPSILON) {
      throw new Error(`Pay the balance before collecting: ${sale.balance.toFixed(2)} still due.`);
    }

    const now = Date.now();
    await ctx.db.patch(args.orderId, {
      status: "COLLECTED",
      saleId,
      closedAt: now,
      updatedAt: now,
      // Paid in full, so binding whatever the deposit rule said.
      confirmedAt: order.confirmedAt ?? now,
    });
    await logEvent(ctx, actor, args.orderId, "COLLECTED", { saleId, totalAfter: sale?.total });
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

/**
 * Changes an open order's lines. `items` is the full new set: a line left out (or at 0)
 * is removed, a new product is priced at today's till price, and lines kept keep their
 * agreed price. Deposits already paid cannot exceed the new total. Reserved stock follows
 * the new quantities. The change is recorded with each line's quantity before and after.
 */
export const changeLines = mutation({
  args: {
    token: v.string(),
    orderId: v.id("customerOrders"),
    items: v.array(v.object({ productVariantId: v.id("productVariants"), quantity: v.number() })),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const order = await loadOpenOrder(ctx, args.orderId);
    if (order.status !== "OPEN" && order.status !== "READY") throw new Error("This order is closed.");
    const reason = args.reason.trim();
    if (!reason) throw new Error("Say why the order is changing.");

    const wanted = new Map<Id<"productVariants">, number>();
    for (const i of args.items) {
      if (i.quantity < 0) throw new Error("Quantities cannot be negative.");
      wanted.set(i.productVariantId, (wanted.get(i.productVariantId) ?? 0) + i.quantity);
    }
    for (const [id, q] of wanted) if (q === 0) wanted.delete(id);
    if (wanted.size === 0) throw new Error("An order needs at least one item. Cancel it instead.");

    const current = await ctx.db
      .query("customerOrderItems")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .take(500);
    const currentBy = new Map<Id<"productVariants">, Doc<"customerOrderItems">>();
    const extraLines: Doc<"customerOrderItems">[] = [];
    for (const l of current) {
      const first = currentBy.get(l.productVariantId);
      if (first) extraLines.push(l);
      else currentBy.set(l.productVariantId, l);
    }
    const quantityBefore = (variantId: Id<"productVariants">) =>
      current.filter((l) => l.productVariantId === variantId).reduce((n, l) => n + l.quantity, 0);

    // Kept lines at their agreed price, new ones at the till price; IVA and tier as today.
    const quote = await priceSale(ctx, {
      customerId: order.customerId,
      items: [...wanted].map(([productVariantId, quantity]) => ({
        productVariantId,
        quantity,
        unitPrice: currentBy.get(productVariantId)?.unitPrice,
      })),
    });
    const paid = await orderPaid(ctx, order._id);
    if (paid > quote.total + EPSILON) {
      throw new Error(`Deposits of ${round2(paid)} already exceed the new total of ${quote.total}.`);
    }

    // Reserved stock: release what is held, then hold the new quantities again.
    const holds = await ctx.db
      .query("stockHolds")
      .withIndex("by_order", (q) => q.eq("orderId", order._id))
      .take(500);
    const active = holds.filter((h) => h.status === "ACTIVE");
    const now = Date.now();
    // Holds already past their expiry no longer hold anything (the cron just has not marked
    // them yet): they are closed as EXPIRED and do not carry the reservation forward.
    const live = active.filter((h) => h.expiresAt > now);
    for (const h of active) {
      await ctx.db.patch(
        h._id,
        h.expiresAt > now ? { status: "RELEASED", releasedAt: now } : { status: "EXPIRED", releasedAt: now }
      );
    }
    if (live.length > 0) {
      const expiresAt = Math.min(...live.map((h) => h.expiresAt));
      for (const line of quote.lines) {
        const { available } = await availableToSell(ctx, order.branchId, line.productVariantId);
        if (line.quantity > available) {
          throw new Error(
            `Only ${Math.max(0, available)} of ${line.productName} available to reserve; requested ${line.quantity}.`
          );
        }
        await ctx.db.insert("stockHolds", {
          orderId: order._id,
          branchId: order.branchId,
          productVariantId: line.productVariantId,
          quantity: line.quantity,
          status: "ACTIVE",
          createdAt: now,
          expiresAt,
        });
      }
    }

    const lineChanges: NonNullable<Doc<"orderEvents">["lineChanges"]> = [];
    for (const line of quote.lines) {
      const existing = currentBy.get(line.productVariantId);
      const lineTotal = round2(line.unitPrice * line.quantity);
      if (existing) {
        const before = quantityBefore(line.productVariantId);
        if (existing.quantity !== line.quantity) await ctx.db.patch(existing._id, { quantity: line.quantity, lineTotal });
        if (before !== line.quantity) {
          lineChanges.push({
            productVariantId: line.productVariantId,
            label: `${existing.productName} ${existing.variantLabel}`,
            quantityBefore: before,
            quantityAfter: line.quantity,
            unitPrice: existing.unitPrice,
          });
        }
      } else {
        await ctx.db.insert("customerOrderItems", {
          orderId: order._id,
          productVariantId: line.productVariantId,
          productName: line.productName,
          variantLabel: line.label,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          lineTotal,
        });
        lineChanges.push({
          productVariantId: line.productVariantId,
          label: `${line.productName} ${line.label}`,
          quantityBefore: 0,
          quantityAfter: line.quantity,
          unitPrice: line.unitPrice,
        });
      }
    }
    // Second lines for a product that is kept: folded into its first line.
    for (const extra of extraLines) {
      if (!wanted.has(extra.productVariantId)) continue;
      const keep = currentBy.get(extra.productVariantId)!;
      const origins = await ctx.db
        .query("orderItemOrigins")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", extra._id))
        .take(50);
      for (const o of origins) await ctx.db.patch(o._id, { orderItemId: keep._id });
      await ctx.db.delete(extra._id);
    }
    for (const existing of current) {
      if (wanted.has(existing.productVariantId)) continue;
      const origins = await ctx.db
        .query("orderItemOrigins")
        .withIndex("by_order_item", (q) => q.eq("orderItemId", existing._id))
        .take(50);
      for (const o of origins) await ctx.db.delete(o._id);
      await ctx.db.delete(existing._id);
      if (lineChanges.some((c) => c.productVariantId === existing.productVariantId)) continue;
      lineChanges.push({
        productVariantId: existing.productVariantId,
        label: `${existing.productName} ${existing.variantLabel}`,
        quantityBefore: quantityBefore(existing.productVariantId),
        quantityAfter: 0,
        unitPrice: existing.unitPrice,
      });
    }
    if (lineChanges.length === 0) throw new Error("Nothing changed.");

    await ctx.db.patch(order._id, { totalAmount: quote.total, updatedAt: now });
    await logEvent(ctx, actor, order._id, "CHANGED", {
      reason,
      lineChanges,
      totalBefore: order.totalAmount,
      totalAfter: quote.total,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer_order.changed",
      entityType: "customerOrder",
      entityId: order._id,
      details: `${order.orderNumber}: ${lineChanges.length} line(s) changed, total ${order.totalAmount} → ${quote.total} — ${reason}`,
    });
    // A smaller total can bring the deposit paid up to the rule.
    await confirmIfDue(ctx, actor, order._id);
  },
});
