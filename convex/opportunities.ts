import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const STAGE = v.union(
  v.literal("OPEN"),
  v.literal("PROCEEDING"),
  v.literal("NOT_PROCEEDING"),
  v.literal("CONVERTED")
);

const REASON = v.union(
  v.literal("PRICE"),
  v.literal("SIZE"),
  v.literal("COLOR"),
  v.literal("STOCK"),
  v.literal("OTHER")
);

export const list = query({
  args: { stage: v.optional(STAGE) },
  handler: async (ctx, args) => {
    const rows = args.stage
      ? await ctx.db
          .query("opportunities")
          .withIndex("by_stage", (q) => q.eq("stage", args.stage!))
          .order("desc")
          .take(200)
      : await ctx.db.query("opportunities").order("desc").take(200);
    return await Promise.all(
      rows.map(async (row) => ({
        ...row,
        customerName: row.customerId ? (await ctx.db.get(row.customerId))?.name : undefined,
      }))
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    description: v.string(),
    customerId: v.optional(v.id("customers")),
    productId: v.optional(v.id("products")),
    variantId: v.optional(v.id("productVariants")),
    estimatedValue: v.optional(v.number()),
    conditions: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<Id<"opportunities">> => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const description = args.description.trim();
    if (!description) throw new Error("Describe the interest.");
    if (args.customerId && !(await ctx.db.get(args.customerId))) {
      throw new Error("Customer not found.");
    }
    if (args.estimatedValue !== undefined && args.estimatedValue < 0) {
      throw new Error("The estimated value cannot be negative.");
    }
    const now = Date.now();
    const id = await ctx.db.insert("opportunities", {
      description,
      customerId: args.customerId,
      productId: args.productId,
      variantId: args.variantId,
      stage: "OPEN",
      estimatedValue: args.estimatedValue,
      conditions: args.conditions?.trim() || undefined,
      createdByUsername: actor.username,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "opportunity.created",
      entityType: "opportunity",
      entityId: id,
      details: description,
    });
    return id;
  },
});

/** Moves an opportunity between OPEN, PROCEEDING and NOT_PROCEEDING. Losing one needs a reason. */
export const setStage = mutation({
  args: {
    token: v.string(),
    id: v.id("opportunities"),
    stage: v.union(v.literal("OPEN"), v.literal("PROCEEDING"), v.literal("NOT_PROCEEDING")),
    reasonNotProceeding: v.optional(REASON),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Opportunity not found.");
    if (row.stage === "CONVERTED") throw new Error("A converted opportunity cannot change stage.");
    if (args.stage === "NOT_PROCEEDING" && !args.reasonNotProceeding) {
      throw new Error("Say why it did not go ahead.");
    }
    await ctx.db.patch(args.id, {
      stage: args.stage,
      reasonNotProceeding: args.stage === "NOT_PROCEEDING" ? args.reasonNotProceeding : undefined,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "opportunity.stage_changed",
      entityType: "opportunity",
      entityId: args.id,
      details: `${row.stage} → ${args.stage}`,
    });
  },
});

/** Links a proceeding opportunity to the customer order it became. */
export const markConverted = mutation({
  args: {
    token: v.string(),
    id: v.id("opportunities"),
    orderId: v.id("customerOrders"),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Opportunity not found.");
    if (row.stage === "CONVERTED") throw new Error("This opportunity is already converted.");
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found.");
    if (row.customerId && order.customerId !== row.customerId) {
      throw new Error("The order belongs to a different customer.");
    }
    await ctx.db.patch(args.id, {
      stage: "CONVERTED",
      convertedOrderId: args.orderId,
      updatedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "opportunity.converted",
      entityType: "opportunity",
      entityId: args.id,
      details: `Converted into ${order.orderNumber}`,
    });
  },
});
