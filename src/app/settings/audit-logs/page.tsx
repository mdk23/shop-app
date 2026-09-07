"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
  inputClass,
} from "@/components/ui";
import { Search } from "lucide-react";

export default function AuditLogsPage() {
  const logs = useQuery(api.auth.getAuditLogs, { limit: 300 });
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (logs ?? []).filter(
      (l) =>
        !t ||
        l.action.toLowerCase().includes(t) ||
        l.username.toLowerCase().includes(t) ||
        (l.details ?? "").toLowerCase().includes(t)
    );
  }, [logs, search]);

  return (
    <PageLayout title="Audit Logs" subtitle="Administration · activity trail">
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-64`}
            placeholder="Filter action / user / detail"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Toolbar>

      <Card>
        {logs === undefined ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No matching entries" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>User</Th>
                <Th>Action</Th>
                <Th>Detail</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((l) => (
                <tr key={l._id} className="hover:bg-surface-container-low">
                  <Td className="text-xs text-on-surface-variant whitespace-nowrap">
                    {new Date(l.createdAt).toLocaleString()}
                  </Td>
                  <Td className="font-bold">{l.username}</Td>
                  <Td>
                    <Badge tone="info">{l.action}</Badge>
                  </Td>
                  <Td className="text-xs text-on-surface-variant max-w-lg truncate">
                    {l.details ?? "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </PageLayout>
  );
}
