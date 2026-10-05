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

export const listOpen = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("complaints")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .order("desc")
      .collect();
  },
});

export const list = query({
  args: { status: v.optional(v.union(v.literal("OPEN"), v.literal("RESOLVED"), v.literal("REJECTED"))) },
  handler: async (ctx, args) => {
    const rows = args.status
      ? await ctx.db
          .query("complaints")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take(200)
      : await ctx.db.query("complaints").order("desc").take(200);
    return await Promise.all(
      rows.map(async (row) => ({
        ...row,
        customerName: row.customerId ? (await ctx.db.get(row.customerId))?.name : undefined,
      }))
    );
  },
});

export const listBySale = query({
  args: { saleId: v.id("sales") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("complaints")
      .withIndex("by_sale", (q) => q.eq("saleId", args.saleId))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    saleId: v.optional(v.id("sales")),
    customerId: v.optional(v.id("customers")),
    description: v.string(),
  },
  handler: async (ctx, args): Promise<Id<"complaints">> => {
    const actor = await authorize(ctx, args.token, "pos.use");
    const description = args.description.trim();
    if (!description) throw new Error("Describe the complaint.");

    let customerId = args.customerId;
    if (args.saleId) {
      const sale = await ctx.db.get(args.saleId);
      if (!sale) throw new Error("Sale not found.");
      customerId = sale.customerId;
    } else if (customerId && !(await ctx.db.get(customerId))) {
      throw new Error("Customer not found.");
    }

    const id = await ctx.db.insert("complaints", {
      customerId,
      saleId: args.saleId,
      description,
      status: "OPEN",
      createdByUsername: actor.username,
      createdAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "complaint.created",
      entityType: "complaint",
      entityId: id,
      details: description,
    });
    return id;
  },
});

/** `RECUSA` closes the complaint as rejected; any other resolution closes it as resolved. */
export const resolve = mutation({
  args: {
    token: v.string(),
    id: v.id("complaints"),
    resolutionType: RESOLUTION,
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "returns.process");
    const complaint = await ctx.db.get(args.id);
    if (!complaint) throw new Error("Complaint not found.");
    if (complaint.status !== "OPEN") throw new Error("This complaint is already closed.");

    const status = args.resolutionType === "RECUSA" ? "REJECTED" : "RESOLVED";
    const now = Date.now();
    const resolutionId = await ctx.db.insert("resolutions", {
      resolutionType: args.resolutionType,
      decidedAt: now,
    });
    await ctx.db.patch(args.id, {
      status,
      resolutionId,
      resolutionNotes: args.notes?.trim() || undefined,
      resolvedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "complaint.resolved",
      entityType: "complaint",
      entityId: args.id,
      details: `${status}: ${args.resolutionType}`,
    });
  },
});
