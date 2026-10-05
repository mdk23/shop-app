import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

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
    productVariantId: v.optional(v.id("productVariants")),
    categoryId: v.optional(v.id("categories")),
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
    const now = Date.now();
    const id = await ctx.db.insert("wantList", {
      customerId: args.customerId,
      description,
      productVariantId: args.productVariantId,
      categoryId: args.categoryId,
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
