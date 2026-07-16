"use client";

import { Clock } from "lucide-react";

type PeakHourItem = {
  name: string;
  count: number;
};

interface PeakHoursListProps {
  peakHours: PeakHourItem[];
}

export function PeakHoursList({ peakHours }: PeakHoursListProps) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-4">
      <div>
        <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          Peak Service Hours
        </h3>
        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
          Busiest periods by order count
        </p>
      </div>

      <div className="space-y-2.5">
        {peakHours.length === 0 ? (
          <div className="text-center py-4 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider">
            No timeline metrics
          </div>
        ) : (
          peakHours.map((slot, index) => {
            const maxOrders = Math.max(...peakHours.map((s) => s.count), 1);
            const pct = Math.round((slot.count / maxOrders) * 100);
            return (
              <div key={index} className="flex items-center gap-3">
                <span className="text-[9px] font-black text-on-surface-variant opacity-75 uppercase w-28 truncate">
                  {slot.name}
                </span>
                <div className="flex-1 bg-surface-container-high h-2 rounded-full overflow-hidden">
                  <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-[9px] font-black text-on-surface w-8 text-right">
                  {slot.count} ord
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
