"use client";

import React from "react";
import { Search, Receipt } from "lucide-react";
import { format } from "date-fns";
import { cn, formatCurrency } from "@/lib/utils";

interface RecentActivityTableProps {
  filteredOrders: any[];
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  statusFilter: "All" | "Paid" | "Pending" | "Credit";
  setStatusFilter: (status: "All" | "Paid" | "Pending" | "Credit") => void;
  handleSort: (field: "refCode" | "client" | "method" | "status" | "total") => void;
  renderSortIcon: (field: "refCode" | "client" | "method" | "status" | "total") => React.ReactNode;
  getMethodIcon: (method: string) => React.ReactNode;
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  expandedOrder: string | null;
  setExpandedOrder: (orderId: string | null) => void;
  expandedItems: any[] | undefined;
  ROWS_PER_PAGE: number;
}

export function RecentActivityTable({
  filteredOrders,
  searchTerm,
  setSearchTerm,
  statusFilter,
  setStatusFilter,
  handleSort,
  renderSortIcon,
  getMethodIcon,
  currentPage,
  setCurrentPage,
  expandedOrder,
  setExpandedOrder,
  expandedItems,
  ROWS_PER_PAGE,
}: RecentActivityTableProps) {
  return (
    <div className="bg-surface border-2 border-outline rounded-2xl shadow-hard overflow-hidden flex flex-col min-h-[450px]">
      <div className="px-6 py-4 border-b border-outline bg-surface-container-low/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
        <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em]">
          Recent Sales Log ({filteredOrders.length})
        </h3>

        <div className="flex flex-wrap items-center gap-3">
          {/* Search input */}
          <div className="relative w-full sm:w-60">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-on-surface-variant opacity-40" />
            <input
              type="text"
              placeholder="SEARCH ORDER, CLIENT, ITEM..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface border-2 border-outline rounded-xl pl-9 pr-3 py-1.5 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-9"
            />
          </div>

          {/* Status filter dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-surface border-2 border-outline rounded-xl px-3 py-1.5 outline-none focus:border-primary transition-all font-black uppercase tracking-widest text-[9px] h-9 cursor-pointer"
          >
            <option value="All">ALL STATUS</option>
            <option value="Paid">FULLY PAID</option>
            <option value="Pending">PENDING (PARTIAL)</option>
            <option value="Credit">CREDIT (UNPAID)</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-black text-white select-none">
            <tr className="uppercase text-[9px] tracking-widest font-black">
              <th
                className="px-6 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
                onClick={() => handleSort("refCode")}
              >
                <div className="flex items-center gap-1">
                  <span>Order ID</span>
                  {renderSortIcon("refCode")}
                </div>
              </th>
              <th className="px-6 py-3">Time</th>
              <th
                className="px-6 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
                onClick={() => handleSort("client")}
              >
                <div className="flex items-center gap-1">
                  <span>Customer</span>
                  {renderSortIcon("client")}
                </div>
              </th>
              <th className="px-6 py-3">Items</th>
              <th
                className="px-6 py-3 text-right cursor-pointer hover:bg-neutral-800 transition-colors"
                onClick={() => handleSort("total")}
              >
                <div className="flex items-center justify-end gap-1">
                  <span>Total</span>
                  {renderSortIcon("total")}
                </div>
              </th>
              <th className="px-6 py-3 text-right">Amount Paid</th>
              <th
                className="px-6 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
                onClick={() => handleSort("method")}
              >
                <div className="flex items-center gap-1">
                  <span>Payment Method</span>
                  {renderSortIcon("method")}
                </div>
              </th>
              <th
                className="px-6 py-3 cursor-pointer hover:bg-neutral-800 transition-colors"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center gap-1">
                  <span>Status</span>
                  {renderSortIcon("status")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/30 text-xs font-bold text-on-surface">
            {filteredOrders.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-8 py-16 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40">
                  <Receipt className="w-12 h-12 mx-auto mb-3" />
                  No sales records found.
                </td>
              </tr>
            ) : (
              filteredOrders.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE).map((order) => (
                <React.Fragment key={order._id}>
                  <tr
                    className={cn(
                      "hover:bg-primary/5 cursor-pointer transition-all",
                      expandedOrder === order._id && "bg-primary/5"
                    )}
                    onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                  >
                    <td className="px-6 py-3.5 uppercase font-display text-primary">
                      {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                    </td>
                    <td className="px-6 py-3.5 text-on-surface-variant">
                      {format(order.createdAt, "HH:mm")}
                    </td>
                    <td className="px-6 py-3.5 uppercase">
                      {order.customer?.name || "Generic Client"}
                    </td>
                    <td className="px-6 py-3.5 max-w-[200px] truncate text-on-surface-variant text-[11px]">
                      {order.items.map((item: any) => `${item.dishName} (x${item.quantity})`).join(", ")}
                    </td>
                    <td className="px-6 py-3.5 text-right font-display text-[14px]">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="px-6 py-3.5 text-right text-green-600 font-black">
                      {formatCurrency(order.amountPaid)}
                    </td>
                    <td className="px-6 py-3.5 uppercase text-[10px] tracking-wider">
                      <div className="flex items-center gap-1.5">
                        {getMethodIcon(order.paymentMethod || "Cash")}
                        <span>
                          {order.payments && order.payments.length > 0
                            ? order.payments.map((p: any) => p.method).join(" + ")
                            : order.paymentMethod || "Cash"}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border",
                        order.status === "Paid"
                          ? "bg-green-500/10 text-green-600 border-green-500/20"
                          : "bg-red-500/10 text-red-600 border-red-500/20"
                      )}>
                        {order.status === "Paid" ? "Paid" : "Cancelled"}
                      </span>
                    </td>
                  </tr>

                  {/* Expandable Order Detail */}
                  {expandedOrder === order._id && (
                    <tr className="bg-surface-container-low/40">
                      <td colSpan={8} className="px-6 py-4 border-b border-outline-variant/30">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs uppercase tracking-wider font-black">
                          {/* Left Side: Items */}
                          <div className="space-y-2">
                            <p className="text-[10px] font-black text-on-surface-variant/60">Items Detail</p>
                            <div className="space-y-1 text-[11px] font-bold">
                              {!expandedItems ? (
                                <div className="flex justify-center p-2 opacity-50">
                                  <div className="w-5 h-5 border border-primary border-t-transparent rounded-full animate-spin" />
                                </div>
                              ) : (expandedItems.length > 0 ? expandedItems : (order.items || [])).length === 0 ? (
                                <p className="text-[10px] text-on-surface-variant opacity-60 px-2">No items found</p>
                              ) : (
                                (expandedItems.length > 0 ? expandedItems : (order.items || [])).map((item: any, idx: number) => (
                                  <div key={idx} className="flex justify-between border-b border-outline-variant/20 py-1 bg-surface px-3 py-1.5 border border-outline rounded-xl shadow-hard-sm-sm">
                                    <span>{item.quantity}x {item.dishName}</span>
                                    <span className="text-primary font-black">{formatCurrency((item.priceAtTime ?? item.price ?? 0) * item.quantity)}</span>
                                  </div>
                                ))
                              )}
                            </div>
                          </div>

                          {/* Right Side: Totals and metadata */}
                          <div className="bg-surface border border-outline rounded-xl p-4 shadow-hard-sm space-y-2 text-[11px] font-bold text-on-surface-variant">
                            <div className="flex justify-between border-b border-outline-variant/25 pb-1.5 text-on-surface font-black">
                              <span>Total Bill:</span>
                              <span>{formatCurrency(order.total)}</span>
                            </div>
                            <div className="flex justify-between text-green-600 font-black">
                              <span>Amount Paid:</span>
                              <span>{formatCurrency(order.amountPaid)}</span>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filteredOrders.length > ROWS_PER_PAGE && (
        <div className="px-6 py-3 border-t border-outline bg-surface-container-low/50 flex items-center justify-between select-none">
          <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider opacity-60">
            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length} records
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-surface border border-outline rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-container-high transition-all"
            >
              Prev
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredOrders.length / ROWS_PER_PAGE), p + 1))}
              disabled={currentPage === Math.ceil(filteredOrders.length / ROWS_PER_PAGE)}
              className="px-3 py-1.5 text-[9px] font-black uppercase tracking-widest bg-surface border border-outline rounded-lg disabled:opacity-30 disabled:cursor-not-allowed hover:bg-surface-container-high transition-all"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
