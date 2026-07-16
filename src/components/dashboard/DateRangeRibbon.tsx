"use client";

import React from "react";
import { cn } from "@/lib/utils";

interface DateRangeRibbonProps {
  dateRangeType: "Today" | "Yesterday" | "This Week";
  setDateRangeType: (type: "Today" | "Yesterday" | "This Week") => void;
}

export function DateRangeRibbon({
  dateRangeType,
  setDateRangeType,
}: DateRangeRibbonProps) {
  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur-md border-b-2 border-outline py-4 px-2 -mx-2 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none">
      <div>
        <h2 className="text-xl lg:text-xl font-black text-on-surface uppercase tracking-tight">
          Dashboard
        </h2>
        <p className="text-xs text-on-surface-variant font-bold uppercase tracking-widest opacity-60">
          Enterprise Overview & Operations Overview
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Range Toggle Buttons */}
        <div className="flex bg-surface border-2 border-outline rounded-xl p-1 shadow-hard-sm animate-fadeIn">
          {(["Today", "Yesterday", "This Week"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setDateRangeType(type)}
              className={cn(
                "px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all",
                dateRangeType === type
                  ? "bg-primary text-on-primary"
                  : "text-on-surface-variant hover:text-primary"
              )}
            >
              {type}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
