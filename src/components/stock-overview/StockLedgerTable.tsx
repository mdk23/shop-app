"use client";

import React from "react";
import { History, Trash2, ChevronLeft, ChevronRight as ChevronRightIcon } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface StockLedgerTableProps {
  filteredAndSortedMovements: any[];
  paginatedMovements: any[];
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  totalPages: number;
  ITEMS_PER_PAGE: number;
  currentUser: any;
  handleSort: (field: "date" | "qty" | "item") => void;
  renderSortIndicator: (field: "date" | "qty" | "item") => React.ReactNode;
  handleDelete: (movementId: any) => Promise<void>;
  formatType: (type: string) => string;
}

export function StockLedgerTable({
  filteredAndSortedMovements,
  paginatedMovements,
  currentPage,
  setCurrentPage,
  totalPages,
  ITEMS_PER_PAGE,
  currentUser,
  handleSort,
  renderSortIndicator,
  handleDelete,
  formatType,
}: StockLedgerTableProps) {
  return (
    <div className="flex-1 overflow-x-auto">
      <table className="w-full text-left border-separate border-spacing-0">
        <thead className="sticky top-0 z-10 bg-black text-white select-none">
          <tr className="uppercase text-[9px] tracking-widest font-black">
            <th
              className="px-6 py-4 cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
              onClick={() => handleSort("date")}
            >
              <div className="flex items-center">
                <span>Date & Time</span>
                {renderSortIndicator("date")}
              </div>
            </th>
            <th className="px-6 py-4 w-[15%]">Type</th>
            <th
              className="px-6 py-4 cursor-pointer hover:bg-neutral-800 transition-colors w-[20%]"
              onClick={() => handleSort("item")}
            >
              <div className="flex items-center">
                <span>Item</span>
                {renderSortIndicator("item")}
              </div>
            </th>
            <th
              className="px-6 py-4 cursor-pointer hover:bg-neutral-800 transition-colors w-[10%] text-right"
              onClick={() => handleSort("qty")}
            >
              <div className="flex items-center justify-end">
                <span>Change</span>
                {renderSortIndicator("qty")}
              </div>
            </th>
            <th className="px-6 py-4 text-right w-[8%]">Previous</th>
            <th className="px-6 py-4 text-right w-[8%]">New Bal</th>
            <th className="px-6 py-4 w-[10%]">Reference</th>
            <th className="px-6 py-4 w-[8%]">User</th>
            <th className="px-6 py-4 w-[11%]">Notes</th>
            {currentUser?.role === "admin" && <th className="px-6 py-4 text-right w-[5%]">Actions</th>}
          </tr>
        </thead>
        <tbody className="divide-y-2 divide-outline-variant/30 text-xs font-bold text-on-surface">
          {paginatedMovements.length === 0 ? (
            <tr>
              <td
                colSpan={currentUser?.role === "admin" ? 10 : 9}
                className="px-8 py-20 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40"
              >
                <History className="w-12 h-12 mx-auto mb-3" />
                No stock movement audit records found.
              </td>
            </tr>
          ) : (
            paginatedMovements.map((mov) => {
              const isSoftDeleted = mov.notes?.startsWith("[DELETED BY ADMIN");
              return (
                <tr
                  key={mov._id}
                  className={cn(
                    "hover:bg-primary/5 transition-all",
                    isSoftDeleted && "opacity-40 line-through bg-neutral-100"
                  )}
                >
                  <td className="px-6 py-4 font-mono text-[10px] text-on-surface-variant">
                    {format(mov.movementDate, "yyyy-MM-dd HH:mm:ss")}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                        mov.quantity > 0
                          ? "bg-green-500/10 text-green-600 border-green-500/20"
                          : "bg-red-500/10 text-red-600 border-red-500/20"
                      )}
                    >
                      {formatType(mov.movementType)}
                    </span>
                  </td>
                  <td className="px-6 py-4 uppercase font-black text-on-surface">
                    {mov.itemName}
                  </td>
                  <td
                    className={cn(
                      "px-6 py-4 text-right font-display text-sm",
                      mov.quantity > 0 ? "text-green-600" : "text-red-600"
                    )}
                  >
                    {mov.quantity > 0 ? `+${mov.quantity}` : mov.quantity} {mov.unit}
                  </td>
                  <td className="px-6 py-4 text-right text-on-surface-variant/70 font-mono text-[11px]">
                    {mov.previousBalance} {mov.unit}
                  </td>
                  <td className="px-6 py-4 text-right font-mono text-[11px]">
                    {mov.newBalance} {mov.unit}
                  </td>
                  <td className="px-6 py-4 uppercase font-mono text-[9px] opacity-75 text-on-surface-variant">
                    {mov.referenceType ? (
                      <span className="flex items-center gap-1">
                        {mov.referenceType}
                        {mov.referenceId && (
                          <span className="text-[8px] bg-surface-container px-1 py-0.5 rounded border">
                            #{mov.referenceId.slice(-4).toUpperCase()}
                          </span>
                        )}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-6 py-4 lowercase font-black text-on-surface-variant">
                    @{mov.username || "system"}
                  </td>
                  <td className="px-6 py-4 text-[10px] font-medium max-w-[200px] truncate" title={mov.notes}>
                    {mov.notes || "—"}
                  </td>
                  {currentUser?.role === "admin" && (
                    <td className="px-6 py-4 text-right">
                      {mov.referenceType === "manual" && !isSoftDeleted && (
                        <button
                          onClick={() => handleDelete(mov._id)}
                          className="p-1 rounded bg-error/10 hover:bg-error/20 text-red-600 border border-transparent hover:border-red-300 transition-all"
                          title="Soft-delete adjustment"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      {/* Pagination controls footer */}
      {totalPages > 1 && (
        <div className="px-6 py-4 border-t-2 border-outline flex items-center justify-between bg-surface-container-low/40 select-none">
          <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider opacity-60">
            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–
            {Math.min(currentPage * ITEMS_PER_PAGE, filteredAndSortedMovements.length)} of{" "}
            {filteredAndSortedMovements.length} transactions
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-[9px] font-black uppercase tracking-widest bg-surface border-2 border-outline rounded-xl hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-hard-sm active:scale-95"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1">
              {(() => {
                const pages: (number | string)[] = [];
                if (totalPages <= 7) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  if (currentPage <= 4) {
                    pages.push(1, 2, 3, 4, 5, '...', totalPages);
                  } else if (currentPage >= totalPages - 3) {
                    pages.push(1, '...', totalPages - 4, totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
                  } else {
                    pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
                  }
                }

                return pages.map((page, idx) => {
                  if (page === '...') {
                    return (
                      <div key={`ellipsis-${idx}`} className="w-9 h-9 flex items-center justify-center text-on-surface-variant font-black">
                        ...
                      </div>
                    );
                  }
                  return (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page as number)}
                      className={cn(
                        "w-9 h-9 rounded-xl text-[10px] font-black uppercase border-2 transition-all shadow-hard-sm",
                        currentPage === page ? "bg-primary border-primary text-on-primary" : "bg-surface hover:border-primary/50"
                      )}
                    >
                      {page}
                    </button>
                  );
                });
              })()}
            </div>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 text-[9px] font-black uppercase tracking-widest bg-surface border-2 border-outline rounded-xl hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-hard-sm active:scale-95"
            >
              <ChevronRightIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
