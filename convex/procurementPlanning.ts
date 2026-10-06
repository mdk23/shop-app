import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const itemInput = v.object({
  variantId: v.id("productVariants"),
  quantity: v.number(),
});

async function variantLabel(ctx: QueryCtx, variantId?: Id<"productVariants">) {
  if (!variantId) return "—";
  const variant = await ctx.db.get(variantId);
  if (!variant) return "—";
  const product = await ctx.db.get(variant.productId);
  return `${product?.name ?? "—"} ${[variant.color, variant.size].filter(Boolean).join(" / ")}`.trim();
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
        return {
          ...need,
          items: await Promise.all(
            items.map(async (item) => ({ ...item, label: await variantLabel(ctx, item.variantId) }))
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
              .collect();
            return { ...item, label: await variantLabel(ctx, item.variantId), coverages: coverages.length };
          })
        );
        return { ...decision, items: itemsOut };
      })
    );
    return { needs: needsOut, decisions: decisionsOut };
  },
});

export const createNeed = mutation({
  args: { token: v.string(), items: v.array(itemInput) },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    if (args.items.length === 0) throw new Error("Add at least one item.");
    const id = await ctx.db.insert("procurementNeeds", { recognizedAt: Date.now() });
    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantities must be positive.");
      const variant = await ctx.db.get(item.variantId);
      if (!variant) throw new Error("Product variant not found.");
      await ctx.db.insert("procurementNeedItems", {
        needId: id,
        productId: variant.productId,
        variantId: item.variantId,
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
        variantId: item.variantId,
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
    if (decisionItem.variantId !== needItem.variantId) {
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
