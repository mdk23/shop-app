import { v } from "convex/values";
import { query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize, userHasPermission } from "./permissions";
import { branchIdArg, normalizeBranchId } from "./analytics";
import { orderPaid } from "./customerOrders";
import { variantLabel } from "./inventory";

/**
 * O Meu Dia: the work the records already say is due, for the person signed in. It
 * distributes work rather than reporting on it — every item opens the screen where it
 * is done. What a person sees follows their role's permissions and the branch chosen;
 * nothing is assigned to individuals, so two sellers of one branch see the same list.
 * Nothing here is stored: each item is read from the record it is about.
 */

const DAY = 24 * 60 * 60 * 1000;
const EPSILON = 0.005;
const MAX_ITEMS = 30; // per zone; the counters give the full number
const SALES_WINDOW_DAYS = 30; // for "days of stock left"
const FAILED_LOOKBACK_DAYS = 14;

type Phrase = { text: string; params?: Record<string, string | number> };
type Tone = "error" | "warning" | "info" | "neutral";
type Item = {
  key: string;
  kind: string;
  title: Phrase;
  detail?: Phrase;
  href?: string;
  when?: number;
  tone: Tone;
};

const inBranch = (rowBranch: Id<"branches"> | undefined, branchId: Id<"branches"> | undefined) =>
  !branchId || !rowBranch || rowBranch === branchId;

async function customerName(ctx: QueryCtx, id: Id<"customers"> | undefined) {
  return (id && (await ctx.db.get(id))?.name) || "—";
}

async function variantName(ctx: QueryCtx, id: Id<"productVariants">) {
  const variant = await ctx.db.get(id);
  if (!variant) return "?";
  const product = await ctx.db.get(variant.productId);
  return `${product?.name ?? "?"} — ${await variantLabel(ctx, variant)}`;
}

/** Units of a variant sold since `since`, from its stock ledger. */
async function unitsSold(
  ctx: QueryCtx,
  productVariantId: Id<"productVariants">,
  branchId: Id<"branches"> | undefined,
  since: number
) {
  const movements = branchId
    ? ctx.db
        .query("inventoryMovements")
        .withIndex("by_branch_and_variant", (q) => q.eq("branchId", branchId).eq("productVariantId", productVariantId))
        .order("desc")
    : ctx.db
        .query("inventoryMovements")
        .withIndex("by_variant", (q) => q.eq("productVariantId", productVariantId))
        .order("desc");
  let sold = 0;
  let read = 0;
  for await (const m of movements) {
    if (m.movementDate < since || ++read > 1000) break;
    if (m.movementType === "SALE") sold -= m.quantity;
  }
  return sold;
}

export const today = query({
  args: {
    token: v.string(),
    branchId: branchIdArg,
    // The start of the viewer's day (local midnight) and the time now, from the browser.
    dayStart: v.number(),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const user = await authorize(ctx, args.token, "pos.use");
    const can = (p: Parameters<typeof userHasPermission>[1]) => userHasPermission(user, p);
    const branchId = normalizeBranchId(args.branchId);
    const { now, dayStart } = args;
    const dayEnd = dayStart + DAY;
    const weekEnd = dayStart + 8 * DAY;

    const attention: Item[] = [];
    const todayItems: Item[] = [];
    const followUps: Item[] = [];
    const knowledge: Item[] = [];
    const upcoming: Item[] = [];

    /** Puts a dated item in the zone its date falls in: overdue, today or the next 7 days. */
    const byDate = (item: Omit<Item, "tone">, when: number, overdueText: Phrase) => {
      if (when < dayStart) attention.push({ ...item, title: overdueText, when, tone: "error" });
      else if (when < dayEnd) todayItems.push({ ...item, when, tone: "warning" });
      else if (when < weekEnd) upcoming.push({ ...item, when, tone: "neutral" });
    };

    // ── Customer orders: paid but not collected, ready to collect, and their dates ──
    if (can("customers.view")) {
      const orders = [
        ...(await ctx.db.query("customerOrders").withIndex("by_status", (q) => q.eq("status", "READY")).take(200)),
        ...(await ctx.db.query("customerOrders").withIndex("by_status", (q) => q.eq("status", "OPEN")).take(200)),
      ].filter((o) => inBranch(o.branchId, branchId));
      for (const order of orders) {
        const name = await customerName(ctx, order.customerId);
        const href = `/orders/${order._id}`;
        const params = { order: order.orderNumber, customer: name };
        const paid = await orderPaid(ctx, order._id);
        if (paid + EPSILON >= order.totalAmount) {
          attention.push({
            key: `paid:${order._id}`,
            kind: "ORDER_PAID",
            title: { text: "Order {order} is paid in full but not collected", params },
            detail: { text: "Customer: {customer}", params },
            href,
            tone: "warning",
          });
        } else if (order.status === "READY") {
          todayItems.push({
            key: `ready:${order._id}`,
            kind: "ORDER_READY",
            title: { text: "Order {order} is ready: let {customer} know", params },
            href,
            tone: "info",
          });
        }
        if (order.expectedDate !== undefined && order.status === "OPEN") {
          byDate(
            {
              key: `order-date:${order._id}`,
              kind: "ORDER_DUE",
              title: { text: "Order {order} promised to {customer}", params },
              href,
            },
            order.expectedDate,
            { text: "Order {order} for {customer} is past its promised date", params }
          );
        }
      }

      // Reservations about to lapse: the stock goes back on sale when they do.
      const holds = await ctx.db
        .query("stockHolds")
        .withIndex("by_status_and_expires", (q) => q.eq("status", "ACTIVE").gte("expiresAt", now).lt("expiresAt", weekEnd))
        .take(500);
      const holdOrders = new Map<Id<"customerOrders">, number>();
      for (const h of holds) {
        if (!inBranch(h.branchId, branchId)) continue;
        holdOrders.set(h.orderId, Math.min(holdOrders.get(h.orderId) ?? Infinity, h.expiresAt));
      }
      for (const [orderId, expiresAt] of holdOrders) {
        const order = await ctx.db.get(orderId);
        if (!order) continue;
        const item = {
          key: `hold:${orderId}`,
          kind: "HOLD_EXPIRING",
          title: { text: "Reservation for order {order} expires", params: { order: order.orderNumber } },
          detail: { text: "Customer: {customer}", params: { customer: await customerName(ctx, order.customerId) } },
          href: `/orders/${orderId}`,
          when: expiresAt,
        };
        if (expiresAt < dayEnd) attention.push({ ...item, tone: "error" });
        else upcoming.push({ ...item, tone: "neutral" });
      }

      // Requests with a date the customer needs them by.
      for (const stage of ["OPEN", "PROCEEDING"] as const) {
        const demands = await ctx.db.query("demands").withIndex("by_stage", (q) => q.eq("stage", stage)).take(500);
        for (const d of demands) {
          if (d.neededBy === undefined || !inBranch(d.branchId, branchId)) continue;
          const params = { request: d.description, customer: await customerName(ctx, d.customerId) };
          byDate(
            {
              key: `demand:${d._id}`,
              kind: "DEMAND_DUE",
              title: { text: "{customer} needs \"{request}\"", params },
              href: d.proceededAt ? "/opportunities" : "/requests",
            },
            d.neededBy,
            { text: "{customer} needed \"{request}\" by now", params }
          );
        }
      }

      // Promises made to customers that are not yet kept.
      const commitments = await ctx.db.query("followUpCommitments").order("desc").take(200);
      for (const c of commitments) {
        const kept = await ctx.db
          .query("followUpSatisfactions")
          .withIndex("by_follow_up", (q) => q.eq("followUpId", c._id))
          .first();
        if (kept) continue;
        const participant = await ctx.db
          .query("relationParticipants")
          .withIndex("by_relation", (q) => q.eq("relationId", c.relationId))
          .first();
        const overdue = c.dueAt !== undefined && c.dueAt < dayStart;
        const dueToday = c.dueAt !== undefined && c.dueAt >= dayStart && c.dueAt < dayEnd;
        followUps.push({
          key: `follow:${c._id}`,
          kind: "FOLLOW_UP",
          title: { text: c.description },
          detail: { text: "Customer: {customer}", params: { customer: await customerName(ctx, participant?.customerId) } },
          href: participant ? `/customers/${participant.customerId}` : undefined,
          when: c.dueAt,
          tone: overdue ? "error" : dueToday ? "warning" : "neutral",
        });
      }
    }

    // ── Deliveries: due, late, and failed ones not yet sent again ──
    if (can("sales.view")) {
      const scheduled = await ctx.db
        .query("deliveries")
        .withIndex("by_status_and_created_at", (q) => q.eq("status", "SCHEDULED"))
        .take(500);
      for (const d of scheduled) {
        if (!inBranch(d.branchId, branchId)) continue;
        const params = { delivery: d.deliveryNumber, recipient: d.recipientName, address: d.address };
        const item = {
          key: `delivery:${d._id}`,
          kind: "DELIVERY_DUE",
          title: { text: "Delivery {delivery} to {recipient}", params },
          detail: { text: "{address}", params },
          href: "/deliveries",
        };
        if (d.scheduledFor === undefined) todayItems.push({ ...item, tone: "info" });
        else byDate(item, d.scheduledFor, { text: "Delivery {delivery} to {recipient} is late", params });
      }
      const failed = await ctx.db
        .query("deliveries")
        .withIndex("by_status_and_created_at", (q) =>
          q.eq("status", "FAILED").gte("createdAt", now - FAILED_LOOKBACK_DAYS * DAY)
        )
        .take(200);
      for (const d of failed) {
        if (!inBranch(d.branchId, branchId)) continue;
        const later = await ctx.db
          .query("deliveries")
          .withIndex("by_sale", (q) => q.eq("saleId", d.saleId))
          .take(50);
        if (later.some((o) => o.createdAt > d.createdAt && o.status !== "FAILED")) continue;
        attention.push({
          key: `failed:${d._id}`,
          kind: "DELIVERY_FAILED",
          title: { text: "Delivery {delivery} to {recipient} failed", params: { delivery: d.deliveryNumber, recipient: d.recipientName } },
          detail: d.failureReason ? { text: d.failureReason } : undefined,
          href: "/deliveries",
          when: d.createdAt,
          tone: "error",
        });
      }
    }

    // ── Complaints waiting for a decision ──
    if (can("returns.approve")) {
      const open = await ctx.db.query("complaints").withIndex("by_status", (q) => q.eq("status", "OPEN")).take(100);
      for (const c of open) {
        attention.push({
          key: `complaint:${c._id}`,
          kind: "COMPLAINT",
          title: { text: "Complaint from {customer} waiting for a decision", params: { customer: await customerName(ctx, c.customerId) } },
          detail: { text: c.description },
          href: "/complaints",
          when: c.createdAt,
          tone: "warning",
        });
      }
    }

    // ── Transfers on their way to this branch ──
    if (can("inventory.transfer")) {
      const moving = await ctx.db.query("stockTransfers").withIndex("by_status", (q) => q.eq("status", "IN_TRANSIT")).take(200);
      for (const tr of moving) {
        if (branchId && tr.destinationBranchId !== branchId) continue;
        const source = await ctx.db.get(tr.sourceBranchId);
        attention.push({
          key: `transfer:${tr._id}`,
          kind: "TRANSFER",
          title: { text: "Transfer {transfer} from {branch}: confirm what arrived", params: { transfer: tr.transferNumber, branch: source?.name ?? "?" } },
          href: "/inventory/transfers",
          when: tr.sentAt,
          tone: "warning",
        });
      }
    }

    // ── Purchasing: deliveries due, orders partly received, quality, landed costs ──
    if (can("purchasing.view")) {
      const sent = await ctx.db.query("purchaseOrders").withIndex("by_status", (q) => q.eq("status", "SENT")).take(300);
      for (const po of sent) {
        if (po.expectedDeliveryDate === undefined || !inBranch(po.branchId, branchId)) continue;
        const supplier = await ctx.db.get(po.supplierId);
        const params = { order: po.orderCode, supplier: supplier?.name ?? "?" };
        byDate(
          { key: `po:${po._id}`, kind: "PO_DUE", title: { text: "Goods from {supplier} due ({order})", params }, href: `/purchase-orders/${po._id}` },
          po.expectedDeliveryDate,
          { text: "Goods from {supplier} are late ({order})", params }
        );
      }
      const partial = await ctx.db
        .query("purchaseOrders")
        .withIndex("by_status", (q) => q.eq("status", "PARTIALLY_RECEIVED"))
        .take(100);
      for (const po of partial) {
        if (!inBranch(po.branchId, branchId)) continue;
        const supplier = await ctx.db.get(po.supplierId);
        attention.push({
          key: `po-partial:${po._id}`,
          kind: "PO_PARTIAL",
          title: { text: "Order {order} from {supplier} is partly received: receive the rest or close it short", params: { order: po.orderCode, supplier: supplier?.name ?? "?" } },
          href: `/purchase-orders/${po._id}`,
          tone: "warning",
        });
      }
      const untreated = await ctx.db
        .query("qualityIssues")
        .withIndex("by_treatment", (q) => q.eq("treatment", undefined))
        .take(100);
      for (const issue of untreated) {
        attention.push({
          key: `quality:${issue._id}`,
          kind: "QUALITY",
          title: { text: "Quality issue to treat" },
          detail: { text: issue.description },
          href: "/quality",
          when: issue.recognizedAt,
          tone: "warning",
        });
      }
    }
    if (can("purchasing.manage")) {
      const costs = await ctx.db.query("landedCosts").order("desc").take(100);
      const pending = costs.filter((c) => c.appliedAt === undefined).length;
      if (pending > 0) {
        attention.push({
          key: "landed-costs",
          kind: "LANDED_COST",
          title: { text: "{count} landed cost(s) not yet applied to product costs", params: { count: pending } },
          href: "/landed-costs",
          tone: "warning",
        });
      }
    }

    // ── The nightly data check ──
    if (can("settings.manage")) {
      const issues = await ctx.db.query("integrityIssues").withIndex("by_found_at").take(101);
      if (issues.length > 0) {
        attention.push({
          key: "integrity",
          kind: "INTEGRITY",
          title: { text: "{count} stored figure(s) no longer match their records", params: { count: issues.length > 100 ? "100+" : issues.length } },
          href: "/settings",
          tone: "error",
        });
      }
    }

    // ── Relevant knowledge: what the stock and requests say needs a decision ──
    if (can("purchasing.view")) {
      const statusRows = (status: "OUT_OF_STOCK" | "LOW_STOCK") =>
        branchId
          ? ctx.db
              .query("variantStock")
              .withIndex("by_branch_and_status", (q) => q.eq("branchId", branchId).eq("status", status))
              .take(50)
          : ctx.db.query("variantStock").withIndex("by_status", (q) => q.eq("status", status)).take(50);
      const rows = [...(await statusRows("OUT_OF_STOCK")), ...(await statusRows("LOW_STOCK"))];
      // One line per variant (several branches can be low on it), lowest first.
      const qty = new Map<Id<"productVariants">, number>();
      for (const r of rows) qty.set(r.productVariantId, (qty.get(r.productVariantId) ?? 0) + r.quantity);
      const since = now - SALES_WINDOW_DAYS * DAY;
      for (const [variantId, quantity] of [...qty].sort((a, b) => a[1] - b[1]).slice(0, 10)) {
        const variant = await ctx.db.get(variantId);
        if (!variant?.active) continue;
        const name = await variantName(ctx, variantId);
        const sold = await unitsSold(ctx, variantId, branchId, since);
        const perDay = sold / SALES_WINDOW_DAYS;
        const title: Phrase =
          quantity <= 0
            ? { text: "{product} is out of stock", params: { product: name } }
            : perDay > 0
              ? { text: "{product}: {qty} left, about {days} day(s) of sales", params: { product: name, qty: quantity, days: Math.max(1, Math.round(quantity / perDay)) } }
              : { text: "{product}: {qty} left, below the reorder level", params: { product: name, qty: quantity } };
        knowledge.push({
          key: `stock:${variantId}`,
          kind: "STOCK",
          title,
          detail: sold > 0 ? { text: "{sold} sold in the last 30 days", params: { sold } } : undefined,
          href: "/procurement-planning",
          tone: quantity <= 0 ? "error" : "warning",
        });
      }

      // Sales lost because the item was not in stock, last 30 days.
      const lost = (await ctx.db.query("demands").withIndex("by_reason", (q) => q.eq("reason", "STOCK")).order("desc").take(500))
        .filter((d) => d.stage === "LOST" && (d.closedAt ?? d.updatedAt) >= since && inBranch(d.branchId, branchId));
      if (lost.length > 0) {
        const value = lost.reduce((s, d) => s + (d.estimatedValue ?? d.maxPrice ?? 0), 0);
        knowledge.push({
          key: "lost-stock",
          kind: "LOST_SALES",
          title: { text: "{count} sale(s) lost for lack of stock in the last 30 days", params: { count: lost.length } },
          detail: value > 0 ? { text: "Estimated value: {value}", params: { value } } : undefined,
          href: "/insights",
          tone: "warning",
        });
      }

      // Products several customers are asking for at once.
      const asked = new Map<Id<"products">, number>();
      for (const stage of ["OPEN", "PROCEEDING"] as const) {
        for (const d of await ctx.db.query("demands").withIndex("by_stage", (q) => q.eq("stage", stage)).take(500)) {
          if (!inBranch(d.branchId, branchId)) continue;
          let productId = d.productId;
          if (!productId && d.productVariantId) productId = (await ctx.db.get(d.productVariantId))?.productId;
          if (productId) asked.set(productId, (asked.get(productId) ?? 0) + 1);
        }
      }
      for (const [productId, count] of [...asked].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
        knowledge.push({
          key: `asked:${productId}`,
          kind: "DEMAND_GROWING",
          title: { text: "{count} open requests for {product}", params: { count, product: (await ctx.db.get(productId))?.name ?? "?" } },
          href: "/requests",
          tone: "info",
        });
      }
    }

    // Overdue first, then by date; undated items last.
    const byWhen = (a: Item, b: Item) => (a.when ?? Infinity) - (b.when ?? Infinity);
    const toneRank: Record<Tone, number> = { error: 0, warning: 1, info: 2, neutral: 3 };
    attention.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || byWhen(a, b));
    todayItems.sort(byWhen);
    followUps.sort((a, b) => toneRank[a.tone] - toneRank[b.tone] || byWhen(a, b));
    upcoming.sort(byWhen);

    const zone = (items: Item[]) => ({ count: items.length, items: items.slice(0, MAX_ITEMS) });
    return {
      userName: user.name,
      attention: zone(attention),
      today: zone(todayItems),
      followUps: zone(followUps),
      knowledge: zone(knowledge),
      upcoming: zone(upcoming),
    };
  },
});
