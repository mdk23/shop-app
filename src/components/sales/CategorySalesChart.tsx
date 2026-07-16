"use client";

import { Package } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";

type CategorySaleItem = {
  name: string;
  value: number;
};

interface CategorySalesChartProps {
  categorySales: CategorySaleItem[];
}

export function CategorySalesChart({ categorySales }: CategorySalesChartProps) {
  return (
    <div className="flex-1 flex flex-col bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-4">
      <div>
        <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Package className="w-5 h-5 text-primary" />
          Dishes Sold by Category
        </h3>
        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
          Itemized quantities grouped by menu category (Chicken, Combos, Pizza, Sides, etc.)
        </p>
      </div>

      {categorySales.length === 0 ? (
        <div className="flex-1 min-h-[300px] flex items-center justify-center border border-dashed border-outline rounded-2xl bg-surface-container-high/20 text-on-surface-variant/40 font-black uppercase text-[10px] tracking-wider">
          No sales category metrics available
        </div>
      ) : (
        <div className="flex-1 relative min-h-[300px] w-full">
          <div className="absolute inset-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={categorySales} layout="vertical" margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <XAxis type="number" hide />
                <YAxis
                  dataKey="name"
                  type="category"
                  width={90}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "currentColor", fontSize: 9, fontWeight: 900 }}
                />
                <Tooltip
                  cursor={{ fill: "var(--color-surface-container-highest)", opacity: 0.4 }}
                  contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                />
                <Bar dataKey="value" fill="var(--color-primary)" radius={[0, 8, 8, 0]} name="Units Sold" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
