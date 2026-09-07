"use client";

import { useState } from "react";
import { Modal, Button, Select } from "@/components/ui";
import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

const METHODS = ["Cash", "Card", "MPESA", "EMOLA", "Bank Transfer", "Other"];

export function PaymentModal({
  total,
  fmt,
  onClose,
  onComplete,
  title = "Take Payment",
}: {
  total: number;
  fmt: (n: number) => string;
  onClose: () => void;
  onComplete: (payments: { method: string; amount: number }[]) => void | Promise<void>;
  title?: string;
}) {
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
      title={title}
      subtitle={`Amount due ${fmt(total)}`}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => submit([])}
            loading={busy}
          >
            Save as pending
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
            Complete Sale
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
          <Plus className="w-3.5 h-3.5" /> Split payment
        </button>
      </div>

      <div className="mt-4 pt-3 border-t border-outline/40 space-y-1.5 text-sm">
        <Line label="Paid" value={fmt(paid)} />
        <Line
          label={change >= 0 ? "Change" : "Balance due"}
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
