"use client";

import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Badge, Spinner, Table, Th, Td } from "@/components/ui";
import { useCurrency } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

const STATUS_TONE = {
  DRAFT: "neutral",
  SENT: "info",
  PARTIALLY_RECEIVED: "warning",
  COMPLETED: "success",
  CANCELLED: "error",
} as const;

const STATUS_LABEL = {
  DRAFT: "Draft",
  SENT: "Sent to supplier",
  PARTIALLY_RECEIVED: "Partly received",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
} as const;

export default function PurchaseOrderDetailPage() {
  const { t } = useTranslation();
  const fmt = useCurrency();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id as Id<"purchaseOrders">;
  const po = useQuery(api.purchaseOrders.get, { id });
  const receipts = useQuery(api.purchaseReceipts.listByPurchaseOrder, { purchaseOrderId: id });
  const shipments = useQuery(api.shipments.list, {});

  if (po === undefined) {
    return (
      <PageLayout title={t("Purchase order")} subtitle="">
        <Spinner />
      </PageLayout>
    );
  }
  if (po === null) {
    return (
      <PageLayout title={t("Purchase order")} subtitle="">
        <p className="text-sm">{t("Order not found.")}</p>
      </PageLayout>
    );
  }

  const ordered = po.items.reduce((s, i) => s + i.quantityOrdered, 0);
  const received = po.items.reduce((s, i) => s + i.quantityReceived, 0);
  const mine = (shipments ?? []).filter((s) => s.purchaseOrderId === id);

  return (
    <PageLayout title={po.orderCode} subtitle={`${po.supplierName} · ${po.branchName ?? ""}`}>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" onClick={() => router.push("/purchase-orders")}>
          <ArrowLeft className="w-3.5 h-3.5" /> {t("Back")}
        </Button>
        <Badge tone={STATUS_TONE[po.status]}>{t(STATUS_LABEL[po.status])}</Badge>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Ordered")}</p>
          <p className="text-xl font-black">{ordered}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Received")}</p>
          <p className="text-xl font-black">{received}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Total")}</p>
          <p className="text-xl font-black">{fmt(po.totalAmount)}</p>
        </Card>
      </div>

      <Card className="mb-4">
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>{t("Item")}</Th>
                <Th className="text-right">{t("Ordered")}</Th>
                <Th className="text-right">{t("Received")}</Th>
                <Th>{t("Progress")}</Th>
                <Th className="text-right">{t("Unit cost")}</Th>
              </tr>
            </thead>
            <tbody>
              {po.items.map((i) => {
                const pct = i.quantityOrdered > 0 ? Math.min(100, (i.quantityReceived / i.quantityOrdered) * 100) : 0;
                return (
                  <tr key={i._id}>
                    <Td>
                      {i.productName} <span className="text-on-surface-variant">{i.variantLabel}</span>
                    </Td>
                    <Td className="text-right">{i.quantityOrdered}</Td>
                    <Td className="text-right font-bold">{i.quantityReceived}</Td>
                    <Td>
                      <div className="h-2 w-32 rounded-full bg-surface-container-high overflow-hidden">
                        <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                    </Td>
                    <Td className="text-right">{fmt(i.unitCost)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Receipts")}
          </p>
          {receipts === undefined ? (
            <Spinner />
          ) : receipts.length === 0 ? (
            <p className="text-xs text-on-surface-variant">{t("Nothing received yet")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {receipts.map((r) => (
                <li key={r._id}>
                  <span className="font-mono">{r.receiptNumber}</span> · {formatDate(r.receivedAt)} ·{" "}
                  {r.unitsTotal} {t("units")}
                  {r.deliveryNoteRef ? ` · ${r.deliveryNoteRef}` : ""}
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Shipments")}
          </p>
          {mine.length === 0 ? (
            <p className="text-xs text-on-surface-variant">{t("No shipments for this order")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {mine.map((s) => (
                <li key={s._id}>
                  {s.carrier} · {s.trackingReference ?? "—"} ·{" "}
                  {s.status === "ARRIVED" ? t("Arrived") : t("In transit")}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </PageLayout>
  );
}
