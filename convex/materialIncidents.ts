import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const KIND = v.union(v.literal("DAMAGE"), v.literal("LOSS"), v.literal("THEFT"), v.literal("OTHER"));

export const list = query({
  args: {},
  handler: async (ctx) => {
    const incidents = await ctx.db.query("materialIncidents").order("desc").take(200);
    return await Promise.all(
      incidents.map(async (incident) => {
        const items = await ctx.db
          .query("materialIncidentItems")
          .withIndex("by_incident", (q) => q.eq("incidentId", incident._id))
          .collect();
        const named = await Promise.all(
          items.map(async (item) => {
            const variant = await ctx.db.get(item.variantId);
            const product = variant ? await ctx.db.get(variant.productId) : null;
            const movement = item.movementId ? await ctx.db.get(item.movementId) : null;
            return {
              ...item,
              label: product ? `${product.name} ${[variant?.color, variant?.size].filter(Boolean).join(" / ")}`.trim() : "—",
              quantity: movement ? Math.abs(movement.quantity) : null,
            };
          })
        );
        return { ...incident, items: named };
      })
    );
  },
});

/**
 * Records damage, loss or theft. Damage and loss change stock, so each item writes a
 * DAMAGE or LOSS movement in the ledger and keeps a link to it. "Other" only records.
 */
export const create = mutation({
  args: {
    token: v.string(),
    branchId: v.id("branches"),
    incidentType: KIND,
    occurredAt: v.number(),
    notes: v.optional(v.string()),
    items: v.array(
      v.object({
        variantId: v.id("productVariants"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "inventory.adjust");
    if (!(await ctx.db.get(args.branchId))) throw new Error("Branch not found.");
    if (args.items.length === 0) throw new Error("Add at least one item.");
    for (const item of args.items) {
      if (item.quantity <= 0) throw new Error("Quantities must be positive.");
    }
    const id = await ctx.db.insert("materialIncidents", {
      incidentType: args.incidentType,
      occurredAt: args.occurredAt,
      knownAt: Date.now(),
    });
    const movementType = args.incidentType === "DAMAGE" ? "DAMAGE" : args.incidentType === "OTHER" ? null : "LOSS";
    const reason = args.notes?.trim() ? ` — ${args.notes.trim()}` : "";
    for (const item of args.items) {
      const variant = await ctx.db.get(item.variantId);
      if (!variant) throw new Error("Product variant not found.");
      let movementId: Id<"inventoryMovements"> | undefined;
      if (movementType) {
        movementId = await ctx.runMutation(internal.inventory.mutateStock, {
          productVariantId: item.variantId,
          branchId: args.branchId,
          quantity: -item.quantity,
          movementType,
          referenceType: "material_incident",
          referenceId: String(id),
          notes: `${args.incidentType}${reason}`,
          userId: actor._id,
          username: actor.username,
        });
      }
      await ctx.db.insert("materialIncidentItems", {
        incidentId: id,
        variantId: item.variantId,
        movementId,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "material_incident.recorded",
      entityType: "materialIncident",
      entityId: id,
      details: `${args.incidentType}, ${args.items.length} item(s)`,
    });
    return id;
  },
});
