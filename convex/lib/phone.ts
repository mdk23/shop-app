/**
 * No phone normalization exists anywhere in the app today — `customers.phone1`
 * is stored and indexed exactly as typed. This is the first place that needs
 * to match phones typed in different formats (e.g. "+258 84 123 4567" vs
 * "841234567"), for retroactive customer capture in the POS.
 */

/** Strips everything but digits, then strips a leading Mozambique country code. */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  const withoutCountryCode = digits.startsWith("258") ? digits.slice(3) : digits;
  return withoutCountryCode.length >= 7 ? withoutCountryCode : "";
}
