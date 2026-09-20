import { normalizePhone } from "../../../convex/lib/phone";
import { formatReceiptText } from "./format";
import type { ReceiptChannel } from "./types";

/** wa.me needs the full international number (country code, no "+", no spaces). */
function toWaMeFormat(phone: string): string {
  const local = normalizePhone(phone); // strips a leading "258" if present
  return local ? `258${local}` : phone.replace(/\D/g, "");
}

/**
 * `wa.me` appears in exactly this one place — swapping in a real WhatsApp
 * Business API later means adding a channel here and changing `getReceiptChannel`,
 * not touching any call site.
 */
export function buildWhatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${toWaMeFormat(phone)}?text=${encodeURIComponent(text)}`;
}

export const whatsappLinkChannel: ReceiptChannel = {
  id: "whatsapp-link",
  send(sale, phone, opts) {
    const text = formatReceiptText(sale, opts);
    const url = buildWhatsAppUrl(phone, text);
    window.open(url, "_blank", "noopener");
  },
};
