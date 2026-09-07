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
} from "@/components/ui";
import { useCurrency, useResolvedBranch } from "@/lib/useShop";
import { cn } from "@/lib/utils";
import { Download } from "lucide-react";

const TABS = [
  "Category",
  "Brand",
  "Size",
  "Color",
  "Product",
  "Payment methods",
  "Customer debt",
  "Inventory",
] as const;

export default function ReportsPage() {
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
        case "Brand":
          return breakdown.byBrand;
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
    <PageLayout title="Reports" subtitle="Analytics across sales, stock & customers">
      <Toolbar>
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-36">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </Select>
        <div className="ml-auto" />
        {tab !== "Inventory" && (
          <Button variant="secondary" onClick={exportCsv} disabled={rows.length === 0}>
            <Download className="w-3.5 h-3.5" /> CSV
          </Button>
        )}
      </Toolbar>

      {metrics && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Revenue" value={fmt(metrics.grossRevenue)} />
          <StatCard label="Gross profit" value={fmt(metrics.grossProfit)} />
          <StatCard label="Items sold" value={metrics.itemsSold} />
          <StatCard label="Returns" value={metrics.returnsCount} sub={fmt(metrics.refundAmount)} />
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
              tab === t
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-outline"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <Card>
        {tab === "Inventory" ? (
          !valuation ? (
            <Spinner />
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 p-4">
              <StatCard label="Units on hand" value={valuation.units} />
              <StatCard label="Value at cost" value={fmt(valuation.costValue)} />
              <StatCard label="Value at retail" value={fmt(valuation.retailValue)} />
              <StatCard label="Low stock" value={valuation.lowStockCount} accent="primary" />
              <StatCard label="Out of stock" value={valuation.outOfStockCount} accent="error" />
            </div>
          )
        ) : breakdown === undefined && tab !== "Payment methods" && tab !== "Customer debt" ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No data for this report" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{tab === "Customer debt" ? "Customer" : "Name"}</Th>
                <Th className="text-right">
                  {tab === "Payment methods"
                    ? "Count"
                    : tab === "Customer debt"
                      ? "Open sales"
                      : "Units"}
                </Th>
                <Th className="text-right">
                  {tab === "Customer debt" ? "Balance" : "Revenue"}
                </Th>
                {tab === "Product" && <Th className="text-right">Profit</Th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
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
      </Card>
    </PageLayout>
  );
}
