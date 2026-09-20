"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Select,
  Table,
  Th,
  Td,
  Spinner,
  Toolbar,
  StatCard,
  EmptyState,
  Pagination,
} from "@/components/ui";
import { useCurrency, useResolvedBranch } from "@/lib/useShop";
import { useClientPage } from "@/lib/pagination";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

const TABS = [
  "Category",
  "Size",
  "Color",
  "Product",
  "Payment methods",
  "Customer debt",
  "Inventory",
] as const;

export default function ReportsPage() {
  const { t } = useTranslation();
  const fmt = useCurrency();
  const { branchId, isAll } = useResolvedBranch();
  const [range, setRange] = useState("30");
  const [tab, setTab] = useState<(typeof TABS)[number]>("Category");

  const { start, end } = useMemo(() => {
    const now = Date.now();
    return { start: now - Number(range) * 86400000, end: now };
  }, [range]);

  const branchArg = isAll ? "all" : branchId;
  const breakdown = useQuery(api.analytics.salesBreakdown, {
    start,
    end,
    branchId: branchArg,
  });
  const metrics = useQuery(api.analytics.getDashboardMetrics, {
    start,
    end,
    branchId: isAll ? undefined : branchId,
  });
  const debt = useQuery(api.analytics.customerDebt, { branchId: branchArg });
  const valuation = useQuery(api.analytics.inventoryValuation, {
    branchId: isAll ? undefined : branchId,
  });

  const rows: { name: string; qty?: number; revenue?: number; profit?: number; extra?: string }[] =
    useMemo(() => {
      if (!breakdown) return [];
      switch (tab) {
        case "Category":
          return breakdown.byCategory;
        case "Size":
          return breakdown.bySize;
        case "Color":
          return breakdown.byColor;
        case "Product":
          return breakdown.byProduct;
        case "Payment methods":
          return Object.entries(metrics?.paymentMethodsBreakdown ?? {}).map(
            ([name, v]) => ({ name, qty: v.count, revenue: v.amount })
          );
        case "Customer debt":
          return (debt ?? []).map((d) => ({
            name: d.name,
            qty: d.sales,
            revenue: d.balance,
          }));
        default:
          return [];
      }
    }, [breakdown, metrics, debt, tab]);

  const page = useClientPage(rows);

  const exportCsv = () => {
    const header = "name,qty,revenue,profit";
    const body = rows
      .map((r) => [r.name, r.qty ?? "", r.revenue ?? "", r.profit ?? ""].join(","))
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `report-${tab.toLowerCase().replace(/ /g, "-")}.csv`;
    a.click();
  };

  return (
    <PageLayout title={t("Reports")} subtitle={t("Analytics across sales, stock & customers")}>
      <Toolbar>
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-36">
          <option value="7">{t("Last 7 days")}</option>
          <option value="30">{t("Last 30 days")}</option>
          <option value="90">{t("Last 90 days")}</option>
          <option value="365">{t("Last year")}</option>
        </Select>
        <div className="ml-auto" />
        {tab !== "Inventory" && (
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="w-3.5 h-3.5" /> {t("CSV")}
          </Button>
        )}
      </Toolbar>

      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label={t("Revenue")} value={fmt(metrics.grossRevenue)} />
          <StatCard label={t("Gross profit")} value={fmt(metrics.grossProfit)} />
          <StatCard label={t("Items sold")} value={metrics.itemsSold} />
          <StatCard label={t("Returns")} value={metrics.returnsCount} sub={fmt(metrics.refundAmount)} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((tabName) => (
          <button
            key={tabName}
            onClick={() => setTab(tabName)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
              tab === tabName
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-outline"
            )}
          >
            {t(tabName)}
          </button>
        ))}
      </div>

      <Card>
        {tab === "Inventory" ? (
          !valuation ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4">
              <StatCard label={t("Units on hand")} value={valuation.units} />
              <StatCard label={t("Value at cost")} value={fmt(valuation.costValue)} />
              <StatCard label={t("Value at retail")} value={fmt(valuation.retailValue)} />
              <StatCard label={t("Low stock")} value={valuation.lowStockCount} accent="primary" />
              <StatCard label={t("Out of stock")} value={valuation.outOfStockCount} accent="error" />
            </div>
          )
        ) : breakdown === undefined && tab !== "Payment methods" && tab !== "Customer debt" ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title={t("No data for this report")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tab === "Customer debt" ? t("Customer") : t("Name")}</Th>
                <Th className="text-right">
                  {tab === "Payment methods"
                    ? t("Count")
                    : tab === "Customer debt"
                      ? t("Open sales")
                      : t("Units")}
                </Th>
                <Th className="text-right">
                  {tab === "Customer debt" ? t("Balance") : t("Revenue")}
                </Th>
                {tab === "Product" && <Th className="text-right">{t("Profit")}</Th>}
              </tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r.name} className="hover:bg-surface-container-low">
                  <Td className="font-bold">{r.name}</Td>
                  <Td className="text-right">{r.qty ?? "—"}</Td>
                  <Td className="text-right font-bold">
                    {r.revenue !== undefined ? fmt(r.revenue) : "—"}
                  </Td>
                  {tab === "Product" && (
                    <Td className="text-right">
                      {r.profit !== undefined ? fmt(r.profit) : "—"}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {tab !== "Inventory" && rows.length > 0 && (
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
    </PageLayout>
  );
}
