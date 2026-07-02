"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";
import { 
  History, 
  Receipt, 
  ChevronLeft, 
  ChevronRight, 
  X,
  CreditCard,
  Banknote,
  ArrowRight,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ManagePaymentsModal from "@/components/pos/ManagePaymentsModal";

interface CustomerHistoryProps {
  customerId: Id<"customers">;
  onClose: () => void;
}

const ITEMS_PER_PAGE = 15;

export function CustomerHistory({ customerId, onClose }: CustomerHistoryProps) {
  const customer = useQuery(api.customers.getById, { id: customerId });
  const orders = useQuery(api.orders.listByCustomer, { customerId });
  const [currentPage, setCurrentPage] = useState(1);
  const [orderToManagePayments, setOrderToManagePayments] = useState<any>(null);
  const [expandedOrder, setExpandedOrder] = useState<Id<"orders"> | null>(null);
  const expandedItems = useQuery(api.orders.getOrderItems, expandedOrder ? { orderId: expandedOrder } : "skip");

  if (!customer) return null;

  const totalPages = Math.ceil((orders?.length || 0) / ITEMS_PER_PAGE);
  const currentOrders = orders?.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  return (
    <>
      {/* Semi-transparent click-outside backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        onClick={onClose}
        className="fixed inset-0 bg-black z-[105] backdrop-blur-[2px]"
      />
      
      <motion.div 
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "tween", ease: "easeOut", duration: 0.18 }}
        className="fixed inset-y-0 right-0 w-full max-w-2xl bg-surface border-l-4 border-outline shadow-2xl z-[110] flex flex-col"
      >
        <div className="p-8 border-b-4 border-outline bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-primary border-2 border-outline rounded shadow-hard flex items-center justify-center text-on-primary">
              <History className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-4xl font-display text-on-surface uppercase tracking-tighter leading-none">
                History
              </h2>
              <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">
                {customer.name} • {customer.stats?.orderCount || 0} Total Orders
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-8">
          {!orders ? (
            <div className="flex flex-col items-center justify-center h-full opacity-20">
              <div className="w-16 h-16 border-4 border-outline border-t-transparent rounded-full animate-spin" />
            </div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-40">
              <Receipt className="w-20 h-20" />
              <p className="font-display text-2xl uppercase">No transaction history</p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="bg-surface-container-low p-6 border-2 border-outline rounded shadow-hard flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Total Purchases</p>
                    <p className="text-3xl font-display text-on-surface">{formatCurrency(customer.stats?.totalPurchases || 0)}</p>
                  </div>
                  <p className="text-[9px] font-medium text-on-surface-variant/60 mt-3 leading-tight">Sum of all completed orders over time.</p>
                </div>
                <div className="bg-surface-container-low p-6 border-2 border-outline rounded shadow-hard flex flex-col justify-between">
                  <div>
                    <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Current Balance</p>
                    <p className={cn(
                      "text-3xl font-display",
                      (customer.stats?.balance || 0) < 0 ? "text-error" : "text-green-700"
                    )}>
                      {formatCurrency(customer.stats?.balance || 0)}
                    </p>
                  </div>
                  <p className="text-[9px] font-medium text-on-surface-variant/60 mt-3 leading-tight">
                    {(customer.stats?.balance || 0) < 0 ? "Negative balance indicates unpaid debt." : "Positive balance indicates store credit."}
                  </p>
                </div>
              </div>

              <div className="bg-surface-container-highest text-on-surface p-3 rounded text-[10px] font-black uppercase tracking-[0.2em] grid grid-cols-5 gap-4 px-6">
                <span className="col-span-1">Order</span>
                <span className="col-span-1">Date</span>
                <span className="col-span-1 text-center">Method</span>
                <span className="col-span-1 text-right">Total</span>
                <span className="col-span-1 text-right"></span>
              </div>

              <div className="space-y-2">
                {currentOrders?.map((order: any) => (
                  <div key={order._id} className="flex flex-col">
                    <div 
                      className="bg-surface border-2 border-outline rounded p-4 shadow-hard-sm hover:bg-surface-container-low transition-colors group grid grid-cols-5 gap-4 items-center cursor-pointer"
                      onClick={() => setExpandedOrder(expandedOrder === order._id ? null : order._id)}
                    >
                      <div className="flex items-center gap-2 col-span-1">
                        <span className="font-bold text-on-surface uppercase text-xs">#{order.orderCode}</span>
                      </div>
                      <div className="text-[10px] font-bold text-on-surface-variant uppercase col-span-1">
                        {format(order.createdAt, "MMM d, HH:mm")}
                      </div>
                      <div className="flex justify-center col-span-1">
                        <div className="px-2 py-1 bg-surface-container-low border border-outline rounded text-[8px] font-black uppercase tracking-tighter">
                          {order.amountPaid === 0 ? "Debt" : order.paymentMethod}
                        </div>
                      </div>
                      <div className="text-right col-span-1">
                        <span className="font-display text-lg text-primary">{formatCurrency(order.total)}</span>
                      </div>
                      <div className="flex justify-end items-center col-span-1 text-on-surface-variant">
                        {expandedOrder === order._id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </div>
                    </div>

                    <AnimatePresence>
                      {expandedOrder === order._id && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden bg-surface-container-low/40 px-6 py-4 border-l-2 border-r-2 border-b-2 border-outline rounded-b-xl -mt-2 z-0"
                        >
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
                            <div>
                              <h4 className="text-[9px] font-black text-on-surface-variant uppercase tracking-[0.2em] mb-3">
                                Items Ordered
                              </h4>
                              <div className="space-y-2">
                                {!expandedItems ? (
                                  <div className="flex justify-center p-4 opacity-50"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>
                                ) : (
                                  expandedItems.map((item: any, idx: number) => (
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
                                  {order.change > 0 && (
                                    <div className="flex justify-between text-on-surface-variant/75">
                                      <span>Change Returned</span>
                                      <span>{formatCurrency(order.change)}</span>
                                    </div>
                                  )}
                                  {order.username && (
                                    <div className="flex justify-between text-on-surface-variant/75 pt-1.5 border-t border-dashed border-outline-variant">
                                      <span>Registered By</span>
                                      <span className="lowercase font-black">@{order.username}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="pt-3 border-t border-outline-variant mt-4 flex justify-between font-display text-xl">
                                <span className="uppercase tracking-tighter">
                                  {order.remainingAmount > 0 ? "Outstanding" : "Balance"}
                                </span>
                                <span className={order.remainingAmount > 0 ? "text-error" : "text-green-500"}>
                                  {formatCurrency(order.remainingAmount)}
                                </span>
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOrderToManagePayments(order);
                                }}
                                className="mt-4 w-full py-2 bg-surface-container-highest border border-outline rounded-xl font-black text-[10px] uppercase tracking-widest text-on-surface-variant hover:text-primary hover:border-primary/50 transition-all active:scale-95 shadow-soft"
                              >
                                Manage Payments
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {totalPages > 1 && (
          <div className="p-6 border-t-4 border-outline bg-surface-container-low flex items-center justify-between">
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              Page {currentPage} of {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
                className="p-3 border-2 border-outline rounded bg-surface-container-low hover:bg-surface-container-highest disabled:opacity-30 transition-all shadow-hard-sm"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
                className="p-3 border-2 border-outline rounded bg-surface-container-low hover:bg-surface-container-highest disabled:opacity-30 transition-all shadow-hard-sm"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </motion.div>

      {orderToManagePayments && (
        <ManagePaymentsModal
          order={orderToManagePayments}
          onClose={() => setOrderToManagePayments(null)}
        />
      )}
    </>
  );
}
