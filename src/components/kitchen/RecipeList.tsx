"use client";

import React from "react";
import { FileText, Layers, ChefHat, Play, Edit2, Trash2 } from "lucide-react";

interface RecipeListProps {
  recipes: any[] | undefined;
  onProduceClick: (recipe: any) => void;
  onEditClick: (recipe: any) => void;
  onDeleteClick: (recipe: any) => void;
}

export function RecipeList({
  recipes,
  onProduceClick,
  onEditClick,
  onDeleteClick,
}: RecipeListProps) {
  return (
    <div className="bg-surface border-2 border-outline rounded-lg shadow-hard overflow-hidden">
      <div className="p-6 border-b-2 border-outline bg-surface-container-low/50">
        <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] flex items-center gap-2">
          <FileText className="w-4 h-4 text-primary" /> Defined Recipes
        </h3>
      </div>
      
      {recipes && recipes.length === 0 ? (
        <div className="text-center py-20 text-on-surface-variant/40 font-bold uppercase tracking-widest">
          <Layers className="w-16 h-16 mx-auto mb-4 opacity-40" />
          No kitchen recipes defined yet.
        </div>
      ) : (
        <div className="divide-y-2 divide-black">
          {recipes?.map((recipe: any) => (
            <div key={recipe._id} className="p-6 hover:bg-primary/5 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-black flex items-center justify-center text-primary shadow-hard-sm">
                    <ChefHat className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-display text-xl text-on-surface uppercase tracking-wider">{recipe.producedIngredientName}</h4>
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">
                      Recipe Standard Output: {recipe.outputQuantity} {recipe.producedIngredientUnit}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 pt-2">
                  {recipe.ingredients.map((ing: any, idx: number) => (
                    <div key={idx} className="bg-surface-container-high border border-black/10 px-3 py-1 rounded-xl text-[10px] font-bold text-on-surface flex items-center gap-1.5">
                      <span className="font-black text-primary">{ing.quantity} {ing.unit}</span>
                      <span className="text-on-surface-variant">{ing.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-3 self-end lg:self-center">
                <button
                  onClick={() => onProduceClick(recipe)}
                  className="bg-primary text-on-primary px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-secondary active:scale-95 transition-all shadow-hard-sm border-2 border-black/10 flex items-center gap-1.5"
                >
                  <Play className="w-4 h-4" /> Produce
                </button>
                <button
                  onClick={() => onEditClick(recipe)}
                  className="p-2.5 rounded-xl text-on-surface-variant hover:bg-surface-container-high border border-transparent hover:border-outline-variant transition-all"
                  title="Edit Recipe"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => onDeleteClick(recipe)}
                  className="p-2.5 rounded-xl text-error hover:bg-error/10 border border-transparent hover:border-outline-variant transition-all"
                  title="Delete Recipe"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
