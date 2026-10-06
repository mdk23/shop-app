import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const OUTCOME = v.union(
  v.literal("DISPONIVEL"),
  v.literal("ALTERNATIVA"),
  v.literal("PROPOSTA_FUTURA"),
  v.literal("SEM_SOLUCAO_ADEQUADA")
);

export const listByDemand = query({
  args: { demandId: v.id("wantList") },
  handler: async (ctx, args) => {
    const responses = await ctx.db
      .query("demandResponses")
      .withIndex("by_demand", (q) => q.eq("demandId", args.demandId))
      .order("desc")
      .collect();
    return await Promise.all(
      responses.map(async (response) => {
        const items = await ctx.db
          .query("demandResponseItems")
          .withIndex("by_response", (q) => q.eq("responseId", response._id))
          .collect();
        return { ...response, items };
      })
    );
  },
});

/**
 * Records what we answered to a request: available, an alternative, a future proposal
 * or nothing suitable. If it happened during a customer contact, the link is kept.
 */
export const record = mutation({
  args: {
    token: v.string(),
    demandId: v.id("wantList"),
    outcome: OUTCOME,
    interactionId: v.optional(v.id("customerInteractions")),
    items: v.array(
      v.object({
        variantId: v.optional(v.id("productVariants")),
        description: v.string(),
        quantity: v.optional(v.number()),
        price: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    if (!(await ctx.db.get(args.demandId))) throw new Error("Request not found.");
    if (args.outcome !== "SEM_SOLUCAO_ADEQUADA" && args.items.length === 0) {
      throw new Error("Describe what was offered.");
    }
    for (const item of args.items) {
      if (!item.description.trim()) throw new Error("Each offered item needs a description.");
      if (item.price !== undefined && item.price < 0) throw new Error("Prices cannot be negative.");
    }
    const now = Date.now();
    const id = await ctx.db.insert("demandResponses", {
      demandId: args.demandId,
      interactionId: args.interactionId,
      outcome: args.outcome,
      presentedAt: now,
      registeredAt: now,
    });
    for (const item of args.items) {
      const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
      await ctx.db.insert("demandResponseItems", {
        responseId: id,
        productId: variant?.productId,
        variantId: item.variantId,
        presentedDescription: item.description.trim(),
        proposedQuantity: item.quantity,
        proposedPrice: item.price,
      });
    }
    if (args.interactionId) {
      await ctx.db.insert("interactionDemands", {
        interactionId: args.interactionId,
        demandId: args.demandId,
        role: "RESPONSE",
        registeredAt: now,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "demand.responded",
      entityType: "wantList",
      entityId: args.demandId,
      details: args.outcome,
    });
    return id;
  },
});
