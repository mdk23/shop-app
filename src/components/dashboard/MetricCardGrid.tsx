"use client";

import React from "react";
import { Coins, Truck } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

interface MetricCardGridProps {
  orders: any[] | undefined;
  metrics: any;
}

export function MetricCardGrid({ orders, metrics }: MetricCardGridProps) {
  return (
    <div className="space-y-3 flex flex-col h-full">
      <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Summary</h3>
      <div className="flex flex-col gap-4 flex-1">
        {/* Gross Revenue - Main Card */}
        <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity pointer-events-none">
            <Coins className="w-32 h-32" />
          </div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] opacity-80 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Gross Revenue
            </span>
            <span className={cn(
              "text-[9px] font-black uppercase tracking-wider px-2 py-1 rounded border shadow-hard-sm",
              metrics.revenueGrowth >= 0
                ? "bg-green-500/10 text-green-600 border-green-500/20"
                : "bg-red-500/10 text-red-600 border-red-500/20"
            )}>
              {metrics.revenueGrowth >= 0 ? `▲ +${metrics.revenueGrowth.toFixed(1)}%` : `▼ ${metrics.revenueGrowth.toFixed(1)}%`}
            </span>
          </div>
          <p className="text-3xl font-display text-on-surface tracking-tight leading-none mb-4">
            {orders === undefined ? "---" : formatCurrency(metrics.grossRevenue)}
          </p>
          <div className="flex items-center justify-between border-t border-outline-variant/30 pt-3 text-[10px] font-black uppercase tracking-wider text-on-surface-variant/70">
            <span>Orders: <strong className="text-on-surface">{metrics.orderCount}</strong></span>
            <span>vs Previous Period</span>
          </div>
        </div>

        {/* Sub-cards Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1">
          {/* Cash Collected */}
          <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
                Collected
              </span>
            </div>
            <p className="text-xl font-display text-on-surface tracking-tight leading-none mb-3">
              {orders === undefined ? "---" : formatCurrency(metrics.cashCollected)}
            </p>
            <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider">
              <span className="text-primary bg-primary/10 px-1.5 py-0.5 rounded">{metrics.collectedPercentage.toFixed(1)}% of Rev</span>
              <span className="text-on-surface-variant">{metrics.paymentCount} pmts</span>
            </div>
          </div>

          {/* Accounts Receivable */}
          <div className="bg-surface border-2 border-outline rounded-2xl p-4 shadow-hard flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-error" />
                Receivable
              </span>
            </div>
            <p className={cn("text-xl font-display tracking-tight leading-none mb-3", metrics.outstandingDebt > 0 ? "text-error" : "text-on-surface")}>
              {orders === undefined ? "---" : formatCurrency(metrics.outstandingDebt)}
            </p>
            <div className="flex items-center justify-between text-[8px] font-black uppercase tracking-wider">
              {metrics.debtOrderCount > 0 ? (
                <span className="text-error bg-error/10 px-1.5 py-0.5 rounded">{metrics.debtOrderCount} Pending</span>
              ) : (
                <span className="text-on-surface-variant">0 Pending</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
