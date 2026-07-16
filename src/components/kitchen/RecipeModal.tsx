"use client";

import React from "react";
import { X, FileText, ChevronDown, Layers, Plus, Trash2, Play } from "lucide-react";
import { SearchableIngredientSelect } from "./SearchableIngredientSelect";
import { cn } from "@/lib/utils";

interface RecipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingRecipeId: string | null;
  recipeProducedId: string;
  setRecipeProducedId: (id: string) => void;
  recipeOutputQty: string;
  setRecipeOutputQty: (qty: string) => void;
  recipeCategory: string;
  setRecipeCategory: (cat: string) => void;
  recipeNotes: string;
  setRecipeNotes: (notes: string) => void;
  recipeIngredients: Array<{ ingredientId: string; quantity: string }>;
  factoryItems: any[];
  rawIngredients: any[];
  isSavingRecipe: boolean;
  actionAfterSave: "close" | "produce";
  setActionAfterSave: (act: "close" | "produce") => void;
  onSave: (e: React.FormEvent) => void;
  onAddIngredientRow: () => void;
  onRemoveIngredientRow: (index: number) => void;
  onIngredientRowChange: (index: number, field: "ingredientId" | "quantity", value: string) => void;
}

export function RecipeModal({
  isOpen,
  onClose,
  editingRecipeId,
  recipeProducedId,
  setRecipeProducedId,
  recipeOutputQty,
  setRecipeOutputQty,
  recipeCategory,
  setRecipeCategory,
  recipeNotes,
  setRecipeNotes,
  recipeIngredients,
  factoryItems,
  rawIngredients,
  isSavingRecipe,
  actionAfterSave,
  setActionAfterSave,
  onSave,
  onAddIngredientRow,
  onRemoveIngredientRow,
  onIngredientRowChange,
}: RecipeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-[100vw] h-[100vh] sm:w-[95vw] sm:h-[95vh] lg:w-[90vw] lg:h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-outline-variant animate-in fade-in-50 zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant bg-surface-container-low shrink-0">
          <div>
            <h2 className="text-2xl font-black text-on-surface uppercase tracking-wider">
              {editingRecipeId ? "Edit Prep Recipe" : "Define Prep Recipe"}
            </h2>
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mt-1 opacity-60">
              Configure standardized manufacturing formulas
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-highest hover:bg-error hover:text-on-error transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={onSave} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Left Column */}
            <div className="lg:w-[40%] bg-surface-container-low/30 border-r border-outline-variant/60 p-6 lg:p-8 overflow-y-auto space-y-8">
              <div className="space-y-6">
                <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.2em] border-b-2 border-black/10 pb-4 flex items-center gap-2">
                  <FileText className="w-5 h-5 text-primary" />
                  Recipe Information
                </h3>
                
                {/* Target prep item */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Prepped Item to Produce (Kitchen Category) *</label>
                  <div className="relative">
                    <select
                      required
                      value={recipeProducedId}
                      onChange={(e) => setRecipeProducedId(e.target.value)}
                      className="w-full bg-surface border-2 border-black rounded-xl px-4 py-4 text-on-surface font-black uppercase tracking-wider text-xs focus:border-primary outline-none appearance-none cursor-pointer"
                    >
                      <option value="" disabled>Choose kitchen item...</option>
                      {factoryItems.map((item: any) => (
                        <option key={item._id} value={item._id}>
                          {item.name} ({item.unit})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40" />
                  </div>
                </div>

                {/* Output quantity */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Yield / Output Quantity *</label>
                  <input
                    required
                    type="number"
                    step="any"
                    min="0.01"
                    placeholder="e.g. 10.00"
                    value={recipeOutputQty}
                    onChange={(e) => setRecipeOutputQty(e.target.value)}
                    className="w-full bg-surface border-2 border-black rounded-xl px-4 py-4 text-on-surface font-black text-lg focus:border-primary outline-none"
                  />
                </div>

                {/* Category */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Recipe Category</label>
                  <input
                    type="text"
                    placeholder="e.g. Sauce Base, Marinade..."
                    value={recipeCategory}
                    onChange={(e) => setRecipeCategory(e.target.value)}
                    className="w-full bg-surface border-2 border-black rounded-xl px-4 py-4 text-on-surface font-black text-sm focus:border-primary outline-none"
                  />
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Recipe Notes & Instructions</label>
                  <textarea
                    placeholder="e.g. Blend for 5 minutes until smooth..."
                    value={recipeNotes}
                    onChange={(e) => setRecipeNotes(e.target.value)}
                    className="w-full bg-surface border-2 border-black rounded-xl px-4 py-4 text-on-surface font-bold text-sm focus:border-primary outline-none h-32 resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Right Column */}
            <div className="lg:w-[60%] p-6 lg:p-8 overflow-y-auto flex flex-col">
              <div className="flex justify-between items-center border-b-2 border-black/10 pb-4 mb-6 shrink-0">
                <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.2em] flex items-center gap-2">
                  <Layers className="w-5 h-5 text-primary" />
                  Ingredient Composition
                </h3>
                <button
                  type="button"
                  onClick={onAddIngredientRow}
                  className="inline-flex items-center gap-1.5 text-xs font-black text-primary uppercase tracking-widest bg-primary/10 hover:bg-primary border border-primary/20 hover:text-on-primary px-4 py-2.5 rounded-xl transition-all shadow-hard-sm"
                >
                  <Plus className="w-4 h-4" /> Add Row
                </button>
              </div>

              {/* Table */}
              <div className="border-2 border-black rounded-2xl overflow-hidden bg-surface-container-low flex-1">
                <table className="w-full border-collapse">
                  <thead className="sticky top-0 z-10 bg-black text-white">
                    <tr className="text-left">
                      <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[40%]">Ingredient *</th>
                      <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[20%]">Quantity Required *</th>
                      <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[15%] text-center">Unit</th>
                      <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[15%] text-center">Current Stock</th>
                      <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[10%] text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y-2 divide-black bg-surface">
                    {recipeIngredients.map((ri: any, index: number) => {
                      const selectedIngDetail = rawIngredients.find((r: any) => r._id === ri.ingredientId);
                      return (
                        <tr key={index} className="hover:bg-primary/5 transition-colors">
                          <td className="px-5 py-4">
                            <SearchableIngredientSelect
                              value={ri.ingredientId}
                              onChange={(id) => onIngredientRowChange(index, "ingredientId", id)}
                              options={rawIngredients}
                              placeholder="Select raw material..."
                            />
                          </td>
                          <td className="px-5 py-4">
                            <input
                              required
                              type="number"
                              step="any"
                              min="0.001"
                              placeholder="0.00"
                              value={ri.quantity}
                              onChange={(e) => onIngredientRowChange(index, "quantity", e.target.value)}
                              className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-black text-sm outline-none focus:border-primary"
                            />
                          </td>
                          <td className="px-5 py-4">
                            {selectedIngDetail ? (
                              <span className="bg-surface-container-high px-3 py-2 rounded-lg border border-black/10 block text-center truncate text-[11px] font-black uppercase text-on-surface">
                                {selectedIngDetail.unit}
                              </span>
                            ) : (
                              <span className="text-on-surface-variant/40 block text-center text-xs font-bold">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4">
                            {selectedIngDetail ? (
                              <span className={cn(
                                "px-3 py-2 rounded-lg border border-black/10 block text-center text-[11px] font-black uppercase",
                                selectedIngDetail.stockQuantity > 0 ? "bg-green-500/10 text-green-700" : "bg-error/10 text-error"
                              )}>
                                {selectedIngDetail.stockQuantity}
                              </span>
                            ) : (
                              <span className="text-on-surface-variant/40 block text-center text-xs font-bold">—</span>
                            )}
                          </td>
                          <td className="px-5 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => onRemoveIngredientRow(index)}
                              className="p-3 text-error bg-error/10 hover:bg-error hover:text-on-error border-2 border-transparent hover:border-error rounded-xl transition-all"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="p-6 lg:px-8 border-t border-outline-variant bg-surface-container-low flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high border-2 border-transparent hover:border-outline-variant transition-all"
            >
              Cancel
            </button>
            <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
              <button
                type="submit"
                onClick={() => setActionAfterSave("close")}
                disabled={isSavingRecipe}
                className="w-full sm:w-auto bg-surface text-on-surface px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:-translate-y-1 transition-all shadow-hard-sm border-2 border-black disabled:opacity-50"
              >
                {isSavingRecipe && actionAfterSave === "close" ? "Saving..." : "Save Recipe"}
              </button>
              <button
                type="submit"
                onClick={() => setActionAfterSave("produce")}
                disabled={isSavingRecipe}
                className="w-full sm:w-auto bg-primary text-on-primary px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-secondary transition-all shadow-hard active:scale-95 border-brutal flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                {isSavingRecipe && actionAfterSave === "produce" ? "Saving..." : "Save & Start Production"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
