"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Table,
  Th,
  Td,
  EmptyState,
  Pagination,
  Spinner,
  Toolbar,
  inputClass,
} from "@/components/ui";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useCurrency } from "@/lib/useShop";
import { useClientPage } from "@/lib/pagination";
import { useTranslation } from "@/contexts/LanguageContext";
import { Search, Printer } from "lucide-react";

export default function ReceiptsPage() {
  const fmt = useCurrency();
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<Id<"sales"> | null>(null);
  const sales = useQuery(api.sales.listRecent, { limit: 100 });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (sales ?? []).filter(
      (s) =>
        !t ||
        s.saleNumber.toLowerCase().includes(t) ||
        (s.customerName ?? "").toLowerCase().includes(t)
    );
  }, [sales, search]);
  const page = useClientPage(filtered);

  return (
    <PageLayout title={t("Receipts")} subtitle={t("Settings · reprint sale receipts")}>
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-64`}
            placeholder={t("Sale # or customer")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Toolbar>

      <Card>
        {sales === undefined ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title={t("No sales")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Sale")}</Th>
                <Th>{t("Date")}</Th>
                <Th>{t("Customer")}</Th>
                <Th className="text-right">{t("Total")}</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((s) => (
                <tr key={s._id} className="hover:bg-surface-container-low">
                  <Td className="font-mono text-[11px] font-bold">{s.saleNumber}</Td>
                  <Td className="text-xs text-on-surface-variant">
                    {new Date(s.createdAt).toLocaleString()}
                  </Td>
                  <Td>{s.customerName ?? t("Walk-in")}</Td>
                  <Td className="text-right font-bold">{fmt(s.total)}</Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(s._id)}>
                      <Printer className="w-3.5 h-3.5" /> {t("Print")}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {filtered.length > 0 && (
          <Pagination
            pageIndex={page.pageIndex}
            rowCount={page.rows.length}
            pageSize={page.pageSize}
            hasPrev={page.hasPrev}
            hasNext={page.hasNext}
            onPrev={page.goPrev}
            onNext={page.goNext}
          />
        )}
      </Card>

      {openId && <ReceiptModal saleId={openId} onClose={() => setOpenId(null)} />}
    </PageLayout>
  );
}
