"use client";

import { useState, useRef } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import {
  ChefHat,
  Plus,
  Search,
  CheckCircle2,
  XCircle,
  Play,
  Trash2,
  AlertCircle,
  ChevronDown,
  Calendar,
  Layers,
  History,
  FileText,
  Edit2,
  X
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Reusable Searchable Dropdown for Ingredient Select
function SearchableIngredientSelect({
  value,
  onChange,
  options,
  placeholder = "Search ingredient..."
}: {
  value: string;
  onChange: (id: string) => void;
  options: any[];
  placeholder?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const triggerRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });
  
  const selectedOption = options.find((opt) => opt._id === value);
  const filtered = options.filter((opt) =>
    opt.name.toLowerCase().includes(search.toLowerCase())
  );

  const openDropdown = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    }
    setIsOpen(true);
    setSearch("");
  };

  return (
    <div className="relative w-full">
      <div
        ref={triggerRef}
        onClick={() => {
          if (isOpen) setIsOpen(false);
          else openDropdown();
        }}
        className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-black uppercase tracking-wider text-[11px] cursor-pointer flex justify-between items-center transition-colors hover:border-primary"
      >
        <span className="truncate">{selectedOption ? selectedOption.name : placeholder}</span>
        <ChevronDown className="w-4 h-4 opacity-40 flex-shrink-0 ml-2" />
      </div>

      {isOpen && (
        <>
          {/* Overlay to catch clicks outside the dropdown */}
          <div className="fixed inset-0 z-[100]" onClick={() => setIsOpen(false)} />
          <div 
            className="fixed bg-surface border-2 border-black rounded-2xl shadow-hard z-[105] max-h-[400px] flex flex-col p-2.5"
            style={{ top: coords.top, left: coords.left, width: coords.width }}
          >
            <div className="relative mb-2 shrink-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-40 text-on-surface" />
              <input
                type="text"
                autoFocus
                placeholder="Search..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full bg-surface-container-high border border-outline-variant rounded-lg pl-8 pr-3 py-2 text-[10px] font-bold uppercase outline-none focus:border-primary text-on-surface"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <span className="text-[10px] text-on-surface-variant p-2 uppercase font-bold italic opacity-60 block">No items found</span>
              ) : (
                filtered.map((opt) => (
                  <div
                    key={opt._id}
                    onClick={() => {
                      onChange(opt._id);
                      setIsOpen(false);
                      setSearch("");
                    }}
                    className={cn(
                      "px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider cursor-pointer hover:bg-primary hover:text-on-primary transition-colors text-on-surface mb-0.5 flex justify-between items-center",
                      opt._id === value && "bg-primary/10 text-primary border border-primary/20"
                    )}
                  >
                    <div>
                      <div>{opt.name}</div>
                      <div className="text-[8px] font-bold opacity-60">{opt.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="opacity-80">{opt.stockQuantity}</div>
                      <div className="text-[8px] font-bold opacity-60">{opt.unit}</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function KitchenPage() {
  const recipes = useQuery(api.factory.listRecipes);
  const logs = useQuery(api.factory.listLogs);
  const ingredients = useQuery(api.ingredients.list);

  const addRecipe = useMutation(api.factory.addRecipe);
  const updateRecipe = useMutation(api.factory.updateRecipe);
  const removeRecipe = useMutation(api.factory.removeRecipe);
  const produceBatch = useMutation(api.factory.produceBatch);
  const reverseBatch = useMutation(api.factory.reverseBatch);

  // States
  const [activeTab, setActiveTab] = useState<"dashboard" | "recipes" | "history">("dashboard");
  const [isProduceModalOpen, setIsProduceModalOpen] = useState(false);
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  
  // Produce Batch state
  const [selectedRecipeId, setSelectedRecipeId] = useState<string>("");
  const [produceQuantity, setProduceQuantity] = useState<string>("");
  const [produceNotes, setProduceNotes] = useState<string>("");
  const [isProducing, setIsProducing] = useState(false);

  // Recipe Creation / Editing state
  const [recipeProducedId, setRecipeProducedId] = useState<string>("");
  const [recipeOutputQty, setRecipeOutputQty] = useState<string>("");
  const [recipeCategory, setRecipeCategory] = useState<string>("");
  const [recipeNotes, setRecipeNotes] = useState<string>("");
  const [recipeIngredients, setRecipeIngredients] = useState<Array<{ ingredientId: string; quantity: string }>>([
    { ingredientId: "", quantity: "" }
  ]);
  const [isSavingRecipe, setIsSavingRecipe] = useState(false);
  const [actionAfterSave, setActionAfterSave] = useState<"close" | "produce">("close");
  const [isReversingId, setIsReversingId] = useState<string | null>(null);

  // History filtering states
  const [historySearch, setHistorySearch] = useState("");

  // Helpers
  const factoryItems = (ingredients ?? []).filter((i) => i.category === "Kitchen");
  const rawIngredients = (ingredients ?? []).filter((i) => i.category !== "Kitchen");

  const getStatus = (ing: any) => {
    if (ing.stockQuantity <= 0) {
      return { label: "Out of Stock", color: "bg-error/10 text-error border-error/20", icon: XCircle };
    }
    if (ing.stockQuantity <= ing.lowStockThreshold) {
      return { label: "Low Prep Level", color: "bg-tertiary/10 text-tertiary border-tertiary/20", icon: AlertCircle };
    }
    return { label: "Good Stock", color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle2 };
  };

  // Live preview logic for production batch
  const selectedRecipe = recipes?.find((r) => r._id === selectedRecipeId);
  const qtyToProduceNum = parseFloat(produceQuantity) || 0;
  
  const previewRequirements = selectedRecipe && qtyToProduceNum > 0
    ? selectedRecipe.ingredients.map((ing: any) => {
        const currentInStock = (ingredients ?? []).find((i) => i._id === ing.ingredientId);
        const scaleFactor = qtyToProduceNum / selectedRecipe.outputQuantity;
        const needed = ing.quantity * scaleFactor;
        const isSufficient = currentInStock ? currentInStock.stockQuantity >= needed : false;
        
        return {
          id: ing.ingredientId,
          name: ing.name,
          unit: ing.unit,
          needed,
          currentStock: currentInStock?.stockQuantity || 0,
          isSufficient,
        };
      })
    : [];

  const isProductionValid = previewRequirements.length > 0 && previewRequirements.every((r) => r.isSufficient);

  // Handle Recipe submission (Create or Edit)
  const handleSaveRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipeProducedId || !recipeOutputQty) {
      toast.error("Please select a produced item and specify standard output quantity.");
      return;
    }

    const validIngredients = recipeIngredients.filter((ri) => ri.ingredientId && parseFloat(ri.quantity) > 0);
    if (validIngredients.length === 0) {
      toast.error("Please add at least one raw ingredient with a valid quantity.");
      return;
    }

    setIsSavingRecipe(true);
    try {
      let savedRecipeId = null;
      if (editingRecipeId) {
        await updateRecipe({
          id: editingRecipeId as any,
          producedIngredientId: recipeProducedId as any,
          outputQuantity: parseFloat(recipeOutputQty),
          category: recipeCategory || undefined,
          notes: recipeNotes || undefined,
          ingredients: validIngredients.map((ri) => ({
            ingredientId: ri.ingredientId as any,
            quantity: parseFloat(ri.quantity),
          })),
        });
        savedRecipeId = editingRecipeId;
        toast.success("Recipe updated successfully!");
      } else {
        savedRecipeId = await addRecipe({
          producedIngredientId: recipeProducedId as any,
          outputQuantity: parseFloat(recipeOutputQty),
          category: recipeCategory || undefined,
          notes: recipeNotes || undefined,
          ingredients: validIngredients.map((ri) => ({
            ingredientId: ri.ingredientId as any,
            quantity: parseFloat(ri.quantity),
          })),
        });
        toast.success("Recipe created successfully!");
      }
      
      setIsRecipeModalOpen(false);
      setEditingRecipeId(null);
      // Reset form
      const qtyStr = recipeOutputQty;
      setRecipeProducedId("");
      setRecipeOutputQty("");
      setRecipeCategory("");
      setRecipeNotes("");
      setRecipeIngredients([{ ingredientId: "", quantity: "" }]);

      if (actionAfterSave === "produce" && savedRecipeId) {
        setSelectedRecipeId(savedRecipeId as string);
        setProduceQuantity(qtyStr);
        setProduceNotes("");
        setTimeout(() => setIsProduceModalOpen(true), 100);
      }
      setActionAfterSave("close");
    } catch (err: any) {
      toast.error(err.message || "Failed to save recipe");
    } finally {
      setIsSavingRecipe(false);
    }
  };

  // Open recipe edit modal
  const handleOpenEditRecipe = (recipe: any) => {
    setEditingRecipeId(recipe._id);
    setRecipeProducedId(recipe.producedIngredientId);
    setRecipeOutputQty(recipe.outputQuantity.toString());
    setRecipeCategory(recipe.category || "");
    setRecipeNotes(recipe.notes || "");
    setRecipeIngredients(
      recipe.ingredients.map((ing: any) => ({
        ingredientId: ing.ingredientId,
        quantity: ing.quantity.toString()
      }))
    );
    setIsRecipeModalOpen(true);
  };

  // Handle production batch trigger
  const handleProduceBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecipeId || qtyToProduceNum <= 0) return;

    if (!isProductionValid) {
      toast.error("Cannot produce: Insufficient raw ingredients in stock!");
      return;
    }

    setIsProducing(true);
    try {
      await produceBatch({
        recipeId: selectedRecipeId as any,
        quantity: qtyToProduceNum,
        notes: produceNotes || undefined,
      });
      toast.success(`Successfully prepped and added ${qtyToProduceNum} of prepped stock!`);
      setIsProduceModalOpen(false);
      setProduceQuantity("");
      setProduceNotes("");
      setSelectedRecipeId("");
    } catch (err: any) {
      toast.error(err.message || "Production failed.");
    } finally {
      setIsProducing(false);
    }
  };

  // Reversing a production batch
  const handleReverseBatch = async (logId: string) => {
    setIsReversingId(logId);
    try {
      await reverseBatch({ id: logId as any });
      toast.success("Batch successfully deleted and inventory stock restored!");
    } catch (err: any) {
      toast.error(err.message || "Failed to reverse batch.");
    } finally {
      setIsReversingId(null);
    }
  };

  // Recipe dynamic input rows helpers
  const handleAddIngredientRow = () => {
    setRecipeIngredients([...recipeIngredients, { ingredientId: "", quantity: "" }]);
  };

  const handleRemoveIngredientRow = (index: number) => {
    const next = [...recipeIngredients];
    next.splice(index, 1);
    setRecipeIngredients(next.length === 0 ? [{ ingredientId: "", quantity: "" }] : next);
  };

  const handleIngredientRowChange = (index: number, field: "ingredientId" | "quantity", value: string) => {
    const next = [...recipeIngredients];
    next[index][field] = value;
    setRecipeIngredients(next);
  };

  // Filter logs for history list
  const filteredLogs = (logs ?? []).filter((log: any) =>
    log.producedIngredientName.toLowerCase().includes(historySearch.toLowerCase())
  );

  return (
    <PageLayout>
      <div className="space-y-8 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8 lg:mb-12">
          <div>
            <h1 className="text-3xl lg:text-5xl 2xl:text-7xl font-display text-on-surface leading-none mb-2 uppercase tracking-tighter">Production</h1>
            <p className="text-on-surface-variant font-bold uppercase tracking-[0.2em] text-[10px] lg:text-xs opacity-60">
              Operational batch production
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setEditingRecipeId(null);
                setRecipeProducedId("");
                setRecipeOutputQty("");
                setRecipeCategory("");
                setRecipeNotes("");
                setRecipeIngredients([{ ingredientId: "", quantity: "" }]);
                setIsRecipeModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-surface text-on-surface border-2 border-black rounded-2xl text-[10px] font-black uppercase tracking-widest hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-x-0 active:translate-y-0 active:shadow-none transition-all shadow-hard-sm"
            >
              <Plus className="w-5 h-5 text-primary" />
              New Recipe
            </button>
            <button
              onClick={() => {
                setSelectedRecipeId(recipes && recipes.length > 0 ? recipes[0]._id : "");
                setProduceQuantity("");
                setProduceNotes("");
                setIsProduceModalOpen(true);
              }}
              className="inline-flex items-center justify-center gap-2 px-6 py-4 bg-primary text-on-primary border-brutal rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-secondary active:scale-95 transition-all shadow-hard-sm"
            >
              <Play className="w-5 h-5" />
              Produce Batch
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-8 border-b-4 border-outline mb-8">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={cn(
              "pb-4 px-2 text-sm font-black uppercase tracking-[0.2em] transition-all relative",
              activeTab === "dashboard" ? "text-primary" : "text-on-surface-variant opacity-40 hover:opacity-100"
            )}
          >
            Dashboard
            {activeTab === "dashboard" && (
              <div className="absolute -bottom-1 left-0 right-0 h-1.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("recipes")}
            className={cn(
              "pb-4 px-2 text-sm font-black uppercase tracking-[0.2em] transition-all relative",
              activeTab === "recipes" ? "text-primary" : "text-on-surface-variant opacity-40 hover:opacity-100"
            )}
          >
            Active Recipes
            {activeTab === "recipes" && (
              <div className="absolute -bottom-1 left-0 right-0 h-1.5 bg-primary" />
            )}
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={cn(
              "pb-4 px-2 text-sm font-black uppercase tracking-[0.2em] transition-all relative",
              activeTab === "history" ? "text-primary" : "text-on-surface-variant opacity-40 hover:opacity-100"
            )}
          >
            Production Logs
            {activeTab === "history" && (
              <div className="absolute -bottom-1 left-0 right-0 h-1.5 bg-primary" />
            )}
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === "dashboard" && (
          <div className="space-y-8">
            {/* Low stock alerts */}
            {factoryItems.some(i => i.stockQuantity <= i.lowStockThreshold) && (
              <div className="bg-tertiary/10 border-2 border-tertiary rounded-2xl p-6 shadow-hard flex items-start gap-4">
                <AlertCircle className="w-8 h-8 text-tertiary flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-base font-black text-on-surface uppercase tracking-wider">Low Prep Alerts</h3>
                  <p className="text-xs text-on-surface-variant font-medium mt-1">
                    The following prepped items have fallen below their minimum stock thresholds. Arrange kitchen production batches to fulfill these deficits.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {factoryItems
                      .filter(i => i.stockQuantity <= i.lowStockThreshold)
                      .map(i => (
                        <div key={i._id} className="bg-surface border border-outline px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                          <span>{i.name}: {i.stockQuantity} / {i.lowStockThreshold} {i.unit}</span>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Grid display of prep stock */}
            <div className="bg-surface border-2 border-outline rounded-lg shadow-hard p-6">
              <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                <Layers className="w-4 h-4 text-primary" /> Current Kitchen Prepared Inventory
              </h3>

              {factoryItems.length === 0 ? (
                <div className="text-center py-16 text-on-surface-variant/40 font-bold uppercase tracking-widest">
                  <ChefHat className="w-16 h-16 mx-auto mb-4 opacity-40" />
                  No ingredients listed in "Kitchen" category.<br />
                  <span className="text-[10px] font-medium lowercase italic">add ingredients with Category: Kitchen under Inventory page</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {factoryItems.map((item) => {
                    const status = getStatus(item);
                    return (
                      <div key={item._id} className="bg-surface-container-low border-2 border-black rounded-2xl p-6 shadow-hard flex flex-col justify-between gap-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-black text-on-surface text-lg uppercase tracking-tight leading-tight">{item.name}</h4>
                            <span className="text-[9px] font-bold text-on-surface-variant uppercase tracking-wider opacity-60">
                              Unit: {item.unit}
                            </span>
                          </div>
                          <span className={cn("px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest border border-black/10", status.color)}>
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-baseline gap-1 mt-2">
                          <span className="text-4xl font-display text-primary tracking-tighter">{item.stockQuantity}</span>
                          <span className="text-xs font-black text-on-surface-variant uppercase tracking-wider">{item.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "recipes" && (
          <div className="bg-surface border-2 border-outline rounded-lg shadow-hard overflow-hidden">
            <div className="p-6 border-b-2 border-outline bg-surface-container-low/50">
              <h3 className="text-xs font-black text-on-surface-variant uppercase tracking-[0.2em] flex items-center gap-2">
                <FileText className="w-4 h-4 text-primary" /> Defined Recipes
              </h3>
            </div>
            
            {recipes && recipes.length === 0 ? (
              <div className="text-center py-20 text-on-surface-variant/40 font-bold uppercase tracking-widest">
                <Layers className="w-16 h-16 mx-auto mb-4 opacity-40" />
                No kitchen recipes defined yet.
              </div>
            ) : (
              <div className="divide-y-2 divide-black">
                {recipes?.map((recipe: any) => (
                  <div key={recipe._id} className="p-6 hover:bg-primary/5 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-surface-container-high border border-black flex items-center justify-center text-primary shadow-hard-sm">
                          <ChefHat className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-display text-xl text-on-surface uppercase tracking-wider">{recipe.producedIngredientName}</h4>
                          <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest opacity-60">
                            Recipe Standard Output: {recipe.outputQuantity} {recipe.producedIngredientUnit}
                          </p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-2">
                        {recipe.ingredients.map((ing: any, idx: number) => (
                          <div key={idx} className="bg-surface-container-high border border-black/10 px-3 py-1 rounded-xl text-[10px] font-bold text-on-surface flex items-center gap-1.5">
                            <span className="font-black text-primary">{ing.quantity} {ing.unit}</span>
                            <span className="text-on-surface-variant">{ing.name}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3 self-end lg:self-center">
                      <button
                        onClick={() => {
                          setSelectedRecipeId(recipe._id);
                          setProduceQuantity(recipe.outputQuantity.toString());
                          setProduceNotes("");
                          setIsProduceModalOpen(true);
                        }}
                        className="bg-primary text-on-primary px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-secondary active:scale-95 transition-all shadow-hard-sm border-2 border-black/10 flex items-center gap-1.5"
                      >
                        <Play className="w-4 h-4" /> Produce
                      </button>
                      <button
                        onClick={() => handleOpenEditRecipe(recipe)}
                        className="p-2.5 rounded-xl text-on-surface-variant hover:bg-surface-container-high border border-transparent hover:border-outline-variant transition-all"
                        title="Edit Recipe"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          toast(`Delete recipe for ${recipe.producedIngredientName}?`, {
                            action: {
                              label: "Delete",
                              onClick: async () => {
                                try {
                                  await removeRecipe({ id: recipe._id });
                                  toast.success("Recipe deleted");
                                } catch (err: any) {
                                  toast.error(err.message || "Failed to delete recipe");
                                }
                              }
                            },
                            cancel: {
                              label: "Cancel",
                              onClick: () => {}
                            },
                          });
                        }}
                        className="p-2.5 rounded-xl text-error hover:bg-error/10 border border-transparent hover:border-outline-variant transition-all"
                        title="Delete Recipe"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === "history" && (
          <div className="bg-surface border-2 border-outline rounded-lg shadow-hard overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-6 border-b-2 border-outline bg-surface-container-low/50 space-y-4">
              <div className="relative max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input
                  type="text"
                  placeholder="Search logs by prep item..."
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  className="w-full bg-surface border-2 border-black rounded-lg pl-10 pr-4 py-2.5 outline-none focus:border-primary transition-all font-bold uppercase tracking-wider text-[11px]"
                />
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-separate border-spacing-0">
                <thead className="sticky top-0 z-10 bg-black text-white">
                  <tr>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em]">Date</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em]">Prep Item</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-right">Quantity Produced</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] hide-on-mobile">Notes</th>
                    <th className="px-6 py-4 text-[10px] font-black uppercase tracking-[0.2em] text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y-2 divide-black bg-surface">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-20 text-center text-on-surface-variant font-bold uppercase tracking-widest opacity-40">
                        <History className="w-16 h-16 mx-auto mb-4" />
                        No production batches recorded.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log: any) => (
                      <tr key={log._id} className="hover:bg-primary/5 transition-colors">
                        <td className="px-6 py-4">
                          <span className="text-[10px] font-black text-on-surface flex items-center gap-1.5 uppercase tracking-wider">
                            <Calendar className="w-3.5 h-3.5 text-primary" /> {format(log.producedAt, "dd/MM/yyyy HH:mm")}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-black text-on-surface uppercase text-sm tracking-wide">
                          {log.producedIngredientName}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <span className="font-display text-lg text-primary tracking-tighter">
                            +{log.quantityProduced}
                          </span>
                          <span className="ml-1 text-[9px] font-bold text-on-surface-variant uppercase tracking-wider">
                            {log.producedIngredientUnit}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-on-surface-variant tracking-wide hide-on-mobile">
                          {log.notes || "—"}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            disabled={isReversingId === log._id}
                            onClick={() => {
                              toast(`Reverse batch for ${log.producedIngredientName}?`, {
                                description: "This will deduct produced stock and restore raw ingredients.",
                                action: {
                                  label: "Reverse & Delete",
                                  onClick: () => handleReverseBatch(log._id)
                                },
                                cancel: {
                                  label: "Cancel",
                                  onClick: () => {}
                                },
                              });
                            }}
                            className={cn(
                              "p-2 rounded-xl text-error hover:bg-error/10 border border-transparent hover:border-outline-variant transition-all",
                              isReversingId === log._id && "opacity-45 cursor-not-allowed animate-pulse"
                            )}
                            title="Reverse/Delete Batch"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* PRODUCE BATCH MODAL */}
      {isProduceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-outline-variant">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-outline-variant bg-surface-container-low">
              <h2 className="text-xl font-black text-on-surface uppercase tracking-wider">Log Kitchen Prep Production</h2>
              <button
                onClick={() => setIsProduceModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-surface-container-highest hover:bg-error hover:text-on-error transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleProduceBatch} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
              {/* Recipe Selector */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Select Recipe *</label>
                <div className="relative">
                  <select
                    required
                    value={selectedRecipeId}
                    onChange={(e) => {
                      setSelectedRecipeId(e.target.value);
                      const rec = recipes?.find((r: any) => r._id === e.target.value);
                      if (rec) setProduceQuantity(rec.outputQuantity.toString());
                    }}
                    className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-black uppercase tracking-wider text-xs focus:border-primary outline-none appearance-none cursor-pointer"
                  >
                    <option value="" disabled>Choose a prep recipe</option>
                    {recipes?.map((recipe: any) => (
                      <option key={recipe._id} value={recipe._id}>
                        {recipe.producedIngredientName} (standard output: {recipe.outputQuantity} {recipe.producedIngredientUnit})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40" />
                </div>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Quantity to Produce ({selectedRecipe?.producedIngredientUnit || "units"}) *</label>
                <input
                  required
                  type="number"
                  step="any"
                  min="0.01"
                  placeholder="e.g. 20"
                  value={produceQuantity}
                  onChange={(e) => setProduceQuantity(e.target.value)}
                  className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-black text-sm focus:border-primary outline-none"
                />
              </div>

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Production Notes / Batch Number</label>
                <input
                  type="text"
                  placeholder="e.g. Morning shift production run"
                  value={produceNotes}
                  onChange={(e) => setProduceNotes(e.target.value)}
                  className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-bold text-xs focus:border-primary outline-none"
                />
              </div>

              {/* Raw materials live checklist preview */}
              {previewRequirements.length > 0 && (
                <div className="pt-4 border-t-2 border-black/10 space-y-3">
                  <h4 className="text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Required Raw Materials Stock Check</h4>
                  <div className="space-y-2">
                    {previewRequirements.map((req: any) => (
                      <div
                        key={req.id}
                        className={cn(
                          "flex justify-between items-center p-3 rounded-xl border-2 transition-all",
                          req.isSufficient
                            ? "bg-green-500/5 border-green-500/20"
                            : "bg-error/5 border-error/20"
                        )}
                      >
                        <div className="flex flex-col">
                          <span className="font-bold text-xs text-on-surface uppercase tracking-wide">{req.name}</span>
                          <span className="text-[9px] font-semibold text-on-surface-variant tracking-wider">
                            Needed: {req.needed.toFixed(2)} {req.unit} | Available: {req.currentStock.toFixed(2)} {req.unit}
                          </span>
                        </div>
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border",
                          req.isSufficient
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-error/10 text-error border-error/20"
                        )}>
                          {req.isSufficient ? "Stock OK" : "Shortage"}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Submit */}
              <div className="pt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsProduceModalOpen(false)}
                  className="px-6 py-3 rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProducing || !isProductionValid}
                  className={cn(
                    "px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-soft transition-all active:scale-95",
                    isProductionValid
                      ? "bg-primary text-on-primary hover:bg-secondary border-brutal"
                      : "bg-surface-container-high text-on-surface-variant border-2 border-dashed border-outline-variant cursor-not-allowed opacity-50"
                  )}
                >
                  {isProducing ? "Processing..." : "Produce Batch"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* RECIPE CREATION & EDITING MODAL (ERP LAYOUT) */}
      {isRecipeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 lg:p-8 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-[100vw] h-[100vh] sm:w-[95vw] sm:h-[95vh] lg:w-[90vw] lg:h-[90vh] rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-outline-variant animate-in fade-in-50 zoom-in-95 duration-150">
            {/* Header (Sticky Top) */}
            <div className="flex items-center justify-between p-6 border-b border-outline-variant bg-surface-container-low shrink-0">
              <div>
                <h2 className="text-2xl font-black text-on-surface uppercase tracking-wider">
                  {editingRecipeId ? "Edit Prep Recipe" : "Define Prep Recipe"}
                </h2>
                <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mt-1 opacity-60">
                  Configure standardized manufacturing formulas
                </p>
              </div>
              <button
                onClick={() => {
                  setIsRecipeModalOpen(false);
                  setEditingRecipeId(null);
                }}
                className="w-12 h-12 flex items-center justify-center rounded-full bg-surface-container-highest hover:bg-error hover:text-on-error transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Form Body & Footer */}
            <form onSubmit={handleSaveRecipe} className="flex flex-col flex-1 overflow-hidden">
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Left Column: Recipe Info (40%) */}
                <div className="lg:w-[40%] bg-surface-container-low/30 border-r border-outline-variant/60 p-6 lg:p-8 overflow-y-auto space-y-8">
                  <div className="space-y-6">
                    <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.2em] border-b-2 border-black/10 pb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-primary" />
                      Recipe Information
                    </h3>
                    
                    {/* Target prep item */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Prepped Item to Produce (Kitchen Category) *</label>
                      <div className="relative">
                        <select
                          required
                          value={recipeProducedId}
                          onChange={(e) => setRecipeProducedId(e.target.value)}
                          className="w-full bg-surface border-2 border-black rounded-xl px-4 py-4 text-on-surface font-black uppercase tracking-wider text-xs focus:border-primary outline-none appearance-none cursor-pointer"
                        >
                          <option value="" disabled>Choose kitchen item...</option>
                          {factoryItems.map((item: any) => (
                            <option key={item._id} value={item._id}>
                              {item.name} ({item.unit})
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="w-5 h-5 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none opacity-40" />
                      </div>
                    </div>

                    {/* Output quantity */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Yield / Output Quantity *</label>
                      <input
                        required
                        type="number"
                        step="any"
                        min="0.01"
                        placeholder="e.g. 10.00"
                        value={recipeOutputQty}
                        onChange={(e) => setRecipeOutputQty(e.target.value)}
                        className="w-full bg-surface border-2 border-black rounded-xl px-4 py-4 text-on-surface font-black text-lg focus:border-primary outline-none"
                      />
                    </div>

                    {/* Category */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Recipe Category</label>
                      <input
                        type="text"
                        placeholder="e.g. Sauce Base, Marinade..."
                        value={recipeCategory}
                        onChange={(e) => setRecipeCategory(e.target.value)}
                        className="w-full bg-surface border-2 border-black rounded-xl px-4 py-4 text-on-surface font-black text-sm focus:border-primary outline-none"
                      />
                    </div>

                    {/* Notes */}
                    <div className="space-y-2">
                      <label className="text-[11px] font-black text-on-surface-variant uppercase tracking-[0.2em]">Recipe Notes & Instructions</label>
                      <textarea
                        placeholder="e.g. Blend for 5 minutes until smooth..."
                        value={recipeNotes}
                        onChange={(e) => setRecipeNotes(e.target.value)}
                        className="w-full bg-surface border-2 border-black rounded-xl px-4 py-4 text-on-surface font-bold text-sm focus:border-primary outline-none h-32 resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Right Column: Ingredients Table (60%) */}
                <div className="lg:w-[60%] p-6 lg:p-8 overflow-y-auto flex flex-col">
                  <div className="flex justify-between items-center border-b-2 border-black/10 pb-4 mb-6 shrink-0">
                    <h3 className="text-sm font-black text-on-surface uppercase tracking-[0.2em] flex items-center gap-2">
                      <Layers className="w-5 h-5 text-primary" />
                      Ingredient Composition
                    </h3>
                    <button
                      type="button"
                      onClick={handleAddIngredientRow}
                      className="inline-flex items-center gap-1.5 text-xs font-black text-primary uppercase tracking-widest bg-primary/10 hover:bg-primary border border-primary/20 hover:text-on-primary px-4 py-2.5 rounded-xl transition-all shadow-hard-sm"
                    >
                      <Plus className="w-4 h-4" /> Add Row
                    </button>
                  </div>

                  {/* Table */}
                  <div className="border-2 border-black rounded-2xl overflow-hidden bg-surface-container-low flex-1">
                    <table className="w-full border-collapse">
                      <thead className="sticky top-0 z-10 bg-black text-white">
                        <tr className="text-left">
                          <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[40%]">Ingredient *</th>
                          <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[20%]">Quantity Required *</th>
                          <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[15%] text-center">Unit</th>
                          <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[15%] text-center">Current Stock</th>
                          <th className="px-5 py-4 text-[10px] font-black uppercase tracking-[0.2em] w-[10%] text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y-2 divide-black bg-surface">
                        {recipeIngredients.map((ri: any, index: number) => {
                          const selectedIngDetail = rawIngredients.find((r: any) => r._id === ri.ingredientId);
                          return (
                            <tr key={index} className="hover:bg-primary/5 transition-colors">
                              {/* Dropdown */}
                              <td className="px-5 py-4">
                                <SearchableIngredientSelect
                                  value={ri.ingredientId}
                                  onChange={(id) => handleIngredientRowChange(index, "ingredientId", id)}
                                  options={rawIngredients}
                                  placeholder="Select raw material..."
                                />
                              </td>
                              {/* Quantity */}
                              <td className="px-5 py-4">
                                <input
                                  required
                                  type="number"
                                  step="any"
                                  min="0.001"
                                  placeholder="0.00"
                                  value={ri.quantity}
                                  onChange={(e) => handleIngredientRowChange(index, "quantity", e.target.value)}
                                  className="w-full bg-surface-container-high border-2 border-black rounded-xl px-4 py-3 text-on-surface font-black text-sm outline-none focus:border-primary"
                                />
                              </td>
                              {/* Unit */}
                              <td className="px-5 py-4">
                                {selectedIngDetail ? (
                                  <span className="bg-surface-container-high px-3 py-2 rounded-lg border border-black/10 block text-center truncate text-[11px] font-black uppercase text-on-surface">
                                    {selectedIngDetail.unit}
                                  </span>
                                ) : (
                                  <span className="text-on-surface-variant/40 block text-center text-xs font-bold">—</span>
                                )}
                              </td>
                              {/* Current Stock */}
                              <td className="px-5 py-4">
                                {selectedIngDetail ? (
                                  <span className={cn(
                                    "px-3 py-2 rounded-lg border border-black/10 block text-center text-[11px] font-black uppercase",
                                    selectedIngDetail.stockQuantity > 0 ? "bg-green-500/10 text-green-700" : "bg-error/10 text-error"
                                  )}>
                                    {selectedIngDetail.stockQuantity}
                                  </span>
                                ) : (
                                  <span className="text-on-surface-variant/40 block text-center text-xs font-bold">—</span>
                                )}
                              </td>
                              {/* Actions */}
                              <td className="px-5 py-4 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveIngredientRow(index)}
                                  className="p-3 text-error bg-error/10 hover:bg-error hover:text-on-error border-2 border-transparent hover:border-error rounded-xl transition-all"
                                >
                                  <Trash2 className="w-5 h-5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Footer (Sticky Bottom) */}
              <div className="p-6 lg:px-8 border-t border-outline-variant bg-surface-container-low flex flex-col sm:flex-row justify-between items-center gap-4 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecipeModalOpen(false);
                    setEditingRecipeId(null);
                  }}
                  className="w-full sm:w-auto px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest text-on-surface-variant hover:bg-surface-container-high border-2 border-transparent hover:border-outline-variant transition-all"
                >
                  Cancel
                </button>
                <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                  <button
                    type="submit"
                    onClick={() => setActionAfterSave("close")}
                    disabled={isSavingRecipe}
                    className="w-full sm:w-auto bg-surface text-on-surface px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:-translate-y-1 transition-all shadow-hard-sm border-2 border-black disabled:opacity-50"
                  >
                    {isSavingRecipe && actionAfterSave === "close" ? "Saving..." : "Save Recipe"}
                  </button>
                  <button
                    type="submit"
                    onClick={() => setActionAfterSave("produce")}
                    disabled={isSavingRecipe}
                    className="w-full sm:w-auto bg-primary text-on-primary px-8 py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-secondary transition-all shadow-hard active:scale-95 border-brutal flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Play className="w-4 h-4" />
                    {isSavingRecipe && actionAfterSave === "produce" ? "Saving..." : "Save & Start Production"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
