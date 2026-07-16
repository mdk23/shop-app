"use client";

import React, { useState } from "react";
import { Plus, Minus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ModalBackdrop,
  ErrorAlert,
  formatMT,
  labelClass,
  inputClass,
  closeButtonClass,
  cancelButtonClass,
} from "./Shared";

interface CashMovementModalProps {
  type: "cash_in" | "cash_out";
  currentBalance: number;
  onClose: () => void;
  onSave: (amount: number, description: string) => Promise<void>;
}

export function CashMovementModal({
  type,
  currentBalance,
  onClose,
  onSave,
}: CashMovementModalProps) {
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCashIn = type === "cash_in";
  const presets = isCashIn
    ? ["Owner Deposit", "Extra Float", "Change Supply", "Other"]
    : ["Buy Ice", "Buy Charcoal", "Emergency Expense", "Supplier Payment", "Other"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (!isCashIn && parsed > currentBalance) {
      setError(`Insufficient funds. Only ${formatMT(currentBalance)} available.`);
      return;
    }
    if (!description.trim()) {
      setError("A description is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSave(parsed, description);
      toast.success(`${isCashIn ? "Cash In" : "Cash Out"} recorded: ${formatMT(parsed)}`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record movement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
        <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-surface-container-low shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                isCashIn ? "bg-emerald-500/10" : "bg-error/10"
              )}
            >
              {isCashIn ? (
                <Plus className="w-5 h-5 text-emerald-500" />
              ) : (
                <Minus className="w-5 h-5 text-error" />
              )}
            </div>
            <h2 className="text-xl font-display text-on-surface">
              {isCashIn ? "Cash In" : "Cash Out"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className={closeButtonClass}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <ErrorAlert message={error} />}

          <div className="space-y-2">
            <label className={labelClass}>Amount (MT)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              className={inputClass}
              placeholder="0.00"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Reason</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDescription(p !== "Other" ? p : "")}
                  className={cn(
                    "py-2 px-3 rounded-xl text-xs font-black text-left border-2 transition-all",
                    description === p && p !== "Other"
                      ? isCashIn
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600"
                        : "bg-error/10 border-error/30 text-error"
                      : "bg-surface-container-low border-outline text-on-surface-variant hover:border-outline"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError(null); }}
              className={inputClass}
              placeholder="Or type a custom reason..."
              disabled={submitting}
            />
          </div>
        </div>

        <div className="p-6 border-t-2 border-outline flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className={cancelButtonClass} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-hard disabled:opacity-50",
              isCashIn
                ? "bg-emerald-500 text-white hover:opacity-90"
                : "bg-error text-on-error hover:opacity-90"
            )}
          >
            {submitting ? "Saving..." : `Record ${isCashIn ? "Cash In" : "Cash Out"}`}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}
