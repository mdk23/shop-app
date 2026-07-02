import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// List all factory recipes with ingredient details
export const listRecipes = query({
  args: {},
  handler: async (ctx) => {
    const recipes = await ctx.db.query("factoryRecipes").collect();
    return await Promise.all(
      recipes.map(async (recipe) => {
        const producedIngredient = await ctx.db.get(recipe.producedIngredientId);
        const ingredientsWithDetails = await Promise.all(
          recipe.ingredients.map(async (ing) => {
            const detail = await ctx.db.get(ing.ingredientId);
            return {
              ...ing,
              name: detail?.name || "Unknown Ingredient",
              unit: detail?.unit || "",
              category: detail?.category || "",
            };
          })
        );
        return {
          ...recipe,
          producedIngredientName: producedIngredient?.name || "Unknown Factory Item",
          producedIngredientUnit: producedIngredient?.unit || "",
          ingredients: ingredientsWithDetails,
        };
      })
    );
  },
});

// Add a new recipe
export const addRecipe = mutation({
  args: {
    producedIngredientId: v.id("ingredients"),
    outputQuantity: v.number(),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    ingredients: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check if recipe already exists for this factory item
    const existing = await ctx.db
      .query("factoryRecipes")
      .withIndex("by_produced_ingredient", (q) =>
        q.eq("producedIngredientId", args.producedIngredientId)
      )
      .first();

    if (existing) {
      throw new Error("A recipe already exists for this ingredient.");
    }

    return await ctx.db.insert("factoryRecipes", {
      producedIngredientId: args.producedIngredientId,
      outputQuantity: args.outputQuantity,
      category: args.category,
      notes: args.notes,
      ingredients: args.ingredients,
    });
  },
});

// Update an existing recipe
export const updateRecipe = mutation({
  args: {
    id: v.id("factoryRecipes"),
    producedIngredientId: v.id("ingredients"),
    outputQuantity: v.number(),
    category: v.optional(v.string()),
    notes: v.optional(v.string()),
    ingredients: v.array(
      v.object({
        ingredientId: v.id("ingredients"),
        quantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    // Check if recipe already exists for this factory item (excluding itself)
    const existing = await ctx.db
      .query("factoryRecipes")
      .withIndex("by_produced_ingredient", (q) =>
        q.eq("producedIngredientId", args.producedIngredientId)
      )
      .first();

    if (existing && existing._id !== args.id) {
      throw new Error("Another recipe already exists for this produced item.");
    }

    await ctx.db.patch(args.id, {
      producedIngredientId: args.producedIngredientId,
      outputQuantity: args.outputQuantity,
      category: args.category,
      notes: args.notes,
      ingredients: args.ingredients,
    });
    return { success: true };
  },
});

// Delete a recipe
export const removeRecipe = mutation({
  args: {
    id: v.id("factoryRecipes"),
  },
  handler: async (ctx, args) => {
    await ctx.db.delete(args.id);
  },
});

// List all production logs
export const listLogs = query({
  args: {},
  handler: async (ctx) => {
    const logs = await ctx.db.query("productionLogs").order("desc").take(250);
    return await Promise.all(
      logs.map(async (log) => {
        const producedIngredient = await ctx.db.get(log.producedIngredientId);
        return {
          ...log,
          producedIngredientName: producedIngredient?.name || "Unknown Factory Item",
          producedIngredientUnit: producedIngredient?.unit || "",
        };
      })
    );
  },
});

// Produce a batch of a recipe
export const produceBatch = mutation({
  args: {
    recipeId: v.id("factoryRecipes"),
    quantity: v.number(), // Quantity of output factory item to produce
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const recipe = await ctx.db.get(args.recipeId);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    const producedIngredient = await ctx.db.get(recipe.producedIngredientId);
    if (!producedIngredient) {
      throw new Error("Produced ingredient item not found");
    }

    // Calculate scale factor (how much to scale raw ingredients)
    const scaleFactor = args.quantity / recipe.outputQuantity;

    // Calculate required raw ingredients
    const scaledRequirements = recipe.ingredients.map((ing) => ({
      ingredientId: ing.ingredientId,
      quantity: ing.quantity * scaleFactor,
    }));

    // 1. Verify enough stock exists for ALL required raw ingredients
    const missingIngredients: string[] = [];
    for (const req of scaledRequirements) {
      const ingredient = await ctx.db.get(req.ingredientId);
      if (!ingredient) {
        throw new Error(`Raw ingredient with ID ${req.ingredientId} not found`);
      }
      if (ingredient.stockQuantity < req.quantity) {
        missingIngredients.push(
          `${ingredient.name} (Need: ${req.quantity.toFixed(2)} ${ingredient.unit}, Have: ${ingredient.stockQuantity.toFixed(2)} ${ingredient.unit})`
        );
      }
    }

    if (missingIngredients.length > 0) {
      throw new Error(`Insufficient raw materials: ${missingIngredients.join("; ")}`);
    }

    // 2. Log the production batch first to get the log ID for auditing reference
    const logId = await ctx.db.insert("productionLogs", {
      recipeId: args.recipeId,
      producedIngredientId: recipe.producedIngredientId,
      quantityProduced: args.quantity,
      producedAt: Date.now(),
      notes: args.notes,
      ingredientsConsumed: scaledRequirements,
    });

    // 3. Deduct raw ingredients via centralized inventory service
    for (const req of scaledRequirements) {
      await ctx.runMutation(internal.inventory.mutateStock, {
        itemId: req.ingredientId,
        quantity: -req.quantity,
        movementType: "production_consumption",
        referenceType: "productionLogs",
        referenceId: logId,
        notes: `Raw material for recipe: ${producedIngredient.name}`,
      });
    }

    // 4. Increase prepped factory item stock via centralized inventory service
    await ctx.runMutation(internal.inventory.mutateStock, {
      itemId: recipe.producedIngredientId,
      quantity: args.quantity,
      movementType: "production_output",
      referenceType: "productionLogs",
      referenceId: logId,
      notes: `Prepped recipe batch production`,
    });

    return { success: true };
  },
});

// Safe Batch Reversal (Deletes batch log and restores stock)
export const reverseBatch = mutation({
  args: {
    id: v.id("productionLogs"),
  },
  handler: async (ctx, args) => {
    const log = await ctx.db.get(args.id);
    if (!log) {
      throw new Error("Production log not found");
    }

    // 1. Check produced factory item stock to verify enough remains to reverse
    const producedIngredient = await ctx.db.get(log.producedIngredientId);
    if (!producedIngredient) {
      throw new Error("Produced ingredient item not found in database");
    }

    if (producedIngredient.stockQuantity < log.quantityProduced) {
      throw new Error(
        `Cannot delete this batch because produced stock has already been partially consumed. (Batch produced: ${log.quantityProduced} ${producedIngredient.unit}, Available: ${producedIngredient.stockQuantity} ${producedIngredient.unit})`
      );
    }

    // 2. Resolve ingredients to restore
    let toRestore: Array<{ ingredientId: Id<"ingredients">; quantity: number }> = [];

    if (log.ingredientsConsumed && log.ingredientsConsumed.length > 0) {
      toRestore = log.ingredientsConsumed;
    } else {
      // Fallback for legacy logs: look up the recipe
      const recipe = await ctx.db.get(log.recipeId);
      if (recipe) {
        const scaleFactor = log.quantityProduced / recipe.outputQuantity;
        toRestore = recipe.ingredients.map((ing) => ({
          ingredientId: ing.ingredientId,
          quantity: ing.quantity * scaleFactor,
        }));
      }
    }

    // 3. Deduct produced quantity from the prepped item stock via centralized inventory service
    await ctx.runMutation(internal.inventory.mutateStock, {
      itemId: log.producedIngredientId,
      quantity: -log.quantityProduced,
      movementType: "production_reversal",
      referenceType: "productionLogs",
      referenceId: args.id,
      notes: `Reversal of prepped batch production`,
    });

    // 4. Restore the raw ingredients stock via centralized inventory service
    for (const req of toRestore) {
      await ctx.runMutation(internal.inventory.mutateStock, {
        itemId: req.ingredientId,
        quantity: req.quantity,
        movementType: "production_reversal",
        referenceType: "productionLogs",
        referenceId: args.id,
        notes: `Restored raw materials from reversed batch`,
      });
    }

    // 5. Delete the production log
    await ctx.db.delete(args.id);

    return { success: true };
  },
});
