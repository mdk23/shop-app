import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Single currency formatter for the whole app. Symbol defaults to "MT"
 * (Mozambican metical) and can be overridden from the `currencySymbol` setting.
 * Uses pt-PT grouping/decimal conventions (e.g. "1.250,00"), which match pt-MZ.
 */
export function formatCurrency(amount: number, symbol = "MT") {
  const n = new Intl.NumberFormat("pt-PT", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
  return `${n} ${symbol}`;
}

/** @deprecated use formatCurrency */
export const formatMT = (amount: number) => formatCurrency(amount);

/** dd/MM/yyyy — the pt-MZ date convention used across the app. */
export function formatDate(timestamp: number) {
  return format(new Date(timestamp), "dd/MM/yyyy");
}

/** dd/MM/yyyy HH:mm — the pt-MZ date+time convention used across the app. */
export function formatDateTime(timestamp: number) {
  return format(new Date(timestamp), "dd/MM/yyyy HH:mm");
}
