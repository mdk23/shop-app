import { mutation } from "./_generated/server";

export const seed = mutation({
  args: {},
  handler: async (ctx) => {
    // 1. Clear existing data
    const dishes = await ctx.db.query("dishes").collect();
    for (const d of dishes) await ctx.db.delete(d._id);
    
    const ingredients = await ctx.db.query("ingredients").collect();
    for (const i of ingredients) await ctx.db.delete(i._id);
    
    const dishIngredients = await ctx.db.query("dishIngredients").collect();
    for (const di of dishIngredients) await ctx.db.delete(di._id);

    // 2. Add Ingredients
    const chickenId = await ctx.db.insert("ingredients", {
      name: "Whole Chicken",
      category: "Food",
      stockQuantity: 50,
      unit: "pcs",
      lowStockThreshold: 10,
    });
    
    const riceId = await ctx.db.insert("ingredients", {
      name: "Basmati Rice",
      category: "Food",
      stockQuantity: 100,
      unit: "kg",
      lowStockThreshold: 20,
    });
    
    const oilId = await ctx.db.insert("ingredients", {
      name: "Vegetable Oil",
      category: "Food",
      stockQuantity: 20,
      unit: "L",
      lowStockThreshold: 5,
    });

    const cokeId = await ctx.db.insert("ingredients", {
      name: "Coca Cola 330ml",
      category: "Drinks",
      stockQuantity: 100,
      unit: "pcs",
      lowStockThreshold: 24,
    });

    // 3. Add Dishes
    const quarterChicken = await ctx.db.insert("dishes", {
      name: "1/4 Roasted Chicken",
      price: 12.50,
      category: "Chicken",
      imageUrl: "https://images.unsplash.com/photo-1598103442097-8b74394b95c6?auto=format&fit=crop&q=80&w=400",
      isActive: true,
      description: "Our signature roasted quarter chicken, perfectly seasoned and cooked to perfection.",
    });

    const halfChicken = await ctx.db.insert("dishes", {
      name: "1/2 Roasted Chicken",
      price: 18.90,
      category: "Chicken",
      imageUrl: "https://images.unsplash.com/photo-1626082927389-6cd097cdc6ec?auto=format&fit=crop&q=80&w=400",
      isActive: true,
      description: "A hearty half chicken, ideal for sharing or a big appetite.",
    });

    const chickenRice = await ctx.db.insert("dishes", {
      name: "Chicken & Rice Box",
      price: 14.50,
      category: "Chicken",
      imageUrl: "https://images.unsplash.com/photo-1547592166-23ac45744acd?auto=format&fit=crop&q=80&w=400",
      isActive: true,
      description: "Tender chicken pieces served over a bed of fragrant basmati rice.",
    });

    const softDrink = await ctx.db.insert("dishes", {
      name: "Soft Drink",
      price: 2.50,
      category: "Drinks",
      imageUrl: "https://images.unsplash.com/photo-1622483767028-3f66f32aef97?auto=format&fit=crop&q=80&w=400",
      isActive: true,
      description: "A refreshing cold beverage.",
    });

    // 4. Add Recipes
    await ctx.db.insert("dishIngredients", { dishId: quarterChicken, ingredientId: chickenId, quantity: 0.25 });
    await ctx.db.insert("dishIngredients", { dishId: halfChicken, ingredientId: chickenId, quantity: 0.5 });
    await ctx.db.insert("dishIngredients", { dishId: chickenRice, ingredientId: chickenId, quantity: 0.25 });
    await ctx.db.insert("dishIngredients", { dishId: chickenRice, ingredientId: riceId, quantity: 0.2 });
    await ctx.db.insert("dishIngredients", { dishId: softDrink, ingredientId: cokeId, quantity: 1 });
  },
});
