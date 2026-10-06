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

/** One landed-cost calculation: the goods plus freight, insurance, duties and handling. */
export const create = mutation({
  args: {
    token: v.string(),
    calculatedFor: v.number(),
    methodVersion: v.optional(v.string()),
    components: v.array(
      v.object({
        componentType: v.string(),
        value: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    if (args.components.length === 0) throw new Error("Add at least one cost component.");
    for (const c of args.components) {
      if (!c.componentType.trim()) throw new Error("Name each cost component.");
      if (c.value < 0) throw new Error("Costs cannot be negative.");
    }
    const currencyId = await mznCurrency(ctx);
    const id = await ctx.db.insert("landedCosts", {
      calculatedFor: args.calculatedFor,
      methodVersion: args.methodVersion?.trim() || "manual",
    });
    for (const c of args.components) {
      await ctx.db.insert("landedCostComponents", {
        landedCostId: id,
        componentType: c.componentType.trim(),
        componentValue: c.value,
        currencyId,
      });
    }
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
