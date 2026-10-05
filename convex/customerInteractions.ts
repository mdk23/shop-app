import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const listByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customerInteractions")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(100);
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    customerId: v.id("customers"),
    channel: v.union(
      v.literal("PHONE"),
      v.literal("WHATSAPP"),
      v.literal("IN_STORE"),
      v.literal("EMAIL"),
      v.literal("OTHER")
    ),
    summary: v.string(),
    occurredAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const summary = args.summary.trim();
    if (!summary) throw new Error("Write a short summary of the contact.");
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found.");
    const now = Date.now();
    const id = await ctx.db.insert("customerInteractions", {
      customerId: args.customerId,
      channel: args.channel,
      summary,
      occurredAt: args.occurredAt ?? now,
      createdByUsername: actor.username,
      createdAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.interaction_logged",
      entityType: "customer",
      entityId: args.customerId,
      details: `${args.channel}: ${summary}`,
    });
    return id;
  },
});
