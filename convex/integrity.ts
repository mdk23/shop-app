import { v } from "convex/values";
import { internalMutation, mutation, query, MutationCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { saleMoney } from "./lib/saleMoney";
import { purchaseOrderMoney, purchaseOrderPaymentStatus } from "./supplierPayments";

/**
 * The daily check that every stored copy still matches its single source:
 *  - STOCK:       variantStock.quantity  = the sum of its inventoryMovements
 *  - SALE_MONEY:  sales.paidAmount / balance = lib/saleMoney (payments, returns, total)
 *  - PO_RECEIVED: purchaseOrderItems.quantityReceived = the sum of its receipt lines
 *  - PO_PAYMENT:  purchaseOrders.paymentStatus = its supplier payments against its total
 * It walks each table a page at a time (one mutation per page, scheduled one after the
 * other) and records what does not match in `integrityIssues`. It never corrects anything:
 * a mismatch is a bug to look at, and the source stays the truth.
 */

const PHASES = ["stock", "sales", "purchaseLines", "purchaseOrders"] as const;
type Phase = (typeof PHASES)[number];
const PAGE = 100;
const LAST_RUN_KEY = "integrity:lastRun";
const EPSILON = 0.005;

async function record(
  ctx: MutationCtx,
  issue: {
    kind: "STOCK" | "SALE_MONEY" | "PO_RECEIVED" | "PO_PAYMENT";
    entityId: string;
    label: string;
    stored: number | string;
    expected: number | string;
  }
) {
  await ctx.db.insert("integrityIssues", {
    ...issue,
    stored: String(issue.stored),
    expected: String(issue.expected),
    foundAt: Date.now(),
  });
}

export const start = internalMutation({
  args: {},
  handler: async (ctx) => {
    // Keep only the latest run's findings.
    for (const old of await ctx.db.query("integrityIssues").take(1000)) await ctx.db.delete(old._id);
    await ctx.scheduler.runAfter(0, internal.integrity.checkPage, { phase: "stock", cursor: null });
  },
});

export const checkPage = internalMutation({
  args: { phase: v.union(...PHASES.map((p) => v.literal(p))), cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const opts = { numItems: PAGE, cursor: args.cursor };
    let isDone: boolean;
    let cursor: string;

    if (args.phase === "stock") {
      const page = await ctx.db.query("variantStock").paginate(opts);
      for (const row of page.page) {
        let fromLedger = 0;
        for await (const m of ctx.db
          .query("inventoryMovements")
          .withIndex("by_branch_and_variant", (q) =>
            q.eq("branchId", row.branchId).eq("productVariantId", row.productVariantId)
          )) {
          fromLedger += m.quantity;
        }
        if (fromLedger !== row.quantity) {
          const variant = await ctx.db.get(row.productVariantId);
          await record(ctx, {
            kind: "STOCK",
            entityId: row._id,
            label: `${variant?.sku ?? "?"} @ ${(await ctx.db.get(row.branchId))?.name ?? "?"}`,
            stored: row.quantity,
            expected: fromLedger,
          });
        }
      }
      ({ isDone, continueCursor: cursor } = page);
    } else if (args.phase === "sales") {
      const page = await ctx.db.query("sales").paginate(opts);
      for (const sale of page.page) {
        const money = await saleMoney(ctx, sale);
        if (Math.abs(money.paid - sale.paidAmount) > EPSILON || Math.abs(money.balance - sale.balance) > EPSILON) {
          await record(ctx, {
            kind: "SALE_MONEY",
            entityId: sale._id,
            label: `${sale.saleNumber} paid/balance`,
            stored: sale.balance,
            expected: money.balance,
          });
        }
      }
      ({ isDone, continueCursor: cursor } = page);
    } else if (args.phase === "purchaseOrders") {
      const page = await ctx.db.query("purchaseOrders").paginate(opts);
      for (const po of page.page) {
        const { paid } = await purchaseOrderMoney(ctx, po);
        const expected = purchaseOrderPaymentStatus(po.totalAmount, paid);
        if (expected !== po.paymentStatus) {
          await record(ctx, {
            kind: "PO_PAYMENT",
            entityId: po._id,
            label: `${po.orderCode} payment status`,
            stored: po.paymentStatus,
            expected,
          });
        }
      }
      ({ isDone, continueCursor: cursor } = page);
    } else {
      const page = await ctx.db.query("purchaseOrderItems").paginate(opts);
      for (const line of page.page) {
        const receiptLines = await ctx.db
          .query("purchaseReceiptItems")
          .withIndex("by_purchase_order_item", (q) => q.eq("purchaseOrderItemId", line._id))
          .take(500);
        const received = receiptLines.reduce((s, r) => s + r.quantityReceived, 0);
        if (received !== line.quantityReceived) {
          const po = await ctx.db.get(line.purchaseOrderId);
          await record(ctx, {
            kind: "PO_RECEIVED",
            entityId: line._id,
            label: `${po?.orderCode ?? "?"} line`,
            stored: line.quantityReceived,
            expected: received,
          });
        }
      }
      ({ isDone, continueCursor: cursor } = page);
    }

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.integrity.checkPage, { phase: args.phase, cursor });
      return;
    }
    const next = PHASES[PHASES.indexOf(args.phase as Phase) + 1];
    if (next) {
      await ctx.scheduler.runAfter(0, internal.integrity.checkPage, { phase: next, cursor: null });
      return;
    }
    // Finished: remember when.
    const now = Date.now();
    const row = await ctx.db
      .query("counters")
      .withIndex("by_key", (q) => q.eq("key", LAST_RUN_KEY))
      .unique();
    if (row) await ctx.db.patch(row._id, { value: now, updatedAt: now });
    else await ctx.db.insert("counters", { key: LAST_RUN_KEY, value: now, updatedAt: now });
  },
});

/** The latest check: when it finished and what did not match. */
export const latest = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    const lastRun = await ctx.db
      .query("counters")
      .withIndex("by_key", (q) => q.eq("key", LAST_RUN_KEY))
      .unique();
    const issues = await ctx.db.query("integrityIssues").withIndex("by_found_at").order("desc").take(200);
    return { lastRunAt: lastRun?.value ?? null, issues };
  },
});

/** Runs the check now instead of waiting for the night. */
export const runNow = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    await ctx.scheduler.runAfter(0, internal.integrity.start, {});
  },
});
