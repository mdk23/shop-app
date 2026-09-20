/**
 * Structural subset of `api.sales.get`'s return value — call sites pass that
 * query result straight in, no mapper needed (excess properties on an
 * already-typed object are fine in TypeScript).
 */
export type ReceiptSale = {
  saleNumber: string;
  createdAt: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  paidAmount: number;
  balance: number;
  items: {
    productName: string;
    variantLabel: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }[];
  customer: { name: string; phone1: string } | null;
  branch: { name: string } | null;
};

export type ReceiptOptions = {
  businessName: string;
  businessPhone?: string;
  footer?: string;
  currencySymbol?: string;
};

export interface ReceiptChannel {
  readonly id: "whatsapp-link" | "whatsapp-business-api";
  send(sale: ReceiptSale, phone: string, opts: ReceiptOptions): Promise<void> | void;
}
