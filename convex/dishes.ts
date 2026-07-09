import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const dishes = await ctx.db.query("dishes").collect();
    const dishesWithIngredients = await Promise.all(
      dishes.map(async (dish) => {
        const ingredients = await ctx.db
          .query("dishIngredients")
          .withIndex("by_dish", (q) => q.eq("dishId", dish._id))
          .collect();
        return { ...dish, ingredients };
      })
    );
    return dishesWithIngredients;
  },
});

export const create = mutation({
  args: {
    name: v.string(),
    price: v.number(),
    category: v.string(),
    isActive: v.optional(v.boolean()),
    description: v.optional(v.string()),
    ingredients: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        quantity: v.number(),
      })
    ),
    isCombo: v.optional(v.boolean()),
    selectableInCombo: v.optional(v.boolean()),
    comboRole: v.optional(v.string()),
    comboConfig: v.optional(v.object({
      allowedMains: v.optional(v.array(v.id("dishes"))),
      allowedSides: v.optional(v.array(v.id("dishes"))),
      allowedDrinks: v.optional(v.array(v.id("dishes"))),
      mainsLimit: v.optional(v.number()),
      sidesLimit: v.number(),
      drinksLimit: v.number(),
    })),

    standalonePackaging: v.optional(v.array(v.object({
      ingredientId: v.id("ingredients"),
      quantity: v.number(),
    }))),
    comboPackaging: v.optional(v.array(v.object({
      ingredientId: v.id("ingredients"),
      quantity: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const { ingredients, ...dishData } = args;
    const dishId = await ctx.db.insert("dishes", dishData);
    
    for (const ing of ingredients) {
      await ctx.db.insert("dishIngredients", {
        dishId,
        ingredientId: ing.ingredientId,
        quantity: ing.quantity,
      });
    }
    
    return dishId;
  },
});

export const update = mutation({
  args: {
    id: v.id("dishes"),
    name: v.string(),
    price: v.number(),
    category: v.string(),
    isActive: v.optional(v.boolean()),
    description: v.optional(v.string()),
    ingredients: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        quantity: v.number(),
      })
    ),
    isCombo: v.optional(v.boolean()),
    selectableInCombo: v.optional(v.boolean()),
    comboRole: v.optional(v.string()),
    comboConfig: v.optional(v.object({
      allowedMains: v.optional(v.array(v.id("dishes"))),
      allowedSides: v.optional(v.array(v.id("dishes"))),
      allowedDrinks: v.optional(v.array(v.id("dishes"))),
      mainsLimit: v.optional(v.number()),
      sidesLimit: v.number(),
      drinksLimit: v.number(),
    })),

    standalonePackaging: v.optional(v.array(v.object({
      ingredientId: v.id("ingredients"),
      quantity: v.number(),
    }))),
    comboPackaging: v.optional(v.array(v.object({
      ingredientId: v.id("ingredients"),
      quantity: v.number(),
    }))),
  },
  handler: async (ctx, args) => {
    const { id, ingredients, ...dishData } = args;
    await ctx.db.patch(id, dishData);
    
    // Delete old ingredients
    const existing = await ctx.db
      .query("dishIngredients")
      .withIndex("by_dish", (q) => q.eq("dishId", id))
      .collect();
    
    for (const item of existing) {
      await ctx.db.delete(item._id);
    }
    
    // Add new ingredients
    for (const ing of ingredients) {
      await ctx.db.insert("dishIngredients", {
        dishId: id,
        ingredientId: ing.ingredientId,
        quantity: ing.quantity,
      });
    }
  },
});

export const remove = mutation({
  args: {
    id: v.id("dishes"),
  },
  handler: async (ctx, args) => {
    // Delete all dishIngredients associated with this dish
    const existing = await ctx.db
      .query("dishIngredients")
      .withIndex("by_dish", (q) => q.eq("dishId", args.id))
      .collect();
    
    for (const item of existing) {
      await ctx.db.delete(item._id);
    }
    
    // Delete the dish itself
    await ctx.db.delete(args.id);
  },
});
