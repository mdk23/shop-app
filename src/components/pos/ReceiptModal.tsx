"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal, Button, Spinner } from "@/components/ui";
import { useCurrency } from "@/lib/useShop";
import { Printer } from "lucide-react";

export function ReceiptModal({
  saleId,
  onClose,
}: {
  saleId: Id<"sales">;
  onClose: () => void;
}) {
  const fmt = useCurrency();
  const sale = useQuery(api.sales.get, { id: saleId });
  const settings = useQuery(api.settings.getAll, {});

  const s = (key: string) =>
    settings?.find((x) => x.key === key)?.value ?? "";

  const print = () => {
    if (!sale) return;
    const w = window.open("", "_blank", "width=380,height=640");
    if (!w) return;
    const rows = sale.items
      .map(
        (it) =>
          `<tr><td>${it.quantity}× ${it.productName} <span style="color:#666">(${it.variantLabel})</span></td><td style="text-align:right">${fmt(
            it.total
          )}</td></tr>`
      )
      .join("");
    const pays = sale.payments
      .map(
        (p) =>
          `<tr><td>${p.kind === "refund" ? "Refund " : ""}${p.method}</td><td style="text-align:right">${fmt(
            p.amount
          )}</td></tr>`
      )
      .join("");
    w.document.write(`<!doctype html><html><head><title>${sale.saleNumber}</title>
      <style>
        *{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;color:#000}
        body{width:300px;margin:0 auto;padding:12px}
        h1{font-size:14px;text-align:center;margin:0 0 2px}
        .muted{color:#555;text-align:center;font-size:11px}
        hr{border:none;border-top:1px dashed #999;margin:8px 0}
        table{width:100%;border-collapse:collapse}
        td{padding:2px 0;vertical-align:top}
        .tot td{font-weight:bold;font-size:13px}
      </style></head><body onload="window.print();window.close()">
      <h1>${s("businessName") || "Store"}</h1>
      <div class="muted">${s("businessAddress")}</div>
      <div class="muted">${s("businessPhone")}</div>
      <hr/>
      <div>Receipt: <b>${sale.saleNumber}</b></div>
      <div>${new Date(sale.createdAt).toLocaleString()}</div>
      <div>Customer: ${sale.customerName ?? "Walk-in"}</div>
      <div>Served by: ${sale.username ?? "—"}</div>
      <hr/>
      <table>${rows}</table>
      <hr/>
      <table>
        <tr><td>Subtotal</td><td style="text-align:right">${fmt(sale.subtotal)}</td></tr>
        ${sale.discount ? `<tr><td>Discount</td><td style="text-align:right">-${fmt(sale.discount)}</td></tr>` : ""}
        ${sale.tax ? `<tr><td>Tax</td><td style="text-align:right">${fmt(sale.tax)}</td></tr>` : ""}
        <tr class="tot"><td>Total</td><td style="text-align:right">${fmt(sale.total)}</td></tr>
      </table>
      <hr/>
      <table>${pays}
        <tr><td>Balance</td><td style="text-align:right">${fmt(sale.balance)}</td></tr>
      </table>
      <hr/>
      <div class="muted">${s("receiptFooter")}</div>
      </body></html>`);
    w.document.close();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Sale Complete"
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            New Sale
          </Button>
          <Button onClick={print} disabled={!sale}>
            <Printer className="w-3.5 h-3.5" /> Print Receipt
          </Button>
        </>
      }
    >
      {!sale ? (
        <Spinner />
      ) : (
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant uppercase tracking-wider text-xs">
              Receipt
            </span>
            <span className="font-mono font-bold">{sale.saleNumber}</span>
          </div>
          <div className="rounded-xl bg-surface-container-low border border-outline divide-y divide-outline/30">
            {sale.items.map((it) => (
              <div key={it._id} className="flex justify-between px-3 py-2 text-xs">
                <span>
                  {it.quantity}× {it.productName}{" "}
                  <span className="text-on-surface-variant">({it.variantLabel})</span>
                </span>
                <span className="font-bold">{fmt(it.total)}</span>
              </div>
            ))}
          </div>
          <div className="space-y-1 text-xs">
            <Line label="Subtotal" value={fmt(sale.subtotal)} />
            {sale.discount > 0 && <Line label="Discount" value={`-${fmt(sale.discount)}`} />}
            {sale.tax > 0 && <Line label="Tax" value={fmt(sale.tax)} />}
            <div className="flex justify-between pt-1 border-t border-outline/40 text-sm font-black">
              <span>Total</span>
              <span className="text-primary">{fmt(sale.total)}</span>
            </div>
            <Line label="Paid" value={fmt(sale.paidAmount)} />
            {sale.balance > 0 && (
              <Line label="Balance due" value={fmt(sale.balance)} />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-on-surface-variant uppercase tracking-wider">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
