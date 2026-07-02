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

  const balance = order.customer?.storeCreditBalance || 0;
  const remainingDebt = balance < 0 ? Math.abs(balance) : 0;
  const currentCredit = balance > 0 ? balance : 0;

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
            <h2 className="text-5xl font-display text-on-surface uppercase leading-tight">Sale Completed!</h2>
            <p className="text-on-surface-variant font-black uppercase tracking-[0.2em] text-xs">
              Order {order.orderCode}
            </p>
          </div>

          {/* Financial Summary Card */}
          <div className="bg-surface-container-low rounded-lg p-8 border-2 border-outline shadow-hard space-y-6 text-left">
            <div className="flex items-center justify-between pb-4 border-b-2 border-outline-variant/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded bg-surface-container-highest flex items-center justify-center text-on-surface">
                  <User className="w-5 h-5" />
                </div>
                <span className="font-black text-on-surface uppercase tracking-wider text-sm">{order.customer?.name}</span>
              </div>
              <span className="font-display text-3xl text-primary">{formatCurrency(order.amountPaid)}</span>
            </div>

            <div className="space-y-4">
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
              <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-wider pb-3 border-b-2 border-outline-variant/50">
                <span className="text-on-surface">Order Total</span>
                <span className="text-on-surface font-display text-base">{formatCurrency(order.total)}</span>
              </div>

              {(order.debtSettled ?? 0) > 0 && (
                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                  <span className="text-on-surface-variant flex items-center gap-2">
                    <History className="w-4 h-4 text-orange-600" /> Debt Settled
                  </span>
                  <span className="text-orange-600">-{formatCurrency(order.debtSettled ?? 0)}</span>
                </div>
              )}
              
              {(order.storeCreditAdded ?? 0) > 0 && (
                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                  <span className="text-on-surface-variant flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-green-700" /> Credit Added
                  </span>
                  <span className="text-green-700">+{formatCurrency(order.storeCreditAdded ?? 0)}</span>
                </div>
              )}

              {order.change > 0 && (
                <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
                  <span className="text-on-surface-variant flex items-center gap-2">
                    <Coins className="w-4 h-4 text-blue-600" /> Change Returned
                  </span>
                  <span className="text-blue-600">{formatCurrency(order.change)}</span>
                </div>
              )}

              <div className={cn(
                "pt-4 border-t-2 border-outline-variant/50 flex justify-between items-center",
                remainingDebt > 0 ? "text-error" : "text-green-700"
              )}>
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-60">
                  {remainingDebt > 0 ? "Remaining Debt" : "Account Credit"}
                </span>
                <span className="text-3xl font-display">
                  {formatCurrency(remainingDebt > 0 ? remainingDebt : currentCredit)}
                </span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 gap-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => {
                  setShowReceipt(true);
                  setIsKitchen(false);
                }}
                className="py-4 rounded-lg bg-surface-container-highest text-on-surface font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-primary hover:text-on-primary transition-all active:scale-[0.98] border-2 border-outline shadow-hard"
              >
                <Printer className="w-4 h-4" />
                Print Receipt
              </button>
              <button
                onClick={() => {
                  setShowReceipt(true);
                  setIsKitchen(true);
                }}
                className="py-4 rounded-lg bg-surface-container-highest text-on-surface font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-primary hover:text-on-primary transition-all active:scale-[0.98] border-2 border-outline shadow-hard"
              >
                <span>🍗</span>
                Print Kitchen Ticket
              </button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={onViewDetails}
                className="py-4 rounded-lg bg-surface border-2 border-outline font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 hover:bg-surface-container-high transition-all active:scale-[0.98] shadow-hard"
              >
                <Receipt className="w-5 h-5" />
                View Details
              </button>
              <button
                onClick={onNewSale}
                className="py-4 rounded-lg bg-primary text-on-primary border-2 border-outline font-black uppercase tracking-widest text-[10px] flex items-center justify-center gap-2 shadow-hard hover:scale-[1.02] transition-all active:scale-[0.98]"
              >
                <PlusCircle className="w-5 h-5" />
                New Sale
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
