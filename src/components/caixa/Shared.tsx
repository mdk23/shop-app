"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

export function formatMT(amount: number): string {
  return `${amount.toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
}

export const MOVEMENT_COLORS: Record<string, string> = {
  opening: "text-blue-500 bg-blue-500/10 border-blue-500/30",
  sale: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  cash_in: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
  cash_out: "text-error bg-error/10 border-error/30",
  closing: "text-on-surface-variant bg-surface-container border-outline",
};

export const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening",
  sale: "Cash Sale",
  cash_in: "Cash In",
  cash_out: "Cash Out",
  closing: "Closing",
};

export const inputClass =
  "w-full px-4 py-3 bg-surface-container-low border-2 border-outline rounded-xl font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all text-sm";
export const labelClass = "block text-xs font-black text-on-surface uppercase tracking-widest";
export const closeButtonClass =
  "w-8 h-8 rounded-lg border border-outline flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all";
export const cancelButtonClass =
  "flex-1 py-3 rounded-xl border-2 border-outline font-black text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all";
export const submitButtonClass =
  "flex-1 py-3 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-widest hover:bg-secondary transition-colors shadow-hard disabled:opacity-50";

interface BalanceCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  prefix?: string;
}

export function BalanceCard({
  label,
  value,
  icon,
  color,
  bg,
  border,
  prefix = "",
}: BalanceCardProps) {
  return (
    <div className={cn("p-4 rounded-2xl border-2", bg, border)}>
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", bg)}>
        <span className={color}>{icon}</span>
      </div>
      <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className={cn("text-xl font-display", color)}>
        {prefix}{formatMT(value)}
      </p>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: string;
  accent?: "positive" | "negative" | "neutral";
}

export function SummaryRow({
  label,
  value,
  accent = "neutral",
}: SummaryRowProps) {
  return (
    <div className="flex justify-between items-center">
      <p className="text-sm font-bold text-on-surface-variant">{label}</p>
      <p
        className={cn(
          "font-black text-sm",
          accent === "positive" ? "text-emerald-500" : accent === "negative" ? "text-error" : "text-on-surface"
        )}
      >
        {value}
      </p>
    </div>
  );
}

interface ModalBackdropProps {
  children: React.ReactNode;
  onClose: () => void;
}

export function ModalBackdrop({
  children,
  onClose,
}: ModalBackdropProps) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="bg-surface border-2 border-outline rounded-2xl w-full max-w-lg shadow-hard-lg overflow-hidden"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-xl">
      <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
      <p className="text-error text-sm font-bold">{message}</p>
    </div>
  );
}
