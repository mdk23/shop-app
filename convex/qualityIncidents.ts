import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "purchasing.view");
    const incidents = await ctx.db.query("qualityIncidents").order("desc").take(200);
    return await Promise.all(
      incidents.map(async (incident) => {
        const items = await ctx.db
          .query("qualityIncidentItems")
          .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
          .collect();
        const named = await Promise.all(
          items.map(async (item) => {
            const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
            const product = variant ? await ctx.db.get(variant.productId) : null;
            return {
              ...item,
              label: product
                ? `${product.name} ${[variant?.color, variant?.size].filter(Boolean).join(" / ")}`.trim()
                : "—",
            };
          })
        );
        const links = await ctx.db
          .query("complaintQualityIncidents")
          .withIndex("by_incident", (q) => q.eq("qualityIncidentId", incident._id))
          .collect();
        return { ...incident, items: named, complaintIds: links.map((l) => l.complaintId) };
      })
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    description: v.string(),
    complaintId: v.optional(v.id("complaints")),
    items: v.array(
      v.object({
        variantId: v.optional(v.id("productVariants")),
        affectedQuantity: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.receive");
    const description = args.description.trim();
    if (!description) throw new Error("Describe the quality problem.");
    if (args.complaintId && !(await ctx.db.get(args.complaintId))) throw new Error("Complaint not found.");
    for (const item of args.items) {
      if (item.affectedQuantity !== undefined && item.affectedQuantity <= 0) {
        throw new Error("Affected quantities must be positive.");
      }
    }
    const id = await ctx.db.insert("qualityIncidents", { description, recognizedAt: Date.now() });
    for (const item of args.items) {
      const variant = item.variantId ? await ctx.db.get(item.variantId) : null;
      await ctx.db.insert("qualityIncidentItems", {
        incidentId: id,
        productId: variant?.productId,
        variantId: item.variantId,
        affectedQuantity: item.affectedQuantity,
      });
    }
    if (args.complaintId) {
      await ctx.db.insert("complaintQualityIncidents", {
        complaintId: args.complaintId,
        qualityIncidentId: id,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "quality_incident.recorded",
      entityType: "qualityIncident",
      entityId: id,
      details: description,
    });
    return id;
  },
});
