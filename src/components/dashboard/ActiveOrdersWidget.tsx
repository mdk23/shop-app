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
      <div className="bg-surface border border-outline/30 rounded-2xl p-6 shadow-sm flex flex-col items-center justify-center min-h-[200px]">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/60 mt-3">Loading Active Orders...</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Live Kitchen Queue</h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Pending Stage */}
        <div className="bg-surface border border-outline/30 rounded-2xl p-5 shadow-sm flex flex-col min-h-[220px]">
          <div className="flex justify-between items-center border-b border-outline/30 pb-3 mb-4">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
              <ClipboardList className="w-4 h-4 text-primary" />
              Pending
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
              {grouped.pending.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
            {grouped.pending.length === 0 ? (
              <div className="text-center py-8 text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-wider">
                No orders pending
              </div>
            ) : (
              grouped.pending.map((order) => (
                <div key={order._id} className="bg-surface-container-low border border-outline/30 rounded-xl p-3 flex justify-between items-center shadow-sm">
                  <div>
                    <p className="font-display text-xs text-primary uppercase">
                      {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                    </p>
                    <p className="text-[8px] font-bold text-on-surface-variant uppercase mt-0.5">
                      {order.itemSummary?.length || 0} items
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-on-surface-variant/70 bg-surface border border-outline/30 px-1.5 py-0.5 rounded-lg">
                    Queued
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Preparing Stage */}
        <div className="bg-surface border border-outline/30 rounded-2xl p-5 shadow-sm flex flex-col min-h-[220px]">
          <div className="flex justify-between items-center border-b border-outline/30 pb-3 mb-4">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
              <Play className="w-4 h-4 text-secondary" />
              Preparing
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-secondary/10 text-secondary border border-secondary/20">
              {grouped.preparing.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
            {grouped.preparing.length === 0 ? (
              <div className="text-center py-8 text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-wider">
                No orders in prep
              </div>
            ) : (
              grouped.preparing.map((order) => (
                <div key={order._id} className="bg-surface-container-low border border-outline/30 rounded-xl p-3 flex justify-between items-center shadow-sm">
                  <div>
                    <p className="font-display text-xs text-primary uppercase">
                      {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                    </p>
                    <p className="text-[8px] font-bold text-on-surface-variant uppercase mt-0.5">
                      {order.itemSummary?.length || 0} items
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-secondary bg-secondary/10 border border-secondary/20 px-1.5 py-0.5 rounded-lg animate-pulse">
                    Cooking
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ready Stage */}
        <div className="bg-surface border border-outline/30 rounded-2xl p-5 shadow-sm flex flex-col min-h-[220px]">
          <div className="flex justify-between items-center border-b border-outline/30 pb-3 mb-4">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-primary" />
              Ready
            </span>
            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-primary/10 text-primary border border-primary/20">
              {grouped.ready.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-2 max-h-[160px] pr-1">
            {grouped.ready.length === 0 ? (
              <div className="text-center py-8 text-[9px] text-on-surface-variant/40 font-bold uppercase tracking-wider">
                No orders ready
              </div>
            ) : (
              grouped.ready.map((order) => (
                <div key={order._id} className="bg-surface-container-low border border-outline/30 rounded-xl p-3 flex justify-between items-center shadow-sm">
                  <div>
                    <p className="font-display text-xs text-primary uppercase">
                      {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                    </p>
                    <p className="text-[8px] font-bold text-on-surface-variant uppercase mt-0.5">
                      {order.itemSummary?.length || 0} items
                    </p>
                  </div>
                  <span className="text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-lg">
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
