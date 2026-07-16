"use client";

import React, { useState } from "react";
import { Lock, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  ModalBackdrop,
  ErrorAlert,
  formatMT,
  SummaryRow,
  labelClass,
  inputClass,
  closeButtonClass,
  cancelButtonClass,
  submitButtonClass,
} from "./Shared";

interface CloseRegisterModalProps {
  expectedCash: number;
  onClose: () => void;
  onSave: (actualCash: number, notes?: string) => Promise<{ expectedCash: number; difference: number }>;
}

export function CloseRegisterModal({
  expectedCash,
  onClose,
  onSave,
}: CloseRegisterModalProps) {
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ expectedCash: number; difference: number } | null>(null);

  const parsed = parseFloat(actualCash);
  const hasValidAmount = !isNaN(parsed) && parsed >= 0;
  const difference = hasValidAmount ? parsed - expectedCash : null;
  const needsNote = difference !== null && Math.abs(difference) > 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasValidAmount) {
      setError("Enter the actual cash amount");
      return;
    }
    if (needsNote && !notes.trim()) {
      setError("A closing note is required for differences over 5 MT.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await onSave(parsed, notes || undefined);
      setResult(res);
      toast.success("Cash register closed successfully!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to close register");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      {result ? (
        <div className="p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-2xl font-display text-on-surface mb-1">Register Closed</h2>
            <p className="text-sm text-on-surface-variant font-bold">Session summary</p>
          </div>
          <div className="w-full bg-surface-container-low border-2 border-outline rounded-2xl p-6 space-y-3 text-left">
            <SummaryRow label="Expected Cash" value={formatMT(result.expectedCash)} />
            <SummaryRow label="Actual Cash" value={formatMT(parsed)} />
            <div className="pt-3 border-t border-outline">
              <SummaryRow
                label="Difference"
                value={`${result.difference >= 0 ? "+" : ""}${formatMT(result.difference)}`}
                accent={result.difference === 0 ? "neutral" : result.difference > 0 ? "positive" : "negative"}
              />
            </div>
          </div>
          <button onClick={onClose} className={submitButtonClass}>Done</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
          <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-surface-container-low shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-error" />
              </div>
              <h2 className="text-xl font-display text-on-surface">Close Cash Register</h2>
            </div>
            <button type="button" onClick={onClose} className={closeButtonClass}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && <ErrorAlert message={error} />}

            <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant">
              <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-1">
                Expected Cash
              </p>
              <p className="text-3xl font-display text-on-surface">{formatMT(expectedCash)}</p>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>Actual Cash Counted (MT)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={actualCash}
                onChange={(e) => { setActualCash(e.target.value); setError(null); }}
                className={inputClass}
                placeholder="Enter the amount you counted"
                autoFocus
                disabled={submitting}
              />
            </div>

            {/* Live difference preview */}
            {hasValidAmount && difference !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-4 rounded-2xl border-2 flex items-center justify-between",
                  difference === 0
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : difference > 0
                    ? "bg-blue-500/10 border-blue-500/30"
                    : "bg-error/10 border-error/30"
                )}
              >
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                  Difference
                </p>
                <p
                  className={cn(
                    "text-2xl font-display",
                    difference === 0
                      ? "text-emerald-500"
                      : difference > 0
                      ? "text-blue-500"
                      : "text-error"
                  )}
                >
                  {difference >= 0 ? "+" : ""}{formatMT(difference)}
                </p>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className={labelClass}>Closing Notes {needsNote ? <span className="text-error font-black uppercase">(Required)</span> : "(Optional)"}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(inputClass, "resize-none h-20")}
                placeholder="Any notes about this closing..."
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
              disabled={submitting || !hasValidAmount}
              className="flex-1 py-3 rounded-xl bg-error text-on-error font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-hard disabled:opacity-50"
            >
              {submitting ? "Closing..." : "Close Register"}
            </button>
          </div>
        </form>
      )}
    </ModalBackdrop>
  );
}
