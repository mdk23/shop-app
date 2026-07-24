"use client";

import React from "react";
import { Receipt, Package } from "lucide-react";

interface ProductSalesPerformanceProps {
  metrics: any;
}

export function ProductSalesPerformance({ metrics }: ProductSalesPerformanceProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Top Selling Products */}
      <div className="bg-surface border border-outline/30 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80 flex items-center gap-2">
            <Receipt className="w-4 h-4 text-primary" />
            Top Selling Products
          </h3>
          <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-1">
            Top performing dishes in this selected range
          </p>
        </div>

        <div className="space-y-4">
          {(!metrics.topProducts || metrics.topProducts.length === 0) ? (
            <div className="text-center py-12 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider">
              No sales recorded in this range
            </div>
          ) : (
            metrics.topProducts.map((p: any, index: number) => (
              <div key={index} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-on-surface truncate max-w-[200px] uppercase text-[10px] tracking-wide">
                    {p.name}
                  </span>
                  <span className="font-black text-primary text-[10px]">{p.qty} units ({p.percentage.toFixed(1)}%)</span>
                </div>
                <div className="w-full bg-surface-container-high h-3 rounded-full overflow-hidden border border-outline shadow-hard-sm-sm">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${p.percentage}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Category Performance */}
      <div className="bg-surface border border-outline/30 rounded-2xl p-6 shadow-sm space-y-4">
        <div>
          <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80 flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Category Performance
          </h3>
          <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-1">
            Item units sold grouped by menu category
          </p>
        </div>

        <div className="space-y-4">
          {(!metrics.categoryData || metrics.categoryData.length === 0) ? (
            <div className="text-center py-12 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider">
              No category data available
            </div>
          ) : (
            metrics.categoryData.slice(0, 5).map((cat: any, index: number) => {
              const maxVal = Math.max(...metrics.categoryData.map((c: any) => c.value), 1);
              const pct = (cat.value / maxVal) * 100;
              return (
                <div key={index} className="space-y-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-on-surface uppercase text-[10px] tracking-wide">
                      {cat.name}
                    </span>
                    <span className="font-black text-primary text-[10px]">{cat.value} units</span>
                  </div>
                  <div className="w-full bg-surface-container-high h-3 rounded-full overflow-hidden border border-outline shadow-hard-sm-sm">
                    <div
                      className="bg-secondary h-full rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
