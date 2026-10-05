import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const score = (n: number, label: string) => {
  if (n < 1 || n > 5) throw new Error(`${label} must be between 1 and 5.`);
};

export const listBySupplier = query({
  args: { supplierId: v.id("suppliers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("supplierEvaluations")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
      .order("desc")
      .take(100);
  },
});

/** Average quality and punctuality per supplier, plus how many non-conformities are still open. */
export const scorecard = query({
  args: {},
  handler: async (ctx) => {
    const suppliers = await ctx.db.query("suppliers").collect();
    return await Promise.all(
      suppliers.map(async (s) => {
        const evals = await ctx.db
          .query("supplierEvaluations")
          .withIndex("by_supplier", (q) => q.eq("supplierId", s._id))
          .collect();
        const issues = await ctx.db
          .query("nonConformities")
          .withIndex("by_supplier", (q) => q.eq("supplierId", s._id))
          .collect();
        let openIssues = 0;
        for (const issue of issues) {
          const t = await ctx.db
            .query("nonConformityTreatments")
            .withIndex("by_non_conformity", (q) => q.eq("nonConformityId", issue._id))
            .first();
          if (!t) openIssues += 1;
        }
        const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
        return {
          supplierId: s._id,
          name: s.name,
          evaluations: evals.length,
          avgQuality: avg(evals.map((e) => e.qualityScore)),
          avgPunctuality: avg(evals.map((e) => e.punctualityPercent)),
          nonConformities: issues.length,
          openNonConformities: openIssues,
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    supplierId: v.id("suppliers"),
    qualityScore: v.number(),
    punctualityPercent: v.number(),
    costScore: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    if (!(await ctx.db.get(args.supplierId))) throw new Error("Supplier not found.");
    score(args.qualityScore, "Quality");
    if (args.costScore !== undefined) score(args.costScore, "Cost");
    if (args.punctualityPercent < 0 || args.punctualityPercent > 100) {
      throw new Error("Punctuality must be between 0 and 100.");
    }
    const id = await ctx.db.insert("supplierEvaluations", {
      supplierId: args.supplierId,
      qualityScore: args.qualityScore,
      punctualityPercent: args.punctualityPercent,
      costScore: args.costScore,
      notes: args.notes?.trim() || undefined,
      evaluatedByUsername: actor.username,
      evaluatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "supplier.evaluated",
      entityType: "supplier",
      entityId: args.supplierId,
      details: `Quality ${args.qualityScore}, punctuality ${args.punctualityPercent}%`,
    });
    return id;
  },
});
