"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Select,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Pagination,
  Spinner,
  Toolbar,
  StatCard,
  Modal,
  Button,
} from "@/components/ui";
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";
import { usePagedQuery } from "@/lib/pagination";
import { useTranslation } from "@/contexts/LanguageContext";

export default function CashReportsPage() {
  const token = useToken();
  const fmt = useCurrency();
  const { branches } = useResolvedBranch();
  const { t } = useTranslation();
  const [statusFilter, setStatusFilter] = useState("");
  const [branch, setBranch] = useState("");
  const [openId, setOpenId] = useState<Id<"cashRegisterSessions"> | null>(null);

  const filterArgs = token
    ? {
        token,
        status: (statusFilter || undefined) as "open" | "closed" | undefined,
        branchId: branch || undefined,
      }
    : "skip";

  const {
    rows: sessions,
    isLoading,
    pageIndex,
    pageSize,
    hasPrev,
    hasNext,
    goPrev,
    goNext,
  } = usePagedQuery(api.cashRegister.listSessionsPaged, filterArgs);

  const totals = useQuery(
    api.cashRegister.sessionTotals,
    token
      ? {
          token,
          status: (statusFilter || undefined) as "open" | "closed" | undefined,
          branchId: branch || undefined,
        }
      : "skip"
  ) ?? { sales: 0, refunds: 0, shortages: 0 };

  return (
    <PageLayout title={t("Cash Reports")} subtitle={t("Cash register · session history")}>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label={t("Cash sales")} value={fmt(totals.sales)} accent="success" />
        <StatCard label={t("Cash refunds")} value={fmt(totals.refunds)} accent="error" />
        <StatCard label={t("Shortages")} value={fmt(totals.shortages)} accent="error" />
      </div>

      <Toolbar>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-36"
        >
          <option value="">{t("All")}</option>
          <option value="open">{t("Open")}</option>
          <option value="closed">{t("Closed")}</option>
        </Select>
        {branches.length > 1 && (
          <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-40">
            <option value="">{t("All branches")}</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
      </Toolbar>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <EmptyState title={t("No sessions")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Opened")}</Th>
                <Th>{t("User")}</Th>
                <Th>{t("Status")}</Th>
                <Th className="text-right">{t("Opening")}</Th>
                <Th className="text-right">{t("Cash sales")}</Th>
                <Th className="text-right">{t("Expected")}</Th>
                <Th className="text-right">{t("Counted")}</Th>
                <Th className="text-right">{t("Diff")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s._id} className="hover:bg-surface-container-low">
                  <Td className="text-xs">{new Date(s.openedAt).toLocaleString()}</Td>
                  <Td>{s.userName ?? s.username}</Td>
                  <Td>
                    <Badge tone={s.status === "open" ? "info" : "neutral"}>
                      {t(s.status === "open" ? "Open" : "Closed")}
                    </Badge>
                  </Td>
                  <Td className="text-right">{fmt(s.openingAmount)}</Td>
                  <Td className="text-right">{fmt(s.cashSalesTotal ?? 0)}</Td>
                  <Td className="text-right">{fmt(s.expectedCash ?? 0)}</Td>
                  <Td className="text-right">
                    {s.actualCash !== undefined ? fmt(s.actualCash) : "—"}
                  </Td>
                  <Td
                    className={`text-right font-bold ${
                      (s.difference ?? 0) < 0 ? "text-error" : "text-success"
                    }`}
                  >
                    {s.difference !== undefined ? fmt(s.difference) : "—"}
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(s._id)}>
                      {t("View")}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!isLoading && sessions.length > 0 && (
          <Pagination
            pageIndex={pageIndex}
            rowCount={sessions.length}
            pageSize={pageSize}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </Card>

      {openId && (
        <SessionDetail id={openId} fmt={fmt} onClose={() => setOpenId(null)} />
      )}
    </PageLayout>
  );
}

function SessionDetail({
  id,
  fmt,
  onClose,
}: {
  id: Id<"cashRegisterSessions">;
  fmt: (n: number) => string;
  onClose: () => void;
}) {
  const s = useQuery(api.cashRegister.getSessionWithMovements, { sessionId: id });
  const { t } = useTranslation();
  return (
    <Modal open onClose={onClose} size="lg" title={t("Session detail")}>
      {!s ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("When")}</Th>
              <Th>{t("Type")}</Th>
              <Th>{t("Description")}</Th>
              <Th className="text-right">{t("Amount")}</Th>
            </tr>
          </thead>
          <tbody>
            {s.movements.map((m) => (
              <tr key={m._id}>
                <Td className="text-xs">{new Date(m.createdAt).toLocaleString()}</Td>
                <Td>
                  <Badge tone="neutral">{t(m.type.replace("_", " "))}</Badge>
                </Td>
                <Td className="text-xs">{m.description}</Td>
                <Td className="text-right font-bold">{fmt(m.amount)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}
