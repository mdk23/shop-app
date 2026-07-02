"use client";

import React, { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { X, Trash2, Edit2, Plus, Check } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

function formatCurrency(amount: number) {
  return amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + " MT";
}

export default function ManagePaymentsModal({
  order,
  onClose,
}: {
  order: any;
  onClose: () => void;
}) {
  const payments = useQuery(api.payments.listByOrder, { orderId: order._id });
  const addPayment = useMutation(api.payments.add);
  const updatePayment = useMutation(api.payments.update);
  const removePayment = useMutation(api.payments.remove);

  const [isAdding, setIsAdding] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<Id<"payments"> | null>(null);

  const [formAmount, setFormAmount] = useState("");
  const [formMethod, setFormMethod] = useState("Cash");

  const handleAddSubmit = async () => {
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Invalid amount");
      return;
    }
    try {
      await addPayment({
        orderId: order._id,
        amount: amt,
        method: formMethod,
      });
      toast.success("Payment added");
      setIsAdding(false);
      setFormAmount("");
    } catch (e: any) {
      toast.error(e.message || "Failed to add payment");
    }
  };

  const handleUpdateSubmit = async () => {
    if (!editingPaymentId) return;
    const amt = parseFloat(formAmount);
    if (isNaN(amt) || amt <= 0) {
      toast.error("Invalid amount");
      return;
    }
    try {
      await updatePayment({
        paymentId: editingPaymentId,
        amount: amt,
        method: formMethod,
      });
      toast.success("Payment updated");
      setEditingPaymentId(null);
      setFormAmount("");
    } catch (e: any) {
      toast.error(e.message || "Failed to update payment");
    }
  };

  const handleDelete = async (paymentId: Id<"payments">) => {
    toast("Are you sure you want to delete this payment?", {
      action: {
        label: "Yes, Delete",
        onClick: async () => {
          try {
            await removePayment({ paymentId });
            toast.success("Payment removed");
          } catch (e: any) {
            toast.error(e.message || "Failed to remove payment");
          }
        },
      },
      duration: 5000,
      position: "top-center"
    });
  };

  const startEdit = (p: any) => {
    setEditingPaymentId(p._id);
    setFormAmount(p.amount.toString());
    setFormMethod(p.method);
    setIsAdding(false);
  };

  const totalPaid = payments?.reduce((acc, p) => acc + p.amount, 0) || 0;
  const remaining = Math.max(0, order.total - totalPaid);

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-surface w-full max-w-lg rounded-[2rem] shadow-2xl overflow-hidden border border-outline flex flex-col max-h-[90vh]"
      >
        <div className="px-6 py-4 border-b border-outline bg-surface-container-low flex justify-between items-center">
          <div>
            <h2 className="text-lg font-black text-on-surface uppercase tracking-wider">
              Manage Payments
            </h2>
            <p className="text-[10px] font-bold text-on-surface-variant opacity-70 uppercase">
              Order {order.orderCode || `#${order._id.slice(-6).toUpperCase()}`} • Total: {formatCurrency(order.total)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container-highest flex items-center justify-center hover:bg-error hover:text-on-error transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="flex justify-between items-center px-4 py-3 bg-surface-container-high rounded-xl border border-outline-variant shadow-soft">
            <div className="flex flex-col">
              <span className="text-[10px] uppercase font-black tracking-wider text-on-surface-variant">Remaining Balance</span>
              <span className="text-error font-display text-lg">{formatCurrency(remaining)}</span>
            </div>
            <div className="flex flex-col text-right">
              <span className="text-[10px] uppercase font-black tracking-wider text-on-surface-variant">Total Paid</span>
              <span className="text-green-500 font-display text-lg">{formatCurrency(totalPaid)}</span>
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-black text-on-surface uppercase tracking-widest">
                Payment History
              </h3>
              {!isAdding && !editingPaymentId && (
                <button
                  onClick={() => {
                    setIsAdding(true);
                    setFormAmount(remaining > 0 ? remaining.toString() : "0");
                    setFormMethod("Cash");
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-on-primary text-[10px] font-black uppercase tracking-widest rounded-lg hover:brightness-110 transition-all shadow-hard-sm active:scale-95"
                >
                  <Plus className="w-3 h-3" /> Add Payment
                </button>
              )}
            </div>

            {!payments ? (
              <div className="text-center py-6 text-[10px] text-on-surface-variant/40 font-black uppercase">Loading...</div>
            ) : payments.length === 0 ? (
              <div className="text-center py-6 text-[10px] text-on-surface-variant/40 font-black uppercase tracking-wider border-2 border-dashed border-outline-variant/30 rounded-xl">
                No payments recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {payments.map((p: any) => (
                  <div key={p._id} className="flex flex-col gap-2 p-3 border-2 border-outline-variant/50 rounded-xl bg-surface hover:border-primary/30 transition-all group">
                    {editingPaymentId === p._id ? (
                      <div className="flex items-end gap-3 w-full">
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-wider text-on-surface-variant pl-1">Amount</label>
                          <input
                            type="number"
                            value={formAmount}
                            onChange={(e) => setFormAmount(e.target.value)}
                            className="w-full bg-surface-container-high border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary text-xs font-bold"
                          />
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] font-black uppercase tracking-wider text-on-surface-variant pl-1">Method</label>
                          <select
                            value={formMethod}
                            onChange={(e) => setFormMethod(e.target.value)}
                            className="w-full bg-surface-container-high border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary text-xs font-bold uppercase"
                          >
                            <option value="Cash">Cash</option>
                            <option value="M-Pesa">M-Pesa</option>
                            <option value="POS">POS / Card</option>
                            <option value="E-Mola">E-Mola</option>
                            <option value="Uber Eats">Uber Eats</option>
                            <option value="Glovo">Glovo</option>
                          </select>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={handleUpdateSubmit} className="h-[38px] px-3 bg-green-500 text-white rounded-xl shadow-hard-sm active:scale-95 transition-all">
                            <Check className="w-4 h-4" />
                          </button>
                          <button onClick={() => setEditingPaymentId(null)} className="h-[38px] px-3 bg-surface-container-highest text-on-surface-variant rounded-xl active:scale-95 transition-all">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-center">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm uppercase">{p.method}</span>
                          </div>
                          <p className="text-[9px] font-black uppercase text-on-surface-variant opacity-60">
                            {new Date(p.createdAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-display text-primary text-lg">{formatCurrency(p.amount)}</span>
                          <div className="flex items-center gap-1 transition-opacity">
                            <button onClick={() => startEdit(p)} className="p-1.5 rounded-lg hover:bg-surface-container-highest text-on-surface-variant transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(p._id)} className="p-1.5 rounded-lg hover:bg-error/10 text-error transition-colors">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <AnimatePresence>
            {isAdding && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-primary/5 border-2 border-primary/20 rounded-xl space-y-4">
                  <h4 className="text-[10px] font-black uppercase text-primary tracking-widest flex items-center justify-between">
                    <span>New Payment Details</span>
                    <button onClick={() => setIsAdding(false)} className="text-on-surface-variant hover:text-error"><X className="w-4 h-4" /></button>
                  </h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-on-surface-variant pl-1">Amount</label>
                      <input
                        type="number"
                        value={formAmount}
                        onChange={(e) => setFormAmount(e.target.value)}
                        className="w-full bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary text-xs font-bold"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black uppercase tracking-wider text-on-surface-variant pl-1">Method</label>
                      <select
                        value={formMethod}
                        onChange={(e) => setFormMethod(e.target.value)}
                        className="w-full bg-surface border-2 border-outline rounded-xl px-3 py-2 outline-none focus:border-primary text-xs font-bold uppercase"
                      >
                        <option value="Cash">Cash</option>
                        <option value="M-Pesa">M-Pesa</option>
                        <option value="POS">POS / Card</option>
                        <option value="E-Mola">E-Mola</option>
                        <option value="Uber Eats">Uber Eats</option>
                        <option value="Glovo">Glovo</option>
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={handleAddSubmit}
                    className="w-full h-10 bg-primary text-on-primary rounded-xl font-black uppercase text-[10px] tracking-widest shadow-hard-sm active:scale-95 transition-all"
                  >
                    Save Payment
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
