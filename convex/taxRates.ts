import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("taxRates").collect();
    return rows.sort((a, b) => a.percentage - b.percentage);
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    percentage: v.number(),
    exemptionCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Tax rate name is required.");
    if (args.percentage < 0 || args.percentage > 100) {
      throw new Error("Tax percentage must be between 0 and 100.");
    }
    const now = Date.now();
    const id = await ctx.db.insert("taxRates", {
      name,
      percentage: args.percentage,
      exemptionCode: args.exemptionCode?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "taxRate.created",
      entityType: "taxRate",
      entityId: id,
      details: `Created IVA rate "${name}" (${args.percentage}%)`,
    });
    return id;
  },
});

/** Deactivating keeps the row: existing sale lines keep their snapshotted rate. */
export const deactivate = mutation({
  args: { token: v.string(), id: v.id("taxRates") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const rate = await ctx.db.get(args.id);
    if (!rate) throw new Error("Tax rate not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "taxRate.deactivated",
      entityType: "taxRate",
      entityId: args.id,
      details: `Deactivated IVA rate "${rate.name}"`,
    });
  },
});
