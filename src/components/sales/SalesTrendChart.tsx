"use client";

import { TrendingUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type TrendItem = {
  label: string;
  Revenue: number;
  Orders: number;
  AOV: number;
};

interface SalesTrendChartProps {
  trendData: TrendItem[];
  chartMode: "revenue" | "orders" | "aov";
  setChartMode: (mode: "revenue" | "orders" | "aov") => void;
}

export function SalesTrendChart({
  trendData,
  chartMode,
  setChartMode,
}: SalesTrendChartProps) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-primary" />
            Sales Trend Analysis
          </h3>
          <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
            Real-time transaction volume & collections
          </p>
        </div>
        {/* Chart Toggle Buttons */}
        <div className="flex items-center bg-surface border border-outline-variant/60 rounded-xl p-1 gap-1">
          {(["revenue", "orders", "aov"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setChartMode(mode)}
              className={cn(
                "px-3 py-1.5 text-[9px] font-black uppercase tracking-wider rounded-lg transition-all",
                chartMode === mode
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-primary"
              )}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      {trendData.length === 0 ? (
        <div className="h-[300px] flex items-center justify-center border border-dashed border-outline rounded-2xl bg-surface-container-high/20 text-on-surface-variant/40 font-black uppercase text-[10px] tracking-wider">
          No data to plot in this range
        </div>
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            {chartMode === "revenue" ? (
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--color-primary)" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="var(--color-primary)" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-outline-variant)" opacity={0.3} />
                <XAxis dataKey="label" stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                  formatter={(value: any) => [formatCurrency(value), "Gross Sales"]}
                />
                <Area type="monotone" dataKey="Revenue" stroke="var(--color-primary)" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            ) : chartMode === "orders" ? (
              <BarChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-outline-variant)" opacity={0.3} />
                <XAxis dataKey="label" stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                  formatter={(value: any) => [value, "Orders Count"]}
                />
                <Bar dataKey="Orders" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            ) : (
              <LineChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-outline-variant)" opacity={0.3} />
                <XAxis dataKey="label" stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--color-on-surface-variant)" fontSize={9} fontWeight={800} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                  formatter={(value: any) => [formatCurrency(value), "Avg Order Value"]}
                />
                <Line type="monotone" dataKey="AOV" stroke="var(--color-primary)" strokeWidth={3} dot={{ stroke: "var(--color-primary)", strokeWidth: 2, r: 4 }} />
              </LineChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
