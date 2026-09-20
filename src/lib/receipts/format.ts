import { formatCurrency, formatDateTime } from "@/lib/utils";
import type { ReceiptSale, ReceiptOptions } from "./types";

/** Plain-text, pt-MZ receipt — the first plain-text receipt format in the app (`ReceiptModal`'s print/on-screen paths each build their own HTML/JSX independently, with nothing reusable). */
export function formatReceiptText(sale: ReceiptSale, opts: ReceiptOptions): string {
  const fmt = (n: number) => formatCurrency(n, opts.currencySymbol);
  const lines: string[] = [];

  lines.push(`*${opts.businessName}*`);
  if (opts.businessPhone) lines.push(opts.businessPhone);
  lines.push("");
  lines.push(`Recibo: ${sale.saleNumber}`);
  lines.push(formatDateTime(sale.createdAt));
  if (sale.customer) lines.push(`Cliente: ${sale.customer.name}`);
  lines.push("");

  for (const item of sale.items) {
    lines.push(`${item.quantity}× ${item.productName} (${item.variantLabel}) — ${fmt(item.total)}`);
  }

  lines.push("");
  lines.push(`Subtotal: ${fmt(sale.subtotal)}`);
  if (sale.discount > 0) lines.push(`Desconto: -${fmt(sale.discount)}`);
  if (sale.tax > 0) lines.push(`Imposto: ${fmt(sale.tax)}`);
  lines.push(`*Total: ${fmt(sale.total)}*`);
  lines.push(`Pago: ${fmt(sale.paidAmount)}`);
  if (sale.balance > 0) lines.push(`Saldo devedor: ${fmt(sale.balance)}`);

  if (opts.footer) {
    lines.push("");
    lines.push(opts.footer);
  }

  return lines.join("\n");
}
