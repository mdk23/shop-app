import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { formatVariantLabel, variantNames } from "./lib/variantNames";

const SOURCE = v.union(v.literal("RECEIPT"), v.literal("STOCK"), v.literal("CUSTOMER"));

const TREATMENT = v.union(
  v.literal("RETURN_TO_SUPPLIER"),
  v.literal("DISCOUNT"),
  v.literal("ACCEPT_AS_IS"),
  v.literal("DESTROY")
);

/** Quality issues, newest first, with item names and linked complaints. Open = not treated yet. */
export const list = query({
  args: {
    token: v.string(),
    supplierId: v.optional(v.id("suppliers")),
    source: v.optional(SOURCE),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const rows = args.supplierId
      ? await ctx.db
          .query("qualityIssues")
          .withIndex("by_supplier", (q) => q.eq("supplierId", args.supplierId))
          .order("desc")
          .take(200)
      : args.source
        ? await ctx.db
            .query("qualityIssues")
            .withIndex("by_source", (q) => q.eq("source", args.source!))
            .order("desc")
            .take(200)
        : await ctx.db.query("qualityIssues").order("desc").take(200);
    return await Promise.all(
      rows
        .filter((row) => !args.source || row.source === args.source)
        .map(async (row) => {
          const items = await ctx.db
            .query("qualityIssueItems")
            .withIndex("by_issue", (q) => q.eq("issueId", row._id))
            .collect();
          const named = await Promise.all(
            items.map(async (item) => {
              const variant = await ctx.db.get(item.productVariantId);
              const product = variant ? await ctx.db.get(variant.productId) : null;
              const variantLabel = variant
                ? formatVariantLabel(await variantNames(ctx, variant), variant.sku)
                : "";
              return { ...item, label: product ? `${product.name} ${variantLabel}`.trim() : "—" };
            })
          );
          const links = await ctx.db
            .query("complaintQualityIssues")
            .withIndex("by_issue", (q) => q.eq("qualityIssueId", row._id))
            .collect();
          const supplier = row.supplierId ? await ctx.db.get(row.supplierId) : null;
          return {
            ...row,
            items: named,
            affectedQuantity: named.reduce((s, i) => s + i.affectedQuantity, 0),
            supplierName: supplier?.name,
            complaintIds: links.map((l) => l.complaintId),
            open: row.treatment === undefined,
          };
        })
    );
  },
});

/**
 * Records a defect. From a receipt line (source RECEIPT) the supplier and product come
 * from the receipt; otherwise the products are listed by hand.
 */
export const create = mutation({
  args: {
    token: v.string(),
    source: SOURCE,
    description: v.string(),
    supplierId: v.optional(v.id("suppliers")),
    receiptItemId: v.optional(v.id("purchaseReceiptItems")),
    complaintId: v.optional(v.id("complaints")),
    items: v.array(
      v.object({
        productVariantId: v.id("productVariants"),
        affectedQuantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.receive");
    const description = args.description.trim();
    if (!description) throw new Error("Describe the problem.");
    if (args.items.length === 0) throw new Error("List at least one affected product.");
    for (const item of args.items) {
      if (item.affectedQuantity <= 0) throw new Error("The affected quantity must be positive.");
      if (!(await ctx.db.get(item.productVariantId))) throw new Error("Product variant not found.");
    }
    let supplierId = args.supplierId;
    if (args.receiptItemId) {
      if (args.source !== "RECEIPT") throw new Error("A receipt line can only be linked to a receipt issue.");
      const receiptItem = await ctx.db.get(args.receiptItemId);
      if (!receiptItem) throw new Error("Receipt line not found.");
      const receipt = await ctx.db.get(receiptItem.receiptId);
      supplierId = supplierId ?? receipt?.supplierId;
    }
    if (supplierId && !(await ctx.db.get(supplierId))) throw new Error("Supplier not found.");
    if (args.complaintId && !(await ctx.db.get(args.complaintId))) throw new Error("Complaint not found.");

    const id = await ctx.db.insert("qualityIssues", {
      source: args.source,
      description,
      supplierId,
      receiptItemId: args.receiptItemId,
      recognizedAt: Date.now(),
      createdBy: actor._id,
      createdByUsername: actor.username,
    });
    for (const item of args.items) {
      await ctx.db.insert("qualityIssueItems", {
        issueId: id,
        productVariantId: item.productVariantId,
        affectedQuantity: item.affectedQuantity,
      });
    }
    if (args.complaintId) {
      await ctx.db.insert("complaintQualityIssues", { complaintId: args.complaintId, qualityIssueId: id });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "quality_issue.recorded",
      entityType: "qualityIssue",
      entityId: id,
      details: `${args.source}: ${description}`,
    });
    return id;
  },
});

/** Records what was done about an issue. One treatment per issue; it closes the issue. */
export const treat = mutation({
  args: {
    token: v.string(),
    id: v.id("qualityIssues"),
    treatment: TREATMENT,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.manage");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Quality issue not found.");
    if (row.treatment) throw new Error("This issue already has a treatment.");
    await ctx.db.patch(args.id, {
      treatment: args.treatment,
      treatmentNotes: args.notes?.trim() || undefined,
      treatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "quality_issue.treated",
      entityType: "qualityIssue",
      entityId: args.id,
      details: args.treatment,
    });
  },
});
