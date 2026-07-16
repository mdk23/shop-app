"use client";

import { CreditCard } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { formatCurrency } from "@/lib/utils";

const COLORS = ["#FF6B35", "#4ECDC4", "#FFD93D", "#6B5B95", "#88D8B0", "#FFCC5C"];

type PaymentSplitItem = {
  name: string;
  value: number;
};

interface PaymentSplitChartProps {
  paymentData: PaymentSplitItem[];
}

export function PaymentSplitChart({ paymentData }: PaymentSplitChartProps) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-4">
      <div>
        <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-primary" />
          Payment Methods Split
        </h3>
        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
          Share of collection channel
        </p>
      </div>

      {paymentData.length === 0 ? (
        <div className="h-[180px] flex items-center justify-center text-on-surface-variant/35 text-[10px] font-black uppercase tracking-wider">
          No payment data
        </div>
      ) : (
        <div className="h-[180px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={paymentData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={75}
                paddingAngle={4}
                dataKey="value"
              >
                {paymentData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ backgroundColor: "var(--color-surface-container-highest)", border: "2px solid var(--color-outline)", borderRadius: "12px", fontSize: "11px", fontWeight: "bold" }}
                formatter={(value: any) => [formatCurrency(value), "Collected"]}
              />
              <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: "9px", fontWeight: "bold" }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
