"use client";

import React, { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { formatCurrency, cn } from "@/lib/utils";
import { format } from "date-fns";
import { 
  Receipt, 
  Printer, 
  ArrowLeft, 
  Search, 
  Loader2, 
  Clock, 
  User 
} from "lucide-react";
import Link from "next/link";
import { ThermalReceiptModal } from "@/components/pos/ReceiptModal";

export default function ReceiptTestPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeOrderId, setActiveOrderId] = useState<any>(null);

  // Load orders from the last 30 days (stabilized to prevent query arguments changing on each render)
  const [dateRange] = useState(() => {
    const now = Date.now();
    return {
      start: now - 30 * 24 * 60 * 60 * 1000,
      end: now
    };
  });

  const orders = useQuery(api.orders.listByRange, {
    start: dateRange.start,
    end: dateRange.end,
  });

  // Query details for selected order when modal is requested
  const selectedOrder = useQuery(
    api.orders.getById,
    activeOrderId ? { id: activeOrderId } : "skip"
  );

  const handleOpenReceipt = (orderId: string) => {
    setActiveOrderId(orderId);
  };

  const handleClose = () => {
    setActiveOrderId(null);
  };

  // Filter orders based on search query
  const filteredOrders = orders?.filter((order) => {
    const code = order.orderCode?.toLowerCase() || "";
    const customer = order.customerName?.toLowerCase() || "";
    const query = searchTerm.toLowerCase();
    return code.includes(query) || customer.includes(query);
  }) || [];

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Navigation / Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <Link 
              href="/settings"
              className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-on-surface-variant hover:text-primary transition-colors mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Settings
            </Link>
            <h1 className="text-3xl font-display font-black text-on-surface uppercase tracking-tight flex items-center gap-3">
              <Printer className="w-8 h-8 text-primary" />
              Thermal POS Receipts
            </h1>
            <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
              Live Testing and preview of receipt layouts using active database sales
            </p>
          </div>
        </div>

        {/* Main Panel */}
        <div className="bg-surface border-2 border-outline rounded-3xl shadow-hard overflow-hidden flex flex-col min-h-[500px]">
          
          {/* Filtering Header */}
          <div className="px-6 py-5 border-b-2 border-outline bg-surface-container-low/50 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-on-surface-variant/50">
                <Search className="w-4 h-4" />
              </div>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search by order code or client..."
                className="w-full pl-10 pr-4 py-2.5 bg-surface border-2 border-outline rounded-xl font-bold text-xs uppercase tracking-wide placeholder-on-surface-variant/40 focus:outline-none focus:border-primary transition-all"
              />
            </div>
            <div className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              Showing {filteredOrders.length} sales from last 30 days
            </div>
          </div>

          {/* Orders Log */}
          <div className="flex-1 overflow-x-auto">
            {orders === undefined ? (
              <div className="flex flex-col items-center justify-center p-20 space-y-4">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant opacity-60">Loading orders...</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center p-20 space-y-3 opacity-50">
                <Receipt className="w-12 h-12 text-on-surface-variant" />
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">No orders found</p>
              </div>
            ) : (
              <table className="w-full text-left border-separate border-spacing-0">
                <thead>
                  <tr className="bg-black text-white uppercase text-[9px] tracking-widest font-black select-none">
                    <th className="px-6 py-4 border-b-2 border-outline">Ref Code</th>
                    <th className="px-6 py-4 border-b-2 border-outline">Customer</th>
                    <th className="px-6 py-4 border-b-2 border-outline">Fulfillment</th>
                    <th className="px-6 py-4 border-b-2 border-outline">Status</th>
                    <th className="px-6 py-4 border-b-2 border-outline text-right">Total</th>
                    <th className="px-6 py-4 border-b-2 border-outline text-center w-[30%]">Layout Previews</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-outline-variant/30">
                  {filteredOrders.map((order) => {
                    const statusColor = 
                      order.status === "Paid" || order.status === "paid" 
                        ? "bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400" 
                        : order.status === "Pending" || order.status === "pending"
                        ? "bg-orange-50 text-orange-700 border-orange-100 dark:bg-orange-950/20 dark:text-orange-400"
                        : "bg-red-50 text-red-700 border-red-100 dark:bg-red-950/20 dark:text-red-400";
                    
                    return (
                      <tr key={order._id} className="hover:bg-primary/5 transition-all">
                        <td className="px-6 py-4">
                          <p className="font-display text-on-surface text-sm uppercase tracking-wider font-black">
                            {order.orderCode || `#${order._id.slice(-6).toUpperCase()}`}
                          </p>
                          <p className="text-[9px] font-black text-on-surface-variant flex items-center gap-1 uppercase tracking-tighter opacity-60 mt-0.5">
                            <Clock className="w-3 h-3" /> {format(order.createdAt, "dd/MM/yyyy HH:mm")}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                              <User className="w-3.5 h-3.5" />
                            </div>
                            <span className="font-bold text-on-surface uppercase text-xs tracking-wider truncate max-w-[150px]">
                              {order.customerName || "Generic Client"}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                            order.orderType === "delivery"
                              ? "bg-primary/10 text-primary border-primary/20"
                              : "bg-surface-container-high text-on-surface-variant border-outline-variant"
                          )}>
                            {order.orderType || "dine_in"}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={cn(
                            "inline-flex items-center px-2.5 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-widest border",
                            statusColor
                          )}>
                            {order.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-mono text-sm font-black text-primary">
                            {formatCurrency(order.total)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <div className="flex items-center justify-center">
                            <button
                              onClick={() => handleOpenReceipt(order._id)}
                              className="px-4 py-2 rounded-xl bg-primary text-on-primary border-2 border-outline hover:bg-secondary transition-all font-black text-[10px] uppercase tracking-widest flex items-center gap-1.5 cursor-pointer shadow-hard-sm"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Print POS Thermal
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

        </div>

      </div>

      {/* Async Loading Overlay for fetching details */}
      {activeOrderId && selectedOrder === undefined && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="bg-surface border-2 border-outline rounded-3xl p-8 flex flex-col items-center space-y-4 shadow-hard-lg">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <p className="text-xs font-black uppercase tracking-widest text-on-surface">Fetching Order Items...</p>
          </div>
        </div>
      )}

      {/* Render selected receipt type modal */}
      {activeOrderId && selectedOrder && (
        <ThermalReceiptModal order={selectedOrder} onClose={handleClose} />
      )}

    </PageLayout>
  );
}
