import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { drawerCash, requireOpenSession } from "./cashRegister";
import { paymentMethodValidator } from "./lib/paymentMethods";
import { round2 } from "./lib/fiscal";

/**
 * Payments to suppliers, against purchase orders. The payment rows are the record; an
 * order's `paymentStatus` is their sum against its total, rewritten whenever one changes.
 * Cash comes out of the branch's open register (it shows in the drawer as cash out).
 */

async function paymentsOf(ctx: QueryCtx, purchaseOrderId: Id<"purchaseOrders">) {
  return await ctx.db
    .query("supplierPayments")
    .withIndex("by_purchase_order", (q) => q.eq("purchaseOrderId", purchaseOrderId))
    .collect();
}

/** What has been paid on an order, and what is still owed. */
export async function purchaseOrderMoney(ctx: QueryCtx, po: Doc<"purchaseOrders">) {
  const payments = await paymentsOf(ctx, po._id);
  const paid = round2(payments.reduce((s, p) => s + p.amount, 0));
  return { payments, paid, outstanding: round2(Math.max(0, po.totalAmount - paid)) };
}

async function settlePurchaseOrder(ctx: MutationCtx, purchaseOrderId: Id<"purchaseOrders">) {
  const po = await ctx.db.get(purchaseOrderId);
  if (!po) return;
  const { paid } = await purchaseOrderMoney(ctx, po);
  const paymentStatus =
    paid <= 0 ? "UNPAID" : paid + 0.005 >= po.totalAmount ? "PAID" : "PARTIALLY_PAID";
  if (paymentStatus !== po.paymentStatus) await ctx.db.patch(purchaseOrderId, { paymentStatus });
}

export const listByPurchaseOrder = query({
  args: { token: v.string(), purchaseOrderId: v.id("purchaseOrders") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const po = await ctx.db.get(args.purchaseOrderId);
    if (!po) return null;
    const money = await purchaseOrderMoney(ctx, po);
    return { ...money, payments: money.payments.sort((a, b) => b.paidAt - a.paidAt) };
  },
});

/** What is owed to each supplier: orders sent or received and not fully paid. */
export const payables = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const open = [
      ...(await ctx.db
        .query("purchaseOrders")
        .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "UNPAID"))
        .take(1000)),
      ...(await ctx.db
        .query("purchaseOrders")
        .withIndex("by_payment_status", (q) => q.eq("paymentStatus", "PARTIALLY_PAID"))
        .take(1000)),
    ].filter((po) => po.status !== "DRAFT" && po.status !== "CANCELLED");
    const bySupplier = new Map<Id<"suppliers">, { owed: number; orders: number }>();
    for (const po of open) {
      const { outstanding } = await purchaseOrderMoney(ctx, po);
      if (outstanding <= 0) continue;
      const e = bySupplier.get(po.supplierId) ?? { owed: 0, orders: 0 };
      e.owed = round2(e.owed + outstanding);
      e.orders += 1;
      bySupplier.set(po.supplierId, e);
    }
    return (
      await Promise.all(
        [...bySupplier.entries()].map(async ([supplierId, e]) => ({
          supplierId,
          name: (await ctx.db.get(supplierId))?.name ?? "—",
          ...e,
        }))
      )
    ).sort((a, b) => b.owed - a.owed);
  },
});

export const add = mutation({
  args: {
    token: v.string(),
    purchaseOrderId: v.id("purchaseOrders"),
    amount: v.number(),
    method: paymentMethodValidator,
    reference: v.optional(v.string()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const po = await ctx.db.get(args.purchaseOrderId);
    if (!po) throw new Error("Purchase order not found.");
    if (po.status === "DRAFT") throw new Error("Send the order before paying it.");
    if (po.status === "CANCELLED") throw new Error("The order is cancelled.");
    if (!Number.isFinite(args.amount) || args.amount <= 0) {
      throw new Error("A payment must be a positive amount.");
    }
    const { outstanding } = await purchaseOrderMoney(ctx, po);
    if (args.amount > outstanding + 0.005) {
      throw new Error(`Only ${outstanding.toFixed(2)} is still owed on ${po.orderCode}.`);
    }

    // Cash leaves the drawer, so it needs the branch's open register and enough cash in it.
    let sessionId: Id<"cashRegisterSessions"> | undefined;
    if (args.method === "CASH") {
      if (!po.branchId) throw new Error("This order has no branch to pay cash from.");
      const session = await requireOpenSession(ctx, po.branchId);
      const inDrawer = await drawerCash(ctx, session._id);
      if (args.amount > inDrawer + 0.005) {
        throw new Error(`Only ${inDrawer.toFixed(2)} in cash is in the drawer.`);
      }
      sessionId = session._id;
    }

    const now = Date.now();
    const id = await ctx.db.insert("supplierPayments", {
      purchaseOrderId: po._id,
      supplierId: po.supplierId,
      amount: round2(args.amount),
      method: args.method,
      reference: args.reference?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      paidAt: now,
      cashRegisterSessionId: sessionId,
      userId: actor._id,
      username: actor.username,
      createdAt: now,
    });
    await settlePurchaseOrder(ctx, po._id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "supplier_payment.added",
      entityType: "purchaseOrder",
      entityId: po._id,
      details: `${po.orderCode}: paid ${args.amount.toFixed(2)} by ${args.method}${
        args.reference?.trim() ? ` (ref ${args.reference.trim()})` : ""
      }`,
    });
    return id;
  },
});

/** Removes a payment recorded by mistake; a cash one only while its register is open. */
export const remove = mutation({
  args: { token: v.string(), paymentId: v.id("supplierPayments") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "payments.modify");
    const payment = await ctx.db.get(args.paymentId);
    if (!payment) throw new Error("Payment not found.");
    if (payment.cashRegisterSessionId) {
      const session = await ctx.db.get(payment.cashRegisterSessionId);
      if (!session || session.status !== "OPEN") {
        throw new Error("This cash payment is in a closed register session and can no longer be removed.");
      }
    }
    const po = await ctx.db.get(payment.purchaseOrderId);
    await ctx.db.delete(args.paymentId);
    await settlePurchaseOrder(ctx, payment.purchaseOrderId);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "supplier_payment.removed",
      entityType: "purchaseOrder",
      entityId: payment.purchaseOrderId,
      details: `${po?.orderCode ?? ""}: removed ${payment.amount.toFixed(2)} by ${payment.method}`,
    });
  },
});
