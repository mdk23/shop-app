"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  Receipt,
  Clock,
  User,
  Trash2,
  ChevronUp,
  ChevronDown,
  Banknote,
  CreditCard,
  Smartphone,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "lucide-react";

interface SalesTableProps {
  filteredOrders: any[];
  currentPage: number;
  setCurrentPage: React.Dispatch<React.SetStateAction<number>>;
  ROWS_PER_PAGE: number;
  sortField: "refCode" | "client" | "method" | "status" | "delivery" | null;
  sortOrder: "asc" | "desc";
  handleSort: (field: "refCode" | "client" | "method" | "status" | "delivery") => void;
  onDeleteOrder: (order: any) => void;
  onManagePayments: (order: any) => void;
}

const getMethodIcon = (method: string) => {
  switch (method) {
    case "Cash":
      return <Banknote className="w-4 h-4 text-primary" />;
    case "POS":
      return <CreditCard className="w-4 h-4 text-secondary" />;
    default:
      return <Smartphone className="w-4 h-4 text-primary" />;
  }
};

const getStatusColor = (status: string) => {
  switch (status) {
    case "Paid":
      return "bg-primary/10 text-primary border-primary/20";
    case "Partially Paid":
      return "bg-secondary/10 text-secondary border-secondary/20";
    case "Pending":
      return "bg-error/10 text-error border-error/20";
    default:
      return "bg-surface-container-highest text-on-surface-variant border-outline";
  }
};

export function SalesTable({
  filteredOrders,
  currentPage,
  setCurrentPage,
  ROWS_PER_PAGE,
  sortField,
  sortOrder,
  handleSort,
  onDeleteOrder,
  onManagePayments,
}: SalesTableProps) {
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  const expandedItems = useQuery(
    api.orders.getOrderItems,
    expandedOrder ? { orderId: expandedOrder as any } : "skip"
  );

  // Close expanded details if page changes
  useEffect(() => {
    setExpandedOrder(null);
  }, [currentPage]);

  const renderSortIcon = (field: "refCode" | "client" | "method" | "status" | "delivery") => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 ml-1 opacity-40 hover:opacity-100 transition-opacity flex-shrink-0" />;
    }
    if (sortOrder === "asc") {
      return <ArrowUp className="w-3 h-3 ml-1 text-primary flex-shrink-0" />;
    }
    return <ArrowDown className="w-3 h-3 ml-1 text-primary flex-shrink-0" />;
  };

  return (
    <div className="bg-surface border-2 border-outline rounded-2xl shadow-hard overflow-hidden flex flex-col min-h-[500px]">
      <div className="px-6 py-4 border-b border-outline bg-surface-container-low/50">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-black text-on-surface uppercase tracking-[0.2em]">
            Sales Log ({filteredOrders.length})
          </h3>
          <span className="text-[10px] font-black text-on-surface-variant opacity-50 uppercase tracking-widest">
            Page {currentPage} of {Math.max(1, Math.ceil(filteredOrders.length / ROWS_PER_PAGE))}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-black text-white select-none">
            <tr className="uppercase text-[9px] tracking-widest font-black">
              <th 
                className="px-6 py-4 cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                onClick={() => handleSort("refCode")}
              >
                <div className="flex items-center gap-1">
                  <span>Ref Code</span>
                  {renderSortIcon("refCode")}
                </div>
              </th>
              <th 
                className="px-6 py-4 hide-on-tablet cursor-pointer hover:bg-neutral-800 transition-colors w-[25%]"
                onClick={() => handleSort("client")}
              >
                <div className="flex items-center gap-1">
                  <span>Client Profile</span>
                  {renderSortIcon("client")}
                </div>
              </th>
              <th className="px-6 py-4 hide-on-mobile w-[10%]">Kitchen</th>
              <th 
                className="px-6 py-4 hide-on-mobile cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                onClick={() => handleSort("delivery")}
              >
                <div className="flex items-center gap-1">
                  <span>Delivery</span>
                  {renderSortIcon("delivery")}
                </div>
              </th>
              <th 
                className="px-6 py-4 hide-on-mobile cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                onClick={() => handleSort("method")}
              >
                <div className="flex items-center gap-1">
                  <span>Method</span>
                  {renderSortIcon("method")}
                </div>
              </th>
              <th 
                className="px-6 py-4 hide-on-mobile cursor-pointer hover:bg-neutral-800 transition-colors w-[15%]"
                onClick={() => handleSort("status")}
              >
                <div className="flex items-center gap-1">
                  <span>Payment</span>
                  {renderSortIcon("status")}
                </div>
              </th>
              <th className="px-6 py-4 text-right w-[10%]">Total Price</th>
              <th className="px-6 py-4 text-right w-[5%]">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y-2 divide-outline-variant/30">
            {filteredOrders.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE).map((order) => (
              <React.Fragment key={order._id}>
                <tr
                  className={cn(
                    "hover:bg-primary/5 transition-all cursor-pointer group",
                    expandedOrder === order._id && "bg-primary/5"
                  )}
                  onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="hidden sm:flex w-9 h-9 rounded-xl bg-surface-container-high border border-outline items-center justify-center text-primary group-hover:bg-primary group-hover:text-on-primary transition-all">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-display text-on-surface text-sm lg:text-base uppercase tracking-wider">
                          {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                        </p>
                        <p className="text-[9px] font-black text-on-surface-variant flex items-center gap-1 uppercase tracking-tighter opacity-60">
                          <Clock className="w-3 h-3" /> {format(order.createdAt, "dd/MM/yyyy HH:mm")}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 hide-on-tablet">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
                        <User className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex flex-col">
                        <span className="font-bold text-on-surface uppercase text-xs tracking-wider">
                          {(order as any).customer?.name || "Generic Client"}
                        </span>
                        {order.username && (
                          <span className="text-[9px] text-on-surface-variant font-medium lowercase">
                            seller: @{order.username}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 hide-on-mobile">
                    <span className={cn(
                      "inline-flex items-center px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                      order.prepStatus === "completed" ? "bg-success/10 text-success border-success/20" :
                      order.prepStatus === "ready" ? "bg-primary/10 text-primary border-primary/20" :
                      order.prepStatus === "preparing" ? "bg-warning/10 text-warning-dark border-warning/20" :
                      "bg-surface-container-high text-on-surface-variant border-outline-variant"
                    )}>
                      {order.prepStatus || "pending"}
                    </span>
                  </td>
                  <td className="px-6 py-4 hide-on-mobile">
                    <span className={cn(
                      "inline-flex items-center px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                      order.orderType === "delivery"
                        ? "bg-primary/10 text-primary border-primary/20"
                        : "bg-surface-container-high text-on-surface-variant border-outline-variant"
                    )}>
                      {order.orderType === "delivery" ? "Delivery" : "Pickup"}
                    </span>
                  </td>
                  <td className="px-6 py-4 hide-on-mobile">
                    {order.payments && order.payments.length > 0 ? (
                      <div className="flex flex-col gap-1">
                        {order.payments.map((p: any, idx: number) => (
                          <div key={idx} className="flex items-center gap-1.5 text-[9px] font-black text-on-surface uppercase tracking-wider">
                            {getMethodIcon(p.method)}
                            <span>{p.method}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[9px] font-black text-on-surface uppercase tracking-widest">
                        {getMethodIcon(order.amountPaid === 0 ? "Debt" : (order.paymentMethod || "Cash"))}
                        {order.amountPaid === 0 ? "Debt" : order.paymentMethod}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 hide-on-mobile">
                    <div
                      className={cn(
                        "inline-flex items-center px-3 py-1 rounded-xl text-[9px] font-black uppercase tracking-widest border",
                        getStatusColor(order.status)
                      )}
                    >
                      {order.status}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right whitespace-nowrap">
                    <p className="font-display text-base lg:text-xl text-primary tracking-tighter">
                      {formatCurrency(order.total)}
                    </p>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteOrder(order);
                        }}
                        className="p-2 rounded-xl text-error hover:bg-error/10 border border-transparent hover:border-outline-variant transition-all hide-on-mobile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {expandedOrder === order._id ? (
                        <ChevronUp className="w-4 h-4 text-on-surface-variant" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-on-surface-variant" />
                      )}
                    </div>
                  </td>
                </tr>

                {/* Expandable Order detail view */}
                <AnimatePresence>
                  {expandedOrder === order._id && (
                    <tr>
                      <td colSpan={8} className="p-0">
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden bg-surface-container-low/40 px-6 py-4 border-b border-outline"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                              <h4 className="text-[9px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-3">
                                Items Ordered
                              </h4>
                              <div className="space-y-2">
                                {!expandedItems ? (
                                  <div className="flex justify-center p-4 opacity-50">
                                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                                  </div>
                                ) : (expandedItems.length > 0 ? expandedItems : (order.items || [])).length === 0 ? (
                                  <p className="text-xs text-on-surface-variant opacity-60 px-2">No items found</p>
                                ) : (
                                  (expandedItems.length > 0 ? expandedItems : (order.items || [])).map((item: any, idx: number) => (
                                    <div key={idx} className="flex flex-col bg-surface p-3 rounded-xl border border-outline shadow-hard-sm gap-2">
                                      <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                          <span className="w-6 h-6 rounded bg-black text-white flex items-center justify-center font-black text-[10px]">
                                            {item.quantity}
                                          </span>
                                          <span className="font-bold text-on-surface uppercase text-xs tracking-wider">
                                            {item.dishName}
                                          </span>
                                        </div>
                                        <span className="font-display text-on-surface-variant text-sm">
                                          {formatCurrency(
                                            (item.priceAtTime ?? item.price ?? 0) * item.quantity +
                                              (item.modifiers || []).reduce((sum: number, m: any) => sum + m.price, 0) +
                                              (item.comboSelections || []).reduce(
                                                (sum: number, c: any) => sum + c.extraCharge,
                                                0
                                              )
                                          )}
                                        </span>
                                      </div>

                                      {/* Modifiers */}
                                      {item.modifiers && item.modifiers.length > 0 && (
                                        <div className="pl-2 border-l border-primary/20 space-y-1">
                                          {item.modifiers.map((mod: any, i: number) => (
                                            <p key={i} className="text-[9px] font-bold text-on-surface-variant/80 flex justify-between">
                                              <span>🍳 {mod.name}</span>
                                              <span className="text-primary font-black">+{formatCurrency(mod.price)}</span>
                                            </p>
                                          ))}
                                        </div>
                                      )}

                                      {/* Combo Selections */}
                                      {item.comboSelections && item.comboSelections.length > 0 && (
                                        <div className="pl-2 border-l border-primary/20 space-y-1">
                                          {item.comboSelections.map((sel: any, i: number) => (
                                            <p key={i} className="text-[9px] font-bold text-on-surface-variant/80 flex justify-between">
                                              <span>
                                                {sel.category === "Free Pizza Upgrade" ? "🍕 Promo" : `🥗 ${sel.category}`}: {sel.name}
                                              </span>
                                              {sel.extraCharge > 0 && (
                                                <span className="text-primary font-black">+{formatCurrency(sel.extraCharge)}</span>
                                              )}
                                            </p>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>

                            <div className="bg-surface rounded-xl p-4 border border-outline shadow-hard-sm flex flex-col justify-between">
                              <div>
                                <h4 className="text-[9px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-3">
                                  Financial Breakdown
                                </h4>
                                <div className="space-y-1.5 text-xs font-bold uppercase tracking-wider">
                                  <div className="flex justify-between">
                                    <span>Food Subtotal</span>
                                    <span>{formatCurrency(order.total - (order.deliveryFeeAmount ?? 0))}</span>
                                  </div>
                                  {order.orderType === "delivery" && (
                                    <div className="flex justify-between">
                                      <span>Delivery Fee</span>
                                      <span>{formatCurrency(order.deliveryFeeAmount ?? 0)}</span>
                                    </div>
                                  )}
                                  <div className="flex justify-between pt-1.5 border-t border-dashed border-outline-variant/50">
                                    <span>Total Bill</span>
                                    <span>{formatCurrency(order.total)}</span>
                                  </div>
                                  <div className="flex justify-between text-green-500">
                                    <span>Amount Paid</span>
                                    <span>{formatCurrency(order.amountPaid)}</span>
                                  </div>
                                  {order.username && (
                                    <div className="flex justify-between text-on-surface-variant/75 pt-1.5 border-t border-dashed border-outline-variant">
                                      <span>Registered By</span>
                                      <span className="lowercase font-black">@{order.username}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <button
                                onClick={() => onManagePayments(order)}
                                className="mt-4 w-full py-2 bg-surface-container-highest border border-outline rounded-xl font-black text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all active:scale-95 shadow-soft"
                              >
                                Manage Payments
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      </td>
                    </tr>
                  )}
                </AnimatePresence>
              </React.Fragment>
            ))}

            {filteredOrders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-8 py-20 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40">
                  <Receipt className="w-12 h-12 mx-auto mb-3" />
                  No sales found matching your search.
                </td>
              </tr>
            )}
          </tbody>
          {filteredOrders.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 bg-black text-white font-black text-[10px] uppercase tracking-wider">
              <tr className="border-t-4 border-outline">
                <td className="px-6 py-4">Totals ({filteredOrders.length})</td>
                <td className="px-6 py-4"></td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] font-black uppercase tracking-wider">
                    {(() => {
                      const totalsMap: Record<string, number> = {};
                      filteredOrders.forEach((o) => {
                        const payments = (o as any).payments || [];
                        if (payments.length > 0) {
                          payments.forEach((p: any) => {
                            totalsMap[p.method] = (totalsMap[p.method] || 0) + p.amount;
                          });
                        } else {
                          const method = o.paymentMethod || "Cash";
                          totalsMap[method] = (totalsMap[method] || 0) + o.amountPaid;
                        }
                      });
                      return Object.entries(totalsMap).map(([method, amount], idx) => (
                        <span key={idx} className="whitespace-nowrap">
                          {method}: <span className="text-primary font-extrabold">{formatCurrency(amount)}</span>
                        </span>
                      ));
                    })()}
                  </div>
                </td>
                <td className="px-6 py-4"></td>
                <td className="px-6 py-4"></td>
                <td className="px-6 py-4"></td>
                <td className="px-6 py-4 text-right text-lg font-display text-primary">
                  {formatCurrency(filteredOrders.reduce((acc, o) => acc + o.total, 0))}
                </td>
                <td className="px-6 py-4"></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Pagination Controls */}
      {filteredOrders.length > ROWS_PER_PAGE && (
        <div className="px-6 py-4 border-t-2 border-outline flex items-center justify-between bg-surface-container-low/40">
          <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider opacity-60">
            Showing {(currentPage - 1) * ROWS_PER_PAGE + 1}–{Math.min(currentPage * ROWS_PER_PAGE, filteredOrders.length)} of {filteredOrders.length} transactions
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 text-[9px] font-black uppercase tracking-widest bg-surface border-2 border-outline rounded-xl hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-hard-sm active:scale-95"
            >
              ← Prev
            </button>

            {Array.from({ length: Math.ceil(filteredOrders.length / ROWS_PER_PAGE) }, (_, i) => i + 1)
              .filter((page) => page === 1 || page === Math.ceil(filteredOrders.length / ROWS_PER_PAGE) || Math.abs(page - currentPage) <= 1)
              .reduce<(number | "...")[]>((acc, page, idx, arr) => {
                if (idx > 0 && (page as number) - (arr[idx - 1] as number) > 1) acc.push("...");
                acc.push(page);
                return acc;
              }, [])
              .map((item, idx) =>
                item === "..." ? (
                  <span key={`ellipsis-${idx}`} className="text-[10px] font-black text-on-surface-variant opacity-40 px-1">
                    ...
                  </span>
                ) : (
                  <button
                    key={item}
                    onClick={() => setCurrentPage(item as number)}
                    className={cn(
                      "w-9 h-9 rounded-xl text-[10px] font-black uppercase border-2 transition-all shadow-hard-sm active:scale-95",
                      currentPage === item
                        ? "bg-primary text-on-primary border-outline"
                        : "bg-surface text-on-surface border-outline-variant hover:border-primary/50"
                    )}
                  >
                    {item}
                  </button>
                )
              )}

            <button
              onClick={() => setCurrentPage((p) => Math.min(Math.ceil(filteredOrders.length / ROWS_PER_PAGE), p + 1))}
              disabled={currentPage === Math.ceil(filteredOrders.length / ROWS_PER_PAGE)}
              className="px-4 py-2 text-[9px] font-black uppercase tracking-widest bg-surface border-2 border-outline rounded-xl hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-all shadow-hard-sm active:scale-95"
            >
              Next →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
