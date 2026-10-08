import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const TERM_TYPE = v.union(
  v.literal("PRODUCTS"),
  v.literal("PRICES"),
  v.literal("DEADLINES"),
  v.literal("RESPONSIBILITIES"),
  v.literal("CUSTOMIZATION")
);

/**
 * The supplier's open relation, opened now if it has none. Purchase orders are placed
 * under it, so the terms in force for an order are always reachable from the order.
 */
export async function openRelationFor(
  ctx: MutationCtx,
  supplierId: Id<"suppliers">
): Promise<Id<"supplyRelations">> {
  const relations = await ctx.db
    .query("supplyRelations")
    .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
    .collect();
  const open = relations.find((r) => r.endedAt === undefined);
  if (open) return open._id;
  return await ctx.db.insert("supplyRelations", { supplierId, startedAt: Date.now() });
}

/** Relations with a supplier, each with its terms and the latest orders placed under it. */
export const listBySupplier = query({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, args) => {
    const relations = await ctx.db
      .query("supplyRelations")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .collect();
    return await Promise.all(
      relations.map(async (rel) => ({
        ...rel,
        terms: await ctx.db
          .query("partnershipTerms")
          .withIndex("by_relation", (q) => q.eq("supplyRelationId", rel._id))
          .collect(),
        orders: (
          await ctx.db
            .query("purchaseOrders")
            .withIndex("by_supply_relation", (q) => q.eq("supplyRelationId", rel._id))
            .order("desc")
            .take(50)
        ).map((po) => ({ _id: po._id, orderCode: po.orderCode, status: po.status })),
      }))
    );
  },
});

export const createRelation = mutation({
  args: { token: v.string(), supplierId: v.id("suppliers"), startedAt: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    if (!(await ctx.db.get(args.supplierId))) throw new Error("Supplier not found.");
    const open = await ctx.db
      .query("supplyRelations")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .collect();
    if (open.some((r) => r.endedAt === undefined)) {
      throw new Error("This supplier already has an open relation.");
    }
    const id = await ctx.db.insert("supplyRelations", {
      supplierId: args.supplierId,
      startedAt: args.startedAt ?? Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "supplier.relation_opened",
      entityType: "supplier",
      entityId: args.supplierId,
    });
    return id;
  },
});

/** Adds a term. The previous term of the same type is closed so only one is current. */
export const addTerm = mutation({
  args: {
    token: v.string(),
    supplyRelationId: v.id("supplyRelations"),
    termType: TERM_TYPE,
    content: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const rel = await ctx.db.get(args.supplyRelationId);
    if (!rel) throw new Error("Relation not found.");
    const content = args.content.trim();
    if (!content) throw new Error("Write the term.");
    const now = Date.now();
    const current = await ctx.db
      .query("partnershipTerms")
      .withIndex("by_relation", (q) => q.eq("supplyRelationId", args.supplyRelationId))
      .collect();
    for (const term of current) {
      if (term.termType === args.termType && term.validTo === undefined) {
        await ctx.db.patch(term._id, { validTo: now });
      }
    }
    await ctx.db.insert("partnershipTerms", {
      supplyRelationId: args.supplyRelationId,
      termType: args.termType,
      content,
      validFrom: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "supplier.term_set",
      entityType: "supplyRelation",
      entityId: args.supplyRelationId,
      details: `${args.termType}: ${content}`,
    });
  },
});
