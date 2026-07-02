"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { X, CreditCard, Banknote, Smartphone, Bitcoin, ArrowRight, Save, Coins, AlertCircle, SplitSquareHorizontal, Trash2 } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  total: number;
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
  { id: "Bitcoin", icon: Bitcoin, color: "bg-yellow-600", light: "bg-surface-container-high text-on-surface-variant" },
];

export function PaymentModal({ isOpen, onClose, total, items, customerId, customerName, onSuccess }: PaymentModalProps) {
  const [selectedMethod, setSelectedMethod] = useState<string>("Cash");
  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [selectedFeeId, setSelectedFeeId] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Split payment state
  const [isSplitPayment, setIsSplitPayment] = useState(false);
  const [splitPayments, setSplitPayments] = useState<{method: string, amount: number}[]>([]);

  const createOrder = useMutation(api.orders.create);
  const { token, currentUser } = useAuth();
  const customer = useQuery(api.customers.getById, 
    (customerId && customerId !== "") ? { id: customerId as any } : "skip"
  );

  const deliveryFees = useQuery(api.deliveryFees.list, { activeOnly: true });
  const selectedFeeObj = deliveryFees?.find(f => f._id === selectedFeeId);
  const deliveryFeeAmount = orderType === "delivery" ? (selectedFeeObj?.fee ?? 0) : 0;
  const grandTotal = total + deliveryFeeAmount;

  const [amountPaid, setAmountPaid] = useState<string>(grandTotal.toString());

  // Check for active caixa session when Cash is selected
  const activeCaixaSession = useQuery(api.caixa.getActiveSession, { token });
  const hasCaixaOpen = !!activeCaixaSession;
  const hasCashPayment = isSplitPayment 
    ? splitPayments.some(p => p.method === "Cash")
    : selectedMethod === "Cash";
  const cashBlocked = hasCashPayment && !hasCaixaOpen;

  const numAmountPaid = isSplitPayment 
    ? splitPayments.reduce((sum, p) => sum + p.amount, 0)
    : parseFloat(amountPaid) || 0;
  
  const previousBalance = customer?.storeCreditBalance || 0;
  const previousDebt = previousBalance < 0 ? Math.abs(previousBalance) : 0;
  const totalDue = grandTotal + previousDebt;

  const remainingTotalDue = Math.max(0, totalDue - numAmountPaid);
  const change = numAmountPaid > totalDue ? numAmountPaid - totalDue : 0;
  const debtSettled = Math.min(previousDebt, Math.max(0, numAmountPaid - grandTotal));

  // If not split, use the selectedMethod input.
  // If split, the user's typing in `amountPaid` is just the temporary amount to add.
  const tempAmountToAdd = parseFloat(amountPaid) || 0;

  // Generic Client validation
  const isGeneric = customer?.isGeneric;
  const canCheckout = !cashBlocked && 
    (isGeneric ? numAmountPaid === grandTotal : numAmountPaid >= 0) &&
    (orderType === "pickup" || !!selectedFeeObj);

  useEffect(() => {
    if (isOpen) {
      setOrderType("pickup");
      setSelectedFeeId("");
      setIsProcessing(false);
      setIsSplitPayment(false);
      setSplitPayments([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && !isSplitPayment) {
      setAmountPaid(grandTotal.toString());
    } else if (isOpen && isSplitPayment) {
      setAmountPaid(remainingTotalDue > 0 ? remainingTotalDue.toString() : "0");
    }
  }, [isOpen, grandTotal, isSplitPayment, splitPayments.length]);

  const handleCheckout = async () => {
    if (!canCheckout) {
      if (orderType === "delivery" && !selectedFeeObj) {
        toast.error("Please select a delivery zone/fee");
        return;
      }
      toast.error(isGeneric ? "Generic Client must pay in full" : "Invalid amount");
      return;
    }

    setIsProcessing(true);
    try {
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
        paymentMethod: isSplitPayment ? "Multiple" : selectedMethod,
        amountPaid: numAmountPaid,
        splitPayments: isSplitPayment ? splitPayments : undefined,
        change,
        saveChangeAsCredit: !isGeneric && change > 0,
        cashRegisterSessionId: (hasCashPayment && activeCaixaSession) ? activeCaixaSession._id : undefined,
        userId: currentUser?.userId,
        username: currentUser?.username,
        orderType,
        deliveryFeeId: orderType === "delivery" ? (selectedFeeObj?._id as any) : undefined,
        deliveryFeeName: orderType === "delivery" ? selectedFeeObj?.name : undefined,
        deliveryFeeAmount: orderType === "delivery" ? selectedFeeObj?.fee : undefined,
      });

      // Pass the new orderId to trigger success modal
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
                {isGeneric && <span className="bg-primary/10 text-primary text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-black">Generic</span>}
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
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-surface-container-low p-5 rounded-3xl border border-outline-variant">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">Current Sale</p>
                  <p className="text-2xl font-black text-on-surface">{formatCurrency(grandTotal)}</p>
                  {orderType === "delivery" && (
                    <p className="text-[9px] font-bold text-on-surface-variant/70 mt-1 uppercase tracking-tight">
                      Food: {formatCurrency(total)} + Del: {formatCurrency(deliveryFeeAmount)}
                    </p>
                  )}
                </div>
                <div className={cn(
                  "p-5 rounded-3xl border transition-all",
                  previousDebt > 0 ? "bg-error/10 border-error/20 text-error" : "bg-green-700/10 border-green-700/20 text-green-700"
                )}>
                  <p className="text-[10px] font-black uppercase tracking-widest mb-1">
                    {previousDebt > 0 ? "Previous Debt" : "Current Credit"}
                  </p>
                  <p className="text-2xl font-black">
                    {formatCurrency(previousDebt > 0 ? previousDebt : Math.abs(previousBalance))}
                  </p>
                </div>
                <div className="bg-primary/5 p-5 rounded-3xl border border-primary/20">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Total Due</p>
                  <p className="text-2xl font-black text-primary">{formatCurrency(totalDue)}</p>
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
                    {remainingTotalDue > 0 
                      ? "Remaining Total Due" 
                      : (!isGeneric && change > 0 ? "Store Credit Added" : "Change to Return")}
                  </p>
                  <p className="text-3xl font-black">
                    {formatCurrency(Math.abs(remainingTotalDue > 0 ? remainingTotalDue : change))}
                  </p>
                </div>
                {debtSettled > 0 && (
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Debt Settling</p>
                    <p className="text-xl font-black">{formatCurrency(debtSettled)}</p>
                  </div>
                )}
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

            {/* Order Fulfillment Selection */}
            <div className="bg-surface-container-low p-5 rounded-3xl border border-outline-variant space-y-4">
              <label className="block text-xs font-black text-on-surface-variant uppercase tracking-widest ml-1">
                Order Fulfillment
              </label>
              
              <div className="flex gap-4">
                <button
                  type="button"
                  onClick={() => setOrderType("pickup")}
                  className={cn(
                    "flex-1 py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2 cursor-pointer",
                    orderType === "pickup"
                      ? "bg-primary text-on-primary border-primary shadow-hard"
                      : "bg-surface-container-lowest border-outline-variant hover:border-outline text-on-surface-variant"
                  )}
                >
                  Pickup
                </button>
                <button
                  type="button"
                  onClick={() => setOrderType("delivery")}
                  className={cn(
                    "flex-1 py-4 px-6 rounded-2xl font-black text-sm uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2 cursor-pointer",
                    orderType === "delivery"
                      ? "bg-primary text-on-primary border-primary shadow-hard"
                      : "bg-surface-container-lowest border-outline-variant hover:border-outline text-on-surface-variant"
                  )}
                >
                  Delivery
                </button>
              </div>

              {orderType === "delivery" && (
                <div className="space-y-2 animate-fadeIn">
                  <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
                    Select Delivery Zone & Fee
                  </label>
                  <select
                    value={selectedFeeId}
                    onChange={(e) => setSelectedFeeId(e.target.value)}
                    className="w-full bg-surface-container-lowest border-2 border-outline focus:border-primary rounded-2xl p-4 font-black uppercase tracking-wider text-xs outline-none transition-all cursor-pointer"
                  >
                    <option value="">-- CHOOSE A DELIVERY ZONE --</option>
                    {deliveryFees?.map((f) => (
                      <option key={f._id} value={f._id}>
                        {f.name} ({formatCurrency(f.fee)})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {/* Payment Methods Grid */}
            <div>
              <div className="flex items-center justify-between mb-4 ml-1">
                <label className="text-xs font-black text-on-surface-variant uppercase tracking-widest">
                  Select Payment Method
                </label>
                <button
                  onClick={() => {
                    setIsSplitPayment(!isSplitPayment);
                    setSplitPayments([]);
                    setAmountPaid(grandTotal.toString());
                  }}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 text-[10px] font-black uppercase tracking-wider transition-all",
                    isSplitPayment 
                      ? "bg-primary text-white border-primary" 
                      : "bg-surface text-on-surface-variant border-outline hover:border-primary/50"
                  )}
                >
                  <SplitSquareHorizontal className="w-3.5 h-3.5" />
                  Split Payment
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {PAYMENT_METHODS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => setSelectedMethod(m.id)}
                    className={cn(
                      "flex flex-col items-center justify-center gap-3 p-4 rounded-2xl border-2 transition-all relative overflow-hidden group",
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

            {/* Advanced Change Handling */}
            {change > 0 && !isGeneric && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                className="bg-green-700/10 border border-green-700/20 p-6 rounded-[2rem] flex items-center justify-between"
              >
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-green-700/10 flex items-center justify-center text-green-700 shadow-sm">
                    <Save className="w-7 h-7" />
                  </div>
                  <div>
                    <p className="font-black text-green-700 text-lg">Change Saved to Credit</p>
                    <p className="text-on-surface-variant text-sm font-medium">Customer has {formatCurrency(change)} excess which will be saved as store credit.</p>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Right: Input & Checkout */}
          <div className="w-[380px] bg-surface-container-low p-6 lg:p-8 flex flex-col overflow-y-auto">
            <div className="mb-auto space-y-8">
              <div>
                <label className="block text-xs font-black text-on-surface-variant uppercase tracking-widest mb-2">
                  {isSplitPayment ? `Add ${selectedMethod} Amount` : "Amount Received"}
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
                      if (e.key === "Enter" && isSplitPayment && tempAmountToAdd > 0) {
                        setSplitPayments(prev => [...prev, { method: selectedMethod, amount: tempAmountToAdd }]);
                        setAmountPaid("0");
                      }
                    }}
                    className="w-full bg-surface-container-lowest border-2 border-primary rounded-3xl p-4 lg:p-6 pl-16 lg:pl-20 text-right text-4xl lg:text-5xl font-black text-primary tracking-tight outline-none focus:ring-4 focus:ring-primary/20 transition-all shadow-inner"
                    placeholder="0.00"
                  />
                </div>
                {isSplitPayment && (
                  <button
                    disabled={tempAmountToAdd <= 0}
                    onClick={() => {
                      setSplitPayments(prev => [...prev, { method: selectedMethod, amount: tempAmountToAdd }]);
                      setAmountPaid("0");
                    }}
                    className="w-full mt-3 py-4 rounded-2xl font-black text-sm uppercase tracking-widest bg-surface-container-highest border-2 border-outline hover:border-primary hover:text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add {selectedMethod} Payment
                  </button>
                )}
              </div>
              
              {isSplitPayment && splitPayments.length > 0 && (
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Added Payments</label>
                  <div className="space-y-2">
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
                              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center text-white", mInfo?.color || "bg-primary")}>
                                <Icon className="w-4 h-4" />
                              </div>
                              <span className="font-bold text-sm">{p.method}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-black text-lg">{formatCurrency(p.amount)}</span>
                              <button
                                onClick={() => setSplitPayments(prev => prev.filter((_, i) => i !== idx))}
                                className="w-8 h-8 rounded-lg text-error hover:bg-error/10 flex items-center justify-center transition-colors"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                </div>
              )}

              {previousDebt > 0 && numAmountPaid > 0 && !isSplitPayment && (
                <div className="p-4 bg-primary/10 rounded-2xl border border-primary/20">
                  <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Payment Strategy</p>
                  <p className="text-sm font-bold text-on-surface-variant leading-tight">
                    {numAmountPaid >= totalDue 
                      ? `Covers full sale and settles ${formatCurrency(debtSettled)} of debt.` 
                      : `Covers ${formatCurrency(numAmountPaid)} of current sale.`}
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="space-y-4">
              <button
                disabled={!canCheckout || isProcessing}
                onClick={handleCheckout}
                className={cn(
                  "w-full py-6 rounded-[1.5rem] font-black text-2xl shadow-prominent flex items-center justify-center gap-4 transition-all",
                  !canCheckout || isProcessing
                    ? "bg-surface-dim text-on-surface-variant cursor-not-allowed"
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
              {isGeneric && numAmountPaid !== grandTotal && (
                <p className="text-center text-error font-black text-xs uppercase tracking-wider">
                  Exact payment required for Generic Client
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
