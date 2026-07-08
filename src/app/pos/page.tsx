"use client";

import { useState, useRef, useEffect } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency, cn } from "@/lib/utils";
import { ShoppingCart, Plus, Minus, Trash2, ArrowRight, X, Pizza as PizzaIcon, Sparkles, History, Receipt } from "lucide-react";
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

const categories = ["Chicken", "Sides", "Pizza", "Combos", "Cold Drinks", "Extras"];

export default function POSPage() {
  const { currentUser } = useAuth();
  const dishes = useQuery(api.dishes.list);
  const recentOrders = useQuery(api.orders.listRecent, { limit: 20 });
  const router = useRouter();


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
  };

  return (
    <PageLayout
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
      <div className="flex flex-col lg:flex-row h-full gap-4 lg:gap-6">
        {/* LEFT PANEL: Menu */}
        <div className="flex-1 flex flex-col min-w-0">


          <div className="flex overflow-x-auto scrollbar-hide gap-2 mb-4 lg:mb-6 border-b border-outline-variant/30 pb-4 -mx-2 px-2 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-4 xl:grid-cols-8 lg:gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={cn(
                  "px-4 py-3 lg:px-2 rounded-xl font-black transition-all duration-200 text-[10px] uppercase tracking-widest flex-shrink-0 border-2 whitespace-nowrap",
                  selectedCategory === cat
                    ? "bg-primary border-primary text-on-primary shadow-hard scale-105"
                    : "bg-surface-container-high border-outline-variant/50 text-on-surface-variant hover:border-outline"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 gap-3 lg:gap-4 pb-24 lg:pb-0">
            <AnimatePresence mode="popLayout">
              {filteredDishes?.map((dish) => (
                <motion.button
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  key={dish._id}
                  onClick={() => addToCart(dish)}
                  className="group bg-surface border-2 border-outline rounded-2xl overflow-hidden hover:shadow-hard hover:-translate-y-1 transition-all text-left flex flex-col relative"
                >

                  <div className="p-3 flex-1 flex flex-col min-h-[90px]">
                    <h3 className="text-sm lg:text-base font-black text-on-surface mb-1 group-hover:text-primary transition-colors leading-[0.9] break-words">
                      {dish.name}
                    </h3>
                    <p className="text-[10px] font-black text-on-surface-variant/40 uppercase tracking-widest mb-3">{dish.category}</p>
                    <div className="mt-auto flex items-end justify-between">
                      <div className="flex flex-col">
                        <span className="text-sm font-black text-primary tracking-tighter">
                          {formatCurrency(dish.price)}
                        </span>
                      </div>
                      <div className="w-8 h-8 rounded-lg bg-surface-container-high border-2 border-outline flex items-center justify-center text-on-surface group-hover:bg-primary group-hover:text-on-primary transition-all shadow-hard-sm">
                        <Plus className="w-4 h-4" />
                      </div>
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Floating Mobile Cart Summary (Sticky Bottom) */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 p-4 pointer-events-none">
          <motion.div
            initial={{ y: 100 }}
            animate={{ y: 0 }}
            className="pointer-events-auto"
          >
            <button
              onClick={() => {
                const cartPanel = document.getElementById('cart-panel');
                if (cartPanel) {
                  cartPanel.classList.toggle('translate-y-0');
                  cartPanel.classList.toggle('translate-y-full');
                }
              }}
              className="w-full bg-primary text-on-primary h-16 rounded-2xl shadow-hard-lg flex items-center justify-between px-6 border-brutal active:scale-95 transition-all"
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <ShoppingCart className="w-6 h-6" />
                  {cart.length > 0 && (
                    <span className="absolute -top-2 -right-2 bg-on-primary text-primary w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-primary">
                      {cart.reduce((sum, i) => sum + i.quantity, 0)}
                    </span>
                  )}
                </div>
                <span className="font-black uppercase tracking-widest text-sm">View Tray</span>
              </div>
              <span className="text-xl font-black tracking-tighter">{formatCurrency(cartTotal)}</span>
            </button>
          </motion.div>
        </div>

        {/* RIGHT PANEL: Cart & Customer */}
        <div 
          id="cart-panel"
          className="fixed inset-0 z-50 lg:z-auto lg:static translate-y-full lg:translate-y-0 adaptive-transition bg-background lg:bg-transparent lg:w-[320px] xl:w-[380px] 2xl:w-[25%] flex flex-col gap-4 lg:h-[calc(100vh-120px)] lg:sticky lg:top-24"
        >
          {/* Mobile Close Button */}
          <button 
            onClick={() => {
              const cartPanel = document.getElementById('cart-panel');
              if (cartPanel) {
                cartPanel.classList.add('translate-y-full');
                cartPanel.classList.remove('translate-y-0');
              }
            }}
            className="lg:hidden absolute top-4 right-4 z-10 w-12 h-12 bg-surface border-2 border-outline rounded-full flex items-center justify-center shadow-hard"
          >
            <X className="w-6 h-6" />
          </button>

          {/* Customer Selection */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-[1.5rem] p-4 shadow-soft">
            <CustomerSelect
              selectedCustomerId={selectedCustomerId}
              onSelect={setSelectedCustomerId}
            />
          </div>

          <div className="flex-1 bg-surface-container-lowest border border-outline-variant rounded-[1.5rem] flex flex-col shadow-prominent overflow-hidden transition-all duration-300 min-h-0">
            {/* Header: Fixed */}
            <div className="p-4 border-b border-outline-variant flex items-center justify-between bg-primary/5 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-on-primary shadow-soft shrink-0">
                  <ShoppingCart className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-lg lg:text-xl font-black text-on-surface leading-tight">Your Tray</h2>
                  <p className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-widest">{cart.length} unique {cart.length === 1 ? 'item' : 'items'}</p>
                </div>
              </div>
              {cart.length > 0 && (
                <button
                  onClick={() => setCart([])}
                  className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-error hover:bg-error/10 rounded-2xl transition-all group"
                  title="Clear Cart"
                >
                  <Trash2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                </button>
              )}
            </div>

            {/* Order Items List: Scrollable */}
            <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-3 custom-scrollbar min-h-0">
              <AnimatePresence initial={false} mode="popLayout">
                {cart.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center opacity-30 select-none">
                    <div className="w-24 h-24 rounded-full bg-outline-variant/10 flex items-center justify-center mb-6">
                      <ShoppingCart className="w-12 h-12 text-outline-variant" />
                    </div>
                    <p className="font-black text-xl text-on-surface-variant">Empty Tray</p>
                    <p className="text-sm font-bold text-on-surface-variant/60">Deliciousness awaits!</p>
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
                        className="flex flex-col bg-surface-container-low p-3 pl-4 rounded-2xl border border-outline-variant hover:border-primary/40 hover:bg-surface-container-lowest transition-all group shadow-sm gap-2"
                      >
                        <div className="flex items-center gap-4">
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-on-surface truncate text-sm lg:text-base leading-tight group-hover:text-primary transition-colors">{item.name}</p>
                            <p className="text-xs font-black text-primary/70">{formatCurrency(item.price)}</p>
                          </div>

                          <div className="flex items-center gap-1 bg-surface-container-high rounded-xl p-1 shadow-inner shrink-0 scale-90 lg:scale-100">
                            <button
                              onClick={() => updateQuantity(item.cartItemId, -1)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-error/10 hover:text-error text-on-surface-variant transition-all active:scale-90"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="w-7 text-center font-black text-on-surface text-sm">{item.quantity}</span>
                            <button
                              onClick={() => updateQuantity(item.cartItemId, 1)}
                              className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-primary/10 hover:text-primary text-on-surface-variant transition-all active:scale-95"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>

                          <div className="min-w-[70px] text-right shrink-0">
                            <p className="font-black text-on-surface text-sm lg:text-base">
                              {formatCurrency(getItemTotal(item))}
                            </p>
                          </div>
                        </div>

                        {/* Modifiers display */}
                        {item.modifiers && item.modifiers.length > 0 && (
                          <div className="pl-2 border-l-2 border-primary/20 space-y-1">
                            {item.modifiers.map((mod, i) => (
                              <p key={i} className="text-xs font-bold text-on-surface-variant/80 flex justify-between">
                                <span>🍳 {mod.name}</span>
                                <span className="text-primary font-black">+{formatCurrency(mod.price)}</span>
                              </p>
                            ))}
                          </div>
                        )}

                        {/* Combo and pizza promo selections display */}
                        {item.comboSelections && item.comboSelections.length > 0 && (
                          <div className="pl-2 border-l-2 border-primary/20 space-y-1">
                            {item.comboSelections.map((sel, i) => (
                              <p key={i} className="text-xs font-bold text-on-surface-variant/80 flex justify-between">
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

            {/* Footer: Fixed */}
            <div className="p-4 border-t border-outline-variant bg-surface-container-lowest shrink-0 shadow-[0_-12px_24px_-12px_rgba(0,0,0,0.1)]">
              <div className="space-y-2 mb-6">
                <div className="flex justify-between text-on-surface-variant font-black text-[10px] uppercase tracking-[0.2em] opacity-50">
                  <span>Subtotal</span>
                  <span>{formatCurrency(cartTotal)}</span>
                </div>
                <div className="flex justify-between items-center pt-2 border-t border-outline-variant/30">
                  <span className="text-lg font-black text-on-surface">Total</span>
                  <div className="text-right">
                    <span className="text-3xl font-black text-primary tracking-tighter block">{formatCurrency(cartTotal)}</span>
                  </div>
                </div>
              </div>

              <button
                disabled={cart.length === 0}
                onClick={handleCheckoutClick}
                className={cn(
                  "w-full py-5 rounded-2xl font-black text-xl transition-all shadow-prominent flex items-center justify-center gap-4 group relative overflow-hidden",
                  cart.length === 0
                    ? "bg-surface-dim text-on-surface-variant cursor-not-allowed border-2 border-outline-variant"
                    : "bg-primary text-on-primary hover:bg-secondary hover:scale-[1.02] active:scale-[0.98] border-brutal"
                )}
              >
                <div className="flex items-center gap-3 relative z-10">
                  <span className="uppercase tracking-[0.2em] text-sm">Send to Kitchen</span>
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </div>
                {cart.length > 0 && (
                  <motion.div
                    initial={{ x: "-100%" }}
                    animate={{ x: "100%" }}
                    transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                    className="absolute inset-0 bg-white/10 skew-x-[20deg]"
                  />
                )}
              </button>
            </div>
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
