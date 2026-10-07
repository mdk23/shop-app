import { v } from "convex/values";
import { mutation, query, QueryCtx } from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const STAGE = v.union(
  v.literal("OPEN"),
  v.literal("PROCEEDING"),
  v.literal("CONVERTED"),
  v.literal("FULFILLED"),
  v.literal("LOST")
);

const REASON = v.union(
  v.literal("SIZE"),
  v.literal("COLOR"),
  v.literal("PRICE"),
  v.literal("STOCK"),
  v.literal("OTHER")
);

const FINAL_STAGES: Doc<"demands">["stage"][] = ["CONVERTED", "FULFILLED", "LOST"];

async function withCustomerName(ctx: QueryCtx, rows: Doc<"demands">[]) {
  return await Promise.all(
    rows.map(async (row) => ({
      ...row,
      customerName: row.customerId ? (await ctx.db.get(row.customerId))?.name : undefined,
    }))
  );
}

/** Procuras view: every demand, newest first, optionally by stage or by lost-sale reason. */
export const list = query({
  args: { stage: v.optional(STAGE), reason: v.optional(REASON) },
  handler: async (ctx, args) => {
    const rows = args.reason
      ? await ctx.db
          .query("demands")
          .withIndex("by_reason", (q) => q.eq("reason", args.reason))
          .order("desc")
          .take(200)
      : args.stage
        ? await ctx.db
            .query("demands")
            .withIndex("by_stage", (q) => q.eq("stage", args.stage!))
            .order("desc")
            .take(200)
        : await ctx.db.query("demands").order("desc").take(200);
    const filtered = rows.filter(
      (r) => (!args.stage || r.stage === args.stage) && (!args.reason || r.reason === args.reason)
    );
    return await withCustomerName(ctx, filtered);
  },
});

/** Oportunidades view: demands that proceeded, whatever happened to them after. */
export const listOpportunities = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db
      .query("demands")
      .withIndex("by_proceeded_at", (q) => q.gt("proceededAt", 0))
      .order("desc")
      .take(200);
    return await withCustomerName(ctx, rows);
  },
});

export const listByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("demands")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(100);
  },
});

/** Count of demands per reason, for buying: which causes lose sales most. */
export const countByReason = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("demands").collect();
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (!row.reason) continue;
      counts[row.reason] = (counts[row.reason] ?? 0) + 1;
    }
    return counts;
  },
});

/** Records a demand. `proceeding` starts it straight on the Oportunidades board. */
export const create = mutation({
  args: {
    token: v.string(),
    description: v.string(),
    customerId: v.optional(v.id("customers")),
    productId: v.optional(v.id("products")),
    productVariantId: v.optional(v.id("productVariants")),
    categoryId: v.optional(v.id("categories")),
    sizeId: v.optional(v.id("sizes")),
    colorId: v.optional(v.id("colors")),
    maxPrice: v.optional(v.number()),
    estimatedValue: v.optional(v.number()),
    quantity: v.optional(v.number()),
    neededBy: v.optional(v.number()),
    intendedUse: v.optional(v.string()),
    conditions: v.optional(v.string()),
    notes: v.optional(v.string()),
    reason: v.optional(REASON),
    branchId: v.optional(v.id("branches")),
    proceeding: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<Id<"demands">> => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const description = args.description.trim();
    if (!description) throw new Error("Describe what the customer wants.");
    if (args.customerId && !(await ctx.db.get(args.customerId))) throw new Error("Customer not found.");
    if (args.maxPrice !== undefined && args.maxPrice < 0) throw new Error("The budget cannot be negative.");
    if (args.estimatedValue !== undefined && args.estimatedValue < 0) {
      throw new Error("The estimated value cannot be negative.");
    }
    if (args.quantity !== undefined && args.quantity <= 0) throw new Error("The quantity must be positive.");
    if (args.sizeId && !(await ctx.db.get(args.sizeId))) throw new Error("Size not found.");
    if (args.colorId && !(await ctx.db.get(args.colorId))) throw new Error("Color not found.");
    if (args.productId && !(await ctx.db.get(args.productId))) throw new Error("Product not found.");
    const now = Date.now();
    const id = await ctx.db.insert("demands", {
      description,
      customerId: args.customerId,
      productId: args.productId,
      productVariantId: args.productVariantId,
      categoryId: args.categoryId,
      sizeId: args.sizeId,
      colorId: args.colorId,
      maxPrice: args.maxPrice,
      estimatedValue: args.estimatedValue,
      quantity: args.quantity,
      neededBy: args.neededBy,
      intendedUse: args.intendedUse?.trim() || undefined,
      conditions: args.conditions?.trim() || undefined,
      notes: args.notes?.trim() || undefined,
      reason: args.reason,
      branchId: args.branchId,
      stage: args.proceeding ? "PROCEEDING" : "OPEN",
      proceededAt: args.proceeding ? now : undefined,
      createdBy: actor._id,
      createdByUsername: actor.username,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "demand.created",
      entityType: "demand",
      entityId: id,
      details: description,
    });
    return id;
  },
});

/**
 * Moves an open demand on: to PROCEEDING (it joins the Oportunidades board), FULFILLED or
 * LOST. CONVERTED, FULFILLED and LOST are final. Losing one needs a reason — the one
 * given now or the one recorded with it.
 */
export const setStage = mutation({
  args: {
    token: v.string(),
    id: v.id("demands"),
    stage: v.union(v.literal("PROCEEDING"), v.literal("FULFILLED"), v.literal("LOST")),
    reason: v.optional(REASON),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Demand not found.");
    if (FINAL_STAGES.includes(row.stage)) throw new Error("This demand is already closed.");
    if (args.stage === row.stage) throw new Error("The demand is already at this stage.");
    const reason = args.reason ?? row.reason;
    if (args.stage === "LOST" && !reason) throw new Error("Say why the sale was lost.");
    const now = Date.now();
    const closing = args.stage === "FULFILLED" || args.stage === "LOST";
    await ctx.db.patch(args.id, {
      stage: args.stage,
      reason: args.stage === "LOST" ? reason : row.reason,
      proceededAt: args.stage === "PROCEEDING" ? now : row.proceededAt,
      closedAt: closing ? now : undefined,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "demand.stage_changed",
      entityType: "demand",
      entityId: args.id,
      details: `${row.stage} → ${args.stage}`,
    });
  },
});

/** Links a demand to the customer order it became. */
export const markConverted = mutation({
  args: {
    token: v.string(),
    id: v.id("demands"),
    orderId: v.id("customerOrders"),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Demand not found.");
    if (FINAL_STAGES.includes(row.stage)) throw new Error("This demand is already closed.");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found.");
    if (row.customerId && order.customerId !== row.customerId) {
      throw new Error("The order belongs to a different customer.");
    }
    const now = Date.now();
    await ctx.db.patch(args.id, {
      stage: "CONVERTED",
      convertedOrderId: args.orderId,
      proceededAt: row.proceededAt ?? now,
      closedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "demand.converted",
      entityType: "demand",
      entityId: args.id,
      details: `Converted into ${order.orderNumber}`,
    });
  },
});
