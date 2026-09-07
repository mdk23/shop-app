import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let rows = args.status
      ? await ctx.db
          .query("suppliers")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .collect()
      : await ctx.db.query("suppliers").collect();
    const s = args.search?.trim().toLowerCase();
    if (s)
      rows = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(s) ||
          (r.contactName ?? "").toLowerCase().includes(s) ||
          (r.phone ?? "").includes(s)
      );
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
});

const SUPPLIER_FIELDS = {
  name: v.string(),
  contactName: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  taxNumber: v.optional(v.string()),
  status: v.union(v.literal("active"), v.literal("inactive")),
  paymentTerms: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const create = mutation({
  args: { token: v.string(), ...SUPPLIER_FIELDS },
  handler: async (ctx, args) => {
    const { token, ...data } = args;
    const actor = await authorize(ctx, token, "suppliers.manage");
    const id = await ctx.db.insert("suppliers", { ...data, createdAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "supplier.created",
      entityType: "supplier",
      entityId: id,
      details: `Created supplier "${data.name}"`,
    });
    return id;
  },
});

export const update = mutation({
  args: { token: v.string(), id: v.id("suppliers"), ...SUPPLIER_FIELDS },
  handler: async (ctx, args) => {
    const { token, id, ...data } = args;
    const actor = await authorize(ctx, token, "suppliers.manage");
    await ctx.db.patch(id, data);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "supplier.updated",
      entityType: "supplier",
      entityId: id,
      details: `Updated supplier "${data.name}"`,
    });
    return id;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("suppliers") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "suppliers.manage");
    const linkedPo = await ctx.db
      .query("purchaseOrders")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.id))
      .first();
    if (linkedPo)
      throw new Error(
        "This supplier has purchase orders and cannot be deleted. Set it inactive instead."
      );
    await ctx.db.delete(args.id);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "supplier.deleted",
      entityType: "supplier",
      entityId: args.id,
    });
    return args.id;
  },
});
