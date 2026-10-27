import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { formatVariantLabel, variantNames } from "./lib/variantNames";

const itemInput = v.object({
  variantId: v.id("productVariants"),
  quantity: v.number(),
});

async function variantLabel(ctx: QueryCtx, variantId?: Id<"productVariants">) {
  if (!variantId) return "—";
  const variant = await ctx.db.get(variantId);
  if (!variant) return "—";
  const product = await ctx.db.get(variant.productId);
  return `${product?.name ?? "—"} ${formatVariantLabel(await variantNames(ctx, variant), "")}`.trim();
}

/** Needs recognised (what the shop should buy) and decisions taken to cover them. */
export const overview = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const needs = await ctx.db.query("procurementNeeds").order("desc").take(100);
    const needsOut = await Promise.all(
      needs.map(async (need) => {
        const items = await ctx.db
          .query("procurementNeedItems")
          .withIndex("by_need", (q) => q.eq("needId", need._id))
          .collect();
        const branch = need.branchId ? await ctx.db.get(need.branchId) : null;
        return {
          ...need,
          branchName: branch?.name ?? null,
          items: await Promise.all(
            items.map(async (item) => ({ ...item, label: await variantLabel(ctx, item.productVariantId) }))
          ),
        };
      })
    );
    const decisions = await ctx.db.query("procurementDecisions").order("desc").take(100);
    const decisionsOut = await Promise.all(
      decisions.map(async (decision) => {
        const items = await ctx.db
          .query("procurementDecisionItems")
          .withIndex("by_decision", (q) => q.eq("decisionId", decision._id))
          .collect();
        const itemsOut = await Promise.all(
          items.map(async (item) => {
            const coverages = await ctx.db
              .query("decisionNeedCoverages")
              .withIndex("by_decision_item", (q) => q.eq("decisionItemId", item._id))
              .take(100);
            const orderLines = await ctx.db
              .query("decisionOrderLines")
              .withIndex("by_decision_item", (q) => q.eq("decisionItemId", item._id))
              .take(100);
            const orders = await Promise.all(
              orderLines.map(async (l) => {
                const line = await ctx.db.get(l.purchaseOrderItemId);
                const po = line ? await ctx.db.get(line.purchaseOrderId) : null;
                return { _id: l._id, orderCode: po?.orderCode ?? "—", quantity: l.quantity };
              })
            );
            return {
              ...item,
              label: await variantLabel(ctx, item.productVariantId),
              coverages: coverages.length,
              orders,
              quantityOrdered: orderLines.reduce((s, l) => s + l.quantity, 0),
            };
          })
        );
        return { ...decision, items: itemsOut };
      })
    );
    return { needs: needsOut, decisions: decisionsOut };
  },
});

export const createNeed = mutation({
  args: { token: v.string(), branchId: v.id("branches"), items: v.array(itemInput) },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    if (args.items.length === 0) throw new Error("Add at least one item.");
    if (!(await ctx.db.get(args.branchId))) throw new Error("Branch not found.");
    const id = await ctx.db.insert("procurementNeeds", { recognizedAt: Date.now(), branchId: args.branchId });
    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantities must be positive.");
      const variant = await ctx.db.get(item.variantId);
      if (!variant) throw new Error("Product variant not found.");
      await ctx.db.insert("procurementNeedItems", {
        needId: id,
        productId: variant.productId,
        productVariantId: item.variantId,
        quantityRecognized: item.quantity,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "procurement_need.recorded",
      entityType: "procurementNeed",
      entityId: id,
      details: `${args.items.length} item(s)`,
    });
    return id;
  },
});

export const createDecision = mutation({
  args: { token: v.string(), decisionType: v.string(), items: v.array(itemInput) },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const decisionType = args.decisionType.trim();
    if (!decisionType) throw new Error("Say what kind of decision this is.");
    if (args.items.length === 0) throw new Error("Add at least one item.");
    const id = await ctx.db.insert("procurementDecisions", { decisionType, decidedAt: Date.now() });
    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantities must be positive.");
      const variant = await ctx.db.get(item.variantId);
      if (!variant) throw new Error("Product variant not found.");
      await ctx.db.insert("procurementDecisionItems", {
        decisionId: id,
        productId: variant.productId,
        productVariantId: item.variantId,
        quantityDecided: item.quantity,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "procurement_decision.recorded",
      entityType: "procurementDecision",
      entityId: id,
      details: decisionType,
    });
    return id;
  },
});

/** Says that a decision item covers (part of) a recognised need item. */
export const coverNeed = mutation({
  args: {
    token: v.string(),
    decisionItemId: v.id("procurementDecisionItems"),
    needItemId: v.id("procurementNeedItems"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const decisionItem = await ctx.db.get(args.decisionItemId);
    const needItem = await ctx.db.get(args.needItemId);
    if (!decisionItem || !needItem) throw new Error("Decision or need not found.");
    if (decisionItem.productVariantId !== needItem.productVariantId) {
      throw new Error("A decision can only cover a need for the same product variant.");
    }
    if (args.quantity <= 0) throw new Error("The covered quantity must be positive.");
    const id = await ctx.db.insert("decisionNeedCoverages", {
      decisionItemId: args.decisionItemId,
      needItemId: args.needItemId,
      coveredQuantity: args.quantity,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "procurement.need_covered",
      entityType: "procurementDecision",
      entityId: decisionItem.decisionId,
      details: `${args.quantity} unit(s)`,
    });
    return id;
  },
});

/** Open purchase order lines for a variant, to carry a decision out on. */
export const openOrderLines = query({
  args: { token: v.string(), variantId: v.id("productVariants") },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const lines = await ctx.db
      .query("purchaseOrderItems")
      .withIndex("by_product_variant", (q) => q.eq("productVariantId", args.variantId))
      .take(200);
    const out = [];
    for (const line of lines) {
      const po = await ctx.db.get(line.purchaseOrderId);
      if (!po || po.status === "CANCELLED" || po.status === "COMPLETED") continue;
      const supplier = await ctx.db.get(po.supplierId);
      out.push({
        _id: line._id,
        orderCode: po.orderCode,
        status: po.status,
        supplierName: supplier?.name ?? "—",
        quantityOrdered: line.quantityOrdered,
        quantityFromDecisions: await decidedOnLine(ctx, line._id),
      });
    }
    return out;
  },
});

async function decidedOnLine(ctx: QueryCtx, purchaseOrderItemId: Id<"purchaseOrderItems">) {
  const rows = await ctx.db
    .query("decisionOrderLines")
    .withIndex("by_purchase_order_item", (q) => q.eq("purchaseOrderItemId", purchaseOrderItemId))
    .take(100);
  return rows.reduce((s, r) => s + r.quantity, 0);
}

/**
 * Says that (part of) a decision item was placed on a purchase order line. The line must be
 * for the same variant; a decision item cannot be ordered beyond what was decided, nor a
 * line be claimed by decisions beyond what it orders.
 */
export const linkToOrder = mutation({
  args: {
    token: v.string(),
    decisionItemId: v.id("procurementDecisionItems"),
    purchaseOrderItemId: v.id("purchaseOrderItems"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const decisionItem = await ctx.db.get(args.decisionItemId);
    const line = await ctx.db.get(args.purchaseOrderItemId);
    if (!decisionItem || !line) throw new Error("Decision or order line not found.");
    if (decisionItem.productVariantId !== line.productVariantId) {
      throw new Error("A decision can only be ordered on a line for the same product variant.");
    }
    const po = await ctx.db.get(line.purchaseOrderId);
    if (!po || po.status === "CANCELLED") throw new Error("That order is cancelled.");
    if (args.quantity <= 0) throw new Error("The ordered quantity must be positive.");
    const already = (
      await ctx.db
        .query("decisionOrderLines")
        .withIndex("by_decision_item", (q) => q.eq("decisionItemId", args.decisionItemId))
        .take(100)
    ).reduce((s, r) => s + r.quantity, 0);
    const decided = decisionItem.quantityDecided ?? 0;
    if (already + args.quantity > decided) {
      throw new Error(`Only ${Math.max(0, decided - already)} unit(s) of this decision are left to order.`);
    }
    const onLine = await decidedOnLine(ctx, line._id);
    if (onLine + args.quantity > line.quantityOrdered) {
      throw new Error(`That line orders ${line.quantityOrdered}; decisions already account for ${onLine}.`);
    }
    const id = await ctx.db.insert("decisionOrderLines", {
      decisionItemId: args.decisionItemId,
      purchaseOrderItemId: line._id,
      quantity: args.quantity,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "procurement.decision_ordered",
      entityType: "procurementDecision",
      entityId: decisionItem.decisionId,
      details: `${args.quantity} unit(s) on ${po.orderCode}`,
    });
    return id;
  },
});
