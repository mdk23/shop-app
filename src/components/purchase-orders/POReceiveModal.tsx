"use client";

import React, { useState, useEffect } from "react";
import { X, Truck, Save } from "lucide-react";
import { toast } from "sonner";

interface POReceiveModalProps {
  receivingPO: any;
  onClose: () => void;
  onSave: (items: Array<{ ingredientId: string; quantityReceived: number }>) => Promise<void>;
}

export function POReceiveModal({
  receivingPO,
  onClose,
  onSave,
}: POReceiveModalProps) {
  const [receiveBatchQuantities, setReceiveBatchQuantities] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (receivingPO) {
      const initialQuantities: Record<string, string> = {};
      receivingPO.items.forEach((item: any) => {
        const remaining = Math.max(0, item.quantityOrdered - item.quantityReceived);
        initialQuantities[item.ingredientId] = remaining.toString();
      });
      setReceiveBatchQuantities(initialQuantities);
    }
  }, [receivingPO]);

  if (!receivingPO) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const itemsToReceive = Object.entries(receiveBatchQuantities)
      .map(([ingId, qtyStr]) => ({
        ingredientId: ingId,
        quantityReceived: parseFloat(qtyStr) || 0,
      }))
      .filter((item) => item.quantityReceived > 0);

    if (itemsToReceive.length === 0) {
      toast.error("Please specify a received quantity greater than 0 for at least one item.");
      return;
    }

    setSubmitting(true);
    try {
      await onSave(itemsToReceive);
    } catch (err: any) {
      toast.error(err.message || "Failed to record receipt");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-xl border-4 border-outline rounded-lg shadow-hard-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b-4 border-black bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded flex items-center justify-center">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-display text-on-surface uppercase tracking-tight leading-none">
                Receive Stock
              </h2>
              <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">
                PO Code: <strong className="text-on-surface">{receivingPO.orderCode}</strong>
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
            {receivingPO.items.map((item: any) => {
              const remaining = Math.max(0, item.quantityOrdered - item.quantityReceived);
              return (
                <div
                  key={item.ingredientId}
                  className="border-2 border-outline rounded-xl p-4 bg-surface-container-low/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="flex-1">
                    <h4 className="font-display text-sm uppercase text-on-surface">{item.ingredientName}</h4>
                    <div className="flex gap-4 mt-1 text-[9px] font-black uppercase text-on-surface-variant/70 tracking-wider">
                      <span>Ordered: {item.quantityOrdered} {item.ingredientUnit}</span>
                      <span>Received: {item.quantityReceived} {item.ingredientUnit}</span>
                      <span className="text-primary">Remaining: {remaining} {item.ingredientUnit}</span>
                    </div>
                  </div>
                  <div className="w-full md:w-32 space-y-1">
                    <label className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                      Received Qty
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={receiveBatchQuantities[item.ingredientId] || "0"}
                      onChange={(e) => {
                        setReceiveBatchQuantities({
                          ...receiveBatchQuantities,
                          [item.ingredientId]: e.target.value,
                        });
                      }}
                      className="w-full bg-surface-container-low border-2 border-outline rounded px-3 py-1.5 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-6 border-t border-black">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-black rounded font-display text-base uppercase tracking-tighter hover:bg-surface-container-high active:bg-surface-container-highest transition-all shadow-hard-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-6 py-3 bg-brand-gradient text-white border-2 border-black rounded font-display text-base uppercase tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 shadow-hard-sm"
            >
              <Save className="w-5 h-5" />
              {submitting ? "Saving..." : "Save Receipt"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
