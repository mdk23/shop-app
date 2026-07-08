"use client";

import { useState, useEffect } from "react";
import { X, Plus, Minus, Check, Sparkles, Egg, Layers, ShoppingBag } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface DishCustomizationModalProps {
  isOpen: boolean;
  onClose: () => void;
  dish: any; // The base dish clicked
  allDishes: any[]; // To fetch sides, drinks, pizzas
  onConfirm: (customizedItem: {
    dishId: any;
    name: string;
    price: number;
    quantity: number;
    modifiers?: { name: string; price: number }[];
    comboSelections?: { category: string; dishId?: any; name: string; extraCharge: number }[];
  }) => void;
}


export function DishCustomizationModal({
  isOpen,
  onClose,
  dish,
  allDishes,
  onConfirm,
}: DishCustomizationModalProps) {
  const [quantity, setQuantity] = useState(1);


  // Combo State
  const [selectedMains, setSelectedMains] = useState<any[]>([]);
  const [selectedSides, setSelectedSides] = useState<any[]>([]);
  const [selectedDrink, setSelectedDrink] = useState<any | null>(null);


  const isComboDish =
    dish &&
    (dish.isCombo || dish.category === "Combos" || dish.name.toLowerCase().includes("combo"));

  // Find Margarita Pizza
  const margaritaPizza = allDishes?.find(
    (d) =>
      d.category === "Pizza" &&
      (d.name.toLowerCase().includes("margarita") ||
        d.name.toLowerCase().includes("margherita"))
  );

  // Hardcoded pizza price differences as robust fallback
  const getPizzaUpgradeCharge = (targetPizza: any) => {
    if (!targetPizza) return 0;
    const name = targetPizza.name.toLowerCase();
    if (name.includes("margarita") || name.includes("margherita")) return 0;
    if (name.includes("smoky bacon") || name.includes("bacon")) return 110;
    if (name.includes("fakeroni") || name.includes("pepperoni")) return 160;
    if (name.includes("chicken bbq") || name.includes("bbq")) return 210;
    if (name.includes("tuna mayo") || name.includes("tuna")) return 310;

    // Dynamic price difference fallback
    if (margaritaPizza) {
      const diff = targetPizza.price - margaritaPizza.price;
      return diff > 0 ? diff : 0;
    }
    return 0;
  };

  // Reset states on open
  useEffect(() => {
    if (isOpen && dish) {
      setQuantity(1);
      setSelectedMains([]);
      setSelectedSides([]);
      setSelectedDrink(null);
    }
  }, [isOpen, dish]);

  if (!isOpen || !dish) return null;

  // Dynamic Combo rules
  let mainOptions: any[] = [];
  let sideOptions: any[] = [];
  let drinkOptions: any[] = [];
  let requiredMainsCount = 0;
  let requiredSidesCount = 0;
  let requiredDrinksCount = 0;

  if (isComboDish) {
    if (dish.comboConfig) {
      requiredMainsCount = dish.comboConfig.mainsLimit || 0;
      requiredSidesCount = dish.comboConfig.sidesLimit || 0;
      requiredDrinksCount = dish.comboConfig.drinksLimit || 0;

      const allowedMainsIds = dish.comboConfig.allowedMains || [];
      const allowedSidesIds = dish.comboConfig.allowedSides || [];
      const allowedDrinksIds = dish.comboConfig.allowedDrinks || [];

      if (allowedMainsIds.length > 0) {
        mainOptions = allDishes?.filter(d => allowedMainsIds.includes(d._id)) || [];
      } else {
        mainOptions = allDishes?.filter(d => d.selectableInCombo && d.comboRole === "Main Dish") || [];
      }

      if (allowedSidesIds.length > 0) {
        sideOptions = allDishes?.filter(d => allowedSidesIds.includes(d._id)) || [];
      } else {
        sideOptions = allDishes?.filter(d => d.selectableInCombo && d.comboRole === "Side") || [];
      }

      if (allowedDrinksIds.length > 0) {
        drinkOptions = allDishes?.filter(d => allowedDrinksIds.includes(d._id)) || [];
      } else {
        drinkOptions = allDishes?.filter(d => d.selectableInCombo && d.comboRole === "Drink") || [];
      }
    } else {
      // Legacy Fallback
      sideOptions = allDishes?.filter((d) => d.category === "Sides") || [];
      drinkOptions = allDishes?.filter(
        (d) => d.category === "Drinks" || d.category === "Cold Drinks"
      ) || [];
      if (drinkOptions.length === 0) {
        drinkOptions = [
          { _id: "juice-sumo", name: "Juice (Sumo)", price: 0, category: "Drinks" },
          { _id: "soft-drink", name: "Soft Drink (Refresco)", price: 0, category: "Drinks" },
        ];
      }
      requiredSidesCount = dish.name.toLowerCase().includes("duo") ? 2 : 1;
      requiredDrinksCount = 1;
    }
  }

  const pizzaOptions = allDishes?.filter((d) => d.category === "Pizza") || [];

  // Real-time Price Calculation
  let calculatedSinglePrice = dish.price;
  let modifiers: { name: string; price: number }[] = [];
  let comboSelections: { category: string; dishId?: any; name: string; extraCharge: number }[] = [];

  if (isComboDish) {
    calculatedSinglePrice = dish.price;
    selectedMains.forEach((m) => {
      comboSelections.push({ category: "Main Dish", dishId: m._id, name: m.name, extraCharge: 0 });
    });
    selectedSides.forEach((side) => {
      comboSelections.push({ category: "Side", dishId: side._id, name: side.name, extraCharge: 0 });
    });
    if (selectedDrink) {
      comboSelections.push({ category: "Drink", dishId: selectedDrink._id, name: selectedDrink.name, extraCharge: 0 });
    }
  }

  // Calculate final total
  const modifierSum = modifiers.reduce((acc, curr) => acc + curr.price, 0);
  const extraChargeSum = comboSelections.reduce((acc, curr) => acc + curr.extraCharge, 0);
  const itemTotal = (calculatedSinglePrice * quantity) + modifierSum + extraChargeSum;

  const handleConfirm = () => {
    // Validation
    if (isComboDish) {
      if (selectedMains.length !== requiredMainsCount) {
        toast.error(`Please select exactly ${requiredMainsCount} main dish(es)`);
        return;
      }
      if (selectedSides.length !== requiredSidesCount) {
        toast.error(`Please select exactly ${requiredSidesCount} side(s)`);
        return;
      }
      if (!selectedDrink) {
        toast.error("Please select a drink");
        return;
      }
    }

    onConfirm({
      dishId: dish._id,
      name: dish.name,
      price: calculatedSinglePrice,
      quantity,
      modifiers: modifiers.length > 0 ? modifiers : undefined,
      comboSelections: comboSelections.length > 0 ? comboSelections : undefined,
    });
  };

  const handleMainClick = (m: any) => {
    setSelectedMains((prev) => {
      if (requiredMainsCount === 1) {
        if (prev.length === 1 && prev[0]._id === m._id) return [];
        return [m];
      }
      if (prev.length >= requiredMainsCount) {
        return [...prev.slice(1), m];
      }
      return [...prev, m];
    });
  };

  const handleSideClick = (side: any) => {
    setSelectedSides((prev) => {
      if (requiredSidesCount === 1) {
        if (prev.length === 1 && prev[0]._id === side._id) return [];
        return [side];
      }
      if (prev.length >= requiredSidesCount) {
        return [...prev.slice(1), side];
      }
      return [...prev, side];
    });
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-6 bg-background/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 15 }}
        className="bg-surface-container-lowest border border-outline-variant rounded-[2rem] shadow-prominent w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
      >
        {/* Header */}
        <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-primary/5 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-on-primary shadow-soft">
              {isComboDish && <Layers className="w-6 h-6" />}
              {!isComboDish && <ShoppingBag className="w-6 h-6" />}
            </div>
            <div>
              <h2 className="text-xl lg:text-2xl font-black text-on-surface leading-tight">
                Customize: {dish.name}
              </h2>
              <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-widest">
                {dish.category}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center hover:bg-surface-container-high rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-8 custom-scrollbar">
          {/* Base Quantity Selector */}
          <div className="flex items-center justify-between bg-surface-container-low p-5 rounded-3xl border border-outline-variant">
            <div>
              <p className="font-black text-on-surface text-lg">Quantity</p>
              <p className="text-xs font-bold text-on-surface-variant/60 uppercase tracking-wider">
                How many portions?
              </p>
            </div>
            <div className="flex items-center gap-3 bg-surface-container-lowest border border-outline-variant rounded-2xl p-2 shadow-inner">
              <button
                type="button"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-error/10 hover:text-error transition-all active:scale-95 border border-outline-variant"
              >
                <Minus className="w-4 h-4" />
              </button>
              <span className="w-12 text-center font-black text-on-surface text-xl">{quantity}</span>
              <button
                type="button"
                onClick={() => setQuantity((q) => q + 1)}
                className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-primary/10 hover:text-primary transition-all active:scale-95 border border-outline-variant"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>


          {/* COMBO CUSTOMIZATION */}
          {isComboDish && (
            <div className="space-y-8">
              {/* Mains Selection */}
              {requiredMainsCount > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest">
                        Choose Your Main
                      </h3>
                      <p className="text-xs font-medium text-on-surface-variant/60">
                        Must select exactly {requiredMainsCount} main dish(es)
                      </p>
                    </div>
                    <span className="text-xs font-black bg-primary/10 text-primary px-3 py-1 rounded-full">
                      {selectedMains.length} / {requiredMainsCount} Selected
                    </span>
                  </div>
                  {mainOptions.length === 0 ? (
                    <p className="text-sm font-bold text-on-surface-variant/40 italic">
                      No mains registered.
                    </p>
                  ) : null}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {mainOptions.map((m: any) => {
                      const count = selectedMains.filter((s) => s._id === m._id).length;
                      const isSelected = count > 0;
                      return (
                        <button
                          key={m._id}
                          type="button"
                          onClick={() => handleMainClick(m)}
                          className={cn(
                            "p-4 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center min-h-[90px] relative group",
                            isSelected
                              ? "border-primary bg-primary/5 shadow-hard ring-1 ring-primary"
                              : "border-outline-variant bg-surface-container-lowest hover:border-primary/50"
                          )}
                        >
                          <span
                            className={cn(
                              "font-black text-xs lg:text-sm leading-tight text-center",
                              isSelected ? "text-primary" : "text-on-surface"
                            )}
                          >
                            {m.name}
                          </span>
                          {isSelected && (
                            <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-soft text-[11px] font-black">
                              {count > 1 ? count : <Check className="w-3.5 h-3.5" />}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Sides Selection */}
              {requiredSidesCount > 0 && (
                <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest">
                      Select Side Dish
                    </h3>
                    <p className="text-xs font-medium text-on-surface-variant/60">
                      Must select exactly {requiredSidesCount} side(s)
                    </p>
                  </div>
                  <span className="text-xs font-black bg-primary/10 text-primary px-3 py-1 rounded-full">
                    {selectedSides.length} / {requiredSidesCount} Selected
                  </span>
                </div>
                {sideOptions.length === 0 ? (
                  <p className="text-sm font-bold text-on-surface-variant/40 italic">
                    No sides registered in database. Using mock options:
                  </p>
                ) : null}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {(sideOptions.length > 0
                    ? sideOptions
                    : [
                        { _id: "fries", name: "French Fries" },
                        { _id: "rice", name: "Savoury Rice" },
                        { _id: "salad", name: "Fresh Salad" },
                        { _id: "chips", name: "Potato Chips" },
                      ]
                  ).map((side: any) => {
                    const count = selectedSides.filter((s) => s._id === side._id).length;
                    const isSelected = count > 0;
                    return (
                      <button
                        key={side._id}
                        type="button"
                        onClick={() => handleSideClick(side)}
                        className={cn(
                          "p-4 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center min-h-[90px] relative group",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-hard ring-1 ring-primary"
                            : "border-outline-variant bg-surface-container-lowest hover:border-primary/50"
                        )}
                      >
                        <span
                          className={cn(
                            "font-black text-xs lg:text-sm leading-tight text-center",
                            isSelected ? "text-primary" : "text-on-surface"
                          )}
                        >
                          {side.name}
                        </span>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-soft text-[11px] font-black">
                            {count > 1 ? count : <Check className="w-3.5 h-3.5" />}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              )}

              {/* Drink Selection */}
              {requiredDrinksCount > 0 && (
                <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-widest">
                      Select Drink Option
                    </h3>
                    <p className="text-xs font-medium text-on-surface-variant/60 font-semibold">
                      Juice (Sumo) or Soft Drink (Refresco)
                    </p>
                  </div>
                  {selectedDrink && (
                    <span className="text-xs font-black bg-primary/10 text-primary px-3 py-1 rounded-full">
                      Selected
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {drinkOptions.map((drink: any) => {
                    const isSelected = selectedDrink?._id === drink._id;
                    return (
                      <button
                        key={drink._id}
                        type="button"
                        onClick={() => setSelectedDrink(drink)}
                        className={cn(
                          "p-4 rounded-2xl border-2 text-center transition-all flex flex-col items-center justify-center min-h-[90px] relative group",
                          isSelected
                            ? "border-primary bg-primary/5 shadow-hard ring-1 ring-primary"
                            : "border-outline-variant bg-surface-container-lowest hover:border-primary/50"
                        )}
                      >
                        <span
                          className={cn(
                            "font-black text-xs lg:text-sm leading-tight text-center",
                            isSelected ? "text-primary" : "text-on-surface"
                          )}
                        >
                          {drink.name}
                        </span>
                        {isSelected && (
                          <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-on-primary shadow-soft">
                            <Check className="w-3.5 h-3.5" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-6 border-t border-outline-variant bg-surface-container-lowest shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-center sm:text-left">
            <span className="text-xs font-black text-on-surface-variant/50 uppercase tracking-wider block">
              Total Order Addition
            </span>
            <span className="text-3xl font-black text-primary tracking-tighter">
              {formatCurrency(itemTotal)}
            </span>
          </div>

          <div className="flex gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-6 py-4 rounded-2xl font-black text-sm uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 sm:flex-initial px-8 py-4 bg-primary text-on-primary rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-secondary hover:scale-[1.02] active:scale-[0.98] transition-all shadow-prominent flex items-center justify-center gap-2"
            >
              <Check className="w-5 h-5" />
              Add to Tray
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
