"use client";

import React from "react";
import { formatCurrency } from "@/lib/utils";

interface PaymentCollectionsWidgetProps {
  metrics: any;
  getMethodIcon: (method: string) => React.ReactNode;
}

export function PaymentCollectionsWidget({
  metrics,
  getMethodIcon,
}: PaymentCollectionsWidgetProps) {
  return (
    <div className="space-y-3 flex flex-col h-full">
      <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Payment Collections</h3>
      <div className="bg-surface border border-outline/30 rounded-2xl shadow-sm p-4 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(metrics.paymentMethodsBreakdown || {})
            .filter(([method]) => method.toLowerCase() !== "store credit" && method.toLowerCase() !== "credit")
            .map(([method, data]: [string, any]) => {
              const totalAmt = Object.values(metrics.paymentMethodsBreakdown || {}).reduce(
                (sum: number, item: any) => sum + item.amount,
                0
              );
              const percentage = totalAmt > 0 ? (data.amount / totalAmt) * 100 : 0;
              return (
                <div
                  key={method}
                  className="bg-surface-container-low border border-outline/50 rounded-xl p-3 flex items-center gap-3 hover:bg-surface-container-high transition-all duration-200"
                >
                  <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
                    {getMethodIcon(method)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-center mb-0.5">
                      <span className="font-black uppercase text-[9px] tracking-wider text-on-surface-variant truncate">
                        {method}
                      </span>
                      <span className="text-[8px] font-black text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                        {percentage.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline">
                      <span className="font-display text-sm text-on-surface leading-none">
                        {formatCurrency(data.amount)}
                      </span>
                      <span className="text-[8px] font-bold text-on-surface-variant/60 uppercase ml-1 flex-shrink-0">
                        {data.count} tx
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}
