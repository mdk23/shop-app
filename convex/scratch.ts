import { mutation } from "./_generated/server";

export const addFrangoToFullRecipe = mutation({
  args: {},
  handler: async (ctx) => {
    // Find the dish "Full"
    const dishes = await ctx.db.query("dishes").collect();
    const fullDish = dishes.find((d) => d.name === "Full");
    if (!fullDish) return { error: "Dish 'Full' not found" };

    // Find the ingredient "Frango"
    const ingredients = await ctx.db.query("ingredients").collect();
    const frangoIng = ingredients.find((i) => i.name === "Frango");
    if (!frangoIng) return { error: "Ingredient 'Frango' not found" };

    // Check if the recipe association already exists
    const existing = await ctx.db
      .query("dishIngredients")
      .withIndex("by_dish", (q) => q.eq("dishId", fullDish._id))
      .collect();
      
    const hasFrango = existing.some((di) => di.ingredientId === frangoIng._id);
    if (hasFrango) return { message: "Frango is already in the recipe for Full" };

    // Insert the ingredient into the recipe
    await ctx.db.insert("dishIngredients", {
      dishId: fullDish._id,
      ingredientId: frangoIng._id,
      quantity: 1
    });

    return { success: true, message: "Added 1x Frango to the recipe of 'Full'" };
  }
});
