"use client";

import React, { useState } from "react";
import { Landmark, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  ModalBackdrop,
  ErrorAlert,
  labelClass,
  inputClass,
  closeButtonClass,
  cancelButtonClass,
  submitButtonClass,
} from "./Shared";

interface OpenRegisterModalProps {
  onClose: () => void;
  onSave: (amount: number, notes?: string) => Promise<void>;
}

export function OpenRegisterModal({
  onClose,
  onSave,
}: OpenRegisterModalProps) {
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
      setError("Enter a valid opening amount (0 or more)");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSave(parsed, notes || undefined);
      toast.success("Cash register opened successfully!");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open register");
    } finally {
      setSubmitting(false);
    }
  };

  const quickAmounts = [0, 100, 200, 500, 1000, 2000, 5000];

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
        <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-surface-container-low shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-display text-on-surface">Open Cash Register</h2>
          </div>
          <button type="button" onClick={onClose} className={closeButtonClass}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <ErrorAlert message={error} />}

          <div className="space-y-2">
            <label className={labelClass}>Opening Amount (MT)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              className={inputClass}
              placeholder="0.00"
              autoFocus
              disabled={submitting}
            />
          </div>

          {/* Quick amounts */}
          <div className="space-y-2">
            <p className={labelClass}>Quick Select</p>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q.toString())}
                  className={cn(
                    "py-2 rounded-xl text-xs font-black uppercase tracking-wider border-2 transition-all",
                    amount === q.toString()
                      ? "bg-primary border-primary text-on-primary shadow-hard"
                      : "bg-surface-container-low border-outline text-on-surface-variant hover:border-primary hover:text-primary"
                  )}
                >
                  {q.toLocaleString()} MT
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(inputClass, "resize-none h-20")}
              placeholder="Any notes about this opening..."
              disabled={submitting}
            />
          </div>
        </div>

        <div className="p-6 border-t-2 border-outline flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className={cancelButtonClass} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className={submitButtonClass}>
            {submitting ? "Opening..." : "Open Register"}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}
