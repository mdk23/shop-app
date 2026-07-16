"use client";

import React from "react";
import { ChevronDown, X, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProduceBatchModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipes: any[] | undefined;
  ingredients: any[] | undefined;
  selectedRecipeId: string;
  setSelectedRecipeId: (id: string) => void;
  produceQuantity: string;
  setProduceQuantity: (qty: string) => void;
  produceNotes: string;
  setProduceNotes: (notes: string) => void;
  previewRequirements: any[];
  isProductionValid: boolean;
  isProducing: boolean;
  onProduce: (e: React.FormEvent) => void;
}

export function ProduceBatchModal({
  isOpen,
  onClose,
  recipes,
  ingredients,
  selectedRecipeId,
  setSelectedRecipeId,
  produceQuantity,
  setProduceQuantity,
  produceNotes,
  setProduceNotes,
  previewRequirements,
  isProductionValid,
  isProducing,
  onProduce,
}: ProduceBatchModalProps) {
  if (!isOpen) return null;

  const selectedRecipe = recipes?.find((r) => r._id === selectedRecipeId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-outline-variant">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant bg-surface-container-low">
          <h2 className="text-xl font-black text-on-surface uppercase tracking-wider">Log Kitchen Prep Production</h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-highest hover:bg-error hover:text-on-error transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={onProduce} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Recipe Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Select Recipe *</label>
            <div className="relative">
              <select
                required
                value={selectedRecipeId}
                onChange={(e) => {
                  setSelectedRecipeId(e.target.value);
                  const rec = recipes?.find((r: any) => r._id === e.target.value);
                  if (rec) setProduceQuantity(rec.outputQuantity.toString());
                }}
                className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-black uppercase tracking-wider text-xs focus:border-primary outline-none appearance-none cursor-pointer"
              >
                <option value="" disabled>Choose a prep recipe</option>
                {recipes?.map((recipe: any) => (
                  <option key={recipe._id} value={recipe._id}>
                    {recipe.producedIngredientName} (standard output: {recipe.outputQuantity} {recipe.producedIngredientUnit})
                  </option>
                ))}
              </select>
              <ChevronDown className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40" />
            </div>
          </div>

          {/* Quantity */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">
              Quantity to Produce ({selectedRecipe?.producedIngredientUnit || "units"}) *
            </label>
            <input
              required
              type="number"
              step="any"
              min="0.01"
              placeholder="e.g. 20"
              value={produceQuantity}
              onChange={(e) => setProduceQuantity(e.target.value)}
              className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-black text-sm focus:border-primary outline-none"
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Production Notes / Batch Number</label>
            <input
              type="text"
              placeholder="e.g. Morning shift production run"
              value={produceNotes}
              onChange={(e) => setProduceNotes(e.target.value)}
              className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-bold text-xs focus:border-primary outline-none"
            />
          </div>

          {/* Raw materials live checklist preview */}
          {previewRequirements.length > 0 && (
            <div className="pt-4 border-t-2 border-black/10 space-y-3">
              <h4 className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Required Raw Materials Stock Check</h4>
              <div className="space-y-2">
                {previewRequirements.map((req: any) => (
                  <div
                    key={req.id}
                    className={cn(
                      "flex justify-between items-center p-3 rounded-xl border-2 transition-all",
                      req.isSufficient
                        ? "bg-green-500/5 border-green-500/20"
                        : "bg-error/5 border-error/20"
                    )}
                  >
                    <div className="flex flex-col">
                      <span className="font-bold text-xs text-on-surface uppercase tracking-wide">{req.name}</span>
                      <span className="text-[9px] font-semibold text-on-surface-variant tracking-wider">
                        Needed: {req.needed.toFixed(2)} {req.unit} | Available: {req.currentStock.toFixed(2)} {req.unit}
                      </span>
                    </div>
                    <span className={cn(
                      "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                      req.isSufficient
                        ? "bg-green-100 text-green-700 border-green-200"
                        : "bg-error/10 text-error border-error/20"
                    )}>
                      {req.isSufficient ? "Stock OK" : "Shortage"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Submit */}
          <div className="pt-6 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isProducing || !isProductionValid}
              className={cn(
                "px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-soft transition-all active:scale-95",
                isProductionValid
                  ? "bg-primary text-on-primary hover:bg-secondary border-brutal"
                  : "bg-surface-container-high text-on-surface-variant border-2 border-dashed border-outline-variant cursor-not-allowed opacity-50"
              )}
            >
              {isProducing ? "Processing..." : "Produce Batch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
