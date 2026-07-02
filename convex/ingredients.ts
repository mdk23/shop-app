import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { validateToken } from "./auth";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("ingredients").order("desc").collect();
  },
});

export const search = query({
  args: { query: v.string() },
  handler: async (ctx, args) => {
    const q = args.query.toLowerCase();
    if (!q) return [];
    
    // Simple scan-and-filter since ingredients table is typically small (< 1000 items)
    // If it grows, we should add a search index
    const all = await ctx.db.query("ingredients").collect();
    return all.filter(i => i.name.toLowerCase().includes(q));
  },
});


export const add = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    category: v.string(),
    stockQuantity: v.number(),
    unit: v.string(),
    lowStockThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const { token, ...data } = args;
    const actor = await validateToken(ctx, token);

    const id = await ctx.db.insert("ingredients", data);
    // Write opening balance to movements ledger
    const { internal } = require("./_generated/api");
    await ctx.runMutation(internal.inventory.mutateStock, {
      itemId: id,
      quantity: data.stockQuantity,
      movementType: "opening_balance",
      notes: "Initial inventory setup",
      userId: actor._id,
      username: actor.username,
    });
    return id;
  },
});

export const restock = mutation({
  args: {
    id: v.id("ingredients"),
    amount: v.number(),
  },
  handler: async (ctx, args) => {
    const { internal } = require("./_generated/api");
    await ctx.runMutation(internal.inventory.mutateStock, {
      itemId: args.id,
      quantity: args.amount,
      movementType: "purchase_in",
      notes: "Supplier Restock",
    });
  },
});

export const update = mutation({
  args: {
    token: v.string(),
    id: v.id("ingredients"),
    name: v.string(),
    category: v.string(),
    stockQuantity: v.number(),
    unit: v.string(),
    lowStockThreshold: v.number(),
  },
  handler: async (ctx, args) => {
    const { id, token, ...data } = args;
    const actor = await validateToken(ctx, token);

    const ingredient = await ctx.db.get(id);
    if (!ingredient) throw new Error("Ingredient not found");

    const qtyDiff = data.stockQuantity - ingredient.stockQuantity;

    // Patch attributes
    await ctx.db.patch(id, {
      name: data.name,
      category: data.category,
      unit: data.unit,
      lowStockThreshold: data.lowStockThreshold,
    });

    if (qtyDiff !== 0) {
      const { internal } = require("./_generated/api");
      await ctx.runMutation(internal.inventory.mutateStock, {
        itemId: id,
        quantity: qtyDiff,
        movementType: "inventory_count_adjustment",
        notes: `Manual count update. Prev: ${ingredient.stockQuantity}, New: ${data.stockQuantity}`,
        userId: actor._id,
        username: actor.username,
      });
    }
  },
});

export const remove = mutation({
  args: {
    id: v.id("ingredients"),
  },
  handler: async (ctx, args) => {
    // Delete any dishIngredients that reference this ingredient
    const existing = await ctx.db
      .query("dishIngredients")
      .withIndex("by_ingredient", (q) => q.eq("ingredientId", args.id))
      .collect();
    
    for (const item of existing) {
      await ctx.db.delete(item._id);
    }
    
    // Delete the ingredient
    await ctx.db.delete(args.id);
  },
});

