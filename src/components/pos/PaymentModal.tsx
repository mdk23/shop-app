"use client";

import { useState, type ReactNode } from "react";
import { Modal, Button, Select } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/contexts/LanguageContext";

// Payment method identifiers — stored as-is on `payments.method` and matched
// against elsewhere (e.g. `sales.ts`'s `isCash` cash-register logic), so these
// are data values, not UI copy: they stay in English/brand form rather than
// being translated.
const METHODS = ["Cash", "Card", "MPESA", "EMOLA", "Bank Transfer", "Other"];

export function PaymentModal({
  total,
  fmt,
  onClose,
  onComplete,
  title,
  extraFields,
}: {
  total: number;
  fmt: (n: number) => string;
  onClose: () => void;
  onComplete: (payments: { method: string; amount: number }[]) => void | Promise<void>;
  title?: string;
  /** Rendered below the payment rows, above the paid/change summary — e.g. the
   *  anonymous-sale phone capture field. Keeps this modal about payments. */
  extraFields?: ReactNode;
}) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<{ method: string; amount: string }[]>([
    { method: "Cash", amount: total.toFixed(2) },
  ]);
  const [busy, setBusy] = useState(false);

  const paid = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
  const change = paid - total;

  const submit = async (rowsToSend: { method: string; amount: number }[]) => {
    setBusy(true);
    try {
      await onComplete(rowsToSend);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={title ?? t("Receive Payment")}
      subtitle={t("Amount due {amount}", { amount: fmt(total) })}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => submit([])}
            loading={busy}
          >
            {t("Save as pending")}
          </Button>
          <Button
            onClick={() =>
              submit(
                rows
                  .map((r) => ({ method: r.method, amount: Number(r.amount) || 0 }))
                  .filter((r) => r.amount > 0)
              )
            }
            loading={busy}
          >
            {t("Complete Sale")}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <Select
              value={row.method}
              onChange={(e) =>
                setRows((p) =>
                  p.map((r, j) => (j === i ? { ...r, method: e.target.value } : r))
                )
              }
              className="w-40"
            >
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </Select>
            <input
              type="number"
              value={row.amount}
              onChange={(e) =>
                setRows((p) =>
                  p.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r))
                )
              }
              className="flex-1 px-3 py-2.5 bg-surface-container-low border border-outline rounded-xl text-sm text-right"
            />
            {rows.length > 1 && (
              <button
                onClick={() => setRows((p) => p.filter((_, j) => j !== i))}
                className="text-on-surface-variant hover:text-error"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() =>
            setRows((p) => [
              ...p,
              { method: "Card", amount: Math.max(0, total - paid).toFixed(2) },
            ])
          }
          className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-primary"
        >
          <Plus className="w-3.5 h-3.5" /> {t("Split payment")}
        </button>
      </div>

      {extraFields}

      <div className="mt-4 pt-3 border-t border-outline/40 space-y-1.5 text-sm">
        <Line label={t("Paid")} value={fmt(paid)} />
        <Line
          label={change >= 0 ? t("Change") : t("Balance due")}
          value={fmt(Math.abs(change))}
          className={cn(change < 0 ? "text-error" : "text-success", "font-bold")}
        />
      </div>
    </Modal>
  );
}

function Line({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-on-surface-variant uppercase tracking-wider text-xs">
        {label}
      </span>
      <span className={className}>{value}</span>
    </div>
  );
}
