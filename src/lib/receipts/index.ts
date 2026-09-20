import { whatsappLinkChannel } from "./whatsapp";
import type { ReceiptChannel } from "./types";

/** The single swap point — a WhatsApp Business API channel replaces this later without touching call sites. */
export function getReceiptChannel(): ReceiptChannel {
  return whatsappLinkChannel;
}

export { formatReceiptText } from "./format";
export { buildWhatsAppUrl } from "./whatsapp";
export type { ReceiptSale, ReceiptOptions, ReceiptChannel } from "./types";
