import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

/** Payment terms the shop offers (e.g. 30 dias, sinal de 50%). */
export const listPaymentTerms = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("paymentTerms").collect();
    return rows.sort((a, b) => a.days - b.days);
  },
});

export const createPaymentTerm = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    days: v.number(),
    depositPercent: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Name the payment term.");
    if (args.days < 0) throw new Error("Days cannot be negative.");
    if (args.depositPercent !== undefined && (args.depositPercent < 0 || args.depositPercent > 100)) {
      throw new Error("The deposit must be between 0 and 100%.");
    }
    const id = await ctx.db.insert("paymentTerms", {
      name,
      days: args.days,
      depositPercent: args.depositPercent,
      active: true,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "payment_term.created",
      entityType: "paymentTerm",
      entityId: id,
      details: name,
    });
    return id;
  },
});

export const setPaymentTermActive = mutation({
  args: { token: v.string(), id: v.id("paymentTerms"), active: v.boolean() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    if (!(await ctx.db.get(args.id))) throw new Error("Payment term not found.");
    await ctx.db.patch(args.id, { active: args.active });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: args.active ? "payment_term.activated" : "payment_term.deactivated",
      entityType: "paymentTerm",
      entityId: args.id,
    });
  },
});

/** Pricing policies: margin target and rounding rule. A new policy closes the one before it. */
export const listPricingPolicies = query({
  args: {},
  handler: async (ctx) => {
    return (await ctx.db.query("pricingPolicies").collect()).sort((a, b) => b.validFrom - a.validFrom);
  },
});

export const createPricingPolicy = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    marginPercent: v.optional(v.number()),
    roundingRule: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Name the policy.");
    if (args.marginPercent !== undefined && (args.marginPercent < 0 || args.marginPercent >= 100)) {
      throw new Error("The margin must be at least 0 and below 100%.");
    }
    const now = Date.now();
    const current = await ctx.db.query("pricingPolicies").collect();
    for (const policy of current) {
      if (policy.validTo === undefined) await ctx.db.patch(policy._id, { validTo: now });
    }
    const id = await ctx.db.insert("pricingPolicies", {
      name,
      marginPercent: args.marginPercent,
      roundingRule: args.roundingRule?.trim() || undefined,
      validFrom: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "pricing_policy.created",
      entityType: "pricingPolicy",
      entityId: id,
      details: name,
    });
    return id;
  },
});

/** Product positioning (essential, core, premium). A new position closes the previous one. */
export const currentPositioning = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("productPositioning")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    return rows.find((r) => r.validTo === undefined) ?? null;
  },
});

export const setPositioning = mutation({
  args: {
    token: v.string(),
    productId: v.id("products"),
    positioning: v.union(v.literal("ESSENTIAL"), v.literal("CORE"), v.literal("PREMIUM")),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    if (!(await ctx.db.get(args.productId))) throw new Error("Product not found.");
    const now = Date.now();
    const rows = await ctx.db
      .query("productPositioning")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    const open = rows.find((r) => r.validTo === undefined);
    if (open?.positioning === args.positioning) return open._id;
    if (open) await ctx.db.patch(open._id, { validTo: now });
    const id = await ctx.db.insert("productPositioning", {
      productId: args.productId,
      positioning: args.positioning,
      validFrom: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "product.positioning_set",
      entityType: "product",
      entityId: args.productId,
      details: args.positioning,
    });
    return id;
  },
});
