import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const TREATMENT = v.union(
  v.literal("RETURN_TO_SUPPLIER"),
  v.literal("DISCOUNT"),
  v.literal("ACCEPT_AS_IS"),
  v.literal("DESTROY")
);

/** Non-conformities, newest first, with variant name and treatments. Open = no treatment yet. */
export const list = query({
  args: { supplierId: v.optional(v.id("suppliers")) },
  handler: async (ctx, args) => {
    const rows = args.supplierId
      ? await ctx.db
          .query("nonConformities")
          .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
          .order("desc")
          .take(200)
      : await ctx.db.query("nonConformities").order("desc").take(200);
    return await Promise.all(
      rows.map(async (row) => {
        const variant = await ctx.db.get(row.variantId);
        const product = variant ? await ctx.db.get(variant.productId) : null;
        const treatments = await ctx.db
          .query("nonConformityTreatments")
          .withIndex("by_non_conformity", (q) => q.eq("nonConformityId", row._id))
          .collect();
        return {
          ...row,
          productName: product?.name ?? "—",
          variantLabel: variant ? [variant.color, variant.size].filter(Boolean).join(" / ") || variant.sku : "—",
          treatments,
          open: treatments.length === 0,
        };
      })
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    variantId: v.id("productVariants"),
    supplierId: v.optional(v.id("suppliers")),
    receiptItemId: v.optional(v.id("purchaseReceiptItems")),
    description: v.string(),
    affectedQuantity: v.number(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.receive");
    const description = args.description.trim();
    if (!description) throw new Error("Describe the problem.");
    if (args.affectedQuantity <= 0) throw new Error("The affected quantity must be positive.");
    if (!(await ctx.db.get(args.variantId))) throw new Error("Product variant not found.");
    if (args.supplierId && !(await ctx.db.get(args.supplierId))) throw new Error("Supplier not found.");
    const id = await ctx.db.insert("nonConformities", {
      variantId: args.variantId,
      supplierId: args.supplierId,
      receiptItemId: args.receiptItemId,
      description,
      affectedQuantity: args.affectedQuantity,
      recognizedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "non_conformity.recorded",
      entityType: "nonConformity",
      entityId: id,
      details: `${args.affectedQuantity} × ${description}`,
    });
    return id;
  },
});

export const treat = mutation({
  args: {
    token: v.string(),
    nonConformityId: v.id("nonConformities"),
    treatmentType: TREATMENT,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const row = await ctx.db.get(args.nonConformityId);
    if (!row) throw new Error("Non-conformity not found.");
    const existing = await ctx.db
      .query("nonConformityTreatments")
      .withIndex("by_non_conformity", (q) => q.eq("nonConformityId", args.nonConformityId))
      .first();
    if (existing) throw new Error("This non-conformity already has a treatment.");
    await ctx.db.insert("nonConformityTreatments", {
      nonConformityId: args.nonConformityId,
      treatmentType: args.treatmentType,
      notes: args.notes?.trim() || undefined,
      decidedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "non_conformity.treated",
      entityType: "nonConformity",
      entityId: args.nonConformityId,
      details: args.treatmentType,
    });
  },
});
