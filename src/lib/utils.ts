import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Single currency formatter for the whole app. Symbol defaults to "MT"
 * (Mozambican metical) and can be overridden from the `currencySymbol` setting.
 */
export function formatCurrency(amount: number, symbol = "MT") {
  const n = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount ?? 0);
  return `${n} ${symbol}`;
}

/** @deprecated use formatCurrency */
export const formatMT = (amount: number) => formatCurrency(amount);
