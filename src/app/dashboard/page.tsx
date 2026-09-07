"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageLayout } from "@/components/PageLayout";
import { Card, StatCard, Spinner, Badge, Table, Th, Td } from "@/components/ui";
import { useCurrency, useResolvedBranch } from "@/lib/useShop";
import { cn } from "@/lib/utils";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7", label: "7 days" },
  { key: "30", label: "30 days" },
];

export default function DashboardPage() {
  const fmt = useCurrency();
  const { branchId, isAll } = useResolvedBranch();
  const [range, setRange] = useState("7");

  const { start, end } = useMemo(() => {
    const now = Date.now();
    if (range === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return { start: d.getTime(), end: now };
    }
    return { start: now - Number(range) * 86400000, end: now };
  }, [range]);

  const branchArg = isAll ? undefined : branchId;
  const metrics = useQuery(api.analytics.getDashboardMetrics, {
    start,
    end,
    branchId: branchArg,
  });
  const today = useQuery(api.analytics.todaySnapshot, {});
  const trend = useQuery(api.analytics.salesTrend, {
    start,
    end,
    branchId: branchArg,
  });
  const lowStock = useQuery(api.stock.lowStockSummary, {
    branchId: branchArg,
  });

  return (
    <PageLayout title="Dashboard" subtitle="Retail overview">
      <div className="flex gap-1.5 mb-4">
        {RANGES.map((r) => (
          <button
            key={r.key}
            onClick={() => setRange(r.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
              range === r.key
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-outline"
            )}
          >
            {r.label}
          </button>
        ))}
      </div>

      {today && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Today revenue" value={fmt(today.revenue)} />
          <StatCard label="Today sales" value={today.salesCount} />
          <StatCard label="Today items" value={today.itemsSold} />
          <StatCard
            label="Today returns"
            value={today.returnsCount}
            sub={fmt(today.refundAmount)}
            accent={today.returnsCount > 0 ? "error" : "primary"}
          />
        </div>
      )}

      {metrics === undefined ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard
              label={`Revenue · ${range === "today" ? "today" : `${range}d`}`}
              value={fmt(metrics.grossRevenue)}
              sub={`${metrics.revenueGrowth >= 0 ? "+" : ""}${metrics.revenueGrowth.toFixed(0)}% vs prev`}
              accent={metrics.revenueGrowth >= 0 ? "success" : "error"}
            />
            <StatCard label="Gross profit" value={fmt(metrics.grossProfit)} sub={`${metrics.marginPercent.toFixed(0)}% margin`} />
            <StatCard
              label="Outstanding debt"
              value={fmt(metrics.outstandingDebt)}
              accent={metrics.outstandingDebt > 0 ? "error" : "primary"}
            />
            <StatCard label="Discounts given" value={fmt(metrics.discountTotal)} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            <Card className="p-4 lg:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
                Sales trend
              </p>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trend ?? []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--outline)" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={40} />
                    <Tooltip
                      formatter={(value) => fmt(Number(value))}
                      contentStyle={{ fontSize: 12, borderRadius: 8 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="revenue"
                      stroke="var(--primary)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </Card>

            <Card className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
                Payment methods
              </p>
              <div className="space-y-2">
                {Object.entries(metrics.paymentMethodsBreakdown).map(([m, info]) => (
                  <div key={m} className="flex justify-between text-xs">
                    <span className="font-bold">{m}</span>
                    <span>
                      {fmt(info.amount)}{" "}
                      <span className="text-on-surface-variant">({info.count})</span>
                    </span>
                  </div>
                ))}
                {Object.keys(metrics.paymentMethodsBreakdown).length === 0 && (
                  <p className="text-xs text-on-surface-variant">No payments in range.</p>
                )}
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <TopList title="Top products" rows={metrics.topProducts} />
            <TopList title="Top categories" rows={metrics.topCategories} />
            <TopList title="Top brands" rows={metrics.topBrands} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
            <Card className="p-0">
              <div className="px-4 py-3 border-b border-outline/40 flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                  Low / out of stock
                </p>
                {lowStock && (
                  <div className="flex gap-1.5">
                    <Badge tone="warning">{lowStock.lowStockCount} low</Badge>
                    <Badge tone="error">{lowStock.outOfStockCount} out</Badge>
                  </div>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto">
                {!lowStock ? (
                  <Spinner />
                ) : lowStock.items.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-on-surface-variant">
                    Everything is well stocked.
                  </p>
                ) : (
                  <Table>
                    <tbody>
                      {lowStock.items.map((i) => (
                        <tr key={i.productVariantId}>
                          <Td className="text-xs">{i.label}</Td>
                          <Td className="text-right text-xs">
                            {i.quantity} / {i.reorderLevel}
                          </Td>
                          <Td className="w-20">
                            <Badge tone={i.status === "OUT_OF_STOCK" ? "error" : "warning"}>
                              {i.status === "OUT_OF_STOCK" ? "out" : "low"}
                            </Badge>
                          </Td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                )}
              </div>
            </Card>

            {isAll && metrics.branchLeaderboard.length > 0 && (
              <Card className="p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
                  Best performing branches
                </p>
                <div className="space-y-2">
                  {metrics.branchLeaderboard.map((b) => (
                    <div key={b.name} className="flex justify-between text-xs">
                      <span className="font-bold">{b.name}</span>
                      <span>
                        {fmt(b.revenue)}{" "}
                        <span className="text-on-surface-variant">({b.sales})</span>
                      </span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        </>
      )}
    </PageLayout>
  );
}

function TopList({
  title,
  rows,
}: {
  title: string;
  rows: { name: string; qty: number }[];
}) {
  return (
    <Card className="p-4">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
        {title}
      </p>
      <div className="space-y-1.5">
        {rows.length === 0 && (
          <p className="text-xs text-on-surface-variant">No data.</p>
        )}
        {rows.map((r, i) => (
          <div key={r.name} className="flex justify-between text-xs">
            <span className="truncate">
              <span className="text-on-surface-variant mr-1.5">{i + 1}.</span>
              {r.name}
            </span>
            <span className="font-bold">{r.qty}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
