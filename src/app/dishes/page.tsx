"use client";

import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency } from "@/lib/utils";
import { useState } from "react";
import { DishModal } from "@/components/DishModal";
import {
  UtensilsCrossed,
  Plus,
  Scale,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from "lucide-react";
import { toast } from "sonner";

export default function DishesPage() {
  const dishes = useQuery(api.dishes.list);
  const ingredients = useQuery(api.ingredients.list);
  const removeDish = useMutation(api.dishes.remove);
  const seedMenu = useMutation(api.seed.seed);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDish, setEditingDish] = useState<any>(null);
  const [dishToDelete, setDishToDelete] = useState<any>(null);
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedMenu = async () => {
    if (!confirm("Are you sure you want to seed/reset sample menu dishes and inventory ingredients?")) return;
    setIsSeeding(true);
    try {
      await seedMenu();
      toast.success("Sample menu and recipe ingredients seeded successfully!");
    } catch (err: any) {
      toast.error("Failed to seed menu: " + err.message);
    } finally {
      setIsSeeding(false);
    }
  };

  const toggleCategory = (cat: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const handleEdit = (dish: any) => {
    setEditingDish(dish);
    setIsModalOpen(true);
  };

  const handleCreate = () => {
    setEditingDish(null);
    setIsModalOpen(true);
  };

  const handleDeleteClick = (dish: any) => {
    setDishToDelete(dish);
  };

  return (
    <PageLayout isFullWidth>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-on-surface">Menu & Recipes</h1>
            <p className="text-on-surface-variant font-medium">Manage your dishes and their ingredient compositions</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSeedMenu}
              disabled={isSeeding}
              className="bg-surface-container-high border border-outline/30 text-on-surface px-4 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-surface-container-highest transition-all shadow-sm active:scale-95 disabled:opacity-50 cursor-pointer"
              title="Populate complete sample menu and ingredient recipes"
            >
              <RefreshCw className={`w-4 h-4 text-primary ${isSeeding ? "animate-spin" : ""}`} />
              <span>{isSeeding ? "Seeding..." : "Load Sample Menu"}</span>
            </button>
            <button
              onClick={handleCreate}
              className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold flex items-center gap-2 hover:bg-terracotta transition-all shadow-soft active:scale-95 cursor-pointer"
            >
              <Plus className="w-5 h-5" />
              <span>Create New Dish</span>
            </button>
          </div>
        </div>

        {/* Group dishes by category, sorted alphabetically within each group */}
        {(() => {
          const CATEGORY_ORDER = ["Chicken", "Sides", "Pizza", "Combos", "Cold Drinks", "Extras"];
          const grouped = (dishes ?? []).reduce((acc: Record<string, any[]>, dish) => {
            const cat = dish.category || "Other";
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(dish);
            return acc;
          }, {});

          // Sort categories by the defined order, with unknown at end
          const sortedCategories = Object.keys(grouped).sort((a, b) => {
            const ai = CATEGORY_ORDER.indexOf(a);
            const bi = CATEGORY_ORDER.indexOf(b);
            if (ai === -1 && bi === -1) return a.localeCompare(b);
            if (ai === -1) return 1;
            if (bi === -1) return -1;
            return ai - bi;
          });

          return sortedCategories.map((category) => {
            const isCollapsed = collapsedCategories.has(category);
            return (
            <div key={category} className="space-y-4">
              <button
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center gap-3 group"
              >
                <h2 className="text-lg font-black text-on-surface uppercase tracking-widest group-hover:text-primary transition-colors">{category}</h2>
                <div className="flex-1 h-px bg-outline-variant/40" />
                <span className="text-base font-black text-on-surface-variant">{grouped[category].length} dish{grouped[category].length !== 1 ? 'es' : ''}</span>
                {isCollapsed
                  ? <ChevronDown className="w-5 h-5 text-on-surface-variant" />
                  : <ChevronUp className="w-5 h-5 text-on-surface-variant" />}
              </button>
              {!isCollapsed && (
              <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                {grouped[category]
                  .slice()
                  .sort((a: any, b: any) => a.name.localeCompare(b.name))
                  .map((dish: any) => (
                    <div key={dish._id} className="bg-surface-container-low border border-outline-variant rounded-2xl shadow-soft overflow-hidden flex h-[280px] group relative">
                      <div className="absolute top-4 left-4 flex gap-2 z-10">
                        <div className="bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md shadow-soft">
                          {dish.category}
                        </div>
                        {!dish.isActive && (
                          <div className="bg-error text-on-error text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-md shadow-soft">
                            Hidden
                          </div>
                        )}
                      </div>

                      <div className="flex-1 p-8 pt-14 flex flex-col">
                        <div className="flex items-start justify-between mb-4">
                          <div>
                            <h3 className="text-2xl font-black text-on-surface group-hover:text-primary transition-colors">
                              {dish.name}
                            </h3>
                            <p className="text-2xl font-black text-primary">{formatCurrency(dish.price)}</p>
                            {dish.description && (
                              <p className="text-sm font-medium text-on-surface-variant mt-1 line-clamp-1">{dish.description}</p>
                            )}
                          </div>
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => handleEdit(dish)}
                              className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-on-surface-variant hover:bg-primary-container hover:text-on-primary-container transition-all"
                            >
                              <Edit2 className="w-5 h-5" />
                            </button>
                            <button
                              onClick={() => handleDeleteClick(dish)}
                              className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center text-error hover:bg-error hover:text-on-error transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </div>
                        </div>

                        <div className="flex-1">
                          <p className="text-xs font-black text-on-surface-variant uppercase tracking-wider mb-3 flex items-center gap-2">
                            <Scale className="w-3 h-3" /> Recipe Composition
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {dish.ingredients.map((di: any) => {
                              const ing = ingredients?.find((i) => i._id === di.ingredientId);
                              return (
                                <div key={di.ingredientId} className="bg-surface-container-high px-3 py-2 rounded-xl border border-outline-variant/50 flex items-center gap-2">
                                  <span className="text-xs font-bold text-on-surface">{ing?.name}</span>
                                  <span className="text-xs font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                                    {di.quantity} {ing?.unit}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>


                      </div>
                    </div>
                  ))}
              </div>
              )}
            </div>
            );
          });
        })()}
      </div>

      <DishModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        initialData={editingDish}
      />

      {dishToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-black text-on-surface mb-2">Delete Dish</h2>
            <p className="text-on-surface-variant font-medium mb-6">
              Are you sure you want to delete <span className="font-bold text-on-surface">{dishToDelete.name}</span>? This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setDishToDelete(null)}
                className="px-6 py-2 rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    await removeDish({ id: dishToDelete._id });
                    setDishToDelete(null);
                  } catch (e: any) {
                    alert("Failed to delete: " + e.message);
                  }
                }}
                className="bg-error text-on-error px-6 py-2 rounded-xl font-bold hover:bg-error/90 transition-all shadow-soft active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
