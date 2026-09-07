import { v } from "convex/values";
import {
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { nextSequence } from "./metrics";

// ─────────────────────────────────────────────
// FINANCIALS
// ─────────────────────────────────────────────

async function customerFinancials(ctx: QueryCtx, customerId: Id<"customers">) {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  const active = sales.filter((s) => s.status !== "CANCELLED");
  const totalPurchases = active.reduce((s, o) => s + o.total, 0);
  const totalPaid = active.reduce((s, o) => s + o.paidAmount, 0);
  const outstandingDebt = active.reduce((s, o) => s + o.balance, 0);
  const lastPurchase = active.reduce(
    (max, o) => Math.max(max, o.createdAt),
    0
  );

  const credits = await ctx.db
    .query("customerCredits")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  const storeCredit = credits.reduce((s, c) => s + c.delta, 0);

  return {
    totalPurchases,
    totalPaid,
    outstandingDebt,
    purchaseCount: active.length,
    lastPurchase: lastPurchase || null,
    storeCredit,
  };
}

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("customers").order("desc").collect(),
});

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    showArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("customers").order("desc");
    if (!args.showArchived) {
      q = q.filter((qq) => qq.neq(qq.field("status"), "archived"));
    }
    return await q.paginate(args.paginationOpts);
  },
});

export const search = query({
  args: { query: v.string(), showArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const term = args.query.trim().toLowerCase();
    if (!term) return [];
    const isPhone = /^[\d+\-\s()]+$/.test(args.query);
    const candidates = isPhone
      ? await ctx.db.query("customers").order("desc").take(200)
      : await ctx.db
          .query("customers")
          .withSearchIndex("search_name", (qb) => qb.search("name", args.query))
          .take(100);
    return candidates
      .filter(
        (c) =>
          (args.showArchived || c.status !== "archived") &&
          (c.name.toLowerCase().includes(term) ||
            c.phone1.includes(term) ||
            (c.phone2 ?? "").includes(term) ||
            (c.phone3 ?? "").includes(term) ||
            (c.email ?? "").toLowerCase().includes(term) ||
            (c.customerCode ?? "").toLowerCase().includes(term))
      )
      .slice(0, 15);
  },
});

export const getById = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) return null;
    if (customer.isGeneric) {
      return {
        ...customer,
        stats: {
          totalPurchases: 0,
          totalPaid: 0,
          outstandingDebt: 0,
          purchaseCount: 0,
          lastPurchase: null,
          storeCredit: 0,
        },
      };
    }
    return { ...customer, stats: await customerFinancials(ctx, args.id) };
  },
});

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

const CUSTOMER_FIELDS = {
  name: v.string(),
  phone1: v.string(),
  phone2: v.optional(v.string()),
  phone3: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const create = mutation({
  args: { token: v.string(), ...CUSTOMER_FIELDS },
  handler: async (ctx, args) => {
    const { token, ...data } = args;
    const actor = await authorize(ctx, token, "customers.manage");
    const seq = await nextSequence(ctx, "customer_code_sequence");
    const id = await ctx.db.insert("customers", {
      ...data,
      customerCode: `C-${String(seq).padStart(5, "0")}`,
      isGeneric: false,
      active: true,
      status: "active",
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.created",
      entityType: "customer",
      entityId: id,
      details: `Created customer "${data.name}"`,
    });
    return id;
  },
});

export const getOrCreateGeneric = mutation({
  args: {},
  handler: async (ctx) => {
    const generic = await ctx.db
      .query("customers")
      .withIndex("by_isGeneric", (q) => q.eq("isGeneric", true))
      .first();
    if (generic) return generic._id;
    return await ctx.db.insert("customers", {
      name: "Walk-in Customer",
      phone1: "000000000",
      isGeneric: true,
      active: true,
      status: "active",
    });
  },
});

export const update = mutation({
  args: { token: v.string(), id: v.id("customers"), ...CUSTOMER_FIELDS },
  handler: async (ctx, args) => {
    const { token, id, ...data } = args;
    const actor = await authorize(ctx, token, "customers.manage");
    await ctx.db.patch(id, data);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.updated",
      entityType: "customer",
      entityId: id,
      details: `Updated customer "${data.name}"`,
    });
  },
});

export const archive = mutation({
  args: { token: v.string(), id: v.id("customers") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found.");
    if (customer.isGeneric) throw new Error("Cannot archive the walk-in customer.");
    await ctx.db.patch(args.id, { status: "archived", active: false });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.archived",
      entityType: "customer",
      entityId: args.id,
    });
  },
});

export const unarchive = mutation({
  args: { token: v.string(), id: v.id("customers") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    await ctx.db.patch(args.id, { status: "active", active: true });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.unarchived",
      entityType: "customer",
      entityId: args.id,
    });
  },
});
