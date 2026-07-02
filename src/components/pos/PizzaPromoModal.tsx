"use client";

import { useState, useEffect } from "react";
import { X, Check, Pizza as PizzaIcon, Plus, Minus, Sparkles, ChevronRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

const PROMO_PRICE = 1000;

interface PizzaPromoModalProps {
  isOpen: boolean;
  onClose: () => void;
  allDishes: any[];
  pizzaPromoDishId: string; // the _id of the "Pizza Promo" sentinel dish
  onConfirm: (item: {
    dishId: any;
    name: string;
    price: number;
    quantity: number;
    comboSelections: { category: string; dishId: any; name: string; extraCharge: number }[];
  }) => void;
}

export function PizzaPromoModal({
  isOpen,
  onClose,
  allDishes,
  pizzaPromoDishId,
  onConfirm,
}: PizzaPromoModalProps) {
  const [pizza1, setPizza1] = useState<any | null>(null);
  const [pizza2, setPizza2] = useState<any | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [activeSlot, setActiveSlot] = useState<1 | 2>(1);

  // Filter available pizzas (exclude the sentinel "Pizza Promo" dish)
  const pizzaOptions = allDishes.filter(
    (d) =>
      (d.category === "Pizza" || d.name.toLowerCase().includes("pizza")) &&
      d._id !== pizzaPromoDishId &&
      d.isActive !== false
  );

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setPizza1(null);
      setPizza2(null);
      setQuantity(1);
      setActiveSlot(1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isComplete = pizza1 !== null && pizza2 !== null;

  const handlePizzaSelect = (pizza: any) => {
    if (activeSlot === 1) {
      setPizza1(pizza);
      // Auto-advance to slot 2
      if (!pizza2) {
        setTimeout(() => setActiveSlot(2), 150);
      }
    } else {
      setPizza2(pizza);
    }
  };

  const handleConfirm = () => {
    if (!pizza1 || !pizza2) return;
    onConfirm({
      dishId: pizzaPromoDishId,
      name: "Pizza Promo",
      price: PROMO_PRICE,
      quantity,
      comboSelections: [
        { category: "Pizza Promo", dishId: pizza1._id, name: pizza1.name, extraCharge: 0 },
        { category: "Pizza Promo", dishId: pizza2._id, name: pizza2.name, extraCharge: 0 },
      ],
    });
  };

  const totalPrice = PROMO_PRICE * quantity;

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 lg:p-6 bg-black/75 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.93, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.93, y: 16 }}
        transition={{ type: "spring", stiffness: 400, damping: 32 }}
        className="bg-surface-container-lowest border border-outline-variant rounded-[2rem] shadow-prominent w-full max-w-3xl max-h-[92vh] overflow-hidden flex flex-col"
      >
        {/* ── Header ── */}
        <div className="p-5 border-b border-outline-variant flex items-center justify-between bg-primary/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-on-primary shadow-soft">
              <PizzaIcon className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-black text-on-surface leading-tight">Pizza Promo</h2>
              <p className="text-[10px] font-black text-primary uppercase tracking-[0.2em]">
                Any 2 Pizzas — 1 000 MT
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-surface-container-high rounded-full transition-colors text-on-surface-variant"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto p-5 lg:p-6 space-y-6 custom-scrollbar">

          {/* Slot indicators */}
          <div className="grid grid-cols-2 gap-3">
            {/* Slot 1 */}
            <button
              onClick={() => setActiveSlot(1)}
              className={cn(
                "relative p-4 rounded-2xl border-2 text-left transition-all",
                activeSlot === 1
                  ? "border-primary bg-primary/5 shadow-hard"
                  : pizza1
                  ? "border-green-500/60 bg-green-500/5"
                  : "border-outline-variant bg-surface-container-low"
              )}
            >
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest block mb-1",
                activeSlot === 1 ? "text-primary" : "text-on-surface-variant/60"
              )}>
                Pizza 1
              </span>
              {pizza1 ? (
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-on-surface leading-tight">{pizza1.name}</span>
                  {activeSlot !== 1 && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              ) : (
                <span className="font-bold text-on-surface-variant/40 text-sm italic">Tap to select…</span>
              )}
              {activeSlot === 1 && (
                <div className="absolute -bottom-0.5 left-4 right-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>

            {/* Slot 2 */}
            <button
              onClick={() => setActiveSlot(2)}
              className={cn(
                "relative p-4 rounded-2xl border-2 text-left transition-all",
                activeSlot === 2
                  ? "border-primary bg-primary/5 shadow-hard"
                  : pizza2
                  ? "border-green-500/60 bg-green-500/5"
                  : "border-outline-variant bg-surface-container-low"
              )}
            >
              <span className={cn(
                "text-[10px] font-black uppercase tracking-widest block mb-1",
                activeSlot === 2 ? "text-primary" : "text-on-surface-variant/60"
              )}>
                Pizza 2
              </span>
              {pizza2 ? (
                <div className="flex items-center gap-2">
                  <span className="font-black text-sm text-on-surface leading-tight">{pizza2.name}</span>
                  {activeSlot !== 2 && (
                    <div className="ml-auto w-5 h-5 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                      <Check className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              ) : (
                <span className="font-bold text-on-surface-variant/40 text-sm italic">Tap to select…</span>
              )}
              {activeSlot === 2 && (
                <div className="absolute -bottom-0.5 left-4 right-4 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          </div>

          {/* Active slot label */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">
              Selecting Pizza {activeSlot}
            </span>
            <ChevronRight className="w-3.5 h-3.5 text-primary" />
            <span className="text-[10px] font-bold text-primary/80">tap a pizza below</span>
          </div>

          {/* Pizza grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {pizzaOptions.length === 0 && (
              <p className="col-span-full text-sm font-bold text-on-surface-variant/40 italic py-8 text-center">
                No pizzas found in the database. Add dishes in the Pizza category first.
              </p>
            )}
            {pizzaOptions.map((pizza) => {
              const isSlot1 = pizza1?._id === pizza._id && activeSlot === 1;
              const isSlot2 = pizza2?._id === pizza._id && activeSlot === 2;
              const isActiveSelection = isSlot1 || isSlot2;

              // Show checkmark badges when both slots assigned this pizza
              const slot1Match = pizza1?._id === pizza._id;
              const slot2Match = pizza2?._id === pizza._id;

              return (
                <motion.button
                  key={pizza._id}
                  whileTap={{ scale: 0.94 }}
                  onClick={() => handlePizzaSelect(pizza)}
                  className={cn(
                    "relative p-4 rounded-2xl border-2 text-left transition-all flex flex-col gap-2 min-h-[100px] group",
                    isActiveSelection
                      ? "border-primary bg-primary/8 shadow-hard ring-2 ring-primary/30"
                      : "border-outline-variant bg-surface-container-lowest hover:border-primary/50 hover:bg-primary/3"
                  )}
                >
                  {/* Pizza image thumbnail */}
                  {pizza.imageUrl && (
                    <div className="w-full aspect-[3/2] rounded-xl overflow-hidden bg-surface-container-low border border-outline-variant/30 mb-1">
                      <img
                        src={pizza.imageUrl}
                        alt={pizza.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    </div>
                  )}

                  <span
                    className={cn(
                      "font-black text-sm leading-tight",
                      isActiveSelection ? "text-primary" : "text-on-surface"
                    )}
                  >
                    {pizza.name}
                  </span>

                  <span className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-wider">
                    {formatCurrency(pizza.price)} each
                  </span>

                  {/* Slot badges */}
                  <div className="absolute top-2 right-2 flex flex-col gap-1">
                    {slot1Match && (
                      <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-soft">
                        <span className="text-[8px] font-black text-on-primary">1</span>
                      </div>
                    )}
                    {slot2Match && (
                      <div className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center shadow-soft">
                        <span className="text-[8px] font-black text-on-secondary">2</span>
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </div>

          {/* Quantity control (# of promo bundles) */}
          <div className="flex items-center justify-between bg-surface-container-low p-4 rounded-2xl border border-outline-variant">
            <div>
              <p className="font-black text-on-surface text-sm">Promo Bundles</p>
              <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider">
                Each bundle = 2 pizzas at 1 000 MT
              </p>
            </div>
            <div className="flex items-center gap-3 bg-surface-container-lowest border border-outline-variant rounded-2xl p-1.5 shadow-inner">
              <button
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-error/10 hover:text-error transition-all active:scale-95 border border-outline-variant"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-10 text-center font-black text-on-surface text-lg">{quantity}</span>
              <button
                onClick={() => setQuantity((q) => q + 1)}
                className="w-9 h-9 flex items-center justify-center rounded-xl hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-outline-variant"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ── Footer ── */}
        <div className="p-5 border-t border-outline-variant bg-surface-container-lowest shrink-0">
          {/* Price summary */}
          <AnimatePresence>
            {isComplete && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="flex items-center justify-between mb-4 bg-primary/5 border border-primary/20 rounded-2xl px-5 py-3"
              >
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs font-black text-on-surface uppercase tracking-wider">
                    {pizza1?.name}
                    <span className="text-on-surface-variant/40 mx-2">+</span>
                    {pizza2?.name}
                  </span>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-on-surface-variant/50 uppercase tracking-wider">
                    {quantity > 1 ? `${quantity} × 1 000 MT` : "Promo Price"}
                  </p>
                  <p className="text-2xl font-black text-primary tracking-tighter">
                    {formatCurrency(totalPrice)}
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-none px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <motion.button
              whileTap={isComplete ? { scale: 0.97 } : {}}
              onClick={handleConfirm}
              disabled={!isComplete}
              className={cn(
                "flex-1 py-4 rounded-2xl font-black text-sm uppercase tracking-widest flex items-center justify-center gap-3 transition-all shadow-prominent relative overflow-hidden",
                isComplete
                  ? "bg-primary text-on-primary hover:bg-secondary border-brutal active:scale-[0.98]"
                  : "bg-surface-dim text-on-surface-variant/50 cursor-not-allowed border-2 border-outline-variant"
              )}
            >
              {isComplete ? (
                <>
                  <Check className="w-5 h-5" />
                  Add to Tray — {formatCurrency(totalPrice)}
                </>
              ) : (
                <>Select both pizzas to continue</>
              )}
              {isComplete && (
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="absolute inset-0 bg-white/10 skew-x-[20deg] pointer-events-none overflow-hidden rounded-2xl"
                />
              )}
            </motion.button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
