"use client";

import React from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Play, ClipboardList, CheckCircle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

export function ActiveOrdersWidget() {
  const activeOrders = useQuery(api.orders.listActiveOrders);

  const grouped = React.useMemo(() => {
    const list = activeOrders || [];
    return {
      pending: list.filter((o) => o.prepStatus === "pending" || !o.prepStatus),
      preparing: list.filter((o) => o.prepStatus === "preparing"),
      ready: list.filter((o) => o.prepStatus === "ready"),
    };
  }, [activeOrders]);

  if (activeOrders === undefined) {
    return (
      <div className="bg-surface border-2 border-outline rounded-2xl p-6 shadow-hard flex flex-col items-center justify-center min-h-[200px]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <p className="text-[10px] font-black uppercase tracking-wider text-on-surface-variant/60 mt-3">Loading Active Orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Live Kitchen Queue</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pending Stage */}
        <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard flex flex-col min-h-[220px]">
          <div className="flex justify-between items-center border-b border-outline pb-3 mb-4">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-orange-500" />
              Pending
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-orange-500/10 text-orange-600 border border-orange-500/20">
              {grouped.pending.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
            {grouped.pending.length === 0 ? (
              <div className="text-center py-8 text-[9px] text-on-surface-variant/40 font-black uppercase tracking-wider">
                No orders pending
              </div>
            ) : (
              grouped.pending.map((order) => (
                <div key={order._id} className="bg-surface-container-low border border-outline/50 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="font-display text-xs text-primary uppercase">
                      {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                    </p>
                    <p className="text-[8px] font-bold text-on-surface-variant uppercase mt-0.5">
                      {order.itemSummary?.length || 0} items
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-on-surface-variant/60 bg-surface border border-outline px-1.5 py-0.5 rounded">
                    Queued
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Preparing Stage */}
        <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard flex flex-col min-h-[220px]">
          <div className="flex justify-between items-center border-b border-outline pb-3 mb-4">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
              <Play className="w-4 h-4 text-blue-500" />
              Preparing
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-blue-500/10 text-blue-600 border border-blue-500/20">
              {grouped.preparing.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
            {grouped.preparing.length === 0 ? (
              <div className="text-center py-8 text-[9px] text-on-surface-variant/40 font-black uppercase tracking-wider">
                No orders in prep
              </div>
            ) : (
              grouped.preparing.map((order) => (
                <div key={order._id} className="bg-surface-container-low border border-outline/50 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="font-display text-xs text-primary uppercase">
                      {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                    </p>
                    <p className="text-[8px] font-bold text-on-surface-variant uppercase mt-0.5">
                      {order.itemSummary?.length || 0} items
                    </p>
                  </div>
                  <span className="text-[9px] font-black text-blue-600 bg-blue-500/10 border border-blue-500/20 px-1.5 py-0.5 rounded animate-pulse">
                    Cooking
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ready Stage */}
        <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard flex flex-col min-h-[220px]">
          <div className="flex justify-between items-center border-b border-outline pb-3 mb-4">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-green-500" />
              Ready
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-black bg-green-500/10 text-green-600 border border-green-500/20">
              {grouped.ready.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
            {grouped.ready.length === 0 ? (
              <div className="text-center py-8 text-[9px] text-on-surface-variant/40 font-black uppercase tracking-wider">
                No orders ready
              </div>
            ) : (
              grouped.ready.map((order) => (
                <div key={order._id} className="bg-surface-container-low border border-outline/50 rounded-xl p-3 flex justify-between items-center">
                  <div>
                    <p className="font-display text-xs text-primary uppercase">
                      {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                    </p>
                    <p className="text-[8px] font-bold text-on-surface-variant uppercase mt-0.5">
                      {order.itemSummary?.length || 0} items
                    </p>
                  </div>
                  <span className="text-[9px] font-black text-green-600 bg-green-500/10 border border-green-500/20 px-1.5 py-0.5 rounded">
                    Collect
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
