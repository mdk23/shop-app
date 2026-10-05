import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const REQUEST_REASON = v.union(
  v.literal("WRONG_SIZE"),
  v.literal("WRONG_COLOR"),
  v.literal("PRICE_TOO_HIGH"),
  v.literal("NOT_IN_STOCK"),
  v.literal("OTHER")
);

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("OPEN"), v.literal("FULFILLED"), v.literal("CANCELLED"))),
    reason: v.optional(REQUEST_REASON),
  },
  handler: async (ctx, args) => {
    const rows = args.reason
      ? await ctx.db
          .query("wantList")
          .withIndex("by_reason", (q) => q.eq("reason", args.reason))
          .order("desc")
          .take(200)
      : args.status
        ? await ctx.db
            .query("wantList")
            .withIndex("by_status", (q) => q.eq("status", args.status!))
            .order("desc")
            .take(200)
        : await ctx.db.query("wantList").order("desc").take(200);
    const filtered = rows.filter(
      (r) =>
        (!args.status || r.status === args.status) && (!args.reason || r.reason === args.reason)
    );
    return await Promise.all(
      filtered.map(async (row) => ({
        ...row,
        customerName: row.customerId ? (await ctx.db.get(row.customerId))?.name : undefined,
      }))
    );
  },
});

/** Count of recorded requests per reason, for buying: which causes lose sales most. */
export const countByReason = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("wantList").collect();
    const counts: Record<string, number> = {};
    for (const row of rows) {
      if (!row.reason) continue;
      counts[row.reason] = (counts[row.reason] ?? 0) + 1;
    }
    return counts;
  },
});

export const listOpen = query({
  args: { customerId: v.optional(v.id("customers")) },
  handler: async (ctx, args) => {
    if (args.customerId) {
      const rows = await ctx.db
        .query("wantList")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
        .order("desc")
        .collect();
      return rows;
    }
    return await ctx.db
      .query("wantList")
      .withIndex("by_status", (q) => q.eq("status", "OPEN"))
      .order("desc")
      .collect();
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    customerId: v.optional(v.id("customers")),
    description: v.string(),
    productId: v.optional(v.id("products")),
    productVariantId: v.optional(v.id("productVariants")),
    categoryId: v.optional(v.id("categories")),
    sizeId: v.optional(v.id("sizes")),
    colorId: v.optional(v.id("colors")),
    maxPrice: v.optional(v.number()),
    quantity: v.optional(v.number()),
    neededBy: v.optional(v.number()),
    intendedUse: v.optional(v.string()),
    reason: v.optional(REQUEST_REASON),
    branchId: v.optional(v.id("branches")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const description = args.description.trim();
    if (!description) throw new Error("Describe what the customer asked for.");
    if (args.customerId && !(await ctx.db.get(args.customerId))) {
      throw new Error("Customer not found.");
    }
    if (args.maxPrice !== undefined && args.maxPrice < 0) {
      throw new Error("The budget cannot be negative.");
    }
    if (args.quantity !== undefined && args.quantity <= 0) {
      throw new Error("The quantity must be positive.");
    }
    if (args.sizeId && !(await ctx.db.get(args.sizeId))) throw new Error("Size not found.");
    if (args.colorId && !(await ctx.db.get(args.colorId))) throw new Error("Color not found.");
    if (args.productId && !(await ctx.db.get(args.productId))) throw new Error("Product not found.");
    const now = Date.now();
    const id = await ctx.db.insert("wantList", {
      customerId: args.customerId,
      description,
      productId: args.productId,
      productVariantId: args.productVariantId,
      categoryId: args.categoryId,
      sizeId: args.sizeId,
      colorId: args.colorId,
      maxPrice: args.maxPrice,
      quantity: args.quantity,
      neededBy: args.neededBy,
      intendedUse: args.intendedUse?.trim() || undefined,
      reason: args.reason,
      branchId: args.branchId,
      status: "OPEN",
      notes: args.notes?.trim() || undefined,
      createdByUsername: actor.username,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "wantList.created",
      entityType: "wantList",
      entityId: id,
      details: `Recorded demand: ${description}`,
    });
    return id;
  },
});

/** Marks a request fulfilled or cancelled. Closed requests are final. */
export const resolve = mutation({
  args: {
    token: v.string(),
    id: v.id("wantList"),
    outcome: v.union(v.literal("FULFILLED"), v.literal("CANCELLED")),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Request not found.");
    if (row.status !== "OPEN") throw new Error("This request is already closed.");
    const now = Date.now();
    await ctx.db.patch(args.id, {
      status: args.outcome,
      resolvedAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: `wantList.${args.outcome.toLowerCase()}`,
      entityType: "wantList",
      entityId: args.id,
      details: `${args.outcome === "FULFILLED" ? "Fulfilled" : "Cancelled"}: ${row.description}`,
    });
  },
});
