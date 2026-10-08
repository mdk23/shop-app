import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { currentNuitOf, recordNuit } from "./lib/fiscal";

export const list = query({
  args: {
    status: v.optional(v.union(v.literal("ACTIVE"), v.literal("INACTIVE"))),
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
    rows.sort((a, b) => a.name.localeCompare(b.name));
    return await Promise.all(
      rows.map(async (r) => ({
        ...r,
        paymentTermName: r.paymentTermId ? (await ctx.db.get(r.paymentTermId))?.name : undefined,
        nuit: await currentNuitOf(ctx, { supplierId: r._id }),
      }))
    );
  },
});

const SUPPLIER_FIELDS = {
  name: v.string(),
  contactName: v.optional(v.string()),
  phone: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  status: v.union(v.literal("ACTIVE"), v.literal("INACTIVE")),
  paymentTermId: v.optional(v.id("paymentTerms")),
  notes: v.optional(v.string()),
  // Recorded in fiscalIdentities, not on the supplier.
  nuit: v.optional(v.string()),
};

export const create = mutation({
  args: { token: v.string(), ...SUPPLIER_FIELDS },
  handler: async (ctx, args) => {
    const { token, nuit, ...data } = args;
    const actor = await authorize(ctx, token, "suppliers.manage");
    if (data.paymentTermId && !(await ctx.db.get(data.paymentTermId))) throw new Error("Payment term not found.");
    const id = await ctx.db.insert("suppliers", { ...data, createdAt: Date.now() });
    if (nuit?.trim()) await recordNuit(ctx, { supplierId: id }, nuit);
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
    const { token, id, nuit, ...data } = args;
    const actor = await authorize(ctx, token, "suppliers.manage");
    if (data.paymentTermId && !(await ctx.db.get(data.paymentTermId))) throw new Error("Payment term not found.");
    await ctx.db.patch(id, data);
    if (nuit?.trim()) await recordNuit(ctx, { supplierId: id }, nuit);
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
    const identities = await ctx.db
      .query("fiscalIdentities")
      .withIndex("by_supplier", (q) => q.eq("supplierId", args.id))
      .collect();
    for (const row of identities) await ctx.db.delete(row._id);
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
