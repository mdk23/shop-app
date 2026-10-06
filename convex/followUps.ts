import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const RESOLUTION = v.union(
  v.literal("TROCA"),
  v.literal("DEVOLUCAO"),
  v.literal("REEMBOLSO"),
  v.literal("CREDITO"),
  v.literal("REPARACAO"),
  v.literal("RECUSA")
);

/* ---------- Size equivalences (e.g. EU 42 ≈ UK 8) ---------- */

export const listSizeEquivalences = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("sizeEquivalences").collect();
    return await Promise.all(
      rows.map(async (row) => ({
        ...row,
        fromName: (await ctx.db.get(row.fromSizeId))?.name ?? "—",
        toName: (await ctx.db.get(row.toSizeId))?.name ?? "—",
      }))
    );
  },
});

export const createSizeEquivalence = mutation({
  args: {
    token: v.string(),
    fromSizeId: v.id("sizes"),
    toSizeId: v.id("sizes"),
    certainty: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    if (args.fromSizeId === args.toSizeId) throw new Error("Pick two different sizes.");
    const certainty = args.certainty.trim();
    if (!certainty) throw new Error("Say how certain the equivalence is.");
    if (!(await ctx.db.get(args.fromSizeId)) || !(await ctx.db.get(args.toSizeId))) {
      throw new Error("Size not found.");
    }
    const id = await ctx.db.insert("sizeEquivalences", {
      fromSizeId: args.fromSizeId,
      toSizeId: args.toSizeId,
      certainty,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "size_equivalence.created",
      entityType: "size",
      entityId: args.fromSizeId,
      details: certainty,
    });
    return id;
  },
});

/* ---------- Follow-up commitments (promises made after a complaint or return) ---------- */

export const listFollowUps = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("followUpCommitments").order("desc").take(200);
    return await Promise.all(
      rows.map(async (row) => {
        const origins = await ctx.db
          .query("followUpOrigins")
          .withIndex("by_follow_up", (q) => q.eq("followUpId", row._id))
          .collect();
        const satisfactions = await ctx.db
          .query("followUpSatisfactions")
          .withIndex("by_follow_up", (q) => q.eq("followUpId", row._id))
          .collect();
        const participant = await ctx.db
          .query("relationParticipants")
          .withIndex("by_relation", (q) => q.eq("relationId", row.relationId))
          .first();
        const customer = participant ? await ctx.db.get(participant.personId) : null;
        return {
          ...row,
          customerName: customer?.name ?? "—",
          origins: origins.length,
          satisfied: satisfactions.length > 0,
        };
      })
    );
  },
});

/**
 * Records a promise made to a customer. It is tied to a business relation: the one
 * the complaint or return already has, or a new relation opened for the customer.
 */
export const commitFollowUp = mutation({
  args: {
    token: v.string(),
    customerId: v.id("customers"),
    description: v.string(),
    dueAt: v.optional(v.number()),
    complaintId: v.optional(v.id("complaints")),
    salesReturnId: v.optional(v.id("salesReturns")),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const description = args.description.trim();
    if (!description) throw new Error("Describe what was promised.");
    if (!(await ctx.db.get(args.customerId))) throw new Error("Customer not found.");
    if (args.complaintId && !(await ctx.db.get(args.complaintId))) throw new Error("Complaint not found.");
    if (args.salesReturnId && !(await ctx.db.get(args.salesReturnId))) throw new Error("Return not found.");

    const now = Date.now();
    const existing = await ctx.db
      .query("relationParticipants")
      .withIndex("by_person", (q) => q.eq("personId", args.customerId))
      .first();
    let relationId: Id<"businessRelations">;
    if (existing) {
      relationId = existing.relationId;
    } else {
      relationId = await ctx.db.insert("businessRelations", { startedAt: now, registeredAt: now });
      await ctx.db.insert("relationParticipants", {
        relationId,
        personId: args.customerId,
        role: "cliente",
        validFrom: now,
      });
    }

    const id = await ctx.db.insert("followUpCommitments", {
      relationId,
      description,
      assumedAt: now,
      dueAt: args.dueAt,
    });
    if (args.complaintId || args.salesReturnId) {
      await ctx.db.insert("followUpOrigins", {
        followUpId: id,
        complaintId: args.complaintId,
        salesReturnId: args.salesReturnId,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "follow_up.committed",
      entityType: "customer",
      entityId: args.customerId,
      details: description,
    });
    return id;
  },
});

/** The customer confirmed the promise was kept to their satisfaction. */
export const recordSatisfaction = mutation({
  args: { token: v.string(), followUpId: v.id("followUpCommitments") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    if (!(await ctx.db.get(args.followUpId))) throw new Error("Follow-up not found.");
    const now = Date.now();
    const id = await ctx.db.insert("followUpSatisfactions", {
      followUpId: args.followUpId,
      satisfiedAt: now,
      registeredAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "follow_up.satisfied",
      entityType: "followUpCommitment",
      entityId: args.followUpId,
    });
    return id;
  },
});

/* ---------- Resolution succession (a resolution replaced by a new one) ---------- */

/**
 * Replaces a decided resolution with a new one (e.g. a refund promised as a store
 * credit later). The old and new resolution are linked, and the complaint is pointed
 * at the new one when it still points at the old one.
 */
export const supersedeResolution = mutation({
  args: {
    token: v.string(),
    previousResolutionId: v.id("resolutions"),
    resolutionType: RESOLUTION,
    complaintId: v.optional(v.id("complaints")),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "returns.process");
    if (!(await ctx.db.get(args.previousResolutionId))) throw new Error("Resolution not found.");
    const nextResolutionId = await ctx.db.insert("resolutions", {
      resolutionType: args.resolutionType,
      decidedAt: Date.now(),
    });
    await ctx.db.insert("resolutionSuccessions", {
      previousResolutionId: args.previousResolutionId,
      nextResolutionId,
    });
    if (args.complaintId) {
      const complaint = await ctx.db.get(args.complaintId);
      if (complaint?.resolutionId === args.previousResolutionId) {
        await ctx.db.patch(args.complaintId, { resolutionId: nextResolutionId });
      }
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "resolution.superseded",
      entityType: "resolution",
      entityId: args.previousResolutionId,
      details: `→ ${args.resolutionType}`,
    });
    return nextResolutionId;
  },
});
