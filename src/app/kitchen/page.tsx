"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { ChefHat, Plus, Play, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";

// Extracted Sub-components
import { PrepStockGrid } from "@/components/kitchen/PrepStockGrid";
import { RecipeList } from "@/components/kitchen/RecipeList";
import { ProductionLogsTable } from "@/components/kitchen/ProductionLogsTable";
import { ProduceBatchModal } from "@/components/kitchen/ProduceBatchModal";
import { RecipeModal } from "@/components/kitchen/RecipeModal";

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
  const factoryItems = (ingredients ?? []).filter((i) => i.category?.toLowerCase() === "kitchen");
  const rawIngredients = (ingredients ?? []).filter((i) => i.category?.toLowerCase() !== "kitchen");

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
    <PageLayout title="Kitchen Production" subtitle="Operational Batch Production & Recipes">
      <div className="space-y-8 pb-12">
        {/* Header Actions */}
        <div className="flex justify-end gap-3 mb-8 lg:mb-12">
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
          {(["dashboard", "recipes", "history"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "pb-4 px-2 text-sm font-black uppercase tracking-[0.2em] transition-all relative",
                activeTab === tab ? "text-primary" : "text-on-surface-variant opacity-40 hover:opacity-100"
              )}
            >
              {tab === "history" ? "Production Logs" : tab === "recipes" ? "Active Recipes" : "Dashboard"}
              {activeTab === tab && (
                <div className="absolute -bottom-1 left-0 right-0 h-1.5 bg-primary" />
              )}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        {activeTab === "dashboard" && (
          <PrepStockGrid factoryItems={factoryItems} getStatus={getStatus} />
        )}

        {activeTab === "recipes" && (
          <RecipeList
            recipes={recipes}
            onProduceClick={(recipe) => {
              setSelectedRecipeId(recipe._id);
              setProduceQuantity(recipe.outputQuantity.toString());
              setProduceNotes("");
              setIsProduceModalOpen(true);
            }}
            onEditClick={handleOpenEditRecipe}
            onDeleteClick={(recipe) => {
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
          />
        )}

        {activeTab === "history" && (
          <ProductionLogsTable
            historySearch={historySearch}
            setHistorySearch={setHistorySearch}
            filteredLogs={filteredLogs}
            isReversingId={isReversingId}
            onReverseBatch={(log) => {
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
          />
        )}
      </div>

      {/* Produce Batch Modal */}
      <ProduceBatchModal
        isOpen={isProduceModalOpen}
        onClose={() => setIsProduceModalOpen(false)}
        recipes={recipes}
        ingredients={ingredients}
        selectedRecipeId={selectedRecipeId}
        setSelectedRecipeId={setSelectedRecipeId}
        produceQuantity={produceQuantity}
        setProduceQuantity={setProduceQuantity}
        produceNotes={produceNotes}
        setProduceNotes={setProduceNotes}
        previewRequirements={previewRequirements}
        isProductionValid={isProductionValid}
        isProducing={isProducing}
        onProduce={handleProduceBatch}
      />

      {/* Recipe Create/Edit Modal */}
      <RecipeModal
        isOpen={isRecipeModalOpen}
        onClose={() => {
          setIsRecipeModalOpen(false);
          setEditingRecipeId(null);
        }}
        editingRecipeId={editingRecipeId}
        recipeProducedId={recipeProducedId}
        setRecipeProducedId={setRecipeProducedId}
        recipeOutputQty={recipeOutputQty}
        setRecipeOutputQty={setRecipeOutputQty}
        recipeCategory={recipeCategory}
        setRecipeCategory={setRecipeCategory}
        recipeNotes={recipeNotes}
        setRecipeNotes={setRecipeNotes}
        recipeIngredients={recipeIngredients}
        factoryItems={factoryItems}
        rawIngredients={rawIngredients}
        isSavingRecipe={isSavingRecipe}
        actionAfterSave={actionAfterSave}
        setActionAfterSave={setActionAfterSave}
        onSave={handleSaveRecipe}
        onAddIngredientRow={handleAddIngredientRow}
        onRemoveIngredientRow={handleRemoveIngredientRow}
        onIngredientRowChange={handleIngredientRowChange}
      />
    </PageLayout>
  );
}
