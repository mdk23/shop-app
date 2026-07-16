"use client";

import { Receipt } from "lucide-react";

type TopDishItem = {
  name: string;
  value: number;
};

interface TopDishesListProps {
  topDishes: TopDishItem[];
}

export function TopDishesList({ topDishes }: TopDishesListProps) {
  return (
    <div className="bg-surface-container-low border border-outline-variant rounded-2xl p-6 shadow-soft space-y-4">
      <div>
        <h3 className="text-md font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
          <Receipt className="w-5 h-5 text-primary" />
          Top Selling Dishes
        </h3>
        <p className="text-[10px] text-on-surface-variant font-bold uppercase tracking-wider opacity-60 mt-0.5">
          Top performing menu items
        </p>
      </div>

      <div className="space-y-3">
        {topDishes.length === 0 ? (
          <div className="text-center py-6 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider">
            No dish data recorded
          </div>
        ) : (
          topDishes.map((dish, index) => {
            const maxCount = Math.max(...topDishes.map((d) => d.value), 1);
            const percentage = Math.round((dish.value / maxCount) * 100);
            return (
              <div key={index} className="space-y-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-on-surface truncate max-w-[170px] uppercase text-[10px] tracking-wide">
                    {dish.name}
                  </span>
                  <span className="font-black text-primary text-[10px]">{dish.value} units</span>
                </div>
                <div className="w-full bg-surface-container-high h-2.5 rounded-full overflow-hidden border border-outline-variant/30">
                  <div
                    className="bg-primary h-full rounded-full transition-all duration-500"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
