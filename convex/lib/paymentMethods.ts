import { v } from "convex/values";

/**
 * The one list of payment methods, shared by the backend (validators) and the pages
 * (pickers and labels). Refunds can also go to store credit.
 */
export const PAYMENT_METHODS = ["CASH", "CARD", "MPESA", "EMOLA", "BANK_TRANSFER", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const REFUND_METHODS = [...PAYMENT_METHODS, "STORE_CREDIT"] as const;
export type RefundMethod = (typeof REFUND_METHODS)[number];

export const paymentMethodValidator = v.union(...PAYMENT_METHODS.map((m) => v.literal(m)));
export const refundMethodValidator = v.union(...REFUND_METHODS.map((m) => v.literal(m)));

/** Canonical English `t()` keys. */
export const PAYMENT_METHOD_LABEL: Record<RefundMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  MPESA: "M-Pesa",
  EMOLA: "e-Mola",
  BANK_TRANSFER: "Bank transfer",
  OTHER: "Other",
  STORE_CREDIT: "Store credit",
};
