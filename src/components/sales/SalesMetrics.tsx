"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, TrendingUp } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

export type SalesMetricsData = {
  totalSales: number;
  totalCollected: number;
  count: number;
  deliveryRevenue: number;
  deliveryOrdersCount: number;
  pickupOrdersCount: number;
  averageDeliveryFee: number;
  deliveryRevenuePercentage: number;
};

interface SalesMetricsProps {
  metrics: SalesMetricsData;
}

export function SalesMetrics({ metrics }: SalesMetricsProps) {
  return (
    <div className="space-y-6">
      {/* Top KPI Cards (3 columns grid) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Gross Sales (with Order count at bottom) */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
        >
          <div>
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2 opacity-80 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              Gross Sales
            </p>
            <p className="text-3xl font-display text-on-surface leading-none tracking-tight">
              {formatCurrency(metrics.totalSales)}
            </p>
          </div>
          <div className="mt-4 flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-on-surface bg-surface-container-highest w-fit px-3 py-1.5 rounded-xl border border-outline shadow-hard-sm">
            {metrics.count} Total Orders
          </div>
        </motion.div>

        {/* Net Revenue */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="bg-primary border-2 border-outline p-6 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all text-on-primary"
        >
          <div>
            <p className="text-[10px] font-black text-on-primary/80 uppercase tracking-[0.2em] mb-2">
              Net Revenue
            </p>
            <p className="text-3xl font-display leading-none tracking-tight">
              {formatCurrency(metrics.totalCollected)}
            </p>
          </div>
          <p className="text-[9px] font-bold text-on-primary/70 mt-5 uppercase tracking-wider flex items-center gap-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> ▲ 12% vs previous period
          </p>
        </motion.div>

        {/* Average Order Value */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all"
        >
          <div>
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-2 opacity-80">
              Avg Order Value
            </p>
            <p className="text-3xl font-display text-on-surface leading-none tracking-tight">
              {formatCurrency(metrics.count > 0 ? Math.round(metrics.totalSales / metrics.count) : 0)}
            </p>
          </div>
          <p className="text-[9px] font-bold text-on-surface-variant/60 mt-5 uppercase tracking-wider flex items-center gap-1">
            <TrendingUp className="w-3.5 h-3.5 text-green-500" /> ▲ 8% vs previous period
          </p>
        </motion.div>
      </div>

      {/* Delivery breakdown row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
          <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Total Delivery Revenue</span>
          <p className="text-xl font-display text-primary mt-1">{formatCurrency(metrics.deliveryRevenue)}</p>
        </div>
        <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
          <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Delivery Orders</span>
          <p className="text-xl font-display text-on-surface mt-1">{metrics.deliveryOrdersCount}</p>
        </div>
        <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
          <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Pickup Orders</span>
          <p className="text-xl font-display text-on-surface mt-1">{metrics.pickupOrdersCount}</p>
        </div>
        <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
          <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Avg Delivery Fee</span>
          <p className="text-xl font-display text-on-surface mt-1">{formatCurrency(metrics.averageDeliveryFee)}</p>
        </div>
        <div className="bg-surface border-2 border-outline p-5 rounded-2xl shadow-hard flex flex-col justify-between col-span-2 lg:col-span-1 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
          <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest opacity-80">Delivery Rev %</span>
          <p className="text-xl font-display text-primary mt-1">{metrics.deliveryRevenuePercentage.toFixed(1)}%</p>
        </div>
      </div>
    </div>
  );
}
