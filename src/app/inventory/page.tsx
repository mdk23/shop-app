"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { IngredientModal } from "@/components/IngredientModal";
import {
  Package,
  Plus,
  RefreshCcw,
  Search,
  MoreVertical,
  CheckCircle2,
  XCircle,
  Edit2,
  Trash2,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { toast } from "sonner";

export default function InventoryPage() {
  const ingredients = useQuery(api.ingredients.list);
  const restock = useMutation(api.ingredients.restock);
  const removeIngredient = useMutation(api.ingredients.remove);
  
  const [searchTerm, setSearchTerm] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<any>(null);
  const [ingredientToDelete, setIngredientToDelete] = useState<any>(null);
  const [sortColumn, setSortColumn] = useState<"name" | "stock" | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [statusFilter, setStatusFilter] = useState<"All" | "Good" | "Low Stock" | "Out of Stock">("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 15;

  const STATUS_CYCLE: Array<"All" | "Good" | "Low Stock" | "Out of Stock"> = ["All", "Good", "Low Stock", "Out of Stock"];

  const handleSortColumn = (col: "name" | "stock") => {
    if (sortColumn === col) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const handleStatusFilter = () => {
    const idx = STATUS_CYCLE.indexOf(statusFilter);
    setStatusFilter(STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length]);
  };



  const getStatus = (ing: any) => {
    if (ing.stockQuantity <= 0) return { label: "Out of Stock", color: "bg-error/10 text-error", icon: XCircle };
    if (ing.stockQuantity <= ing.lowStockThreshold) return { label: "Low Stock", color: "bg-tertiary/10 text-tertiary", icon: AlertCircle };
    return { label: "Good", color: "bg-green-100 text-green-700", icon: CheckCircle2 };
  };

  const filteredIngredients = (() => {
    let list = (ingredients ?? []).filter((ing) =>
      ing.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (statusFilter !== "All") {
      list = list.filter((ing) => getStatus(ing).label === statusFilter);
    }
    if (categoryFilter !== "All") {
      list = list.filter((ing) => ing.category === categoryFilter);
    }
    if (sortColumn === "name") {
      list = [...list].sort((a, b) =>
        sortDirection === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      );
    } else if (sortColumn === "stock") {
      list = [...list].sort((a, b) =>
        sortDirection === "asc" ? a.stockQuantity - b.stockQuantity : b.stockQuantity - a.stockQuantity
      );
    }
    return list;
  })();

  const totalPages = Math.ceil(filteredIngredients.length / ITEMS_PER_PAGE);
  const paginatedIngredients = filteredIngredients.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  // Reset to first page when filtering or searching
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1);
  };

  const handleStatusFilterChange = () => {
    handleStatusFilter();
    setCurrentPage(1);
  };

  const SortIcon = ({ col }: { col: "name" | "stock" }) => {
    if (sortColumn !== col) return <ChevronsUpDown className="w-3.5 h-3.5 ml-1 opacity-40" />;
    return sortDirection === "asc"
      ? <ChevronUp className="w-3.5 h-3.5 ml-1 text-primary" />
      : <ChevronDown className="w-3.5 h-3.5 ml-1 text-primary" />;
  };

  const handleRestock = async (id: any, amount: number) => {
    try {
      await restock({ id, amount });
      toast.success("Inventory updated");
    } catch (error) {
      toast.error("Failed to update inventory");
    }
  };

  return (
    <PageLayout>
      <div className="space-y-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-on-surface uppercase tracking-tight">Inventory</h1>
            <p className="text-xs lg:text-sm text-on-surface-variant font-bold uppercase tracking-widest opacity-60">Supply Management</p>
          </div>
          <button 
            onClick={() => {
              setEditingIngredient(null);
              setIsModalOpen(true);
            }}
            className="bg-primary text-on-primary px-6 py-4 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 hover:bg-secondary transition-all shadow-hard active:scale-95 border-brutal w-full sm:w-auto"
          >
            <Plus className="w-5 h-5" />
            Add Item
          </button>
        </div>

        <div className="bg-surface-container-low border border-outline-variant rounded-2xl shadow-soft overflow-hidden">
          <div className="p-4 lg:p-6 border-b border-outline-variant flex flex-col md:flex-row items-stretch md:items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant opacity-40" />
              <input
                type="text"
                placeholder="Search inventory..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="w-full bg-surface-container-high border border-outline-variant rounded-2xl pl-12 pr-4 py-4 outline-none focus:border-primary transition-colors font-black uppercase tracking-widest text-[10px]"
              />
            </div>
            <div className="flex items-center gap-2">
              <button 
                onClick={handleStatusFilterChange}
                className="flex-1 md:flex-none px-4 py-4 rounded-2xl bg-surface-container-high border border-outline-variant text-[10px] font-black uppercase tracking-widest hover:text-primary transition-all flex items-center justify-center gap-2">
                {statusFilter === "All" ? "Status: All" : `Status: ${statusFilter}`}
                <ChevronsUpDown className="w-4 h-4 opacity-40" />
              </button>
              <button className="p-4 rounded-2xl bg-surface-container-high border border-outline-variant text-on-surface-variant hover:text-primary transition-colors">
                <RefreshCcw className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low/30 overflow-x-auto flex items-center gap-2">
            {["All", "Food", "Packaging", "Drinks", "Sauces", "Factory", "Supplies"].map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setCategoryFilter(cat);
                  setCurrentPage(1);
                }}
                className={cn(
                  "px-4 py-2 rounded-full text-xs font-black uppercase tracking-wider whitespace-nowrap transition-all border-2",
                  categoryFilter === cat
                    ? "bg-primary text-on-primary border-primary shadow-soft"
                    : "bg-surface-container-high text-on-surface-variant border-outline-variant hover:border-primary/50"
                )}
              >
                {cat}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-high border-b border-outline-variant">
                  <th
                    className="px-4 lg:px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] cursor-pointer hover:text-primary transition-colors select-none"
                    onClick={() => handleSortColumn("name")}
                  >
                    <span className="flex items-center">
                      Item <SortIcon col="name" />
                    </span>
                  </th>
                  <th
                    className="px-4 lg:px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] cursor-pointer hover:text-primary transition-colors select-none"
                    onClick={() => handleSortColumn("stock")}
                  >
                    <span className="flex items-center">
                      Stock <SortIcon col="stock" />
                    </span>
                  </th>
                  <th className="px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] hide-on-tablet">Unit</th>
                  <th
                    className="px-4 lg:px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] cursor-pointer hover:text-primary transition-colors select-none hide-on-mobile"
                  >
                    Status
                  </th>
                  <th className="px-4 lg:px-8 py-5 text-[10px] font-black text-on-surface-variant uppercase tracking-[0.2em] text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/30">
                {paginatedIngredients?.map((ing) => {
                  const status = getStatus(ing);
                  return (
                    <tr key={ing._id} className="hover:bg-surface-container-high/50 transition-colors group">
                      <td className="px-4 lg:px-8 py-5 lg:py-6">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-3">
                            <div className="hidden sm:flex w-10 h-10 rounded-xl bg-surface-container-high items-center justify-center border border-outline-variant/30">
                              <Package className="w-5 h-5 text-primary" />
                            </div>
                            <span className="font-black text-on-surface text-sm lg:text-lg tracking-tight">{ing.name}</span>
                          </div>
                          <div className="sm:ml-13 mt-1">
                            <span className="text-[9px] font-black text-primary/60 uppercase tracking-[0.2em] bg-primary/5 px-2 py-0.5 rounded-lg border border-primary/10">
                              {ing.category || "General"}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 lg:px-8 py-5 lg:py-6">
                        <span className="font-black text-lg lg:text-2xl text-on-surface tracking-tighter">
                          {ing.stockQuantity}
                        </span>
                        <span className="ml-1 text-[10px] font-black text-on-surface-variant/40 sm:hidden">
                          {ing.unit}
                        </span>
                      </td>
                      <td className="px-8 py-6 hide-on-tablet">
                        <span className="bg-surface-container-highest px-3 py-1.5 rounded-xl text-[10px] font-black text-on-surface-variant uppercase tracking-wider border border-outline-variant/50">
                          {ing.unit}
                        </span>
                      </td>
                      <td className="px-8 py-6 hide-on-mobile">
                        <div className={cn("inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest border", status.color.replace('text-', 'border-').replace('bg-', 'bg-transparent border-opacity-20 '))}>
                          <status.icon className="w-3.5 h-3.5" />
                          {status.label}
                        </div>
                      </td>
                      <td className="px-4 lg:px-8 py-5 lg:py-6 text-right">
                        <div className="flex items-center justify-end gap-1.5 md:gap-3">
                          <button 
                            onClick={() => handleRestock(ing._id, 10)}
                            className="bg-primary text-on-primary px-3 py-2 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-secondary transition-all shadow-hard-sm border-2 border-outline/20 hide-on-mobile"
                          >
                            +10
                          </button>
                          <button 
                            onClick={() => {
                              setEditingIngredient(ing);
                              setIsModalOpen(true);
                            }}
                            className="p-2 lg:p-3 rounded-xl hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-colors border border-transparent hover:border-outline-variant"
                          >
                            <Edit2 className="w-4 h-4 lg:w-5 lg:h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-6 border-t border-outline-variant flex items-center justify-between bg-surface-container-low/50">
              <div className="text-sm font-bold text-on-surface-variant">
                Showing {Math.min(filteredIngredients.length, (currentPage - 1) * ITEMS_PER_PAGE + 1)} to {Math.min(filteredIngredients.length, currentPage * ITEMS_PER_PAGE)} of {filteredIngredients.length} ingredients
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => prev - 1)}
                  className="p-2 rounded-lg border border-outline-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
                    <button
                      key={page}
                      onClick={() => setCurrentPage(page)}
                      className={cn(
                        "w-10 h-10 rounded-lg font-bold text-sm transition-all",
                        currentPage === page
                          ? "bg-primary text-on-primary shadow-soft"
                          : "hover:bg-surface-container-high text-on-surface-variant"
                      )}
                    >
                      {page}
                    </button>
                  ))}
                </div>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => prev + 1)}
                  className="p-2 rounded-lg border border-outline-variant hover:bg-surface-container-high disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <IngredientModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        initialData={editingIngredient}
      />

      {ingredientToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-md rounded-3xl shadow-2xl p-6">
            <h2 className="text-xl font-black text-on-surface mb-2">Delete Ingredient</h2>
            <p className="text-on-surface-variant font-medium mb-6">
              Are you sure you want to delete <span className="font-bold text-on-surface">{ingredientToDelete.name}</span>? 
              This will also remove it from any existing dish recipes. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setIngredientToDelete(null)}
                className="px-6 py-2 rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={async () => {
                  try {
                    await removeIngredient({ id: ingredientToDelete._id });
                    toast.success("Ingredient deleted successfully");
                    setIngredientToDelete(null);
                  } catch (e: any) {
                    toast.error("Failed to delete: " + e.message);
                  }
                }}
                className="bg-error text-on-error px-6 py-2 rounded-xl font-bold hover:bg-error/90 transition-all shadow-soft active:scale-95"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
