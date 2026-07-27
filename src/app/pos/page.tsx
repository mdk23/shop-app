"use client";

import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency, cn } from "@/lib/utils";
import { ShoppingCart, Plus, Minus, Trash2, ArrowRight, X, Pizza as PizzaIcon, Sparkles, History, Receipt, Users, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { CustomerSelect } from "@/components/pos/CustomerSelect";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { SuccessModal } from "@/components/pos/SuccessModal";
import { DishCustomizationModal } from "@/components/pos/DishCustomizationModal";

import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { ThermalReceiptModal } from "@/components/pos/ReceiptModal";
import { format } from "date-fns";

type CartItem = {
  cartItemId: string;
  dishId: any;
  name: string;
  price: number;
  quantity: number;
  modifiers?: { name: string; price: number }[];
  comboSelections?: { category: string; dishId?: any; name: string; extraCharge: number }[];
};

const categories = ["Chicken", "Sandwiches", "Sides", "Pizza", "Combos", "Cold Drinks", "Extras"];

export default function POSPage() {
  const { currentUser } = useAuth();
  const dishes = useQuery(api.dishes.list);
  const recentOrders = useQuery(api.orders.listRecent, { limit: 20 });
  const router = useRouter();


  const [orderType, setOrderType] = useState<"pickup" | "delivery">("pickup");
  const [selectedFeeId, setSelectedFeeId] = useState<string>("");

  const deliveryFees = useQuery(api.deliveryFees.list, { activeOnly: true });
  const selectedFeeObj = deliveryFees?.find((f) => f._id === selectedFeeId);
  const deliveryFeeAmount = orderType === "delivery" ? (selectedFeeObj?.fee ?? 0) : 0;

  const [selectedCategory, setSelectedCategory] = useState("Chicken");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [completedOrderId, setCompletedOrderId] = useState<string | null>(null);
  const [customizingDish, setCustomizingDish] = useState<any | null>(null);

  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<any | null>(null);

  const selectedCustomer = useQuery(api.customers.getById,
    (selectedCustomerId && selectedCustomerId !== "") ? { id: selectedCustomerId as any } : "skip"
  );

  const cartEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    cartEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (cart.length > 0) {
      scrollToBottom();
    }
  }, [cart.length]);

  if (dishes === undefined) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center gap-4 bg-surface">
        <div className="w-12 h-12 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
        <p className="text-on-surface-variant font-bold animate-pulse">Loading POS System...</p>
      </div>
    );
  }

  const filteredDishes = (dishes || []).filter(
    (d) => d.category === selectedCategory && d.isActive !== false
  );

  const addToCart = (dish: any) => {
    const isCombo = dish.category === "Combos" || dish.name.toLowerCase().includes("combo");

    if (isCombo) {
      setCustomizingDish(dish);
      return;
    }

    // Pizzas and all other dishes: add directly to cart
    setCart((prev) => {
      const existing = prev.find((item) => item.dishId === dish._id && !item.modifiers && !item.comboSelections);
      if (existing) {
        return prev.map((item) =>
          item.dishId === dish._id && !item.modifiers && !item.comboSelections
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [
        ...prev,
        {
          cartItemId: `${dish._id}-${Date.now()}`,
          dishId: dish._id,
          name: dish.name,
          price: dish.price,
          quantity: 1,
        },
      ];
    });
    toast.success(`Added ${dish.name}`, { duration: 1000, position: "bottom-center" });
  };


  const handleCustomConfirm = (customItem: any) => {
    setCart((prev) => {
      // Look for identical customized item
      const existingIdx = prev.findIndex((item) => {
        if (item.dishId !== customItem.dishId) return false;
        
        const m1 = item.modifiers || [];
        const m2 = customItem.modifiers || [];
        if (m1.length !== m2.length) return false;
        const m1Str = m1.map((m: any) => m.name + m.price).sort().join();
        const m2Str = m2.map((m: any) => m.name + m.price).sort().join();
        if (m1Str !== m2Str) return false;

        const c1 = item.comboSelections || [];
        const c2 = customItem.comboSelections || [];
        if (c1.length !== c2.length) return false;
        const c1Str = c1.map((c: any) => c.name + c.extraCharge).sort().join();
        const c2Str = c2.map((c: any) => c.name + c.extraCharge).sort().join();
        if (c1Str !== c2Str) return false;

        return true;
      });

      if (existingIdx > -1) {
        return prev.map((item, idx) =>
          idx === existingIdx
            ? { ...item, quantity: item.quantity + customItem.quantity }
            : item
        );
      }

      return [
        ...prev,
        {
          ...customItem,
          cartItemId: `${customItem.dishId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        },
      ];
    });
    setCustomizingDish(null);
    toast.success(`Added ${customItem.name} to tray`, { duration: 1000, position: "bottom-center" });
  };
  

  const updateQuantity = (cartItemId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) =>
          item.cartItemId === cartItemId ? { ...item, quantity: Math.max(0, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const getItemTotal = (item: CartItem) => {
    const baseTotal = item.price * item.quantity;
    const modifiersTotal = (item.modifiers || []).reduce((sum, m) => sum + m.price, 0);
    const combosTotal = (item.comboSelections || []).reduce((sum, c) => sum + c.extraCharge, 0);
    return baseTotal + modifiersTotal + combosTotal;
  };

  const cartTotal = cart.reduce((acc, item) => acc + getItemTotal(item), 0);

  const handleCheckoutClick = () => {
    if (cart.length === 0) return;
    if (orderType === "delivery" && !selectedFeeObj) {
      toast.error("Please select a delivery zone & fee");
      return;
    }
    setIsPaymentModalOpen(true);
  };

  const handleOrderSuccess = (orderId: string) => {
    setIsPaymentModalOpen(false);
    setCompletedOrderId(orderId);
  };

  const startNewSale = () => {
    setCart([]);
    setCompletedOrderId(null);
    setSelectedCustomerId(null);
    setOrderType("pickup");
    setSelectedFeeId("");
  };

  return (
    <PageLayout
      title="Menu"
      isFullWidth
      headerActions={
        <button
          onClick={() => setIsHistoryOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-surface border-2 border-outline hover:border-primary rounded-xl font-black text-[10px] uppercase tracking-widest transition-all active:scale-95 shadow-hard-sm"
          id="recent-sales-btn"
        >
          <History className="w-4 h-4 text-primary" />
          Recent Sales
        </button>
      }
    >
      <div className="flex flex-col lg:flex-row h-full gap-4 lg:gap-5 min-h-[calc(100vh-120px)]">
        {/* =================================================================== */}
        {/* SECTION 1: CLIENT & DELIVERY (Left Vertical Section) */}
        {/* =================================================================== */}
        <div className="w-full lg:w-72 xl:w-80 shrink-0 flex flex-col gap-4">
          {/* Card 1: Client Selection */}
          <div className="bg-surface-container-lowest border-2 border-outline-variant rounded-2xl p-4 shadow-soft flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-primary" />
                <h2 className="text-xs font-black text-on-surface uppercase tracking-wider">1. Client & Delivery</h2>
              </div>
              <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">Client</span>
            </div>

            <CustomerSelect
              selectedCustomerId={selectedCustomerId}
              onSelect={setSelectedCustomerId}
            />

            {/* Selected Customer Card Details */}
            {selectedCustomer && (
              <div className="bg-surface-container-low border border-outline-variant/60 rounded-xl p-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-wider">Selected Client</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider",
                    selectedCustomer.isGeneric
                      ? "bg-surface-container-high text-on-surface-variant"
                      : "bg-primary/10 text-primary"
                  )}>
                    {selectedCustomer.isGeneric ? "Walk-in" : "Registered"}
                  </span>
                </div>
                <p className="font-black text-sm text-on-surface truncate">{selectedCustomer.name}</p>
                {selectedCustomer.phone1 && (
                  <p className="text-xs font-bold text-on-surface-variant flex items-center gap-1">
                    📞 <span>{selectedCustomer.phone1}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Card 2: Order Fulfillment (Pickup vs Delivery) */}
          <div className="bg-surface-container-lowest border-2 border-outline-variant rounded-2xl p-4 shadow-soft space-y-4">
            <label className="block text-xs font-black text-on-surface-variant uppercase tracking-widest">
              Order Fulfillment
            </label>
            
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setOrderType("pickup")}
                className={cn(
                  "flex-1 py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2 cursor-pointer",
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
                  "flex-1 py-3.5 px-4 rounded-xl font-black text-xs uppercase tracking-wider border-2 transition-all flex items-center justify-center gap-2 cursor-pointer",
                  orderType === "delivery"
                    ? "bg-primary text-on-primary border-primary shadow-hard"
                    : "bg-surface-container-lowest border-outline-variant hover:border-outline text-on-surface-variant"
                )}
              >
                Delivery
              </button>
            </div>

            {orderType === "delivery" && (
              <div className="space-y-2 animate-fadeIn pt-1">
                <label className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  Select Delivery Zone & Fee
                </label>
                <select
                  value={selectedFeeId}
                  onChange={(e) => setSelectedFeeId(e.target.value)}
                  className="w-full bg-surface-container-low border-2 border-outline focus:border-primary rounded-xl p-3 font-black uppercase tracking-wider text-xs outline-none transition-all cursor-pointer text-on-surface"
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
        </div>

        {/* =================================================================== */}
        {/* SECTION 2: DISH SELECTION (Middle Vertical Section) */}
        {/* =================================================================== */}
        <div className="flex-1 flex flex-col min-w-0 bg-surface-container-lowest border-2 border-outline-variant rounded-2xl p-4 shadow-soft">
          {/* Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-outline-variant/40">
            <h2 className="text-xs font-black text-on-surface uppercase tracking-wider flex items-center gap-2">
              <UtensilsCrossed className="w-4 h-4 text-primary" /> 2. Dish Selection
            </h2>
            <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">
              {filteredDishes?.length || 0} Dishes
            </span>
          </div>

          {/* Category Filter Pills */}
          <div className="flex overflow-x-auto scrollbar-hide gap-2 mb-4 pb-2 border-b border-outline-variant/30">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-3.5 py-2 rounded-xl font-black transition-all duration-200 text-[10px] uppercase tracking-widest flex-shrink-0 border-2 whitespace-nowrap cursor-pointer",
                  selectedCategory === cat
                    ? "bg-primary border-primary text-on-primary shadow-hard scale-105"
                    : "bg-surface-container-high border-outline-variant/50 text-on-surface-variant hover:border-outline"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          {/* Dishes Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
              <AnimatePresence mode="popLayout">
                {filteredDishes?.map((dish) => (
                  <motion.button
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    key={dish._id}
                    onClick={() => addToCart(dish)}
                    className="group bg-surface border-2 border-outline rounded-2xl overflow-hidden hover:shadow-hard hover:-translate-y-1 transition-all text-left flex flex-col relative cursor-pointer"
                  >
                    <div className="p-3 flex-1 flex flex-col min-h-[95px]">
                      <h3 className="text-xs lg:text-sm font-black text-on-surface mb-1 group-hover:text-primary transition-colors leading-[1.1] break-words">
                        {dish.name}
                      </h3>
                      <p className="text-[9px] font-black text-on-surface-variant/40 uppercase tracking-widest mb-2">{dish.category}</p>
                      <div className="mt-auto flex items-end justify-between">
                        <span className="text-xs lg:text-sm font-black text-primary tracking-tighter">
                          {formatCurrency(dish.price)}
                        </span>
                        <div className="w-7 h-7 rounded-lg bg-surface-container-high border border-outline flex items-center justify-center text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-all shadow-hard-sm">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* =================================================================== */}
        {/* SECTION 3: YOUR TRAY (Right Vertical Section) */}
        {/* =================================================================== */}
        <div className="w-full lg:w-80 xl:w-96 2xl:w-[360px] shrink-0 flex flex-col bg-surface-container-lowest border-2 border-outline-variant rounded-2xl shadow-prominent overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-primary/5 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-soft shrink-0">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-on-surface leading-tight">3. Your Tray</h2>
                <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">
                  {cart.length} {cart.length === 1 ? "item" : "items"}
                </p>
              </div>
            </div>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="w-8 h-8 flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 rounded-xl transition-all group cursor-pointer"
                title="Clear Tray"
              >
                <Trash2 className="w-4 h-4 group-hover:scale-110 transition-transform" />
              </button>
            )}
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-3 lg:p-4 space-y-2.5 custom-scrollbar min-h-0">
            <AnimatePresence initial={false} mode="popLayout">
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none py-12">
                  <div className="w-16 h-16 rounded-full bg-outline-variant/10 flex items-center justify-center mb-4">
                    <ShoppingCart className="w-8 h-8 text-outline-variant" />
                  </div>
                  <p className="font-black text-lg text-on-surface-variant">Empty Tray</p>
                  <p className="text-xs font-bold text-on-surface-variant/60">Select dishes to add</p>
                </div>
              ) : (
                <>
                  {cart.map((item) => (
                    <motion.div
                      layout
                      initial={{ opacity: 0, scale: 0.95, y: 10 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.9, x: -20 }}
                      key={item.cartItemId}
                      className="flex flex-col bg-surface-container-low p-2.5 pl-3 rounded-xl border border-outline-variant hover:border-primary/40 hover:bg-surface-container-lowest transition-all group shadow-sm gap-1.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="font-black text-on-surface truncate text-xs lg:text-sm leading-tight group-hover:text-primary transition-colors">
                            {item.name}
                          </p>
                          <p className="text-[10px] font-black text-primary/70">{formatCurrency(item.price)}</p>
                        </div>

                        <div className="flex items-center gap-1 bg-surface-container-high rounded-lg p-0.5 shadow-inner shrink-0">
                          <button
                            onClick={() => updateQuantity(item.cartItemId, -1)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-error/10 hover:text-error text-on-surface-variant transition-all cursor-pointer"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="w-6 text-center font-black text-on-surface text-xs">{item.quantity}</span>
                          <button
                            onClick={() => updateQuantity(item.cartItemId, 1)}
                            className="w-7 h-7 flex items-center justify-center rounded hover:bg-primary/10 hover:text-primary text-on-surface-variant transition-all cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="min-w-[60px] text-right shrink-0">
                          <p className="font-black text-on-surface text-xs lg:text-sm">
                            {formatCurrency(getItemTotal(item))}
                          </p>
                        </div>
                      </div>

                      {/* Modifiers & Combo Selections */}
                      {item.modifiers && item.modifiers.length > 0 && (
                        <div className="pl-2 border-l-2 border-primary/20 space-y-0.5">
                          {item.modifiers.map((mod, i) => (
                            <p key={i} className="text-[10px] font-bold text-on-surface-variant/80 flex justify-between">
                              <span>🍳 {mod.name}</span>
                              <span className="text-primary font-black">+{formatCurrency(mod.price)}</span>
                            </p>
                          ))}
                        </div>
                      )}

                      {item.comboSelections && item.comboSelections.length > 0 && (
                        <div className="pl-2 border-l-2 border-primary/20 space-y-0.5">
                          {item.comboSelections.map((sel, i) => (
                            <p key={i} className="text-[10px] font-bold text-on-surface-variant/80 flex justify-between">
                              <span>
                                {sel.category === "Pizza Promo" ? `🍕 ${sel.name}` : `🥗 ${sel.category}: ${sel.name}`}
                              </span>
                              {sel.extraCharge > 0 && (
                                <span className="text-primary font-black">+{formatCurrency(sel.extraCharge)}</span>
                              )}
                            </p>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  ))}
                  <div ref={cartEndRef} className="h-2" />
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="p-3 lg:p-4 border-t border-outline-variant bg-surface-container-lowest shrink-0 space-y-3">
            <div className="space-y-1.5 text-xs font-black uppercase tracking-wider border-b border-outline-variant/40 pb-2">
              <div className="flex justify-between text-on-surface-variant/70">
                <span>Subtotal (Food)</span>
                <span>{formatCurrency(cartTotal)}</span>
              </div>
              {orderType === "delivery" && (
                <div className="flex justify-between text-primary font-black">
                  <span>Delivery Fee {selectedFeeObj ? `(${selectedFeeObj.name})` : ""}</span>
                  <span>{formatCurrency(deliveryFeeAmount)}</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-1">
              <span className="text-sm font-black text-on-surface">Total</span>
              <span className="text-2xl lg:text-3xl font-black text-primary tracking-tighter">
                {formatCurrency(cartTotal + deliveryFeeAmount)}
              </span>
            </div>

            <button
              disabled={cart.length === 0}
              onClick={handleCheckoutClick}
              className={cn(
                "w-full py-4 rounded-xl font-black text-base transition-all shadow-prominent flex items-center justify-center gap-3 group relative overflow-hidden cursor-pointer",
                cart.length === 0
                  ? "bg-surface-dim text-on-surface-variant cursor-not-allowed border-2 border-outline-variant"
                  : "bg-primary text-on-primary hover:bg-secondary hover:scale-[1.01] active:scale-[0.98] border-brutal"
              )}
            >
              <div className="flex items-center gap-2 relative z-10">
                <span className="uppercase tracking-[0.15em] text-xs font-black">Complete the Order</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </button>
          </div>
        </div>
      </div>

      <DishCustomizationModal
        isOpen={!!customizingDish}
        onClose={() => setCustomizingDish(null)}
        dish={customizingDish}
        allDishes={dishes || []}
        onConfirm={handleCustomConfirm}
      />



      <PaymentModal
        isOpen={isPaymentModalOpen}
        onClose={() => setIsPaymentModalOpen(false)}
        total={cartTotal}
        orderType={orderType}
        selectedFeeId={selectedFeeId}
        items={cart}
        customerId={selectedCustomerId || ""}
        customerName={selectedCustomer?.name || "Generic Client"}
        onSuccess={handleOrderSuccess}
      />
      <SuccessModal
        isOpen={!!completedOrderId}
        orderId={completedOrderId}
        onNewSale={startNewSale}
        onViewDetails={() => router.push("/sales")}
      />

      <AnimatePresence>
        {isHistoryOpen && (
          <div className="fixed inset-0 z-[100] flex justify-end">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsHistoryOpen(false)}
              className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            />
            
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="relative w-full max-w-md h-full bg-surface border-l-4 border-outline p-6 shadow-hard-lg flex flex-col z-10"
            >
              <div className="flex items-center justify-between pb-4 border-b-2 border-outline-variant shrink-0">
                <div className="flex items-center gap-2">
                  <History className="w-5 h-5 text-primary" />
                  <h2 className="text-lg font-display text-on-surface uppercase tracking-wider">Recent Sales History</h2>
                </div>
                <button
                  onClick={() => setIsHistoryOpen(false)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-surface-container-high hover:bg-error/10 hover:text-error transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-4 space-y-3 custom-scrollbar min-h-0">
                {!recentOrders ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="w-8 h-8 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
                  </div>
                ) : recentOrders.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-40">
                    <Receipt className="w-12 h-12 text-on-surface-variant mb-3" />
                    <p className="font-black text-sm uppercase">No sales registered yet</p>
                  </div>
                ) : (
                  recentOrders.map((order) => {
                    const isOwnOrder = order.username === currentUser?.username;
                    const orderTime = format(order.createdAt, "HH:mm");
                    const orderDate = format(order.createdAt, "dd/MM");
                    
                    return (
                      <div
                        key={order._id}
                        onClick={() => {
                          setReceiptOrder(order);
                          setIsHistoryOpen(false); // Close history drawer
                        }}
                        className={cn(
                          "p-4 rounded-2xl border-2 hover:border-primary/50 bg-surface-container-low hover:bg-surface-container-lowest transition-all cursor-pointer shadow-hard-sm relative overflow-hidden group text-left",
                          isOwnOrder ? "border-outline" : "border-outline-variant opacity-75"
                        )}
                      >
                        {isOwnOrder && (
                          <span className="absolute top-0 right-0 bg-primary/10 text-primary text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-bl-xl border-l border-b border-primary/20">
                            Your Sale
                          </span>
                        )}
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <p className="font-display text-sm text-on-surface uppercase tracking-wider group-hover:text-primary transition-colors">
                              {order.orderCode ?? `#${order._id.slice(-6).toUpperCase()}`}
                            </p>
                            <p className="text-[9px] font-black text-on-surface-variant opacity-60 uppercase tracking-wide">
                              {orderDate} · {orderTime}
                            </p>
                          </div>
                          <span className="font-display text-md text-primary tracking-tight">
                            {formatCurrency(order.total)}
                          </span>
                        </div>
                        
                        <div className="flex justify-between items-center text-[9px] font-black uppercase tracking-widest">
                          <span className="text-on-surface-variant opacity-70 truncate max-w-[200px]">
                            {order.customer?.name}
                          </span>
                          <span className={cn(
                            "px-2 py-0.5 rounded border",
                            order.status === "Paid"
                              ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                              : "bg-orange-500/10 text-orange-600 border-orange-500/20"
                          )}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {receiptOrder && (
        <ThermalReceiptModal
          order={receiptOrder}
          onClose={() => setReceiptOrder(null)}
        />
      )}
    </PageLayout>
  );
}
