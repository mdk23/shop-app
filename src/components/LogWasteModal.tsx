"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { X, AlertCircle } from "lucide-react";

interface LogWasteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const WASTE_TYPES = [
  "Spoiled",
  "Burnt",
  "Expired",
  "Damaged",
  "Theft",
  "Preparation Waste",
  "Unknown Loss",
];

export function LogWasteModal({ isOpen, onClose }: LogWasteModalProps) {
  const { token } = useAuth();
  const ingredients = useQuery(api.ingredients.list);
  const logWastage = useMutation(api.inventory.logWastage);

  const [selectedItemId, setSelectedItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [wasteType, setWasteType] = useState(WASTE_TYPES[0]);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset state on open/close
  useEffect(() => {
    if (isOpen) {
      setSelectedItemId("");
      setQuantity("");
      setWasteType(WASTE_TYPES[0]);
      setReason("");
      setNotes("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedIngredient = ingredients?.find((i) => i._id === selectedItemId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) {
      toast.error("You must be logged in to perform this action");
      return;
    }
    if (!selectedItemId) {
      toast.error("Please select an item");
      return;
    }

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error("Please enter a valid quantity greater than 0");
      return;
    }

    if (selectedIngredient && qty > selectedIngredient.stockQuantity) {
      toast.error("Cannot log more waste than available stock.");
      return;
    }

    setIsSubmitting(true);
    try {
      await logWastage({
        token,
        itemId: selectedItemId as any,
        quantity: qty,
        wasteType,
        reason,
        notes: notes || undefined,
      });
      toast.success("Wastage logged successfully");
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to log wastage");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-md rounded-[2rem] shadow-2xl p-6 border-brutal text-on-surface">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
            Log Daily Wastage
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-xl hover:bg-surface-container-high transition-colors"
          >
            <X className="w-5 h-5 text-on-surface-variant" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ingredient Selector */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-75">
              Select Ingredient
            </label>
            <select
              required
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full bg-surface-container text-on-surface border-2 border-outline rounded-xl px-3 py-3 outline-none focus:border-primary transition-all font-bold text-xs appearance-none cursor-pointer"
            >
              <option value="">-- Choose Item --</option>
              {ingredients?.map((ing) => (
                <option key={ing._id} value={ing._id}>
                  {ing.name} ({ing.stockQuantity} {ing.unit} available)
                </option>
              ))}
            </select>
          </div>

          {/* Quantity Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-75">
              Quantity to Log {selectedIngredient && `(in ${selectedIngredient.unit})`}
            </label>
            <input
              required
              type="number"
              step="any"
              min="0.001"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 2.5"
              className="w-full bg-surface-container text-on-surface border-2 border-outline rounded-xl px-3 py-3 outline-none focus:border-primary transition-all font-bold text-xs"
            />
            {selectedIngredient && parseFloat(quantity) > selectedIngredient.stockQuantity && (
              <p className="text-error font-black uppercase text-[9px] flex items-center gap-1 mt-1 text-red-600">
                <AlertCircle className="w-3.5 h-3.5" />
                Cannot log more waste than available stock.
              </p>
            )}
          </div>

          {/* Waste Type Dropdown */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-75">
              Waste Type / Category
            </label>
            <select
              value={wasteType}
              onChange={(e) => setWasteType(e.target.value)}
              className="w-full bg-surface-container text-on-surface border-2 border-outline rounded-xl px-3 py-3 outline-none focus:border-primary transition-all font-bold text-xs appearance-none cursor-pointer"
            >
              {WASTE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          {/* Reason Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-75">
              Reason for Wastage
            </label>
            <input
              required
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. dropped on kitchen floor"
              className="w-full bg-surface-container text-on-surface border-2 border-outline rounded-xl px-3 py-3 outline-none focus:border-primary transition-all font-bold text-xs"
            />
          </div>

          {/* Notes Input */}
          <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-75">
              Additional Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any other details..."
              rows={2}
              className="w-full bg-surface-container text-on-surface border-2 border-outline rounded-xl px-3 py-3 outline-none focus:border-primary transition-all font-bold text-xs resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4 text-xs font-black uppercase">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3.5 rounded-xl border-2 border-outline font-bold text-on-surface-variant hover:bg-surface-container-high transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !selectedItemId ||
                !quantity ||
                (selectedIngredient && parseFloat(quantity) > selectedIngredient.stockQuantity)
              }
              className={`flex-1 py-3.5 rounded-xl border-2 border-outline transition-all shadow-hard active:scale-95 ${
                isSubmitting
                  ? "bg-neutral-500 cursor-not-allowed border-neutral-600 text-white"
                  : "bg-primary hover:bg-secondary text-on-primary"
              }`}
            >
              {isSubmitting ? "Saving..." : "Log Waste"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
