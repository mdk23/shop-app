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
    <div className="sticky -top-2 lg:-top-4 z-20 bg-background/90 backdrop-blur-md border-b border-outline/30 py-4 px-4 -mx-2 flex flex-col md:flex-row md:items-center justify-between gap-4 select-none shadow-sm">
      <div>
        <h2 className="text-xl lg:text-xl font-black text-on-surface uppercase tracking-tight">
          Dashboard
        </h2>
        <p className="text-xs text-on-surface-variant font-medium uppercase tracking-widest opacity-70">
          Enterprise Overview & Operations Overview
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        {/* Range Toggle Buttons */}
        <div className="flex bg-surface border border-outline/30 rounded-2xl p-1.5 shadow-sm">
          {(["Today", "Yesterday", "This Week"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setDateRangeType(type)}
              className={cn(
                "px-4 py-2 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all cursor-pointer",
                dateRangeType === type
                  ? "bg-primary text-on-primary shadow-sm"
                  : "text-on-surface-variant hover:text-primary hover:bg-surface-container/50"
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
