import React, { useState } from "react";
import { AlertCircle, Layers, ChefHat, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { toast } from "sonner";

interface PrepStockGridProps {
  factoryItems: any[];
  getStatus: (ing: any) => { label: string; color: string; icon: React.ElementType };
}

export function PrepStockGrid({ factoryItems, getStatus }: PrepStockGridProps) {
  const seedMenu = useMutation(api.seed.seed);
  const [isSeeding, setIsSeeding] = useState(false);
  const hasLowStockAlerts = factoryItems.some((i) => i.stockQuantity <= i.lowStockThreshold);

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      await seedMenu();
      toast.success("Sample Kitchen ingredients & menu loaded successfully!");
    } catch (err: any) {
      toast.error("Failed to load sample data: " + err.message);
    } finally {
      setIsSeeding(false);
    }
  };

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
          <div className="text-center py-12 text-on-surface-variant/70 font-bold uppercase tracking-widest space-y-4">
            <ChefHat className="w-16 h-16 mx-auto opacity-40 text-primary" />
            <div>
              <p className="text-sm font-black text-on-surface">No ingredients listed in "Kitchen" category.</p>
              <p className="text-[10px] font-medium lowercase italic text-on-surface-variant mt-1">
                Add ingredients with Category: "Kitchen" under Inventory Management, or click below to populate sample items.
              </p>
            </div>
            <button
              onClick={handleSeed}
              disabled={isSeeding}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs uppercase tracking-wider hover:bg-secondary transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isSeeding ? "animate-spin" : ""}`} />
              <span>{isSeeding ? "Loading Sample Data..." : "Load Sample Kitchen Items & Menu"}</span>
            </button>
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
