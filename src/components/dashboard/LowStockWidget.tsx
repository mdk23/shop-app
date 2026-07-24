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
      <div className="bg-surface border border-outline/30 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all max-h-[320px] flex flex-col">
        <div className="flex items-center gap-2 border-b border-outline/30 pb-3 mb-4 flex-shrink-0">
          <ShieldAlert className="w-5 h-5 text-error" />
          <p className="text-[9px] text-on-surface-variant font-bold uppercase tracking-wider opacity-70">
            Stock items requiring immediate attention
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          {hasNoAlerts ? (
            <div className="flex items-center gap-3 p-4 bg-primary/10 border border-primary/20 rounded-xl text-primary font-bold uppercase text-[10px] tracking-wider h-full">
              <CheckCircle className="w-5 h-5 flex-shrink-0 text-primary" />
              All stock levels are healthy. No low or out-of-stock items detected.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6">
              {/* Out of Stock */}
              {stockAlerts.outOfStock.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-error uppercase tracking-widest flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" />
                    Out of Stock ({stockAlerts.outOfStock.length})
                  </p>
                  {stockAlerts.outOfStock.map((ing, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-error/10 border border-error/20 rounded-xl px-4 py-3 gap-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-error uppercase tracking-wider truncate">
                          {ing.name}
                        </p>
                        <p className="text-[9px] font-bold text-error/70 uppercase tracking-wider mt-0.5">
                          Threshold: {ing.lowStockThreshold} {ing.unit}
                        </p>
                      </div>
                      <span className="font-display text-error text-lg leading-none flex-shrink-0 font-black">
                        0 {ing.unit}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* Low Stock */}
              {stockAlerts.lowStock.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Low Stock ({stockAlerts.lowStock.length})
                  </p>
                  {stockAlerts.lowStock.map((ing, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 gap-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-primary uppercase tracking-wider truncate">
                          {ing.name}
                        </p>
                        <p className="text-[9px] font-bold text-primary/70 uppercase tracking-wider mt-0.5">
                          Threshold: {ing.lowStockThreshold} {ing.unit}
                        </p>
                      </div>
                      <span className="font-display text-primary text-lg leading-none flex-shrink-0 font-black">
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
