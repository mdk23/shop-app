"use client";

import React from "react";
import { Package, AlertTriangle, Trash2, TrendingUp, ArrowUpRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

interface StockKpiCardsProps {
  activeSkuCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  wastageMetrics: any;
  timeFilter: "Today" | "Week" | "Month" | "All";
}

export function StockKpiCards({
  activeSkuCount,
  lowStockCount,
  outOfStockCount,
  wastageMetrics,
  timeFilter,
}: StockKpiCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Active SKUs */}
      <div className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">
            Active SKU Count
          </p>
          <h3 className="text-3xl font-black text-on-surface tracking-tighter">{activeSkuCount}</h3>
          <span className="text-[9px] text-green-600 font-bold flex items-center gap-1 mt-1">
            <ArrowUpRight className="w-3.5 h-3.5" /> Checked & active in recipe-book
          </span>
        </div>
        <div className="w-12 h-12 rounded-xl bg-surface-container border border-outline flex items-center justify-center text-on-surface-variant">
          <Package className="w-6 h-6" />
        </div>
      </div>

      {/* Low Stock Alerts */}
      <div className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">
            Low Stock Alerts
          </p>
          <h3 className="text-3xl font-black text-error tracking-tighter text-red-600">
            {lowStockCount + outOfStockCount}
          </h3>
          <span className="text-[9px] text-red-600 font-bold flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3.5 h-3.5" /> {outOfStockCount} items completely depleted
          </span>
        </div>
        <div className="w-12 h-12 rounded-xl bg-red-100 border border-red-300 flex items-center justify-center text-red-600">
          <AlertTriangle className="w-6 h-6" />
        </div>
      </div>

      {/* Wastage Logged */}
      <div className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">
            Wastage (Selected Period)
          </p>
          <h3 className="text-3xl font-black text-on-surface tracking-tighter">
            {timeFilter === "Today"
              ? `${wastageMetrics?.totalTodayQty.toFixed(1) || 0} units`
              : timeFilter === "Week"
                ? `${wastageMetrics?.totalWeekQty.toFixed(1) || 0} units`
                : `${wastageMetrics?.totalMonthQty.toFixed(1) || 0} units`}
          </h3>
          <span className="text-[9px] text-on-surface-variant opacity-60 font-bold flex items-center gap-1 mt-1">
            From kitchen losses & spoiled food items
          </span>
        </div>
        <div className="w-12 h-12 rounded-xl bg-surface-container border border-outline flex items-center justify-center text-on-surface-variant">
          <Trash2 className="w-6 h-6" />
        </div>
      </div>

      {/* Waste % */}
      <div className="bg-surface border-2 border-outline p-6 rounded-2xl shadow-hard flex items-center justify-between">
        <div>
          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider mb-1">
            Waste Share %
          </p>
          <h3 className="text-3xl font-black text-on-surface tracking-tighter">
            {wastageMetrics?.wastePercentage.toFixed(1) || 0}%
          </h3>
          <span className="text-[9px] text-green-600 font-bold flex items-center gap-1 mt-1">
            Relative to total stock consumption
          </span>
        </div>
        <div className="w-12 h-12 rounded-xl bg-surface-container border border-outline flex items-center justify-center text-on-surface-variant">
          <TrendingUp className="w-6 h-6" />
        </div>
      </div>
    </div>
  );
}
