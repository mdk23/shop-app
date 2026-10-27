"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Modal, Table, Th, Td, Badge, EmptyState, Spinner, Toolbar } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Filter = "SCHEDULED" | "DELIVERED" | "FAILED" | "ALL";
const STATUS_TONE = { SCHEDULED: "info", DELIVERED: "success", FAILED: "error" } as const;
const STATUS_LABEL = { SCHEDULED: "Scheduled", DELIVERED: "Delivered", FAILED: "Failed" } as const;

export default function DeliveriesPage() {
  const { t } = useTranslation();
  const token = useToken();
  const [filter, setFilter] = useState<Filter>("SCHEDULED");
  const rows = useQuery(api.deliveries.list, filter === "ALL" ? { token } : { token, status: filter });
  const markDelivered = useMutation(api.deliveries.markDelivered);
  const markFailed = useMutation(api.deliveries.markFailed);
  const [failing, setFailing] = useState<Id<"deliveries"> | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(t(success));
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Deliveries")} subtitle={t("Goods on their way to customers")}>
      <Toolbar>
        <div className="flex gap-1.5">
          {(["SCHEDULED", "DELIVERED", "FAILED", "ALL"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
                filter === f
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-low text-on-surface-variant border-outline"
              )}
            >
              {f === "ALL" ? t("All") : t(STATUS_LABEL[f])}
            </button>
          ))}
        </div>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t("No deliveries here")}
            message={t("Schedule a delivery from a delivery sale or a collected order.")}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t("Number")}</Th>
                  <Th>{t("Sale")}</Th>
                  <Th>{t("Recipient")}</Th>
                  <Th>{t("Address")}</Th>
                  <Th>{t("Items")}</Th>
                  <Th>{t("Status")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <tr key={d._id} className="hover:bg-surface-container-low">
                    <Td className="font-mono">
                      {d.deliveryNumber}
                      <div className="text-xs text-on-surface-variant">{formatDate(d.createdAt)}</div>
                    </Td>
                    <Td className="font-mono">
                      {d.saleNumber}
                      {d.orderNumber && d.customerOrderId && (
                        <div>
                          <Link href={`/orders/${d.customerOrderId}`} className="text-xs underline">
                            {d.orderNumber}
                          </Link>
                        </div>
                      )}
                    </Td>
                    <Td>
                      {d.recipientName}
                      {d.recipientPhone && <div className="text-xs text-on-surface-variant">{d.recipientPhone}</div>}
                    </Td>
                    <Td className="text-xs">{d.address}</Td>
                    <Td className="text-xs">
                      {d.items.map((i) => (
                        <div key={i._id}>
                          {i.label} ×{i.quantity}
                        </div>
                      ))}
                    </Td>
                    <Td>
                      <Badge tone={STATUS_TONE[d.status]}>{t(STATUS_LABEL[d.status])}</Badge>
                      {d.deliveredAt && (
                        <div className="text-xs text-on-surface-variant">
                          {formatDate(d.deliveredAt)} · {d.receivedBy}
                        </div>
                      )}
                      {d.failureReason && <div className="text-xs text-on-surface-variant">{d.failureReason}</div>}
                    </Td>
                    <Td>
                      {d.status === "SCHEDULED" && (
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busy}
                            onClick={() => run(() => markDelivered({ token, id: d._id }), "Marked as delivered")}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> {t("Delivered")}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setFailing(d._id)}>
                            <XCircle className="w-3.5 h-3.5" /> {t("Failed")}
                          </Button>
                        </div>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={!!failing}
        onClose={() => setFailing(null)}
        title={t("Delivery failed")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setFailing(null)}>
              {t("Cancel")}
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={!reason.trim()}
              onClick={async () => {
                if (!failing) return;
                if (await run(() => markFailed({ token, id: failing, reason }), "Delivery marked as failed")) {
                  setFailing(null);
                  setReason("");
                }
              }}
            >
              {t("Mark failed")}
            </Button>
          </>
        }
      >
        <Field label={t("Reason")} required>
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </PageLayout>
  );
}
