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
  Spinner,
  Toolbar,
  StatCard,
  Modal,
  Button,
} from "@/components/ui";
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";

export default function CashReportsPage() {
  const token = useToken();
  const fmt = useCurrency();
  const { branches } = useResolvedBranch();
  const [statusFilter, setStatusFilter] = useState("");
  const [branch, setBranch] = useState("");
  const [openId, setOpenId] = useState<Id<"cashRegisterSessions"> | null>(null);

  const sessions = useQuery(
    api.cashRegister.listSessions,
    token
      ? {
          token,
          status: (statusFilter || undefined) as "open" | "closed" | undefined,
          branchId: branch || undefined,
          limit: 100,
        }
      : "skip"
  );

  const totals = (sessions ?? []).reduce(
    (a, s) => ({
      sales: a.sales + (s.cashSalesTotal ?? 0),
      refunds: a.refunds + (s.cashRefundTotal ?? 0),
      shortages:
        a.shortages + (s.difference !== undefined && s.difference < 0 ? -s.difference : 0),
    }),
    { sales: 0, refunds: 0, shortages: 0 }
  );

  return (
    <PageLayout title="Cash Reports" subtitle="Cash register · session history">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
        <StatCard label="Cash sales" value={fmt(totals.sales)} accent="success" />
        <StatCard label="Cash refunds" value={fmt(totals.refunds)} accent="error" />
        <StatCard label="Shortages" value={fmt(totals.shortages)} accent="error" />
      </div>

      <Toolbar>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-36"
        >
          <option value="">All</option>
          <option value="open">Open</option>
          <option value="closed">Closed</option>
        </Select>
        {branches.length > 1 && (
          <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-40">
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
      </Toolbar>

      <Card>
        {sessions === undefined ? (
          <Spinner />
        ) : sessions.length === 0 ? (
          <EmptyState title="No sessions" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Opened</Th>
                <Th>User</Th>
                <Th>Status</Th>
                <Th className="text-right">Opening</Th>
                <Th className="text-right">Cash sales</Th>
                <Th className="text-right">Expected</Th>
                <Th className="text-right">Counted</Th>
                <Th className="text-right">Diff</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s._id} className="hover:bg-surface-container-low">
                  <Td className="text-xs">{new Date(s.openedAt).toLocaleString()}</Td>
                  <Td>{s.userName ?? s.username}</Td>
                  <Td>
                    <Badge tone={s.status === "open" ? "info" : "neutral"}>{s.status}</Badge>
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
                      View
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
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
  return (
    <Modal open onClose={onClose} size="lg" title="Session detail">
      {!s ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>When</Th>
              <Th>Type</Th>
              <Th>Description</Th>
              <Th className="text-right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {s.movements.map((m) => (
              <tr key={m._id}>
                <Td className="text-xs">{new Date(m.createdAt).toLocaleString()}</Td>
                <Td>
                  <Badge tone="neutral">{m.type.replace("_", " ")}</Badge>
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
