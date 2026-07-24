"use client";

import React, { useState, useEffect } from "react";
import { X, FileText, Save, Plus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { cn, formatCurrency } from "@/lib/utils";

interface PurchaseOrderModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingPO: any;
  suppliers: any[];
  ingredients: any[];
  onSubmit: (data: {
    supplierId: string;
    expectedDeliveryDate: string;
    notes: string;
    items: Array<{ ingredientId: string; quantityOrdered: number; unitCost: number }>;
  }) => Promise<void>;
  formItems: Array<{ ingredientId: string; quantityOrdered: number; unitCost: number }>;
  setFormItems: React.Dispatch<
    React.SetStateAction<
      Array<{ ingredientId: string; quantityOrdered: number; unitCost: number }>
    >
  >;
}

export function PurchaseOrderModal({
  isOpen,
  onClose,
  editingPO,
  suppliers,
  ingredients,
  onSubmit,
  formItems,
  setFormItems,
}: PurchaseOrderModalProps) {
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");

  // Item builder states
  const [builderIngredientId, setBuilderIngredientId] = useState("");
  const [builderQty, setBuilderQty] = useState("");
  const [builderCost, setBuilderCost] = useState("");

  // Filter ingredients based on selected supplier's suppliedIngredients array
  const selectedSupplier = suppliers?.find((s) => s._id === selectedSupplierId);
  const suppliedIngredientIds = selectedSupplier?.suppliedIngredients || [];

  const filteredIngredientsList = (ingredients || []).filter((i) => {
    if (!suppliedIngredientIds || suppliedIngredientIds.length === 0) return true;
    return suppliedIngredientIds.includes(i._id);
  });

  useEffect(() => {
    if (isOpen) {
      if (editingPO) {
        setSelectedSupplierId(editingPO.supplierId);
        setExpectedDeliveryDate(
          editingPO.expectedDeliveryDate ? format(new Date(editingPO.expectedDeliveryDate), "yyyy-MM-dd") : ""
        );
        setNotes(editingPO.notes || "");
      } else {
        setSelectedSupplierId("");
        setExpectedDeliveryDate("");
        setNotes("");
        setFormItems([]);
      }
      setBuilderIngredientId("");
      setBuilderQty("");
      setBuilderCost("");
    }
  }, [isOpen, editingPO]);

  if (!isOpen) return null;

  const handleAddBuilderItem = () => {
    if (!builderIngredientId || !builderQty || !builderCost) {
      toast.error("Please fill in all item fields");
      return;
    }

    const qty = parseFloat(builderQty);
    const cost = parseFloat(builderCost);

    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantity must be a positive number");
      return;
    }
    if (isNaN(cost) || cost <= 0) {
      toast.error("Cost must be a positive number");
      return;
    }

    const existsIdx = formItems.findIndex((i) => i.ingredientId === builderIngredientId);
    if (existsIdx > -1) {
      const updated = [...formItems];
      updated[existsIdx].quantityOrdered += qty;
      updated[existsIdx].unitCost = cost;
      setFormItems(updated);
    } else {
      setFormItems([...formItems, { ingredientId: builderIngredientId, quantityOrdered: qty, unitCost: cost }]);
    }

    setBuilderIngredientId("");
    setBuilderQty("");
    setBuilderCost("");
  };

  const handleRemoveFormItem = (index: number) => {
    const updated = [...formItems];
    updated.splice(index, 1);
    setFormItems(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      toast.error("Please select a supplier");
      return;
    }
    if (formItems.length === 0) {
      toast.error("Please add at least one ingredient to the order");
      return;
    }
    await onSubmit({
      supplierId: selectedSupplierId,
      expectedDeliveryDate,
      notes,
      items: formItems,
    });
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-4xl border-4 border-outline rounded-lg shadow-hard-lg flex flex-col overflow-hidden h-[90vh]">
        {/* Header */}
        <div className="p-6 border-b-4 border-black bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary text-on-primary rounded flex items-center justify-center">
              <FileText className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-display text-on-surface uppercase tracking-tighter">
              {editingPO ? `Edit Purchase Order (${editingPO.orderCode})` : "New Purchase Order"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto p-8 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Supplier Selection */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  Supplier *
                </label>
                <select
                  required
                  value={selectedSupplierId}
                  onChange={(e) => setSelectedSupplierId(e.target.value)}
                  className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-black uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm h-[46px]"
                >
                  <option value="">Select Supplier...</option>
                  {(suppliers || []).map((s) => (
                    <option key={s._id} value={s._id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Expected Delivery Date */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  Expected Delivery Date
                </label>
                <input
                  type="date"
                  value={expectedDeliveryDate}
                  onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                  className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                />
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                Internal Notes / Comments
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                placeholder="e.g. Call driver before delivery..."
              />
            </div>

            {/* Ingredient Item Builder */}
            <div className="border-4 border-dashed border-outline/50 rounded-xl p-6 space-y-4 bg-surface-container-low/30">
              <h4 className="font-display text-lg uppercase tracking-tight text-on-surface">Add Ingredients to Order</h4>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-2 md:col-span-2">
                  <label className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                    Select Ingredient
                  </label>
                  <select
                    value={builderIngredientId}
                    onChange={(e) => setBuilderIngredientId(e.target.value)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded px-3 py-2 text-on-surface font-bold uppercase tracking-wider text-[10px] focus:border-primary outline-none transition-all shadow-hard-sm h-[38px]"
                  >
                    <option value="">Choose item...</option>
                    {(filteredIngredientsList || []).map((i) => (
                      <option key={i._id} value={i._id}>
                        {i.name} ({i.unit})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                    Quantity
                  </label>
                  <input
                    type="number"
                    step="any"
                    value={builderQty}
                    onChange={(e) => setBuilderQty(e.target.value)}
                    placeholder="e.g. 50"
                    className="w-full bg-surface-container-low border-2 border-outline rounded px-3 py-2 text-on-surface font-bold uppercase tracking-wider text-[10px] focus:border-primary outline-none transition-all shadow-hard-sm"
                  />
                </div>

                <div className="space-y-2 font-bold">
                  <label className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                    Unit Cost (Mt)
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="any"
                      value={builderCost}
                      onChange={(e) => setBuilderCost(e.target.value)}
                      placeholder="e.g. 250"
                      className="w-full bg-surface-container-low border-2 border-outline rounded px-3 py-2 text-on-surface font-bold uppercase tracking-wider text-[10px] focus:border-primary outline-none transition-all shadow-hard-sm"
                    />
                    <button
                      type="button"
                      onClick={handleAddBuilderItem}
                      className="bg-black text-white px-4 rounded border-2 border-black hover:bg-neutral-800 transition-all font-display text-sm uppercase tracking-tighter shadow-hard-sm h-[38px] flex items-center justify-center"
                    >
                      Add
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                Order Items ({formItems.length})
              </label>
              <div className="border-2 border-outline rounded-lg overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-surface-container-high text-on-surface text-[9px] font-black uppercase tracking-wider border-b border-outline">
                      <th className="px-4 py-3">Ingredient</th>
                      <th className="px-4 py-3 text-right">Quantity</th>
                      <th className="px-4 py-3 text-right">Unit Cost</th>
                      <th className="px-4 py-3 text-right">Total Cost</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline/50">
                    {formItems.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
                          No items added yet. Use the builder above to add ingredients.
                        </td>
                      </tr>
                    ) : (
                      formItems.map((item, idx) => {
                        const ing = (ingredients || []).find((i) => i._id === item.ingredientId);
                        const name = ing ? ing.name : "Unknown Ingredient";
                        const unit = ing ? ing.unit : "pcs";
                        return (
                          <tr key={idx} className="text-xs font-bold text-on-surface-variant bg-surface-container-low/35">
                            <td className="px-4 py-3 uppercase">{name}</td>
                            <td className="px-4 py-3 text-right">
                              {item.quantityOrdered} {unit}
                            </td>
                            <td className="px-4 py-3 text-right">
                              {formatCurrency(item.unitCost)}
                            </td>
                            <td className="px-4 py-3 text-right text-on-surface font-display">
                              {formatCurrency(item.quantityOrdered * item.unitCost)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveFormItem(idx)}
                                className="p-1 text-error hover:bg-error/10 rounded transition-colors"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Drawer Footer */}
          <div className="p-6 bg-surface-container-low border-t-4 border-black flex justify-between items-center">
            {/* Total Cost Display */}
            <div>
              <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">Est. Order Value</span>
              <p className="text-3xl font-display text-primary leading-none mt-1">
                {formatCurrency(
                  formItems.reduce((sum, item) => sum + item.quantityOrdered * item.unitCost, 0)
                )}
              </p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-3.5 border-2 border-black rounded font-display text-base uppercase tracking-tighter hover:bg-surface-container-high active:bg-surface-container-highest transition-all shadow-hard-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-8 py-3.5 bg-brand-gradient text-white border-2 border-black rounded font-display text-lg uppercase tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 shadow-hard-sm"
              >
                <Save className="w-5 h-5" />
                Save Draft PO
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
