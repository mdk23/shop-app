"use client";

import React from "react";
import { Search, History, Calendar, Trash2 } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ProductionLogsTableProps {
  historySearch: string;
  setHistorySearch: (search: string) => void;
  filteredLogs: any[];
  isReversingId: string | null;
  onReverseBatch: (log: any) => void;
}

export function ProductionLogsTable({
  historySearch,
  setHistorySearch,
  filteredLogs,
  isReversingId,
  onReverseBatch,
}: ProductionLogsTableProps) {
  return (
    <div className="bg-surface border-2 border-outline rounded-lg shadow-hard overflow-hidden flex flex-col min-h-[500px]">
      <div className="p-6 border-b-2 border-outline bg-surface-container-low/50 space-y-4">
        <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] flex items-center gap-2">
          <History className="w-4 h-4 text-primary" /> Manufacturing Logs & Audit
        </h3>
        <div className="relative max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
          <input
            type="text"
            placeholder="Search logs by prep item..."
            value={historySearch}
            onChange={(e) => setHistorySearch(e.target.value)}
            className="w-full bg-surface border-2 border-black rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary transition-all font-bold uppercase tracking-wider text-[11px]"
          />
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-black text-white">
            <tr>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em]">Date</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em]">Prep Item</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-right">Quantity Produced</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] hide-on-mobile">Notes</th>
              <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-black bg-surface">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-8 py-20 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40">
                  <History className="w-16 h-16 mx-auto mb-4" />
                  No production batches recorded.
                </td>
              </tr>
            ) : (
              filteredLogs.map((log: any) => (
                <tr key={log._id} className="hover:bg-primary/5 transition-colors">
                  <td className="px-6 py-4">
                    <span className="text-[10px] font-black text-on-surface flex items-center gap-1.5 uppercase tracking-wider">
                      <Calendar className="w-3.5 h-3.5 text-primary" /> {format(log.producedAt, "dd/MM/yyyy HH:mm")}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-black text-on-surface uppercase text-sm tracking-wide">
                    {log.producedIngredientName}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <span className="font-display text-lg text-primary tracking-tighter">
                      +{log.quantityProduced}
                    </span>
                    <span className="ml-1 text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">
                      {log.producedIngredientUnit}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-xs font-bold text-on-surface-variant tracking-wide hide-on-mobile">
                    {log.notes || "—"}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      disabled={isReversingId === log._id}
                      onClick={() => onReverseBatch(log)}
                      className={cn(
                        "p-2 rounded-xl text-error hover:bg-error/10 border border-transparent hover:border-outline-variant transition-all",
                        isReversingId === log._id && "opacity-45 cursor-not-allowed animate-pulse"
                      )}
                      title="Reverse/Delete Batch"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
