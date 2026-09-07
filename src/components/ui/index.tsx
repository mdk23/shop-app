"use client";

import { cn } from "@/lib/utils";
import { X, Loader2, AlertTriangle, Inbox } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import React from "react";

// ─────────────────────────────────────────────
// Button
// ─────────────────────────────────────────────

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export function Button({
  variant = "primary",
  size = "md",
  className,
  loading,
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 font-black uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed border";
  const sizes = {
    sm: "text-[10px] px-3 py-2",
    md: "text-[11px] px-4 py-2.5",
    lg: "text-xs px-6 py-3.5",
  };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-primary text-on-primary border-primary hover:opacity-90 shadow-hard-sm",
    secondary:
      "bg-surface-container text-on-surface border-outline hover:bg-surface-container-high",
    ghost: "bg-transparent text-on-surface-variant border-transparent hover:bg-surface-container",
    danger: "bg-error text-on-error border-error hover:opacity-90 shadow-hard-sm",
    outline: "bg-transparent text-on-surface border-outline hover:bg-surface-container",
  };
  return (
    <button
      className={cn(base, sizes[size], variants[variant], className)}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
      {children}
    </button>
  );
}

// ─────────────────────────────────────────────
// Inputs
// ─────────────────────────────────────────────

export const inputClass =
  "w-full px-3.5 py-2.5 bg-surface-container-low border border-outline rounded-xl text-sm text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary transition-colors";

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
        {label}
        {required && <span className="text-error"> *</span>}
      </span>
      {children}
      {hint && (
        <span className="block text-[10px] text-on-surface-variant/70 normal-case tracking-normal font-medium">
          {hint}
        </span>
      )}
    </label>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputClass, props.className)} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(inputClass, "min-h-20", props.className)} />;
}

export function Select({
  children,
  className,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cn(inputClass, "cursor-pointer", className)}>
      {children}
    </select>
  );
}

// ─────────────────────────────────────────────
// Modal
// ─────────────────────────────────────────────

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const widths = {
    sm: "max-w-md",
    md: "max-w-xl",
    lg: "max-w-3xl",
    xl: "max-w-5xl",
  };
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-start justify-center p-4 sm:p-8 bg-black/50 backdrop-blur-sm overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className={cn(
              "w-full bg-surface border border-outline rounded-2xl shadow-hard-lg my-auto",
              widths[size]
            )}
            initial={{ scale: 0.96, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-outline/40">
              <div>
                <h3 className="text-lg font-display uppercase tracking-tighter text-on-surface">
                  {title}
                </h3>
                {subtitle && (
                  <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant opacity-60">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4 max-h-[70vh] overflow-y-auto">{children}</div>
            {footer && (
              <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-outline/40 bg-surface-container-low rounded-b-2xl">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className={cn(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            danger ? "bg-error/10 text-error" : "bg-primary/10 text-primary"
          )}
        >
          <AlertTriangle className="w-5 h-5" />
        </div>
        <p className="text-sm text-on-surface-variant leading-relaxed pt-1.5">{message}</p>
      </div>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Layout bits
// ─────────────────────────────────────────────

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-surface border border-outline rounded-2xl shadow-hard-sm",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  accent?: "primary" | "error" | "success";
}) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant opacity-60">
        {label}
      </p>
      <p
        className={cn(
          "text-2xl font-display tracking-tighter mt-1",
          accent === "error" && "text-error",
          accent === "success" && "text-success",
          (!accent || accent === "primary") && "text-on-surface"
        )}
      >
        {value}
      </p>
      {sub && (
        <p className="text-[10px] font-bold text-on-surface-variant opacity-60 mt-0.5">
          {sub}
        </p>
      )}
    </Card>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "success" | "warning" | "error" | "info";
}) {
  const tones = {
    neutral: "bg-surface-container text-on-surface-variant border-outline",
    success: "bg-success/10 text-success border-success/30",
    warning: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    error: "bg-error/10 text-error border-error/30",
    info: "bg-primary/10 text-primary border-primary/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-widest border",
        tones[tone]
      )}
    >
      {children}
    </span>
  );
}

export function EmptyState({
  title,
  message,
  action,
}: {
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-on-surface-variant mb-4">
        <Inbox className="w-6 h-6" />
      </div>
      <p className="text-sm font-black uppercase tracking-wider text-on-surface">{title}</p>
      {message && (
        <p className="text-xs text-on-surface-variant mt-1 max-w-sm">{message}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className={cn("w-6 h-6 animate-spin text-primary", className)} />
    </div>
  );
}

export function Toolbar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-4">{children}</div>
  );
}

// Table helpers
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">{children}</table>
    </div>
  );
}

export function Th({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cn(
        "text-left px-3 py-2.5 text-[9px] font-black uppercase tracking-widest text-on-surface-variant opacity-60 border-b border-outline/40",
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
  onClick,
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  onClick?: React.MouseEventHandler<HTMLTableCellElement>;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      onClick={onClick}
      className={cn("px-3 py-2.5 border-b border-outline/20 text-on-surface", className)}
    >
      {children}
    </td>
  );
}
