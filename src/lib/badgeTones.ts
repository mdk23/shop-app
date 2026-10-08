/**
 * Shared status → badge-tone maps. `Badge`'s `tone` prop is a fixed 5-value
 * union (neutral/success/warning/error/info) — new features should extend
 * this file rather than defining another local tone map inline (there are
 * already ~10 of those scattered across the app).
 */

export type Tone = "neutral" | "success" | "warning" | "error" | "info";

export type Tier = "NOVO" | "REGULAR" | "VIP";

export const TIER_TONE: Record<Tier, Tone> = {
  NOVO: "neutral",
  REGULAR: "info",
  // VIP uses "info" rather than "warning" so it never collides visually with
  // the money row's warning-toned "dívida" (debt) display.
  VIP: "info",
};

/**
 * Values here are the canonical English `t()` keys, not display text —
 * every call site must wrap the lookup in `t(...)` (e.g. `t(TIER_LABEL[tier])`)
 * rather than rendering it directly, since a plain exported object can't
 * call the `useTranslation` hook itself. See `src/lib/i18n/pt.ts` for the
 * Portuguese translations of these exact strings.
 */
export const TIER_LABEL: Record<Tier, string> = {
  NOVO: "New",
  REGULAR: "Regular",
  VIP: "VIP",
};

export type SizeConfidence = "CONFIRMADO" | "INFERIDO";

export const SIZE_CONFIDENCE_TONE: Record<SizeConfidence, Tone> = {
  CONFIRMADO: "success",
  INFERIDO: "neutral",
};

/** Canonical English `t()` keys — see the `TIER_LABEL` note above. */
export const SIZE_CONFIDENCE_LABEL: Record<SizeConfidence, string> = {
  CONFIRMADO: "Confirmed",
  INFERIDO: "Suggested from history",
};

/** What happened to the sale (goods). */
export type SaleStatus = "COMPLETED" | "CANCELLED" | "RETURNED" | "PARTIALLY_RETURNED";

export const SALE_STATUS_TONE: Record<SaleStatus, Tone> = {
  COMPLETED: "success",
  CANCELLED: "neutral",
  RETURNED: "error",
  PARTIALLY_RETURNED: "warning",
};

/** Canonical English `t()` keys — see the `TIER_LABEL` note above. */
export const SALE_STATUS_LABEL: Record<SaleStatus, string> = {
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  RETURNED: "Returned",
  PARTIALLY_RETURNED: "Partially returned",
};

/** The money on a sale. */
export type SalePaymentStatus = "PAID" | "PARTIALLY_PAID" | "UNPAID" | "REFUNDED" | "PARTIALLY_REFUNDED";

export const SALE_PAYMENT_TONE: Record<SalePaymentStatus, Tone> = {
  PAID: "success",
  PARTIALLY_PAID: "warning",
  UNPAID: "warning",
  REFUNDED: "error",
  PARTIALLY_REFUNDED: "error",
};

/** Canonical English `t()` keys — see the `TIER_LABEL` note above. */
export const SALE_PAYMENT_LABEL: Record<SalePaymentStatus, string> = {
  PAID: "Paid",
  PARTIALLY_PAID: "Partially paid",
  UNPAID: "Unpaid",
  REFUNDED: "Refunded",
  PARTIALLY_REFUNDED: "Partially refunded",
};
