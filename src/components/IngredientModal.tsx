"use client";

import { useState } from "react";
import { useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { X } from "lucide-react";
import { toast } from "sonner";

interface IngredientModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any;
}

export function IngredientModal({ isOpen, onClose, initialData }: IngredientModalProps) {
  const { token } = useAuth();
  const addIngredient = useMutation(api.ingredients.add);
  const updateIngredient = useMutation(api.ingredients.update);

  const [name, setName] = useState("");
  const [category, setCategory] = useState("Food");
  const [stockQuantity, setStockQuantity] = useState("");
  const [unit, setUnit] = useState("kg");
  const [lowStockThreshold, setLowStockThreshold] = useState("");

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setCategory(initialData.category || "Food");
      setStockQuantity(initialData.stockQuantity.toString());
      setUnit(initialData.unit);
      setLowStockThreshold(initialData.lowStockThreshold.toString());
    } else {
      setName("");
      setCategory("Food");
      setStockQuantity("");
      setUnit("kg");
      setLowStockThreshold("");
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !stockQuantity || !lowStockThreshold) return;
    if (!token) {
      toast.error("You must be logged in to modify ingredients");
      return;
    }

    try {
      if (initialData) {
        await updateIngredient({
          token,
          id: initialData._id,
          name,
          category,
          stockQuantity: parseFloat(stockQuantity),
          unit,
          lowStockThreshold: parseFloat(lowStockThreshold),
        });
        toast.success("Ingredient updated successfully!");
      } else {
        await addIngredient({
          token,
          name,
          category,
          stockQuantity: parseFloat(stockQuantity),
          unit,
          lowStockThreshold: parseFloat(lowStockThreshold),
        });
        toast.success("Ingredient added successfully!");
      }
      onClose();
    } catch (error: any) {
      console.error("Failed to save ingredient", error);
      toast.error("Failed to save ingredient: " + error.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-md rounded-3xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-outline-variant/30 bg-surface-container-low">
          <h2 className="text-xl font-black text-on-surface">
            {initialData ? "Edit Ingredient" : "Add New Ingredient"}
          </h2>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-highest hover:bg-error hover:text-on-error transition-colors text-on-surface-variant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6">
          <form id="ingredientForm" onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-sm font-bold text-on-surface-variant">Name *</label>
              <input
                required
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface font-medium focus:border-primary outline-none transition-all"
                placeholder="e.g. Tomatoes"
              />
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-on-surface-variant">Category *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface font-medium focus:border-primary outline-none transition-all"
              >
                <option value="Food">Food</option>
                <option value="Packaging">Packaging</option>
                <option value="Drinks">Drinks</option>
                <option value="Sauces">Sauces</option>
                <option value="Factory">Factory</option>
                <option value="Supplies">Supplies</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-sm font-bold text-on-surface-variant">
                  {initialData ? "Current Stock *" : "Initial Stock *"}
                </label>
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  value={stockQuantity}
                  onChange={(e) => setStockQuantity(e.target.value)}
                  className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface font-medium focus:border-primary outline-none transition-all"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-bold text-on-surface-variant">Unit *</label>
                <select
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface font-medium focus:border-primary outline-none transition-all"
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="ml">ml</option>
                  <option value="pcs">pcs</option>
                  <option value="box">box</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-sm font-bold text-on-surface-variant">Low Stock Threshold *</label>
              <input
                required
                type="number"
                step="0.01"
                min="0"
                value={lowStockThreshold}
                onChange={(e) => setLowStockThreshold(e.target.value)}
                className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface font-medium focus:border-primary outline-none transition-all"
                placeholder="e.g. 5"
              />
              <p className="text-xs text-on-surface-variant mt-1">
                You will be warned when stock drops below this amount.
              </p>
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-outline-variant/30 bg-surface-container-low flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="ingredientForm"
            className="bg-primary text-on-primary px-8 py-3 rounded-xl font-bold hover:bg-terracotta transition-all shadow-soft active:scale-95"
          >
            {initialData ? "Save Changes" : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
