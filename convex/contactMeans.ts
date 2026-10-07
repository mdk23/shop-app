import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

/** Contacts beyond the customer's own phones and email, with validity so old numbers are kept. */
export const listByCustomer = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("contactMeans")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .collect();
  },
});

export const add = mutation({
  args: {
    token: v.string(),
    customerId: v.id("customers"),
    contactType: v.union(v.literal("PHONE"), v.literal("EMAIL"), v.literal("WHATSAPP"), v.literal("OTHER")),
    contactValue: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const value = args.contactValue.trim();
    if (!value) throw new Error("Write the contact.");
    if (!(await ctx.db.get(args.customerId))) throw new Error("Customer not found.");
    const now = Date.now();
    const id = await ctx.db.insert("contactMeans", {
      customerId: args.customerId,
      contactType: args.contactType,
      contactValue: value,
      validFrom: now,
      registeredAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.contact_added",
      entityType: "customer",
      entityId: args.customerId,
      details: `${args.contactType}: ${value}`,
    });
    return id;
  },
});

/** Ends a contact without deleting it, so history of who was reached stays intact. */
export const retire = mutation({
  args: { token: v.string(), id: v.id("contactMeans") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const row = await ctx.db.get(args.id);
    if (!row) throw new Error("Contact not found.");
    if (row.validTo !== undefined) throw new Error("This contact is already retired.");
    await ctx.db.patch(args.id, { validTo: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.contact_retired",
      entityType: "customer",
      entityId: row.customerId,
      details: row.contactValue,
    });
  },
});
