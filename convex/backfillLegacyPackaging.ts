import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";

export default mutation({
  handler: async (ctx) => {
    console.log("Starting legacy packaging migration...");
    const dishes = await ctx.db.query("dishes").collect();
    let migratedCount = 0;

    for (const dish of dishes) {
      let needsMigration = false;
      const updates: any = {};

      // Migrate standalone packaging
      if ((dish as any).standalonePackagingIngredientId && (dish as any).standalonePackagingQuantity) {
        updates.standalonePackaging = [
          {
            ingredientId: (dish as any).standalonePackagingIngredientId,
            quantity: (dish as any).standalonePackagingQuantity,
          },
        ];
        needsMigration = true;
      }

      // Migrate combo packaging
      if ((dish as any).comboPackagingIngredientId && (dish as any).comboPackagingQuantity) {
        updates.comboPackaging = [
          {
            ingredientId: (dish as any).comboPackagingIngredientId,
            quantity: (dish as any).comboPackagingQuantity,
          },
        ];
        needsMigration = true;
      }

      // Remove legacy fields (to be fully removed from schema later)
      // Note: Convex db.patch allows setting fields to undefined to remove them 
      updates.standalonePackagingIngredientId = undefined;
      updates.standalonePackagingQuantity = undefined;
      updates.comboPackagingIngredientId = undefined;
      updates.comboPackagingQuantity = undefined;
      updates.comboRules = undefined;
      updates.promoRules = undefined;

      if (needsMigration || 
          (dish as any).standalonePackagingIngredientId || 
          (dish as any).comboPackagingIngredientId || 
          (dish as any).comboRules || 
          (dish as any).promoRules) {
        
        await ctx.db.patch(dish._id, updates);
        migratedCount++;
        console.log(`Migrated dish: ${dish.name}`);
      }
    }

    console.log(`Migration complete! Migrated ${migratedCount} dishes.`);
    return `Migrated ${migratedCount} dishes successfully.`;
  },
});
