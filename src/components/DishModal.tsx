"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { X, Plus, Trash2 } from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";

interface DishModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: any; // The dish data to edit
}

export function DishModal({ isOpen, onClose, initialData }: DishModalProps) {
  const createDish = useMutation(api.dishes.create);
  const updateDish = useMutation(api.dishes.update);
  const availableIngredients = useQuery(api.ingredients.list);
  const availableDishes = useQuery(api.dishes.list);

  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [category, setCategory] = useState("chicken");

  const [isActive, setIsActive] = useState(true);
  const [description, setDescription] = useState("");

  const [isCombo, setIsCombo] = useState(false);
  const [selectableInCombo, setSelectableInCombo] = useState(false);
  const [comboRole, setComboRole] = useState("None");
  const [mainsLimit, setMainsLimit] = useState(0);
  const [sidesLimit, setSidesLimit] = useState(0);
  const [drinksLimit, setDrinksLimit] = useState(0);
  const [allowedMains, setAllowedMains] = useState<Id<"dishes">[]>([]);
  const [allowedSides, setAllowedSides] = useState<Id<"dishes">[]>([]);
  const [allowedDrinks, setAllowedDrinks] = useState<Id<"dishes">[]>([]);
  
  // Packaging states
  const [standalonePackaging, setStandalonePackaging] = useState<{ ingredientId: Id<"ingredients">; quantity: number }[]>([]);
  const [comboPackaging, setComboPackaging] = useState<{ ingredientId: Id<"ingredients">; quantity: number }[]>([]);

  const [recipe, setRecipe] = useState<{ ingredientId: Id<"ingredients">; quantity: number }[]>([]);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setPrice(initialData.price.toString());
      setCategory(initialData.category);

      setIsActive(initialData.isActive ?? true);
      setDescription(initialData.description || "");

      setIsCombo(initialData.isCombo || false);
      setSelectableInCombo(initialData.selectableInCombo || false);
      setComboRole(initialData.comboRole || "None");
      
      if (initialData.comboConfig) {
        setMainsLimit(initialData.comboConfig.mainsLimit || 0);
        setSidesLimit(initialData.comboConfig.sidesLimit || 0);
        setDrinksLimit(initialData.comboConfig.drinksLimit || 0);
        setAllowedMains(initialData.comboConfig.allowedMains || []);
        setAllowedSides(initialData.comboConfig.allowedSides || []);
        setAllowedDrinks(initialData.comboConfig.allowedDrinks || []);
      } else {
        setMainsLimit(0);
        setSidesLimit(0);
        setDrinksLimit(0);
        setAllowedMains([]);
        setAllowedSides([]);
        setAllowedDrinks([]);
      }

      // Load packaging (migrate to array if legacy exists)
      if (initialData.standalonePackaging?.length > 0) {
        setStandalonePackaging(initialData.standalonePackaging);
      } else {
        setStandalonePackaging([]);
      }

      if (initialData.comboPackaging?.length > 0) {
        setComboPackaging(initialData.comboPackaging);
      } else {
        setComboPackaging([]);
      }

      // Load recipe
      if (initialData.ingredients) {
        setRecipe(
          initialData.ingredients.map((i: any) => ({
            ingredientId: i.ingredientId,
            quantity: i.quantity,
          }))
        );
      }
    } else {
      // Reset
      setName("");
      setPrice("");
      setCategory("chicken");

      setIsActive(true);
      setDescription("");
      setIsCombo(false);
      setSelectableInCombo(false);
      setComboRole("None");
      setMainsLimit(0);
      setSidesLimit(0);
      setDrinksLimit(0);
      setAllowedMains([]);
      setAllowedSides([]);
      setAllowedDrinks([]);
      setStandalonePackaging([]);
      setComboPackaging([]);
      setRecipe([]);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !price) return;

    const payload = {
      name,
      price: parseFloat(price),
      category,

      isActive,
      description: description || undefined,
      ingredients: recipe,
      isCombo,
      selectableInCombo,
      comboRole: comboRole === "None" ? undefined : comboRole,
      comboConfig: isCombo ? {
        allowedMains,
        allowedSides,
        allowedDrinks,
        mainsLimit,
        sidesLimit,
        drinksLimit,
      } : undefined,
      standalonePackaging: standalonePackaging.length > 0 ? standalonePackaging : undefined,
      comboPackaging: comboPackaging.length > 0 ? comboPackaging : undefined,
    };

    try {
      if (initialData) {
        await updateDish({ id: initialData._id, ...payload });
      } else {
        await createDish(payload);
      }
      onClose();
    } catch (error) {
      console.error("Failed to save dish", error);
      alert("Failed to save dish. Please check the console.");
    }
  };

  const addPackagingItem = (isComboMode: boolean) => {
    if (!availableIngredients || availableIngredients.length === 0) return;
    const targetArray = isComboMode ? comboPackaging : standalonePackaging;
    
    const unused = availableIngredients.filter(ai => ai.category === "Packaging").find(
      (ai) => !targetArray.some((r) => r.ingredientId === ai._id)
    );

    if (unused) {
      if (isComboMode) {
        setComboPackaging([...comboPackaging, { ingredientId: unused._id, quantity: 1 }]);
      } else {
        setStandalonePackaging([...standalonePackaging, { ingredientId: unused._id, quantity: 1 }]);
      }
    }
  };

  const updatePackagingItem = (isComboMode: boolean, index: number, field: string, value: any) => {
    if (isComboMode) {
      const newPack = [...comboPackaging];
      newPack[index] = { ...newPack[index], [field]: value };
      setComboPackaging(newPack);
    } else {
      const newPack = [...standalonePackaging];
      newPack[index] = { ...newPack[index], [field]: value };
      setStandalonePackaging(newPack);
    }
  };

  const removePackagingItem = (isComboMode: boolean, index: number) => {
    if (isComboMode) {
      const newPack = [...comboPackaging];
      newPack.splice(index, 1);
      setComboPackaging(newPack);
    } else {
      const newPack = [...standalonePackaging];
      newPack.splice(index, 1);
      setStandalonePackaging(newPack);
    }
  };

  const addRecipeItem = () => {
    if (!availableIngredients || availableIngredients.length === 0) return;

    // Find an ingredient not already in the recipe (AND NOT a packaging ingredient)
    const unused = availableIngredients.filter(ai => ai.category !== "Packaging").find(
      (ai) => !recipe.some((r) => r.ingredientId === ai._id)
    );

    if (unused) {
      setRecipe([...recipe, { ingredientId: unused._id, quantity: 1 }]);
    }
  };

  const updateRecipeItem = (index: number, field: string, value: any) => {
    const newRecipe = [...recipe];
    newRecipe[index] = { ...newRecipe[index], [field]: value };
    setRecipe(newRecipe);
  };

  const removeRecipeItem = (index: number) => {
    const newRecipe = [...recipe];
    newRecipe.splice(index, 1);
    setRecipe(newRecipe);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-3xl border-4 border-outline rounded-lg shadow-hard-lg flex flex-col max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b-4 border-black bg-surface-container-low">
          <h2 className="text-4xl font-display text-on-surface uppercase tracking-tighter">
            {initialData ? "Edit Dish" : "Create New Dish"}
          </h2>
          <button
            onClick={onClose}
            className="w-12 h-12 flex items-center justify-center rounded-lg bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <div className="flex-1 overflow-y-auto p-8">
          <form id="dishForm" onSubmit={handleSubmit} className="space-y-10">

            {/* Basic Info Section */}
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.2em] mb-6 pb-2 border-b-2 border-black/10">
                1. Basic Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Name *</label>
                  <input
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded-lg px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-[2px_2px_0px_0px_var(--shadow-color)]"
                    placeholder="e.g. Grilled Chicken Plate"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Price (Mt) *</label>
                  <input
                    required
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded-lg px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-[2px_2px_0px_0px_var(--shadow-color)]"
                    placeholder="e.g. 15.99"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Category *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded-lg px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-[2px_2px_0px_0px_var(--shadow-color)]"
                  >
                    <option value="Chicken">Chicken</option>
                    <option value="Sides">Sides</option>
                    <option value="Pizza">Pizza</option>
                    <option value="Combos">Combos</option>
                    <option value="Cold Drinks">Cold Drinks</option>
                    <option value="Extras">Extras</option>
                  </select>
                </div>
                <div className="space-y-2 flex flex-col justify-center">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2">Active Status</label>
                  <label className="relative inline-flex items-center cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                    />
                    <div className="w-14 h-7 bg-surface-container-highest border-2 border-black rounded-lg peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-black after:rounded after:h-5 after:w-6 after:transition-all peer-checked:bg-brand-gradient peer-checked:after:bg-white"></div>
                    <span className="ml-3 text-[10px] font-black text-on-surface uppercase tracking-widest">
                      {isActive ? "Available" : "Hidden"}
                    </span>
                  </label>
                </div>


                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Description (Optional)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    className="w-full bg-surface-container-low border-2 border-outline rounded-lg px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all resize-none shadow-[2px_2px_0px_0px_var(--shadow-color)]"
                    placeholder="A delicious plate of..."
                  />
                </div>
              </div>
            </div>

            {/* Combo Settings Section */}
            <div>
              <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.2em] mb-6 pb-2 border-b-2 border-black/10">
                2. Combo Settings
              </h3>
              <div className="space-y-6">
                
                {/* Selectable in Combo component behavior */}
                <div className="bg-surface-container-low border-2 border-outline rounded-lg p-5">
                  <div className="flex items-center gap-4">
                    <label className="relative inline-flex items-center cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={selectableInCombo}
                        onChange={(e) => setSelectableInCombo(e.target.checked)}
                      />
                      <div className="w-14 h-7 bg-surface-container-highest border-2 border-black rounded-lg peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-black after:rounded after:h-5 after:w-6 after:transition-all peer-checked:bg-brand-gradient peer-checked:after:bg-white"></div>
                    </label>
                    <div>
                      <p className="text-[10px] font-black text-on-surface uppercase tracking-widest">Selectable In Combos</p>
                      <p className="text-[10px] text-on-surface-variant/60 font-bold">Can this dish be chosen as a part of a larger combo?</p>
                    </div>
                  </div>

                  {selectableInCombo && (
                    <div className="mt-4 pl-[4.5rem]">
                      <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-2">Combo Role</label>
                      <select
                        value={comboRole}
                        onChange={(e) => setComboRole(e.target.value)}
                        className="w-full max-w-xs bg-surface-container-lowest border-2 border-outline rounded-lg px-4 py-2 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none"
                      >
                        <option value="None">-- Select Role --</option>
                        <option value="Main Dish">Main Dish</option>
                        <option value="Side">Side</option>
                        <option value="Drink">Drink</option>
                        <option value="Extra">Extra</option>
                      </select>
                    </div>
                  )}
                </div>

                {/* Is Combo builder behavior */}
                <div className="bg-surface-container-low border-2 border-outline rounded-lg p-5">
                  <div className="flex items-center gap-4">
                    <label className="relative inline-flex items-center cursor-pointer w-fit">
                      <input
                        type="checkbox"
                        className="sr-only peer"
                        checked={isCombo}
                        onChange={(e) => setIsCombo(e.target.checked)}
                      />
                      <div className="w-14 h-7 bg-surface-container-highest border-2 border-black rounded-lg peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-black after:rounded after:h-5 after:w-6 after:transition-all peer-checked:bg-brand-gradient peer-checked:after:bg-white"></div>
                    </label>
                    <div>
                      <p className="text-[10px] font-black text-on-surface uppercase tracking-widest">Is Combo Item</p>
                      <p className="text-[10px] text-on-surface-variant/60 font-bold">Does this dish require the customer to select sides/drinks?</p>
                    </div>
                  </div>

                  {isCombo && (
                    <div className="mt-6 pt-6 border-t-2 border-black/10 grid gap-6">
                      
                      {/* Mains config */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-2">Required Mains Limit</label>
                          <input
                            type="number"
                            min="0"
                            value={mainsLimit}
                            onChange={(e) => setMainsLimit(parseInt(e.target.value) || 0)}
                            className="w-24 bg-surface-container-lowest border-2 border-outline rounded-lg px-4 py-2 text-on-surface font-bold text-center text-xs focus:border-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-2">Allowed Mains</label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {allowedMains.map((mid) => (
                              <span key={mid} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1">
                                {availableDishes?.find(d => d._id === mid)?.name || mid}
                                <button type="button" onClick={() => setAllowedMains(allowedMains.filter(m => m !== mid))}><X className="w-3 h-3 hover:text-error"/></button>
                              </span>
                            ))}
                          </div>
                          <select
                            onChange={(e) => {
                              const v = e.target.value as Id<"dishes">;
                              if (v && !allowedMains.includes(v)) setAllowedMains([...allowedMains, v]);
                              e.target.value = "";
                            }}
                            className="w-full bg-surface-container-lowest border-2 border-outline rounded-lg px-4 py-2 text-on-surface font-bold text-xs focus:border-primary outline-none"
                          >
                            <option value="">+ Add Allowed Main</option>
                            {availableDishes?.filter(d => d.selectableInCombo && d.comboRole === "Main Dish" && !allowedMains.includes(d._id)).map(d => (
                              <option key={d._id} value={d._id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Sides config */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-2">Required Sides Limit</label>
                          <input
                            type="number"
                            min="0"
                            value={sidesLimit}
                            onChange={(e) => setSidesLimit(parseInt(e.target.value) || 0)}
                            className="w-24 bg-surface-container-lowest border-2 border-outline rounded-lg px-4 py-2 text-on-surface font-bold text-center text-xs focus:border-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-2">Allowed Sides</label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {allowedSides.map((sid) => (
                              <span key={sid} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1">
                                {availableDishes?.find(d => d._id === sid)?.name || sid}
                                <button type="button" onClick={() => setAllowedSides(allowedSides.filter(s => s !== sid))}><X className="w-3 h-3 hover:text-error"/></button>
                              </span>
                            ))}
                          </div>
                          <select
                            onChange={(e) => {
                              const v = e.target.value as Id<"dishes">;
                              if (v && !allowedSides.includes(v)) setAllowedSides([...allowedSides, v]);
                              e.target.value = "";
                            }}
                            className="w-full bg-surface-container-lowest border-2 border-outline rounded-lg px-4 py-2 text-on-surface font-bold text-xs focus:border-primary outline-none"
                          >
                            <option value="">+ Add Allowed Side</option>
                            {availableDishes?.filter(d => d.selectableInCombo && d.comboRole === "Side" && !allowedSides.includes(d._id)).map(d => (
                              <option key={d._id} value={d._id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Drinks config */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-2">Required Drinks Limit</label>
                          <input
                            type="number"
                            min="0"
                            value={drinksLimit}
                            onChange={(e) => setDrinksLimit(parseInt(e.target.value) || 0)}
                            className="w-24 bg-surface-container-lowest border-2 border-outline rounded-lg px-4 py-2 text-on-surface font-bold text-center text-xs focus:border-primary outline-none"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest block mb-2">Allowed Drinks</label>
                          <div className="flex flex-wrap gap-2 mb-2">
                            {allowedDrinks.map((did) => (
                              <span key={did} className="bg-primary/10 text-primary text-[10px] px-2 py-1 rounded-md font-bold flex items-center gap-1">
                                {availableDishes?.find(d => d._id === did)?.name || did}
                                <button type="button" onClick={() => setAllowedDrinks(allowedDrinks.filter(d => d !== did))}><X className="w-3 h-3 hover:text-error"/></button>
                              </span>
                            ))}
                          </div>
                          <select
                            onChange={(e) => {
                              const v = e.target.value as Id<"dishes">;
                              if (v && !allowedDrinks.includes(v)) setAllowedDrinks([...allowedDrinks, v]);
                              e.target.value = "";
                            }}
                            className="w-full bg-surface-container-lowest border-2 border-outline rounded-lg px-4 py-2 text-on-surface font-bold text-xs focus:border-primary outline-none"
                          >
                            <option value="">+ Add Allowed Drink</option>
                            {availableDishes?.filter(d => d.selectableInCombo && d.comboRole === "Drink" && !allowedDrinks.includes(d._id)).map(d => (
                              <option key={d._id} value={d._id}>{d.name}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                    </div>
                  )}

                </div>

                {/* Packaging Section */}
                <div className="bg-surface-container-low border-2 border-outline rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-[10px] font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
                      <span className="w-2 h-2 bg-primary rounded-full"></span>
                      {isCombo ? "Combo" : "Standalone"} Packaging
                    </h4>
                    <button
                      type="button"
                      onClick={() => addPackagingItem(isCombo)}
                      className="bg-surface-container-highest text-on-surface px-3 py-1.5 rounded-lg font-black uppercase tracking-widest flex items-center gap-1 hover:bg-primary hover:text-on-primary transition-all text-[9px] border-2 border-outline shadow-[2px_2px_0px_0px_var(--shadow-color)]"
                    >
                      <Plus className="w-3 h-3" /> Add Packaging
                    </button>
                  </div>
                  
                  {isCombo && (
                    <p className="text-[9px] text-on-surface-variant/60 mb-4 italic">Note: Standalone packaging of selected sub-items will be ignored. These combo items are the only boxes used.</p>
                  )}

                  {((isCombo ? comboPackaging : standalonePackaging).length === 0) ? (
                    <div className="bg-surface-container-lowest border-2 border-dashed border-outline rounded-lg p-6 text-center">
                      <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase tracking-widest italic">No packaging assigned.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {(isCombo ? comboPackaging : standalonePackaging).map((item, idx) => {
                        const selectedIng = availableIngredients?.find(
                          (i) => i._id === item.ingredientId
                        );

                        return (
                          <div key={idx} className="flex flex-col sm:flex-row items-end sm:items-center gap-3 bg-surface-container-lowest p-3 rounded-lg border-2 border-outline shadow-[2px_2px_0px_0px_var(--shadow-color)]">
                            <div className="flex-1 w-full">
                              <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest mb-1 block">Container / Item</label>
                              <select
                                value={item.ingredientId}
                                onChange={(e) =>
                                  updatePackagingItem(isCombo, idx, "ingredientId", e.target.value)
                                }
                                className="w-full bg-surface-container-low border-2 border-outline rounded-lg px-3 py-2 text-on-surface font-bold uppercase tracking-wider text-[10px] focus:border-primary outline-none"
                              >
                                {availableIngredients?.filter(ing => ing.category === "Packaging").map((ing) => (
                                  <option key={ing._id} value={ing._id}>
                                    {ing.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div className="w-full sm:w-32">
                              <label className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest mb-1 block">Quantity</label>
                              <div className="flex items-center bg-surface-container-low border-2 border-outline rounded-lg overflow-hidden focus-within:border-primary transition-colors">
                                <input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={item.quantity}
                                  onChange={(e) =>
                                    updatePackagingItem(isCombo, idx, "quantity", parseFloat(e.target.value) || 0)
                                  }
                                  className="w-full bg-transparent px-3 py-2 text-on-surface font-bold text-center text-[10px] outline-none"
                                />
                              </div>
                            </div>

                            <button
                              type="button"
                              onClick={() => removePackagingItem(isCombo, idx)}
                              className="w-10 h-10 shrink-0 flex items-center justify-center rounded-lg bg-error/10 text-error hover:bg-error hover:text-white transition-all border-2 border-transparent hover:border-outline mt-2 sm:mt-0"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

              </div>
            </div>

            {/* Recipe Section */}
            <div>
              <div className="flex items-center justify-between mb-6 pb-2 border-b-2 border-black/10">
                <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.2em]">
                  2. Recipe Builder
                </h3>
                <button
                  type="button"
                  onClick={addRecipeItem}
                  className="bg-surface-container-highest text-on-surface px-4 py-2 rounded-lg font-black uppercase tracking-widest flex items-center gap-2 hover:bg-primary hover:text-on-primary transition-all text-[10px] border-2 border-outline shadow-hard"
                >
                  <Plus className="w-4 h-4" /> Add Ingredient
                </button>
              </div>

              {recipe.length === 0 ? (
                <div className="bg-surface-container-low border-2 border-dashed border-black rounded-lg p-10 text-center">
                  <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">No ingredients added yet.</p>
                  <p className="text-[10px] font-bold text-on-surface-variant/40 mt-1 uppercase tracking-widest italic">Add ingredients for automatic stock tracking.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {recipe.map((item, idx) => {
                    const selectedIng = availableIngredients?.find(
                      (i) => i._id === item.ingredientId
                    );

                    return (
                      <div key={idx} className="flex flex-col sm:flex-row items-end sm:items-center gap-4 bg-surface-container-low p-5 rounded-lg border-2 border-outline shadow-hard">
                        <div className="flex-1 w-full">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 block">Ingredient</label>
                          <select
                            value={item.ingredientId}
                            onChange={(e) =>
                              updateRecipeItem(idx, "ingredientId", e.target.value)
                            }
                            className="w-full bg-surface-container-lowest border-2 border-outline rounded-lg px-3 py-2 text-on-surface font-black uppercase tracking-wider text-[10px] focus:border-primary outline-none"
                          >
                            {availableIngredients?.filter(ing => ing.category !== "Packaging").map((ing) => (
                              <option key={ing._id} value={ing._id}>
                                {ing.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="w-full sm:w-40">
                          <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-2 block">Qty Used</label>
                          <div className="flex items-center bg-surface-container-lowest border-2 border-outline rounded-lg overflow-hidden focus-within:border-primary transition-colors">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.quantity}
                              onChange={(e) =>
                                updateRecipeItem(idx, "quantity", parseFloat(e.target.value) || 0)
                              }
                              className="w-full bg-transparent px-3 py-2 text-on-surface font-black uppercase tracking-wider text-[10px] outline-none"
                            />
                            <span className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-on-surface bg-surface-container-highest border-l-2 border-outline">
                              {selectedIng?.unit || "-"}
                            </span>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeRecipeItem(idx)}
                          className="w-12 h-12 shrink-0 flex items-center justify-center rounded-lg bg-error/10 text-error hover:bg-error hover:text-white transition-all border-2 border-transparent hover:border-outline mt-2 sm:mt-0"
                        >
                          <Trash2 className="w-6 h-6" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </form>
        </div>

        {/* Footer */}
        <div className="p-8 border-t-4 border-black bg-surface-container-low flex justify-end gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-8 py-4 rounded-lg font-black uppercase tracking-widest text-[10px] text-on-surface-variant hover:bg-surface-container-high transition-colors border-2 border-transparent hover:border-black"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="dishForm"
            className="bg-primary text-on-primary px-10 py-4 rounded-lg font-black uppercase tracking-widest text-[10px] border-2 border-outline shadow-hard hover:scale-[1.02] transition-all active:scale-[0.98]"
          >
            {initialData ? "Save Changes" : "Create Dish"}
          </button>
        </div>
      </div>
    </div>
  );
}
