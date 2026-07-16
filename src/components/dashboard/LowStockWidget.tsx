"use client";

import React from "react";
import { ShieldAlert, CheckCircle, XCircle, AlertTriangle } from "lucide-react";

interface LowStockWidgetProps {
  stockAlerts: {
    lowStock: any[];
    outOfStock: any[];
  };
}

export function LowStockWidget({ stockAlerts }: LowStockWidgetProps) {
  const hasNoAlerts = stockAlerts.lowStock.length === 0 && stockAlerts.outOfStock.length === 0;

  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em] opacity-80">Attention Required</h3>
      <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard max-h-[320px] flex flex-col">
        <div className="flex items-center gap-2 border-b border-outline pb-3 mb-4 flex-shrink-0">
          <ShieldAlert className="w-5 h-5 text-error" />
          <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60">
            Stock items requiring immediate attention
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {hasNoAlerts ? (
            <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/20 rounded-xl text-green-600 font-bold uppercase text-[10px] tracking-wider h-full">
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-green-500" />
              All stock levels are healthy. No low or out-of-stock items detected.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {/* Out of Stock */}
              {stockAlerts.outOfStock.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-red-600 uppercase tracking-widest flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" />
                    Out of Stock ({stockAlerts.outOfStock.length})
                  </p>
                  {stockAlerts.outOfStock.map((ing, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-red-700 uppercase tracking-wider truncate">
                          {ing.name}
                        </p>
                        <p className="text-[9px] font-bold text-red-600/70 uppercase tracking-wider mt-0.5">
                          Threshold: {ing.lowStockThreshold} {ing.unit}
                        </p>
                      </div>
                      <span className="font-display text-red-600 text-lg leading-none flex-shrink-0">
                        0 {ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Low Stock */}
              {stockAlerts.lowStock.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-orange-600 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Low Stock ({stockAlerts.lowStock.length})
                  </p>
                  {stockAlerts.lowStock.map((ing, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3 gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-orange-700 uppercase tracking-wider truncate">
                          {ing.name}
                        </p>
                        <p className="text-[9px] font-bold text-orange-600/70 uppercase tracking-wider mt-0.5">
                          Threshold: {ing.lowStockThreshold} {ing.unit}
                        </p>
                      </div>
                      <span className="font-display text-orange-600 text-lg leading-none flex-shrink-0">
                        {ing.stockQuantity} {ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
