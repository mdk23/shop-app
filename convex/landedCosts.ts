import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

async function mznCurrency(ctx: MutationCtx): Promise<Id<"currencies">> {
  const existing = await ctx.db
    .query("currencies")
    .withIndex("by_iso_code", (q) => q.eq("isoCode", "MZN"))
    .unique();
  if (existing) return existing._id;
  return await ctx.db.insert("currencies", { isoCode: "MZN", name: "Metical", symbol: "MT", decimalPlaces: 2 });
}

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const costs = await ctx.db.query("landedCosts").order("desc").take(100);
    return await Promise.all(
      costs.map(async (cost) => {
        const components = await ctx.db
          .query("landedCostComponents")
          .withIndex("by_landed_cost", (q) => q.eq("landedCostId", cost._id))
          .collect();
        return {
          ...cost,
          components,
          total: components.reduce((s, c) => s + c.componentValue, 0),
        };
      })
    );
  },
});

const componentsValidator = v.array(
  v.object({
    componentType: v.string(),
    value: v.number(),
  })
);

type ComponentInput = { componentType: string; value: number };

function validateComponents(components: ComponentInput[]) {
  if (components.length === 0) throw new Error("Add at least one cost component.");
  for (const c of components) {
    if (!c.componentType.trim()) throw new Error("Name each cost component.");
    if (c.value < 0) throw new Error("Costs cannot be negative.");
  }
}

async function insertComponents(ctx: MutationCtx, landedCostId: Id<"landedCosts">, components: ComponentInput[]) {
  const currencyId = await mznCurrency(ctx);
  for (const c of components) {
    await ctx.db.insert("landedCostComponents", {
      landedCostId,
      componentType: c.componentType.trim(),
      componentValue: c.value,
      currencyId,
    });
  }
}

async function deleteComponents(ctx: MutationCtx, landedCostId: Id<"landedCosts">) {
  const existing = await ctx.db
    .query("landedCostComponents")
    .withIndex("by_landed_cost", (q) => q.eq("landedCostId", landedCostId))
    .collect();
  for (const c of existing) await ctx.db.delete(c._id);
}

/** One landed-cost calculation: the goods plus freight, insurance, duties and handling. */
export const create = mutation({
  args: {
    token: v.string(),
    calculatedFor: v.number(),
    methodVersion: v.optional(v.string()),
    components: componentsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    validateComponents(args.components);
    const id = await ctx.db.insert("landedCosts", {
      calculatedFor: args.calculatedFor,
      methodVersion: args.methodVersion?.trim() || "manual",
    });
    await insertComponents(ctx, id, args.components);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "landed_cost.recorded",
      entityType: "landedCost",
      entityId: id,
      details: `${args.components.length} component(s)`,
    });
    return id;
  },
});

/** Edit a calculation: date, method and the full list of cost components (replaced wholesale). */
export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("landedCosts"),
    calculatedFor: v.number(),
    methodVersion: v.optional(v.string()),
    components: componentsValidator,
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const cost = await ctx.db.get(args.id);
    if (!cost) throw new Error("Landed cost not found.");
    validateComponents(args.components);
    await ctx.db.patch(args.id, {
      calculatedFor: args.calculatedFor,
      methodVersion: args.methodVersion?.trim() || "manual",
    });
    await deleteComponents(ctx, args.id);
    await insertComponents(ctx, args.id, args.components);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "landed_cost.updated",
      entityType: "landedCost",
      entityId: args.id,
      details: `${args.components.length} component(s)`,
    });
    return null;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("landedCosts") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const cost = await ctx.db.get(args.id);
    if (!cost) throw new Error("Landed cost not found.");
    await deleteComponents(ctx, args.id);
    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "landed_cost.deleted",
      entityType: "landedCost",
      entityId: args.id,
    });
    return null;
  },
});
