"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { X, CreditCard, Banknote, Smartphone, ArrowRight, Trash2, AlertCircle, Plus } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useBranch } from "@/contexts/BranchContext";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
  orderType: "pickup" | "delivery";
  selectedFeeId?: string;
  items: any[];
  customerId: string;
  customerName: string;
  onSuccess: (orderId: string) => void;
}

const PAYMENT_METHODS = [
  { id: "Cash", icon: Banknote, color: "bg-green-600", light: "bg-surface-container-high text-on-surface-variant" },
  { id: "POS", icon: CreditCard, color: "bg-blue-600", light: "bg-surface-container-high text-on-surface-variant" },
  { id: "M-Pesa", icon: Smartphone, color: "bg-red-600", light: "bg-surface-container-high text-on-surface-variant" },
  { id: "eMola", icon: Smartphone, color: "bg-orange-600", light: "bg-surface-container-high text-on-surface-variant" },
  { id: "BIM", icon: CreditCard, color: "bg-blue-800", light: "bg-surface-container-high text-on-surface-variant" },
  { id: "Moza", icon: CreditCard, color: "bg-zinc-700", light: "bg-surface-container-high text-on-surface-variant" },
];

export function PaymentModal({ isOpen, onClose, total, orderType, selectedFeeId, items, customerId, customerName, onSuccess }: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<string>("Cash");
  const [isProcessing, setIsProcessing] = useState(false);

  // Added payment entries (for multi-method payments)
  const [splitPayments, setSplitPayments] = useState<{ method: string; amount: number }[]>([]);

  const createOrder = useMutation(api.orders.create);
  const { token, currentUser } = useAuth();
  const { selectedBranchId, activeBranches } = useBranch();
  
  const deliveryFees = useQuery(api.deliveryFees.list, { activeOnly: true });
  const selectedFeeObj = deliveryFees?.find(f => f._id === selectedFeeId);
  const deliveryFeeAmount = orderType === "delivery" ? (selectedFeeObj?.fee ?? 0) : 0;
  const grandTotal = total + deliveryFeeAmount;

  const [amountPaid, setAmountPaid] = useState<string>(grandTotal.toString());

  const sumAddedPayments = splitPayments.reduce((sum, p) => sum + p.amount, 0);
  const inputAmountNum = parseFloat(amountPaid) || 0;

  // Build effective payment list
  let finalPayments: { method: string; amount: number }[] = [...splitPayments];
  if (splitPayments.length === 0) {
    finalPayments = [{ method: selectedMethod, amount: inputAmountNum }];
  } else if (inputAmountNum > 0 && sumAddedPayments < grandTotal) {
    finalPayments.push({ method: selectedMethod, amount: inputAmountNum });
  }

  const isSplitPayment = finalPayments.length > 1;

  const numAmountPaid = splitPayments.length > 0
    ? sumAddedPayments + (inputAmountNum > 0 && sumAddedPayments < grandTotal ? inputAmountNum : 0)
    : inputAmountNum;

  const remainingTotalDue = Math.max(0, grandTotal - sumAddedPayments);
  const change = numAmountPaid > grandTotal ? numAmountPaid - grandTotal : 0;

  // Check for active caixa session
  const activeCaixaSession = useQuery(api.caixa.getActiveSession, { token });
  const hasCaixaOpen = !!activeCaixaSession;
  const hasCashPayment = finalPayments.some(p => p.method === "Cash");
  const cashBlocked = hasCashPayment && !hasCaixaOpen;

  const canCheckout = !cashBlocked && 
    numAmountPaid >= grandTotal &&
    (orderType === "pickup" || !!selectedFeeObj);

  useEffect(() => {
    if (isOpen) {
      setIsProcessing(false);
      setSplitPayments([]);
      setSelectedMethod("Cash");
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      const remaining = grandTotal - sumAddedPayments;
      setAmountPaid(remaining > 0 ? remaining.toString() : "0");
    }
  }, [isOpen, grandTotal, sumAddedPayments]);

  const handleAddPartialPayment = () => {
    if (inputAmountNum <= 0) return;
    setSplitPayments(prev => [...prev, { method: selectedMethod, amount: inputAmountNum }]);
    const newSum = sumAddedPayments + inputAmountNum;
    const newRemaining = Math.max(0, grandTotal - newSum);
    setAmountPaid(newRemaining > 0 ? newRemaining.toString() : "0");
  };

  const handleCheckout = async () => {
    if (!canCheckout) {
      if (orderType === "delivery" && !selectedFeeObj) {
        toast.error("Please select a delivery zone/fee");
        return;
      }
      if (numAmountPaid < grandTotal) {
        toast.error("Full payment is required.");
        return;
      }
      toast.error("Invalid amount or payment blocked.");
      return;
    }

    setIsProcessing(true);
    try {
      let targetBranchId: string | undefined = undefined;
      if (selectedBranchId && selectedBranchId !== "all") {
        targetBranchId = selectedBranchId;
      } else if (activeBranches && activeBranches.length > 0) {
        const defaultBranch = activeBranches.find((b: any) => b.isDefault) || activeBranches[0];
        targetBranchId = defaultBranch?._id;
      }

      const orderId = await createOrder({
        items: items.map(i => ({ 
          dishId: i.dishId, 
          quantity: i.quantity, 
          priceAtTime: i.price,
          modifiers: i.modifiers,
          comboSelections: i.comboSelections,
        })),
        total: grandTotal,
        customerId: customerId as any,
        paymentMethod: isSplitPayment ? "Multiple" : finalPayments[0].method,
        amountPaid: numAmountPaid,
        splitPayments: isSplitPayment ? finalPayments : undefined,

        cashRegisterSessionId: (hasCashPayment && activeCaixaSession) ? activeCaixaSession._id : undefined,
        userId: currentUser?.userId,
        username: currentUser?.username,
        orderType,
        deliveryFeeId: orderType === "delivery" ? (selectedFeeObj?._id as any) : undefined,
        deliveryFeeName: orderType === "delivery" ? selectedFeeObj?.name : undefined,
        deliveryFeeAmount: orderType === "delivery" ? selectedFeeObj?.fee : undefined,
        branchId: targetBranchId as any,
      });

      onSuccess(orderId as string);
    } catch (error: any) {
      toast.error(error.message || "Checkout failed");
    } finally {
      setIsProcessing(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 lg:p-8 bg-background/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-surface-container-lowest border border-outline-variant rounded-[2rem] shadow-prominent w-full max-w-5xl h-full max-h-[850px] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 lg:p-8 border-b border-outline-variant flex items-center justify-between bg-primary/5">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-on-primary shadow-soft">
              <Banknote className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black text-on-surface">Complete Sale</h2>
              <p className="text-on-surface-variant font-medium flex items-center gap-2">
                Customer: <span className="text-primary font-bold">{customerName}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center hover:bg-surface-container-high rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Left: Payment Methods & Details */}
          <div className="flex-1 p-6 lg:p-8 overflow-y-auto space-y-8 border-r border-outline-variant">
            {/* Financial Summary */}
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-surface-container-low p-5 rounded-3xl border border-outline-variant">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Current Sale</p>
                  <p className="text-2xl font-black text-on-surface">{formatCurrency(grandTotal)}</p>
                  {orderType === "delivery" && (
                    <p className="text-[9px] font-bold text-on-surface-variant/70 mt-1 uppercase tracking-tight">
                      Food: {formatCurrency(total)} + Del: {formatCurrency(deliveryFeeAmount)}
                    </p>
                  )}
                </div>
                <div className="bg-primary/5 p-5 rounded-3xl border border-primary/20">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Total Due</p>
                  <p className="text-2xl font-black text-primary">{formatCurrency(grandTotal)}</p>
                </div>
              </div>

              <div className={cn(
                "p-6 rounded-3xl border transition-all flex items-center justify-between",
                remainingTotalDue > 0 
                  ? "bg-primary/10 border-primary/20 text-primary" 
                  : change > 0 
                    ? "bg-green-700/10 border-green-700/20 text-green-700"
                    : "bg-surface-container-high border-outline-variant text-on-surface"
              )}>
                <div>
                  <p className="text-xs font-black uppercase tracking-widest opacity-70 mb-1">
                    {remainingTotalDue > 0 ? "Remaining Total Due" : "Change to Return"}
                  </p>
                  <p className="text-3xl font-black">
                    {formatCurrency(Math.abs(remainingTotalDue > 0 ? remainingTotalDue : change))}
                  </p>
                </div>
              </div>
            </div>

            {/* Cash Register Warning */}
            {cashBlocked && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-2xl"
              >
                <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
                <div>
                  <p className="font-black text-error text-sm">No Open Cash Register</p>
                  <p className="text-on-surface-variant text-xs font-bold mt-0.5">
                    You must open a cash register before accepting cash payments. Go to Caixa to open one.
                  </p>
                </div>
              </motion.div>
            )}

            {/* Payment Methods Grid */}
            <div>
              <div className="flex items-center justify-between mb-4 ml-1">
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest">
                  Select Payment Method
                </label>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMethod(m.id)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all relative overflow-hidden group cursor-pointer",
                      selectedMethod === m.id
                        ? "border-primary bg-primary/5 shadow-hard ring-1 ring-primary"
                        : "border-outline-variant bg-surface-container-lowest hover:border-primary/50"
                    )}
                  >
                    <div className={cn(
                      "w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110",
                      selectedMethod === m.id ? m.color + " text-white shadow-soft" : m.light
                    )}>
                      <m.icon className="w-5 h-5" />
                    </div>
                    <span className={cn(
                      "font-black text-xs",
                      selectedMethod === m.id ? "text-primary" : "text-on-surface"
                    )}>
                      {m.id}
                    </span>
                    {selectedMethod === m.id && (
                      <motion.div 
                        layoutId="active-method"
                        className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-primary"
                      />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right: Input & Checkout */}
          <div className="w-[380px] bg-surface-container-low p-6 lg:p-8 flex flex-col overflow-y-auto">
            <div className="mb-auto space-y-6">
              <div>
                <label className="block text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  {splitPayments.length > 0 ? `Amount for ${selectedMethod}` : "Amount Received"}
                </label>
                <div className="relative">
                  <span className="absolute left-4 lg:left-6 top-1/2 -translate-y-1/2 text-xl lg:text-2xl font-black text-on-surface-variant opacity-30 pointer-events-none">MT</span>
                  <input
                    type="number"
                    autoFocus
                    min="0"
                    step="0.01"
                    value={amountPaid}
                    onChange={(e) => setAmountPaid(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        if (remainingTotalDue > 0 && inputAmountNum > 0 && inputAmountNum < remainingTotalDue) {
                          handleAddPartialPayment();
                        } else if (canCheckout) {
                          handleCheckout();
                        }
                      }
                    }}
                    className="w-full bg-surface-container-lowest border-2 border-primary rounded-3xl p-4 lg:p-6 pl-16 lg:pl-20 text-right text-4xl lg:text-5xl font-black text-primary tracking-tight outline-none focus:ring-4 focus:ring-primary/20 transition-all shadow-inner"
                    placeholder="0.00"
                  />
                </div>

                {/* Button to add another payment method portion if splitting across methods */}
                {inputAmountNum > 0 && inputAmountNum < remainingTotalDue && (
                  <button
                    type="button"
                    onClick={handleAddPartialPayment}
                    className="w-full mt-3 py-3 rounded-2xl font-black text-xs uppercase tracking-wider bg-surface-container-highest border-2 border-outline hover:border-primary hover:text-primary transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                  >
                    <Plus className="w-4 h-4 text-primary" />
                    Add {selectedMethod} ({formatCurrency(inputAmountNum)}) & Choose Another Method
                  </button>
                )}
              </div>
              
              {splitPayments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Added Payments ({splitPayments.length})</label>
                    <button
                      type="button"
                      onClick={() => setSplitPayments([])}
                      className="text-[9px] font-bold text-error hover:underline uppercase tracking-wider"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    <AnimatePresence>
                      {splitPayments.map((p, idx) => {
                        const mInfo = PAYMENT_METHODS.find(m => m.id === p.method);
                        const Icon = mInfo?.icon || Banknote;
                        return (
                          <motion.div
                            key={idx}
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -20 }}
                            className="flex items-center justify-between p-3 rounded-xl bg-surface border border-outline-variant shadow-sm"
                          >
                            <div className="flex items-center gap-3">
                              <div className={cn("w-7 h-7 rounded-lg flex items-center justify-center text-white", mInfo?.color || "bg-primary")}>
                                <Icon className="w-3.5 h-3.5" />
                              </div>
                              <span className="font-bold text-xs">{p.method}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-black text-sm text-primary">{formatCurrency(p.amount)}</span>
                              <button
                                type="button"
                                onClick={() => setSplitPayments(prev => prev.filter((_, i) => i !== idx))}
                                className="w-7 h-7 rounded-lg text-error hover:bg-error/10 flex items-center justify-center transition-colors cursor-pointer"
                                title="Remove payment"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-4 pt-4">
              <button
                disabled={!canCheckout || isProcessing}
                onClick={handleCheckout}
                className={cn(
                  "w-full py-6 rounded-[1.5rem] font-black text-2xl shadow-prominent flex items-center justify-center gap-4 transition-all cursor-pointer",
                  !canCheckout || isProcessing
                    ? "bg-surface-dim text-on-surface-variant cursor-not-allowed opacity-60"
                    : "bg-primary text-on-primary hover:bg-secondary hover:scale-[1.02] active:scale-[0.98]"
                )}
              >
                {isProcessing ? (
                  <div className="w-8 h-8 border-4 border-on-primary/30 border-t-on-primary rounded-full animate-spin" />
                ) : (
                  <>
                    Confirm Sale
                    <ArrowRight className="w-8 h-8" />
                  </>
                )}
              </button>
              {numAmountPaid < grandTotal && (
                <p className="text-center text-error font-black text-xs uppercase tracking-wider">
                  Full payment required ({formatCurrency(remainingTotalDue)} remaining)
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
