"use client";

import React from "react";
import { AlertCircle, Layers, ChefHat } from "lucide-react";
import { cn } from "@/lib/utils";

interface PrepStockGridProps {
  factoryItems: any[];
  getStatus: (ing: any) => { label: string; color: string; icon: React.ElementType };
}

export function PrepStockGrid({ factoryItems, getStatus }: PrepStockGridProps) {
  const hasLowStockAlerts = factoryItems.some((i) => i.stockQuantity <= i.lowStockThreshold);

  return (
    <div className="space-y-8">
      {/* Low stock alerts */}
      {hasLowStockAlerts && (
        <div className="bg-tertiary/10 border-2 border-tertiary rounded-2xl p-6 shadow-hard flex items-start gap-4">
          <AlertCircle className="w-8 h-8 text-tertiary flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-black text-on-surface uppercase tracking-wider">Low Prep Alerts</h3>
            <p className="text-xs text-on-surface-variant font-medium mt-1">
              The following prepped items have fallen below their minimum stock thresholds. Arrange kitchen production batches to fulfill these deficits.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {factoryItems
                .filter((i) => i.stockQuantity <= i.lowStockThreshold)
                .map((i) => (
                  <div key={i._id} className="bg-surface border border-outline px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                    <span>{i.name}: {i.stockQuantity} / {i.lowStockThreshold} {i.unit}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Grid display of prep stock */}
      <div className="bg-surface border-2 border-outline rounded-lg shadow-hard p-6">
        <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
          <Layers className="w-4 h-4 text-primary" /> Current Kitchen Prepared Inventory
        </h3>

        {factoryItems.length === 0 ? (
          <div className="text-center py-16 text-on-surface-variant/40 font-bold uppercase tracking-widest">
            <ChefHat className="w-16 h-16 mx-auto mb-4 opacity-40" />
            No ingredients listed in "Kitchen" category.<br />
            <span className="text-[10px] font-medium lowercase italic">add ingredients with Category: Kitchen under Inventory page</span>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {factoryItems.map((item) => {
              const status = getStatus(item);
              return (
                <div key={item._id} className="bg-surface-container-low border-2 border-black rounded-2xl p-6 shadow-hard flex flex-col justify-between gap-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-black text-on-surface text-lg uppercase tracking-tight leading-tight">{item.name}</h4>
                      <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider opacity-60">
                        Unit: {item.unit}
                      </span>
                    </div>
                    <span className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-black/10", status.color)}>
                      {status.label}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-4xl font-display text-primary tracking-tighter">{item.stockQuantity}</span>
                    <span className="text-xs font-black text-on-surface-variant uppercase tracking-wider">{item.unit}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
