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
  Pagination,
  Spinner,
  Toolbar,
  inputClass,
} from "@/components/ui";
import { usePagedQuery, useClientPage } from "@/lib/pagination";
import { useTranslation } from "@/contexts/LanguageContext";
import { Search } from "lucide-react";

export default function AuditLogsPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const isSearching = search.trim().length > 0;

  // Default browse: real cursor pagination, indexed by creation time — reads
  // only 15 documents per page, however deep the audit trail grows.
  const paged = usePagedQuery(api.auth.getAuditLogsPaged, isSearching ? "skip" : {});

  // Free-text filter isn't index-backed, so searching falls back to a capped
  // scan (300 most recent) filtered + paginated client-side.
  const scanned = useQuery(api.auth.getAuditLogs, isSearching ? { limit: 300 } : "skip");
  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!isSearching) return [];
    return (scanned ?? []).filter(
      (l) =>
        l.action.toLowerCase().includes(term) ||
        l.username.toLowerCase().includes(term) ||
        (l.details ?? "").toLowerCase().includes(term)
    );
  }, [scanned, term, isSearching]);
  const clientPage = useClientPage(filtered);

  const rows = isSearching ? clientPage.rows : paged.rows;
  const isLoading = isSearching ? scanned === undefined : paged.isLoading;
  const pager = isSearching ? clientPage : paged;

  return (
    <PageLayout title={t("Audit Logs")} subtitle={t("Administration · activity trail")}>
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-64`}
            placeholder={t("Filter action / user / detail")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {isSearching && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
            {t("Searching the last 300 entries")}
          </span>
        )}
      </Toolbar>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title={t("No matching entries")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("When")}</Th>
                <Th>{t("User")}</Th>
                <Th>{t("Action")}</Th>
                <Th>{t("Detail")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
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
        {!isLoading && rows.length > 0 && (
          <Pagination
            pageIndex={pager.pageIndex}
            rowCount={rows.length}
            pageSize={pager.pageSize}
            hasPrev={pager.hasPrev}
            hasNext={pager.hasNext}
            onPrev={pager.goPrev}
            onNext={pager.goNext}
          />
        )}
      </Card>
    </PageLayout>
  );
}
