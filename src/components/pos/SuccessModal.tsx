"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency, cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { 
  CheckCircle2, 
  Printer, 
  PlusCircle, 
  Receipt, 
  User, 
  ArrowRight,
  Wallet,
  Coins,
  History
} from "lucide-react";
import { useState } from "react";
import { ThermalReceiptModal } from "./ReceiptModal";

interface SuccessModalProps {
  isOpen: boolean;
  orderId: string | null;
  onNewSale: () => void;
  onViewDetails: () => void;
}

export function SuccessModal({ isOpen, orderId, onNewSale, onViewDetails }: SuccessModalProps) {
  const order = useQuery(api.orders.getById, orderId ? { id: orderId as any } : "skip");
  const [showReceipt, setShowReceipt] = useState(false);
  const [isKitchen, setIsKitchen] = useState(false);

  if (!isOpen || !order) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-background/80 backdrop-blur-xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 40 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 40 }}
        className="bg-surface border-4 border-outline rounded-lg shadow-hard-lg w-full max-w-lg overflow-hidden"
      >
        <div className="p-8 text-center space-y-6">
          {/* Success Icon */}
          <div className="relative inline-block">
            <div className="w-24 h-24 rounded-lg bg-primary border-2 border-outline shadow-hard flex items-center justify-center text-on-primary mx-auto relative z-10">
              <CheckCircle2 className="w-12 h-12" />
            </div>
          </div>

          <div className="space-y-2">
            <h2 className="text-4xl lg:text-5xl font-display text-on-surface uppercase leading-tight">
              {order.status === "Pending" ? "Pending Order Saved!" : order.status === "Partially Paid" ? "Partial Payment Saved!" : "Sale Completed!"}
            </h2>
            <div className="flex items-center justify-center gap-3">
              <p className="text-on-surface-variant font-black uppercase tracking-[0.2em] text-xs">
                Order {order.orderCode}
              </p>
              <span className={cn(
                "px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                order.status === "Paid" ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30" :
                order.status === "Partially Paid" ? "bg-blue-500/10 text-blue-600 border-blue-500/30" :
                "bg-amber-500/10 text-amber-600 border-amber-500/30"
              )}>
                {order.status === "Paid" ? "Paid" : order.status === "Partially Paid" ? "Partially Paid" : "Pending Payment"}
              </span>
            </div>
          </div>

          {/* Active Orders Banner */}
          <div className="p-3 bg-primary/10 border-2 border-primary/30 rounded-xl flex items-center justify-between text-xs font-black uppercase tracking-wider text-primary">
            <span className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
              Sent to Active Orders Pipeline
            </span>
            <a href="/active-orders" target="_blank" rel="noopener noreferrer" className="hover:underline flex items-center gap-1 text-[10px]">
              Active Orders →
            </a>
          </div>

          {/* Financial Summary Card */}
          <div className="bg-surface-container-low rounded-lg p-6 border-2 border-outline shadow-hard space-y-4 text-left">
            <div className="flex items-center justify-between pb-4 border-b-2 border-outline-variant/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-surface-container-highest flex items-center justify-center text-on-surface">
                  <User className="w-5 h-5" />
                </div>
                <span className="font-black text-on-surface uppercase tracking-wider text-sm">{order.customer?.name}</span>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Amount Paid</p>
                <span className="font-display text-2xl text-primary">{formatCurrency(order.amountPaid)}</span>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider pb-2 border-b border-dashed border-outline-variant/30">
                <span className="text-on-surface-variant">Food Subtotal</span>
                <span>{formatCurrency(order.total - (order.deliveryFeeAmount ?? 0))}</span>
              </div>
              {order.orderType === "delivery" && (
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider pb-2 border-b border-dashed border-outline-variant/30">
                  <span className="text-on-surface-variant">Delivery Fee</span>
                  <span className="text-primary">{formatCurrency(order.deliveryFeeAmount ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider pb-2 border-b border-outline-variant/50">
                <span className="text-on-surface">Order Total</span>
                <span className="text-on-surface font-display text-base">{formatCurrency(order.total)}</span>
              </div>
              {order.total - order.amountPaid > 0 && (
                <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider text-amber-600 font-bold">
                  <span>Balance Due</span>
                  <span>{formatCurrency(order.total - order.amountPaid)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 gap-3">
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => {
                  setShowReceipt(true);
                  setIsKitchen(false);
                }}
                className="py-3.5 rounded-lg bg-surface-container-highest text-on-surface font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-surface-container-high transition-all active:scale-[0.98] border-2 border-outline shadow-hard cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                Customer Receipt
              </button>
              <button
                onClick={() => {
                  setShowReceipt(true);
                  setIsKitchen(true);
                }}
                className="py-3.5 rounded-lg bg-primary text-on-primary font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-secondary transition-all active:scale-[0.98] border-2 border-outline shadow-hard cursor-pointer"
              >
                <span>🍗</span>
                Print Kitchen Ticket
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onViewDetails}
                className="py-3.5 rounded-lg bg-surface border-2 border-outline font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-surface-container-high transition-all active:scale-[0.98] shadow-hard cursor-pointer"
              >
                <Receipt className="w-4 h-4" />
                View Details
              </button>
              <button
                onClick={onNewSale}
                className="py-3.5 rounded-lg bg-emerald-600 text-white border-2 border-outline font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-hard hover:bg-emerald-700 transition-all active:scale-[0.98] cursor-pointer"
              >
                <PlusCircle className="w-4 h-4" />
                New Order
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {showReceipt && (
        <ThermalReceiptModal
          order={order}
          isKitchenTicket={isKitchen}
          onClose={() => setShowReceipt(false)}
        />
      )}
    </div>
  );
}
