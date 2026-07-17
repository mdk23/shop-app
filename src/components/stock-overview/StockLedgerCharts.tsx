"use client";

import React from "react";
import { Activity, Trash2 } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface StockLedgerChartsProps {
  wastageMetrics: any;
  formatType: (type: string) => string;
}

export function StockLedgerCharts({
  wastageMetrics,
  formatType,
}: StockLedgerChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Movement Breakdown Chart */}
      <div className="lg:col-span-2 bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft flex flex-col justify-between">
        <div>
          <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            Ledger Movements Breakdown
          </h3>
          <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mb-6">
            Relative quantities consumed/received during this period
          </p>
        </div>
        <div className="h-[250px] w-full">
          {wastageMetrics?.breakdownChartData &&
          wastageMetrics.breakdownChartData.some((c: any) => c.value > 0) ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={wastageMetrics.breakdownChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  stroke="var(--color-on-surface-variant)"
                  fontSize={9}
                  fontWeight={800}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => formatType(v)}
                />
                <YAxis stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-surface-container-highest)",
                    border: "2px solid var(--color-outline)",
                    borderRadius: "12px",
                    fontSize: "11px",
                    fontWeight: "bold",
                  }}
                />
                <Bar dataKey="value" fill="var(--color-primary)" radius={[6, 6, 0, 0]} name="Volume Impact" />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center border border-dashed border-outline rounded-2xl bg-surface-container-high/20 text-on-surface-variant/40 font-black uppercase text-[10px] tracking-wider">
              No movement logs recorded
            </div>
          )}
        </div>
      </div>

      {/* Top Wasted Items Widget */}
      <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft flex flex-col justify-between">
        <div>
          <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] mb-2 flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-error" />
            Top Wasted Items
          </h3>
          <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mb-4">
            Highest quantity waste categories
          </p>
        </div>
        <div className="flex-1 overflow-auto max-h-[250px] space-y-2">
          {wastageMetrics?.topWasted && wastageMetrics.topWasted.length > 0 ? (
            <table className="w-full text-left text-[11px] font-bold">
              <thead>
                <tr className="border-b border-outline-variant text-[9px] uppercase tracking-wider text-on-surface-variant">
                  <th className="pb-2">Item</th>
                  <th className="pb-2 text-right">Qty</th>
                  <th className="pb-2 text-right">Occurrences</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/20">
                {wastageMetrics.topWasted.map((item: any, idx: number) => (
                  <tr key={idx} className="hover:bg-surface-container-high/20">
                    <td className="py-2.5 truncate max-w-[120px] uppercase font-black">{item.name}</td>
                    <td className="py-2.5 text-right font-display text-primary">{item.quantity} {item.unit}</td>
                    <td className="py-2.5 text-right opacity-60">{item.occurrences} logs</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="h-full flex items-center justify-center text-on-surface-variant/40 font-black uppercase text-[10px] tracking-wider py-12">
              No wastage logged
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
