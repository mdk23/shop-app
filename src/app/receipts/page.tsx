"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, EmptyState, Spinner, Table, Th, Td, Toolbar, Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useClientPage } from "@/lib/pagination";
import { PagedFooter } from "@/components/ui";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export default function ReceiptsPage() {
  const { t } = useTranslation();
  const receipts = useQuery(api.purchaseReceipts.list, {});
  const page = useClientPage(receipts ?? []);

  return (
    <PageLayout title={t("Goods received")} subtitle={t("Every delivery booked into stock")}>
      <Toolbar>
        <div className="ml-auto" />
        <Link href="/receipts/new">
          <Button>
            <Plus className="w-3.5 h-3.5" /> {t("New receipt")}
          </Button>
        </Link>
      </Toolbar>

      <Card>
        {receipts === undefined ? (
          <Spinner />
        ) : receipts.length === 0 ? (
          <EmptyState
            title={t("No receipts yet")}
            message={t("Book a delivery against an order, or record goods that arrived without one.")}
            action={
              <Link href="/receipts/new">
                <Button>{t("New receipt")}</Button>
              </Link>
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Receipt")}</Th>
                    <Th>{t("Date")}</Th>
                    <Th>{t("Supplier")}</Th>
                    <Th>{t("Order")}</Th>
                    <Th>{t("Delivery note")}</Th>
                    <Th className="text-right">{t("Units")}</Th>
                    <Th>{t("Kind")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r._id} className="hover:bg-surface-container-low">
                      <Td className="font-mono font-bold">
                        <Link href={`/receipts/${r._id}`}>{r.receiptNumber}</Link>
                      </Td>
                      <Td>{formatDate(r.receivedAt)}</Td>
                      <Td>{r.supplierName}</Td>
                      <Td>
                        {r.purchaseOrderId ? (
                          <Link href={`/purchase-orders/${r.purchaseOrderId}`} className="font-mono">
                            {r.orderCode}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </Td>
                      <Td>{r.deliveryNoteRef ?? "—"}</Td>
                      <Td className="text-right font-bold">{r.unitsTotal}</Td>
                      <Td>
                        <Badge tone={r.purchaseOrderId ? "neutral" : "warning"}>
                          {r.purchaseOrderId ? t("With order") : t("Without order")}
                        </Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <PagedFooter paged={page} loading={receipts === undefined} />
          </>
        )}
      </Card>
    </PageLayout>
  );
}
