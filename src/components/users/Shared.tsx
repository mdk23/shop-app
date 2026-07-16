"use client";

import React from "react";
import { motion } from "framer-motion";
import { X, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type Role = "admin" | "manager" | "pos_seller";

export const ROLE_CONFIG: Record<
  Role,
  { label: string; color: string; bg: string; border: string }
> = {
  admin: {
    label: "Admin",
    color: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/30",
  },
  manager: {
    label: "Manager",
    color: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
  },
  pos_seller: {
    label: "POS Seller",
    color: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
  },
};

export const inputClass =
  "w-full px-4 py-3 bg-surface-container-low border-2 border-outline rounded-xl font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all text-sm";

export function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={htmlFor}
        className="block text-xs font-black text-on-surface uppercase tracking-widest"
      >
        {label}
      </label>
      {children}
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

export function ModalWrapper({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="bg-surface border-2 border-outline rounded-2xl w-full max-w-lg shadow-hard-lg overflow-hidden max-h-[90vh] flex flex-col"
      >
        {children}
      </motion.div>
    </div>
  );
}

export function ModalHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-surface-container-low shrink-0">
      <h2 className="text-xl font-display text-on-surface">{title}</h2>
      <button
        onClick={onClose}
        className="w-8 h-8 rounded-lg border border-outline flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ModalFooter({
  onClose,
  submitLabel,
  submitting,
}: {
  onClose: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <div className="p-6 border-t-2 border-outline flex gap-3 shrink-0 bg-surface-container-low/30">
      <button
        type="button"
        onClick={onClose}
        className="flex-1 py-3 rounded-xl border-2 border-outline font-black text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all"
        disabled={submitting}
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="flex-1 py-3 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-widest hover:bg-secondary transition-colors shadow-hard disabled:opacity-50"
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

export function ActionBtn({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={cn(
        "w-8 h-8 rounded-lg border flex items-center justify-center transition-all",
        danger
          ? "border-error/30 text-error hover:bg-error/10"
          : "border-outline text-on-surface-variant hover:text-primary hover:border-primary hover:bg-primary/5"
      )}
    >
      {icon}
    </button>
  );
}

export function LoadingSpinner() {
  return (
    <div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" />
  );
}
