"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface CancelOrderModalProps {
  orderToDelete: any;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}

export function CancelOrderModal({
  orderToDelete,
  onClose,
  onConfirm,
}: CancelOrderModalProps) {
  const [isDeletingOrder, setIsDeletingOrder] = useState(false);

  const handleDelete = async () => {
    if (isDeletingOrder) return;
    setIsDeletingOrder(true);
    try {
      await onConfirm();
    } catch (e: any) {
      if (e.message?.includes("Order not found")) {
        toast.info("Order was already removed.");
        onClose();
      } else {
        toast.error("Failed to delete sale: " + e.message);
      }
    } finally {
      setIsDeletingOrder(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-surface w-full max-w-lg rounded-[2rem] shadow-2xl p-8 border border-outline"
      >
        <div className="flex items-center gap-4 mb-4">
          <div className="w-12 h-12 rounded-xl bg-error/10 flex items-center justify-center text-error">
            <AlertCircle className="w-7 h-7" />
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-on-surface uppercase tracking-wider leading-tight">
            Cancel Transaction?
          </h2>
        </div>
        <p className="text-on-surface-variant font-medium text-xs mb-6 leading-relaxed">
          Are you sure you want to delete Order <span className="font-black text-on-surface">{orderToDelete.orderCode ?? `#${orderToDelete._id.slice(-6)}`}</span>?
          <br /><br />
          This action will <strong className="text-error font-black">restore inventory stock</strong> and remove this record permanently.
        </p>
        <div className="flex gap-4 text-xs font-black uppercase">
          <button
            onClick={onClose}
            className="flex-1 py-3.5 rounded-xl border-2 border-outline font-bold text-on-surface-variant hover:bg-surface-container-high transition-all"
          >
            Go Back
          </button>
          <button
            disabled={isDeletingOrder}
            onClick={handleDelete}
            className={`flex-1 py-3.5 rounded-xl transition-all shadow-hard active:scale-95 border-2 border-outline ${isDeletingOrder ? "bg-error/50 text-on-error cursor-not-allowed" : "bg-error text-on-error hover:bg-error/90"}`}
          >
            {isDeletingOrder ? "Deleting..." : "Delete Sale"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
