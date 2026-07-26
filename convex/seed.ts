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

    // 2. Add Raw Food Ingredients (Raw Materials)
    const breadSlicedId = await ctx.db.insert("ingredients", {
      name: "Sliced Sandwich Bread",
      category: "Food",
      stockQuantity: 200,
      unit: "slices",
      lowStockThreshold: 30,
    });

    const breadRollId = await ctx.db.insert("ingredients", {
      name: "Papoose Bread Roll",
      category: "Food",
      stockQuantity: 100,
      unit: "pcs",
      lowStockThreshold: 20,
    });

    const tunaId = await ctx.db.insert("ingredients", {
      name: "Canned Tuna",
      category: "Food",
      stockQuantity: 50,
      unit: "cans",
      lowStockThreshold: 10,
    });

    const chickenBreastId = await ctx.db.insert("ingredients", {
      name: "Chicken Breast",
      category: "Food",
      stockQuantity: 30,
      unit: "kg",
      lowStockThreshold: 5,
    });

    const chickenWholeId = await ctx.db.insert("ingredients", {
      name: "Whole Chicken",
      category: "Food",
      stockQuantity: 50,
      unit: "pcs",
      lowStockThreshold: 10,
    });

    const steakId = await ctx.db.insert("ingredients", {
      name: "Beef Steak",
      category: "Food",
      stockQuantity: 25,
      unit: "kg",
      lowStockThreshold: 5,
    });

    const rawMayoId = await ctx.db.insert("ingredients", {
      name: "Mayonnaise Base",
      category: "Food",
      stockQuantity: 15,
      unit: "kg",
      lowStockThreshold: 3,
    });

    const lettuceId = await ctx.db.insert("ingredients", {
      name: "Fresh Lettuce",
      category: "Food",
      stockQuantity: 15,
      unit: "kg",
      lowStockThreshold: 3,
    });

    const tomatoId = await ctx.db.insert("ingredients", {
      name: "Fresh Tomatoes",
      category: "Food",
      stockQuantity: 20,
      unit: "kg",
      lowStockThreshold: 4,
    });

    const potatoesId = await ctx.db.insert("ingredients", {
      name: "Potatoes",
      category: "Food",
      stockQuantity: 150,
      unit: "kg",
      lowStockThreshold: 30,
    });

    const riceId = await ctx.db.insert("ingredients", {
      name: "Basmati Rice",
      category: "Food",
      stockQuantity: 100,
      unit: "kg",
      lowStockThreshold: 20,
    });

    const oilId = await ctx.db.insert("ingredients", {
      name: "Cooking Oil",
      category: "Food",
      stockQuantity: 50,
      unit: "L",
      lowStockThreshold: 10,
    });

    // 3. Add Kitchen Prepared Ingredients & Food Bases (Kitchen Category)
    // Prepared in the kitchen and consumed directly by dishes
    const periSauceId = await ctx.db.insert("ingredients", {
      name: "House Peri-Peri Sauce Prep",
      category: "Kitchen",
      stockQuantity: 25,
      unit: "L",
      lowStockThreshold: 5,
    });

    const garlicSauceId = await ctx.db.insert("ingredients", {
      name: "Garlic Sauce Prep",
      category: "Kitchen",
      stockQuantity: 15,
      unit: "L",
      lowStockThreshold: 3,
    });

    const garlicPasteId = await ctx.db.insert("ingredients", {
      name: "Garlic & Herb Paste",
      category: "Kitchen",
      stockQuantity: 10,
      unit: "kg",
      lowStockThreshold: 2,
    });

    const chickenRubId = await ctx.db.insert("ingredients", {
      name: "Portuguese Chicken Spice Rub",
      category: "Kitchen",
      stockQuantity: 15,
      unit: "kg",
      lowStockThreshold: 3,
    });

    const garlicButterId = await ctx.db.insert("ingredients", {
      name: "Garlic Butter Spread",
      category: "Kitchen",
      stockQuantity: 10,
      unit: "kg",
      lowStockThreshold: 2,
    });

    const houseMayoId = await ctx.db.insert("ingredients", {
      name: "House Mayo Dressing",
      category: "Kitchen",
      stockQuantity: 15,
      unit: "kg",
      lowStockThreshold: 3,
    });

    const chipSaltId = await ctx.db.insert("ingredients", {
      name: "Seasoned Chips Salt Mix",
      category: "Kitchen",
      stockQuantity: 8,
      unit: "kg",
      lowStockThreshold: 2,
    });

    const lemonJuiceId = await ctx.db.insert("ingredients", {
      name: "Lemon Juice Concentrate",
      category: "Kitchen",
      stockQuantity: 10,
      unit: "L",
      lowStockThreshold: 2,
    });

    // 4. Add Drink Ingredients
    const cokeId = await ctx.db.insert("ingredients", {
      name: "Coca Cola 330ml Can",
      category: "Drinks",
      stockQuantity: 120,
      unit: "pcs",
      lowStockThreshold: 24,
    });

    const fantaId = await ctx.db.insert("ingredients", {
      name: "Fanta Orange 330ml Can",
      category: "Drinks",
      stockQuantity: 96,
      unit: "pcs",
      lowStockThreshold: 24,
    });

    const spriteId = await ctx.db.insert("ingredients", {
      name: "Sprite 330ml Can",
      category: "Drinks",
      stockQuantity: 96,
      unit: "pcs",
      lowStockThreshold: 24,
    });

    const waterId = await ctx.db.insert("ingredients", {
      name: "Still Water 500ml Bottle",
      category: "Drinks",
      stockQuantity: 150,
      unit: "pcs",
      lowStockThreshold: 30,
    });

    // 5. Add Packaging Ingredients
    const sandwichWrapperId = await ctx.db.insert("ingredients", {
      name: "Sandwich Foil Wrapper",
      category: "Packaging",
      stockQuantity: 300,
      unit: "pcs",
      lowStockThreshold: 50,
    });

    const smallBoxId = await ctx.db.insert("ingredients", {
      name: "Takeaway Meal Box (Small)",
      category: "Packaging",
      stockQuantity: 200,
      unit: "pcs",
      lowStockThreshold: 40,
    });

    const largeBoxId = await ctx.db.insert("ingredients", {
      name: "Takeaway Meal Box (Large)",
      category: "Packaging",
      stockQuantity: 200,
      unit: "pcs",
      lowStockThreshold: 40,
    });

    const friesBagId = await ctx.db.insert("ingredients", {
      name: "Fries Paper Bag",
      category: "Packaging",
      stockQuantity: 250,
      unit: "pcs",
      lowStockThreshold: 50,
    });

    const paperBagId = await ctx.db.insert("ingredients", {
      name: "Paper Carry Bag",
      category: "Packaging",
      stockQuantity: 300,
      unit: "pcs",
      lowStockThreshold: 50,
    });

    // 6. Add Dishes & Standalone Packaging
    const tunaSandwich = await ctx.db.insert("dishes", {
      name: "Tuna Sandwich",
      price: 180,
      category: "Sandwiches",
      isActive: true,
      description: "Freshly toasted sandwich stuffed with seasoned tuna, house mayo dressing, and fresh lettuce.",
      standalonePackaging: [{ ingredientId: sandwichWrapperId, quantity: 1 }],
    });

    const chickenSandwich = await ctx.db.insert("dishes", {
      name: "Chicken Sandwich",
      price: 220,
      category: "Sandwiches",
      isActive: true,
      description: "Grilled chicken breast sandwich with house mayo dressing, lettuce, and ripe tomatoes.",
      standalonePackaging: [{ ingredientId: sandwichWrapperId, quantity: 1 }],
    });

    const pregoSteak = await ctx.db.insert("dishes", {
      name: "Prego Steak Roll",
      price: 250,
      category: "Sandwiches",
      isActive: true,
      description: "Traditional Portuguese prego roll with tender beef steak, garlic sauce, and garlic butter spread.",
      standalonePackaging: [{ ingredientId: sandwichWrapperId, quantity: 1 }],
    });

    const quarterChicken = await ctx.db.insert("dishes", {
      name: "1/4 Roasted Chicken",
      price: 350,
      category: "Chicken",
      isActive: true,
      description: "Our signature flame-roasted quarter chicken seasoned with rich house peri-peri sauce.",
      standalonePackaging: [{ ingredientId: smallBoxId, quantity: 1 }],
    });

    const halfChicken = await ctx.db.insert("dishes", {
      name: "1/2 Roasted Chicken",
      price: 600,
      category: "Chicken",
      isActive: true,
      description: "Half flame-roasted chicken, perfect for a full meal.",
      standalonePackaging: [{ ingredientId: largeBoxId, quantity: 1 }],
    });

    const fullChicken = await ctx.db.insert("dishes", {
      name: "Full Roasted Chicken",
      price: 1100,
      category: "Chicken",
      isActive: true,
      description: "Whole flame-roasted chicken prepared with house peri-peri marinade.",
      standalonePackaging: [{ ingredientId: largeBoxId, quantity: 1 }],
    });

    const chickenRice = await ctx.db.insert("dishes", {
      name: "Chicken & Rice Box",
      price: 400,
      category: "Chicken",
      isActive: true,
      description: "Tender quarter chicken served on top of fragrant basmati rice.",
      standalonePackaging: [{ ingredientId: smallBoxId, quantity: 1 }],
    });

    const frenchFries = await ctx.db.insert("dishes", {
      name: "French Fries (Large)",
      price: 150,
      category: "Sides",
      isActive: true,
      description: "Crispy golden fried potato chips lightly seasoned.",
      selectableInCombo: true,
      comboRole: "Side",
      standalonePackaging: [{ ingredientId: friesBagId, quantity: 1 }],
    });

    const riceSide = await ctx.db.insert("dishes", {
      name: "Basmati Rice Side",
      price: 120,
      category: "Sides",
      isActive: true,
      description: "Fluffy seasoned basmati rice side portion.",
      selectableInCombo: true,
      comboRole: "Side",
      standalonePackaging: [{ ingredientId: smallBoxId, quantity: 1 }],
    });

    const cokeDrink = await ctx.db.insert("dishes", {
      name: "Coca Cola 330ml",
      price: 70,
      category: "Drinks",
      isActive: true,
      description: "Refreshing cold Coca Cola can.",
      selectableInCombo: true,
      comboRole: "Drink",
    });

    const fantaDrink = await ctx.db.insert("dishes", {
      name: "Fanta Orange 330ml",
      price: 70,
      category: "Drinks",
      isActive: true,
      description: "Refreshing cold Fanta Orange can.",
      selectableInCombo: true,
      comboRole: "Drink",
    });

    const spriteDrink = await ctx.db.insert("dishes", {
      name: "Sprite 330ml",
      price: 70,
      category: "Drinks",
      isActive: true,
      description: "Refreshing cold Sprite can.",
      selectableInCombo: true,
      comboRole: "Drink",
    });

    const waterDrink = await ctx.db.insert("dishes", {
      name: "Still Water 500ml",
      price: 50,
      category: "Drinks",
      isActive: true,
      description: "Bottled natural still water.",
      selectableInCombo: true,
      comboRole: "Drink",
    });

    // Combos
    await ctx.db.insert("dishes", {
      name: "Tuna Sandwich Combo",
      price: 280,
      category: "Combos",
      isActive: true,
      isCombo: true,
      description: "Tuna sandwich served with your choice of side and drink.",
      comboConfig: {
        allowedSides: [frenchFries, riceSide],
        allowedDrinks: [cokeDrink, fantaDrink, spriteDrink, waterDrink],
        sidesLimit: 1,
        drinksLimit: 1,
      },
      comboPackaging: [
        { ingredientId: largeBoxId, quantity: 1 },
        { ingredientId: paperBagId, quantity: 1 },
      ],
    });

    await ctx.db.insert("dishes", {
      name: "1/4 Chicken Meal Combo",
      price: 480,
      category: "Combos",
      isActive: true,
      isCombo: true,
      description: "1/4 Roasted Chicken served with your choice of side and drink.",
      comboConfig: {
        allowedSides: [frenchFries, riceSide],
        allowedDrinks: [cokeDrink, fantaDrink, spriteDrink, waterDrink],
        sidesLimit: 1,
        drinksLimit: 1,
      },
      comboPackaging: [
        { ingredientId: largeBoxId, quantity: 1 },
        { ingredientId: paperBagId, quantity: 1 },
      ],
    });

    // 7. Recipe Ingredient Mappings (dishIngredients table)
    // Tuna Sandwich: 2 bread slices, 0.5 can tuna, 0.03 kg house mayo, 0.02 kg lettuce
    await ctx.db.insert("dishIngredients", { dishId: tunaSandwich, ingredientId: breadSlicedId, quantity: 2 });
    await ctx.db.insert("dishIngredients", { dishId: tunaSandwich, ingredientId: tunaId, quantity: 0.5 });
    await ctx.db.insert("dishIngredients", { dishId: tunaSandwich, ingredientId: houseMayoId, quantity: 0.03 });
    await ctx.db.insert("dishIngredients", { dishId: tunaSandwich, ingredientId: lettuceId, quantity: 0.02 });

    // Chicken Sandwich: 2 bread slices, 0.15 kg chicken breast, 0.03 kg house mayo, 0.02 kg lettuce, 0.02 kg tomato, garlic butter
    await ctx.db.insert("dishIngredients", { dishId: chickenSandwich, ingredientId: breadSlicedId, quantity: 2 });
    await ctx.db.insert("dishIngredients", { dishId: chickenSandwich, ingredientId: chickenBreastId, quantity: 0.15 });
    await ctx.db.insert("dishIngredients", { dishId: chickenSandwich, ingredientId: houseMayoId, quantity: 0.03 });
    await ctx.db.insert("dishIngredients", { dishId: chickenSandwich, ingredientId: lettuceId, quantity: 0.02 });
    await ctx.db.insert("dishIngredients", { dishId: chickenSandwich, ingredientId: tomatoId, quantity: 0.02 });
    await ctx.db.insert("dishIngredients", { dishId: chickenSandwich, ingredientId: garlicButterId, quantity: 0.01 });

    // Prego Steak Roll: 1 bread roll, 0.18 kg steak, 0.03 L garlic sauce prep, garlic & herb paste
    await ctx.db.insert("dishIngredients", { dishId: pregoSteak, ingredientId: breadRollId, quantity: 1 });
    await ctx.db.insert("dishIngredients", { dishId: pregoSteak, ingredientId: steakId, quantity: 0.18 });
    await ctx.db.insert("dishIngredients", { dishId: pregoSteak, ingredientId: garlicSauceId, quantity: 0.03 });
    await ctx.db.insert("dishIngredients", { dishId: pregoSteak, ingredientId: garlicPasteId, quantity: 0.01 });

    // 1/4 Chicken: 0.25 whole chicken, 0.05 L house peri-peri sauce prep, chicken spice rub, lemon juice
    await ctx.db.insert("dishIngredients", { dishId: quarterChicken, ingredientId: chickenWholeId, quantity: 0.25 });
    await ctx.db.insert("dishIngredients", { dishId: quarterChicken, ingredientId: periSauceId, quantity: 0.05 });
    await ctx.db.insert("dishIngredients", { dishId: quarterChicken, ingredientId: chickenRubId, quantity: 0.015 });
    await ctx.db.insert("dishIngredients", { dishId: quarterChicken, ingredientId: lemonJuiceId, quantity: 0.01 });

    // 1/2 Chicken: 0.5 whole chicken, 0.1 L house peri-peri sauce prep, chicken spice rub, lemon juice
    await ctx.db.insert("dishIngredients", { dishId: halfChicken, ingredientId: chickenWholeId, quantity: 0.5 });
    await ctx.db.insert("dishIngredients", { dishId: halfChicken, ingredientId: periSauceId, quantity: 0.1 });
    await ctx.db.insert("dishIngredients", { dishId: halfChicken, ingredientId: chickenRubId, quantity: 0.03 });
    await ctx.db.insert("dishIngredients", { dishId: halfChicken, ingredientId: lemonJuiceId, quantity: 0.02 });

    // Full Chicken: 1.0 whole chicken, 0.2 L house peri-peri sauce prep, chicken spice rub, lemon juice
    await ctx.db.insert("dishIngredients", { dishId: fullChicken, ingredientId: chickenWholeId, quantity: 1.0 });
    await ctx.db.insert("dishIngredients", { dishId: fullChicken, ingredientId: periSauceId, quantity: 0.2 });
    await ctx.db.insert("dishIngredients", { dishId: fullChicken, ingredientId: chickenRubId, quantity: 0.06 });
    await ctx.db.insert("dishIngredients", { dishId: fullChicken, ingredientId: lemonJuiceId, quantity: 0.04 });

    // Chicken & Rice Box: 0.25 whole chicken, 0.25 kg rice, 0.03 L house peri sauce prep
    await ctx.db.insert("dishIngredients", { dishId: chickenRice, ingredientId: chickenWholeId, quantity: 0.25 });
    await ctx.db.insert("dishIngredients", { dishId: chickenRice, ingredientId: riceId, quantity: 0.25 });
    await ctx.db.insert("dishIngredients", { dishId: chickenRice, ingredientId: periSauceId, quantity: 0.03 });

    // French Fries: 0.35 kg potatoes, 0.06 L oil, chip salt mix
    await ctx.db.insert("dishIngredients", { dishId: frenchFries, ingredientId: potatoesId, quantity: 0.35 });
    await ctx.db.insert("dishIngredients", { dishId: frenchFries, ingredientId: oilId, quantity: 0.06 });
    await ctx.db.insert("dishIngredients", { dishId: frenchFries, ingredientId: chipSaltId, quantity: 0.005 });

    // Rice Side: 0.25 kg rice, 0.02 L oil
    await ctx.db.insert("dishIngredients", { dishId: riceSide, ingredientId: riceId, quantity: 0.25 });
    await ctx.db.insert("dishIngredients", { dishId: riceSide, ingredientId: oilId, quantity: 0.02 });

    // Drinks
    await ctx.db.insert("dishIngredients", { dishId: cokeDrink, ingredientId: cokeId, quantity: 1 });
    await ctx.db.insert("dishIngredients", { dishId: fantaDrink, ingredientId: fantaId, quantity: 1 });
    await ctx.db.insert("dishIngredients", { dishId: spriteDrink, ingredientId: spriteId, quantity: 1 });
    await ctx.db.insert("dishIngredients", { dishId: waterDrink, ingredientId: waterId, quantity: 1 });

    return { status: "success", message: "Database seeded with prepared food bases, drinks, packaging and recipe ingredients!" };
  },
});
