import { v } from "convex/values";
import { mutation, query, internalMutation, DatabaseReader } from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Id } from "./_generated/dataModel";

async function calculateCustomerFinancials(db: DatabaseReader, customerId: Id<"customers">) {
  const orders = await db
    .query("orders")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();

  const totalPurchases = orders.reduce((sum, o) => sum + o.total, 0);
  const totalPaid = orders.reduce((sum, o) => sum + (o.amountPaid || 0), 0);

  return {
    totalPurchases,
    totalPaid,
    orderCount: orders.length,
  };
}



export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("customers").order("desc").collect();
  },
});

export const listPaginated = query({
  args: { paginationOpts: paginationOptsValidator, showArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    let q = ctx.db.query("customers").order("desc");
    if (!args.showArchived) {
      q = q.filter((q) => q.neq(q.field("status"), "archived"));
    }
    return await q.paginate(args.paginationOpts);
  },
});

export const search = query({
  args: { query: v.string(), showArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const q = args.query.toLowerCase();
    if (!q) return [];
    
    const isPhoneSearch = /^[\d\+\-\s\(\)]+$/.test(args.query);

    let candidates;
    if (isPhoneSearch) {
      candidates = await ctx.db.query("customers").order("desc").take(100);
    } else {
      candidates = await ctx.db
        .query("customers")
        .withSearchIndex("search_name", (qB) => qB.search("name", args.query))
        .take(100);
    }

    return candidates.filter(c => 
      (args.showArchived || c.status !== "archived") &&
      (c.name.toLowerCase().includes(q) || 
      c.phone1.includes(q) || 
      (c.phone2 && c.phone2.includes(q)) || 
      (c.phone3 && c.phone3.includes(q)))
    ).slice(0, 10);
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    phone1: v.string(),
    phone2: v.optional(v.string()),
    phone3: v.optional(v.string()),
    isGeneric: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("customers", {
      name: args.name,
      phone1: args.phone1,
      phone2: args.phone2,
      phone3: args.phone3,
      isGeneric: args.isGeneric ?? false,
      status: "active",
    });
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
      name: "Generic Client",
      phone1: "000000000",
      isGeneric: true,
    });
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
          orderCount: 0,
        }
      };
    }

    const stats = await calculateCustomerFinancials(ctx.db, args.id);

    return {
      ...customer,
      stats: {
        totalPurchases: stats.totalPurchases,
        totalPaid: stats.totalPaid,
        orderCount: stats.orderCount,
      }
    };
  },
});

export const update = mutation({
  args: {
    id: v.id("customers"),
    name: v.string(),
    phone1: v.string(),
    phone2: v.optional(v.string()),
    phone3: v.optional(v.string()),
    isGeneric: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { id, ...data } = args;
    await ctx.db.patch(id, data);
  },
});

export const remove = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found");
    if (customer.isGeneric) throw new Error("Cannot delete generic client");
    
    // Fetch or create the Generic Client to reassign orders
    let generic = await ctx.db
      .query("customers")
      .withIndex("by_isGeneric", (q) => q.eq("isGeneric", true))
      .first();

    if (!generic) {
      const newGenericId = await ctx.db.insert("customers", {
        name: "Generic Client",
        phone1: "000000000",
        isGeneric: true,
      });
      generic = await ctx.db.get(newGenericId);
    }

    const genericId = generic!._id;

    // Fetch and reassign all of this customer's orders to the Generic Client
    const customerOrders = await ctx.db
      .query("orders")
      .withIndex("by_customer", (q) => q.eq("customerId", args.id))
      .collect();

    for (const order of customerOrders) {
      await ctx.db.patch(order._id, {
        customerId: genericId,
      });
    }

    await ctx.db.delete(args.id);
  },
});

export const archive = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found");
    if (customer.isGeneric) throw new Error("Cannot archive generic client");
    
    await ctx.db.patch(args.id, {
      status: "archived",
    });
  },
});

export const unarchive = mutation({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found");
    
    await ctx.db.patch(args.id, {
      status: "active",
    });
  },
});
