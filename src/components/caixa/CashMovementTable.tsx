"use client";

import React from "react";
import { DollarSign, Clock } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { formatMT, MOVEMENT_COLORS, MOVEMENT_LABELS } from "./Shared";

interface CashMovementTableProps {
  movements: any[];
}

export function CashMovementTable({ movements }: CashMovementTableProps) {
  return (
    <div>
      <h2 className="text-xl font-display text-on-surface mb-4">Movements</h2>
      <div className="bg-surface border-2 border-outline rounded-2xl overflow-hidden shadow-hard">
        {movements.length === 0 ? (
          <div className="p-8 text-center">
            <DollarSign className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-2" />
            <p className="font-bold text-on-surface-variant text-sm">No movements yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b-2 border-outline bg-surface-container-low">
                  {["Time", "Type", "Description", "Amount", "User"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => {
                  const isPositive = m.type === "opening" || m.type === "sale" || m.type === "cash_in";
                  const colorClass = MOVEMENT_COLORS[m.type] || MOVEMENT_COLORS.closing;
                  return (
                    <tr
                      key={m._id}
                      className="border-b border-outline-variant hover:bg-surface-container-low/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs font-bold text-on-surface-variant whitespace-nowrap">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {format(m.createdAt, "HH:mm")}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border",
                            colorClass
                          )}
                        >
                          {MOVEMENT_LABELS[m.type]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-on-surface-variant max-w-[200px] truncate">
                        {m.description}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "font-black text-sm",
                            m.type === "cash_out"
                              ? "text-error"
                              : m.type === "closing"
                              ? "text-on-surface-variant"
                              : "text-emerald-500"
                          )}
                        >
                          {m.type === "cash_out" ? "-" : isPositive ? "+" : ""}
                          {formatMT(m.amount)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs font-bold text-on-surface-variant">
                        @{m.username}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
