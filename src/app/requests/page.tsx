"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Badge,
  EmptyState,
  Spinner,
  Table,
  Th,
  Td,
  Toolbar,
  PagedFooter,
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate, cn } from "@/lib/utils";
import { useClientPage } from "@/lib/pagination";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

type Status = "OPEN" | "FULFILLED" | "CANCELLED";
type Reason = "WRONG_SIZE" | "WRONG_COLOR" | "PRICE_TOO_HIGH" | "NOT_IN_STOCK" | "OTHER";

const STATUSES: ("ALL" | Status)[] = ["ALL", "OPEN", "FULFILLED", "CANCELLED"];
const STATUS_LABEL: Record<Status, string> = {
  OPEN: "Open",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
};
const STATUS_TONE: Record<Status, "info" | "success" | "error"> = {
  OPEN: "info",
  FULFILLED: "success",
  CANCELLED: "error",
};

const REASONS: { value: Reason; label: string }[] = [
  { value: "WRONG_SIZE", label: "Wrong size" },
  { value: "WRONG_COLOR", label: "Wrong color" },
  { value: "PRICE_TOO_HIGH", label: "Price too high" },
  { value: "NOT_IN_STOCK", label: "Not in stock" },
  { value: "OTHER", label: "Other" },
];

export default function RequestsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const [status, setStatus] = useState<"ALL" | Status>("OPEN");
  const [reason, setReason] = useState<Reason | "ALL">("ALL");

  const requests = useQuery(api.wantList.list, {
    status: status === "ALL" ? undefined : status,
    reason: reason === "ALL" ? undefined : reason,
  });
  const counts = useQuery(api.wantList.countByReason, {});
  const sizes = useQuery(api.sizes.list, {});
  const colors = useQuery(api.colors.list, {});
  const resolve = useMutation(api.wantList.resolve);
  const page = useClientPage(requests ?? []);

  const sizeName = (id?: string) => (sizes ?? []).find((s) => s._id === id)?.name ?? "—";
  const colorName = (id?: string) => (colors ?? []).find((c) => c._id === id)?.name ?? "—";

  const close = async (id: Id<"wantList">, outcome: "FULFILLED" | "CANCELLED") => {
    try {
      await resolve({ token, id, outcome });
      toast.success(t("Request updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const total = Object.values(counts ?? {}).reduce((s, n) => s + n, 0);

  return (
    <PageLayout title={t("Requests")} subtitle={t("What customers asked for and did not get")}>
      <Card className="p-4 mb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
          {t("Why sales were lost")} · {total}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(reason === r.value ? "ALL" : r.value)}
              className={cn(
                "p-3 rounded-xl border text-left transition-colors",
                reason === r.value
                  ? "border-primary bg-primary/10"
                  : "border-outline bg-surface-container-low hover:border-primary/50"
              )}
            >
              <p className="text-2xl font-black">{counts?.[r.value] ?? 0}</p>
              <p className="text-xs text-on-surface-variant">{t(r.label)}</p>
            </button>
          ))}
        </div>
      </Card>

      <Toolbar>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
                status === s
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-low text-on-surface-variant border-outline"
              )}
            >
              {s === "ALL" ? t("All") : t(STATUS_LABEL[s])}
            </button>
          ))}
        </div>
      </Toolbar>

      <Card>
        {requests === undefined ? (
          <Spinner />
        ) : requests.length === 0 ? (
          <EmptyState
            title={t("No requests here")}
            message={t("Requests are recorded from a customer's profile when the shop cannot meet them.")}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Request")}</Th>
                    <Th>{t("Customer")}</Th>
                    <Th>{t("Size")}</Th>
                    <Th>{t("Color")}</Th>
                    <Th>{t("Qty")}</Th>
                    <Th>{t("Budget")}</Th>
                    <Th>{t("Reason")}</Th>
                    <Th>{t("Status")}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r._id} className="hover:bg-surface-container-low">
                      <Td className="font-bold">{r.description}</Td>
                      <Td>{r.customerName ?? t("Walk-in")}</Td>
                      <Td>{sizeName(r.sizeId)}</Td>
                      <Td>{colorName(r.colorId)}</Td>
                      <Td>{r.quantity ?? "—"}</Td>
                      <Td>{r.maxPrice ?? "—"}</Td>
                      <Td>{r.reason ? t(REASONS.find((x) => x.value === r.reason)?.label ?? "Other") : "—"}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[r.status]}>{t(STATUS_LABEL[r.status])}</Badge>
                      </Td>
                      <Td>
                        {r.status === "OPEN" && (
                          <div className="flex gap-1">
                            <Button size="sm" variant="secondary" onClick={() => close(r._id, "FULFILLED")}>
                              {t("Mark fulfilled")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => close(r._id, "CANCELLED")}>
                              {t("Cancel request")}
                            </Button>
                          </div>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="md:hidden space-y-2 p-2">
              {page.rows.map((r) => (
                <div key={r._id} className="p-3 rounded-xl border border-outline bg-surface-container-low space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-sm">{r.description}</span>
                    <Badge tone={STATUS_TONE[r.status]}>{t(STATUS_LABEL[r.status])}</Badge>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {r.customerName ?? t("Walk-in")} · {formatDate(r.createdAt)}
                  </p>
                  {r.status === "OPEN" && (
                    <div className="flex gap-1.5 pt-1">
                      <Button size="sm" variant="secondary" onClick={() => close(r._id, "FULFILLED")}>
                        {t("Mark fulfilled")}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => close(r._id, "CANCELLED")}>
                        {t("Cancel request")}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <PagedFooter paged={page} loading={requests === undefined} />
          </>
        )}
      </Card>
    </PageLayout>
  );
}
