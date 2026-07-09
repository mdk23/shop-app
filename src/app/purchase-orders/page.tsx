"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatCurrency } from "@/lib/utils";
import {
  FileText,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Save,
  Truck,
  CreditCard,
  User,
  AlertCircle,
  Calendar,
  Layers,
  ArrowRight,
  TrendingUp,
  Receipt,
  FileCheck,
  CheckCircle,
  XCircle,
  PlusCircle,
  MinusCircle
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function PurchaseOrdersPage() {
  const { token } = useAuth();

  // Queries & Mutations
  const purchaseOrders = useQuery(api.purchaseOrders.list, {});
  const suppliers = useQuery(api.suppliers.list, { status: "active" });
  const ingredients = useQuery(api.ingredients.list);

  const createPO = useMutation(api.purchaseOrders.create);
  const updatePO = useMutation(api.purchaseOrders.update);
  const updatePOStatus = useMutation(api.purchaseOrders.updateStatus);
  const removePO = useMutation(api.purchaseOrders.remove);
  const receivePOItems = useMutation(api.purchaseOrders.receiveItems);
  const updatePOPaymentStatus = useMutation(api.purchaseOrders.updatePaymentStatus);

  // States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "draft" | "sent" | "received" | "cancelled">("all");
  const [selectedPOId, setSelectedPOId] = useState<string | null>(null);

  // Receiving states
  const [receivingPO, setReceivingPO] = useState<any>(null);
  const [receiveBatchQuantities, setReceiveBatchQuantities] = useState<Record<string, string>>({});

  // Detail query
  const poDetails = useQuery(
    api.purchaseOrders.get,
    selectedPOId ? { id: selectedPOId as any } : "skip"
  );

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<any>(null);

  // Form States
  const [selectedSupplierId, setSelectedSupplierId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [formItems, setFormItems] = useState<
    Array<{ ingredientId: string; quantityOrdered: number; unitCost: number }>
  >([]);

  // Item builder states
  const [builderIngredientId, setBuilderIngredientId] = useState("");
  const [builderQty, setBuilderQty] = useState("");
  const [builderCost, setBuilderCost] = useState("");

  const handleAddBuilderItem = () => {
    if (!builderIngredientId || !builderQty || !builderCost) {
      toast.error("Please fill in all item fields");
      return;
    }

    const qty = parseFloat(builderQty);
    const cost = parseFloat(builderCost);

    if (isNaN(qty) || qty <= 0) {
      toast.error("Quantity must be a positive number");
      return;
    }
    if (isNaN(cost) || cost <= 0) {
      toast.error("Cost must be a positive number");
      return;
    }

    // Check if ingredient already in form
    const existsIdx = formItems.findIndex((i) => i.ingredientId === builderIngredientId);
    if (existsIdx > -1) {
      const updated = [...formItems];
      updated[existsIdx].quantityOrdered += qty;
      // optionally update unitCost to the latest one
      updated[existsIdx].unitCost = cost;
      setFormItems(updated);
    } else {
      setFormItems([...formItems, { ingredientId: builderIngredientId, quantityOrdered: qty, unitCost: cost }]);
    }

    // Reset builder inputs
    setBuilderIngredientId("");
    setBuilderQty("");
    setBuilderCost("");
  };

  const handleRemoveFormItem = (index: number) => {
    const updated = [...formItems];
    updated.splice(index, 1);
    setFormItems(updated);
  };

  const openCreatePO = () => {
    setEditingPO(null);
    setSelectedSupplierId("");
    setExpectedDeliveryDate("");
    setNotes("");
    setFormItems([]);
    setBuilderIngredientId("");
    setBuilderQty("");
    setBuilderCost("");
    setIsFormOpen(true);
  };

  const openEditPO = async (po: any) => {
    setEditingPO(po);
    setSelectedSupplierId(po.supplierId);
    setExpectedDeliveryDate(po.expectedDeliveryDate ? format(new Date(po.expectedDeliveryDate), "yyyy-MM-dd") : "");
    setNotes(po.notes || "");
    
    // Fetch items of PO for form population
    try {
      toast.loading("Loading order details...", { id: "load-po-edit" });
      const fullPO = await fetchPOData(po._id);
      if (fullPO) {
        setFormItems(
          fullPO.items.map((i: any) => ({
            ingredientId: i.ingredientId,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
          }))
        );
      }
      toast.success("Order details loaded", { id: "load-po-edit" });
      setIsFormOpen(true);
    } catch (e) {
      toast.error("Failed to load PO details", { id: "load-po-edit" });
    }
  };

  // Helper function to fetch PO details manually for edit population
  const fetchPOData = async (poId: string) => {
    // Convex query is reactive, but since we need it in a one-off callback we can call it on the client
    // By matching it with the poDetails query, or using a client side get query
    // Actually, poDetails is already a query in React. Since we sets selectedPOId on click,
    // we can use standard promise-based fetch or wait for it.
    // Instead of waiting, we can just grab from poDetails or query it. Let's make sure poDetails is set.
    setSelectedPOId(poId);
    return new Promise<any>((resolve) => {
      const check = setInterval(() => {
        if (poDetails && poDetails._id === poId) {
          clearInterval(check);
          resolve(poDetails);
        }
      }, 100);
      setTimeout(() => {
        clearInterval(check);
        resolve(null);
      }, 5000);
    });
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSupplierId) {
      toast.error("Please select a supplier");
      return;
    }
    if (formItems.length === 0) {
      toast.error("Please add at least one ingredient to the order");
      return;
    }
    if (!token) {
      toast.error("You must be logged in to modify purchase orders");
      return;
    }

    const orderDate = Date.now();
    const expDate = expectedDeliveryDate ? new Date(expectedDeliveryDate).getTime() : undefined;

    try {
      if (editingPO) {
        await updatePO({
          token,
          id: editingPO._id,
          supplierId: selectedSupplierId as any,
          orderDate: editingPO.orderDate, // preserve original orderDate
          expectedDeliveryDate: expDate,
          notes: notes || undefined,
          items: formItems.map((i) => ({
            ingredientId: i.ingredientId as any,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
          })),
        });
        toast.success("Purchase order updated successfully");
      } else {
        await createPO({
          token,
          supplierId: selectedSupplierId as any,
          orderDate,
          expectedDeliveryDate: expDate,
          notes: notes || undefined,
          items: formItems.map((i) => ({
            ingredientId: i.ingredientId as any,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
          })),
        });
        toast.success("Purchase order draft created");
      }
      setIsFormOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save purchase order");
    }
  };

  const handleTransitionStatus = async (poId: string, status: "sent" | "cancelled") => {
    if (!token) {
      toast.error("You must be logged in to update order status");
      return;
    }

    const actionText = status === "sent" ? "Send Purchase Order" : "Cancel Purchase Order";
    toast.warning(`${actionText}?`, {
      description: `Transitioning PO to ${status}.`,
      action: {
        label: "Confirm",
        onClick: async () => {
          try {
            await updatePOStatus({ token, id: poId as any, status });
            toast.success(`Purchase order marked as ${status}`);
            setSelectedPOId(null);
          } catch (err: any) {
            toast.error(err.message || "Failed to update status");
          }
        },
      },
      duration: 5000,
    });
  };

  const handleDeletePO = (po: any) => {
    if (!token) {
      toast.error("You must be logged in to delete purchase orders");
      return;
    }

    toast.warning(`Delete purchase order ${po.orderCode}?`, {
      description: "This draft will be permanently deleted.",
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            await removePO({ token, id: po._id });
            toast.success("Purchase order deleted successfully");
          } catch (err: any) {
            toast.error(err.message || "Failed to delete purchase order");
          }
        },
      },
      duration: 5000,
    });
  };

  // Filter Logic
  const getSupplierName = (supplierId: string) => {
    const s = (suppliers || []).find((sup) => sup._id === supplierId);
    return s ? s.name : "Unknown Supplier";
  };

  const filteredPOs = (purchaseOrders || []).filter((po) => {
    const sName = getSupplierName(po.supplierId).toLowerCase();
    const code = po.orderCode.toLowerCase();
    const matchesSearch = sName.includes(searchTerm.toLowerCase()) || code.includes(searchTerm.toLowerCase());

    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "received" && (po.status === "completed" || po.status === "partially_received")) ||
      po.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Aggregated Stats
  const draftCount = (purchaseOrders || []).filter((po) => po.status === "draft").length;
  const sentCount = (purchaseOrders || []).filter((po) => po.status === "sent").length;
  const pendingValue = (purchaseOrders || [])
    .filter((po) => po.status === "draft" || po.status === "sent")
    .reduce((sum, po) => sum + po.totalAmount, 0);

  return (
    <PageLayout>
      <div className="space-y-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <h1 className="text-on-surface mb-2 font-display text-4xl uppercase tracking-tighter">Purchase Orders</h1>
            <p className="text-on-surface-variant font-black uppercase tracking-[0.3em] text-[10px] opacity-60 flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Manage purchasing & supplier fulfillment
            </p>
          </div>
          <button
            onClick={openCreatePO}
            className="bg-brand-gradient text-white border-4 border-black px-8 py-4 rounded-lg font-display text-2xl uppercase tracking-tighter shadow-hard hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 self-start lg:self-auto"
          >
            <Plus className="w-8 h-8" strokeWidth={3} />
            Create Purchase Order
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard flex items-center gap-4 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Draft POs</span>
              <p className="text-2xl font-display text-on-surface mt-0.5">{draftCount}</p>
            </div>
          </div>
          <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard flex items-center gap-4 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-500">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Sent Orders</span>
              <p className="text-2xl font-display text-on-surface mt-0.5">{sentCount}</p>
            </div>
          </div>
          <div className="bg-surface border-2 border-outline rounded-2xl p-5 shadow-hard flex items-center gap-4 hover:-translate-x-0.5 hover:-translate-y-0.5 transition-all">
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Pending Total Value</span>
              <p className="text-2xl font-display text-on-surface mt-0.5">{formatCurrency(pendingValue)}</p>
            </div>
          </div>
        </div>

        {/* Filters and List */}
        <div className="bg-surface border-4 border-outline rounded-xl shadow-hard flex flex-col min-h-[500px]">
          <div className="p-6 border-b-4 border-outline flex flex-col lg:flex-row items-center gap-4 bg-surface-container-low/50">
            {/* Search Input */}
            <div className="relative flex-1 w-full max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Search PO Code or Supplier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface-container-high border-2 border-outline rounded-lg pl-12 pr-4 py-3 outline-none focus:border-primary transition-all font-black uppercase tracking-wider text-[10px] shadow-hard-sm"
              />
            </div>

            {/* Status Tabs */}
            <div className="flex border-2 border-outline rounded-lg overflow-hidden w-full lg:w-auto shadow-hard-sm">
              {(["all", "draft", "sent", "received", "cancelled"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={cn(
                    "flex-1 lg:flex-initial px-5 py-2.5 font-black uppercase text-[10px] tracking-wider transition-all",
                    statusFilter === filter
                      ? "bg-black text-white"
                      : "bg-surface text-on-surface hover:bg-surface-container-high"
                  )}
                >
                  {filter}
                </button>
              ))}
            </div>
          </div>

          {/* Orders Table */}
          <div className="flex-1 overflow-auto">
            {purchaseOrders === undefined ? (
              <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant/40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="mt-4 font-black uppercase tracking-wider text-[10px]">Loading Purchase Orders...</p>
              </div>
            ) : filteredPOs.length === 0 ? (
              <div className="text-center py-24 text-on-surface-variant/40 font-black uppercase tracking-wider text-[10px]">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-35" />
                No purchase orders found
              </div>
            ) : (
              <table className="w-full text-left border-separate border-spacing-0">
                <thead>
                  <tr className="bg-surface-container-highest text-on-surface text-[10px] font-black uppercase tracking-[0.2em] border-b-4 border-outline">
                    <th className="px-8 py-5 border-b-4 border-outline">PO Code</th>
                    <th className="px-8 py-5 border-b-4 border-outline">Supplier</th>
                    <th className="px-8 py-5 border-b-4 border-outline">Order Date</th>
                    <th className="px-8 py-5 border-b-4 border-outline">Expected Delivery</th>
                    <th className="px-8 py-5 border-b-4 border-outline text-right">Total Amount</th>
                    <th className="px-8 py-5 border-b-4 border-outline text-center">Status</th>
                    <th className="px-8 py-5 border-b-4 border-outline text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPOs.map((po) => (
                    <tr
                      key={po._id}
                      onClick={() => setSelectedPOId(po._id)}
                      className="hover:bg-surface-container-low transition-colors cursor-pointer group text-xs font-bold text-on-surface-variant"
                    >
                      <td className="px-8 py-5 border-b border-outline/50 font-display text-base text-on-surface group-hover:text-primary transition-colors">
                        {po.orderCode}
                      </td>
                      <td className="px-8 py-5 border-b border-outline/50 uppercase">
                        {getSupplierName(po.supplierId)}
                      </td>
                      <td className="px-8 py-5 border-b border-outline/50">
                        {format(new Date(po.orderDate), "dd/MM/yyyy HH:mm")}
                      </td>
                      <td className="px-8 py-5 border-b border-outline/50">
                        {po.expectedDeliveryDate
                          ? format(new Date(po.expectedDeliveryDate), "dd/MM/yyyy")
                          : "—"}
                      </td>
                      <td className="px-8 py-5 border-b border-outline/50 text-right font-display text-sm text-on-surface">
                        {formatCurrency(po.totalAmount)}
                      </td>
                      <td className="px-8 py-5 border-b border-outline/50 text-center">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                            po.status === "draft" && "bg-gray-500/10 text-gray-600 border border-gray-500/20",
                            po.status === "sent" && "bg-orange-500/10 text-orange-600 border border-orange-500/20",
                            (po.status === "completed" || po.status === "partially_received") &&
                              "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20",
                            po.status === "cancelled" && "bg-error/10 text-error border border-error/20"
                          )}
                        >
                          {po.status === "partially_received" ? "partially received" : po.status}
                        </span>
                      </td>
                      <td className="px-8 py-5 border-b border-outline/50 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-3">
                          {po.status === "draft" && (
                            <>
                              <button
                                onClick={() => openEditPO(po)}
                                className="p-2 border border-black rounded hover:bg-surface-container-high active:bg-surface-container-highest transition-all shadow-hard-sm"
                                title="Edit Draft"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeletePO(po)}
                                className="p-2 bg-error/10 text-error border border-black rounded hover:bg-error hover:text-white transition-all shadow-hard-sm"
                                title="Delete Draft"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleTransitionStatus(po._id, "sent")}
                                className="px-3 py-1.5 bg-black text-white rounded font-display text-[10px] uppercase tracking-wider hover:bg-neutral-800 transition-all flex items-center gap-1 shadow-hard-sm"
                              >
                                Send <ArrowRight className="w-3 h-3" />
                              </button>
                            </>
                          )}
                          {po.status === "sent" && (
                            <button
                              onClick={() => handleTransitionStatus(po._id, "cancelled")}
                              className="px-3 py-1.5 bg-error/10 text-error border border-black rounded font-display text-[10px] uppercase tracking-wider hover:bg-error hover:text-white transition-all shadow-hard-sm"
                            >
                              Cancel PO
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* PO Form Drawer/Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-4xl border-4 border-outline rounded-lg shadow-hard-lg flex flex-col overflow-hidden h-[90vh]">
            {/* Modal Header */}
            <div className="p-6 border-b-4 border-black bg-surface-container-low flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary text-on-primary rounded flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <h2 className="text-3xl font-display text-on-surface uppercase tracking-tighter">
                  {editingPO ? `Edit Purchase Order (${editingPO.orderCode})` : "New Purchase Order"}
                </h2>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <form onSubmit={handleFormSubmit} className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Supplier Selection */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                      Supplier *
                    </label>
                    <select
                      required
                      value={selectedSupplierId}
                      onChange={(e) => setSelectedSupplierId(e.target.value)}
                      className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-black uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm h-[46px]"
                    >
                      <option value="">Select Supplier...</option>
                      {(suppliers || []).map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Expected Delivery Date */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                      Expected Delivery Date
                    </label>
                    <input
                      type="date"
                      value={expectedDeliveryDate}
                      onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                      className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                    />
                  </div>
                </div>

                {/* Notes */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Internal Notes / Comments
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                    placeholder="e.g. Call driver before delivery..."
                  />
                </div>

                {/* Ingredient Item Builder */}
                <div className="border-4 border-dashed border-outline/50 rounded-xl p-6 space-y-4 bg-surface-container-low/30">
                  <h4 className="font-display text-lg uppercase tracking-tight text-on-surface">Add Ingredients to Order</h4>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                        Select Ingredient
                      </label>
                      <select
                        value={builderIngredientId}
                        onChange={(e) => setBuilderIngredientId(e.target.value)}
                        className="w-full bg-surface-container-low border-2 border-outline rounded px-3 py-2 text-on-surface font-bold uppercase tracking-wider text-[10px] focus:border-primary outline-none transition-all shadow-hard-sm h-[38px]"
                      >
                        <option value="">Choose item...</option>
                        {(ingredients || []).map((i) => (
                          <option key={i._id} value={i._id}>
                            {i.name} ({i.unit})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                        Quantity
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={builderQty}
                        onChange={(e) => setBuilderQty(e.target.value)}
                        placeholder="e.g. 50"
                        className="w-full bg-surface-container-low border-2 border-outline rounded px-3 py-2 text-on-surface font-bold uppercase tracking-wider text-[10px] focus:border-primary outline-none transition-all shadow-hard-sm"
                      />
                    </div>

                    <div className="space-y-2 font-bold">
                      <label className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                        Unit Cost (Mt)
                      </label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          step="any"
                          value={builderCost}
                          onChange={(e) => setBuilderCost(e.target.value)}
                          placeholder="e.g. 250"
                          className="w-full bg-surface-container-low border-2 border-outline rounded px-3 py-2 text-on-surface font-bold uppercase tracking-wider text-[10px] focus:border-primary outline-none transition-all shadow-hard-sm"
                        />
                        <button
                          type="button"
                          onClick={handleAddBuilderItem}
                          className="bg-black text-white px-4 rounded border-2 border-black hover:bg-neutral-800 transition-all font-display text-sm uppercase tracking-tighter shadow-hard-sm h-[38px] flex items-center justify-center"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items List */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Order Items ({formItems.length})
                  </label>
                  <div className="border-2 border-outline rounded-lg overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-surface-container-high text-on-surface text-[9px] font-black uppercase tracking-wider border-b border-outline">
                          <th className="px-4 py-3">Ingredient</th>
                          <th className="px-4 py-3 text-right">Quantity</th>
                          <th className="px-4 py-3 text-right">Unit Cost</th>
                          <th className="px-4 py-3 text-right">Total Cost</th>
                          <th className="px-4 py-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline/50">
                        {formItems.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-[10px] font-black uppercase tracking-widest text-on-surface-variant/40">
                              No items added yet. Use the builder above to add ingredients.
                            </td>
                          </tr>
                        ) : (
                          formItems.map((item, idx) => {
                            const ing = (ingredients || []).find((i) => i._id === item.ingredientId);
                            const name = ing ? ing.name : "Unknown Ingredient";
                            const unit = ing ? ing.unit : "pcs";
                            return (
                              <tr key={idx} className="text-xs font-bold text-on-surface-variant bg-surface-container-low/35">
                                <td className="px-4 py-3 uppercase">{name}</td>
                                <td className="px-4 py-3 text-right">
                                  {item.quantityOrdered} {unit}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {formatCurrency(item.unitCost)}
                                </td>
                                <td className="px-4 py-3 text-right text-on-surface font-display">
                                  {formatCurrency(item.quantityOrdered * item.unitCost)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFormItem(idx)}
                                    className="p-1 text-error hover:bg-error/10 rounded transition-colors"
                                  >
                                    <X className="w-4 h-4" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Drawer Footer */}
              <div className="p-6 bg-surface-container-low border-t-4 border-black flex justify-between items-center">
                {/* Total Cost Display */}
                <div>
                  <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">Est. Order Value</span>
                  <p className="text-3xl font-display text-primary leading-none mt-1">
                    {formatCurrency(
                      formItems.reduce((sum, item) => sum + item.quantityOrdered * item.unitCost, 0)
                    )}
                  </p>
                </div>

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="px-6 py-3.5 border-2 border-black rounded font-display text-base uppercase tracking-tighter hover:bg-surface-container-high active:bg-surface-container-highest transition-all shadow-hard-sm"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-8 py-3.5 bg-brand-gradient text-white border-2 border-black rounded font-display text-lg uppercase tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 shadow-hard-sm"
                  >
                    <Save className="w-5 h-5" />
                    Save Draft PO
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PO Detail View Modal */}
      {selectedPOId && poDetails && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-2xl border-4 border-outline rounded-lg shadow-hard-lg flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b-4 border-black bg-surface-container-low flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 border border-primary/20 text-primary rounded flex items-center justify-center">
                  <FileText className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-display text-on-surface uppercase tracking-tight leading-none">
                    {poDetails.orderCode}
                  </h2>
                  <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">
                    Supplier: <strong className="text-on-surface">{poDetails.supplierName}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedPOId(null)}
                className="w-10 h-10 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Info details */}
            <div className="p-8 space-y-6 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-surface-container-low border-2 border-outline rounded-xl p-4 text-xs font-bold text-on-surface-variant">
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-on-surface-variant/50 uppercase tracking-widest">Order Date</span>
                  <p className="text-on-surface">{format(new Date(poDetails.orderDate), "dd MMMM yyyy, HH:mm")}</p>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-on-surface-variant/50 uppercase tracking-widest">Expected Delivery</span>
                  <p className="text-on-surface">
                    {poDetails.expectedDeliveryDate
                      ? format(new Date(poDetails.expectedDeliveryDate), "dd MMMM yyyy")
                      : "Not Scheduled"}
                  </p>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-on-surface-variant/50 uppercase tracking-widest">Status / Payment</span>
                  <div className="flex gap-2 items-center mt-1">
                    <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-primary/10 text-primary border border-primary/20">
                      {poDetails.status}
                    </span>
                    <select
                      value={poDetails.paymentStatus}
                      onChange={async (e) => {
                        if (!token) return;
                        try {
                          await updatePOPaymentStatus({
                            token,
                            id: poDetails._id,
                            paymentStatus: e.target.value as any,
                          });
                          toast.success("Payment status updated");
                        } catch (err: any) {
                          toast.error(err.message || "Failed to update payment status");
                        }
                      }}
                      className="px-2 py-0.5 rounded text-[8px] font-black uppercase bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 outline-none cursor-pointer h-[22px]"
                    >
                      <option value="unpaid">unpaid</option>
                      <option value="partially_paid">partially paid</option>
                      <option value="paid">paid</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <span className="text-[8px] font-black text-on-surface-variant/50 uppercase tracking-widest">Order Total</span>
                  <p className="text-base font-display text-on-surface">{formatCurrency(poDetails.totalAmount)}</p>
                </div>
              </div>

              {/* Notes */}
              {poDetails.notes && (
                <div className="space-y-2">
                  <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Order Notes</span>
                  <div className="bg-surface-container-high rounded p-3 text-xs italic font-bold border border-outline/50">
                    "{poDetails.notes}"
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-2">
                <span className="text-[9px] font-black text-on-surface-variant uppercase tracking-widest">Fulfillment List</span>
                <div className="border-2 border-outline rounded-lg overflow-hidden">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-surface-container-high text-on-surface text-[9px] font-black uppercase tracking-wider border-b border-outline">
                        <th className="px-4 py-3">Ingredient</th>
                        <th className="px-4 py-3 text-right">Qty Ordered</th>
                        <th className="px-4 py-3 text-right">Qty Received</th>
                        <th className="px-4 py-3 text-right">Unit Cost</th>
                        <th className="px-4 py-3 text-right">Line Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline/50">
                      {poDetails.items.map((item: any, index: number) => (
                        <tr key={index} className="text-xs font-bold text-on-surface-variant">
                          <td className="px-4 py-3 uppercase">{item.ingredientName}</td>
                          <td className="px-4 py-3 text-right">
                            {item.quantityOrdered} {item.ingredientUnit}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {item.quantityReceived} {item.ingredientUnit}
                          </td>
                          <td className="px-4 py-3 text-right">{formatCurrency(item.unitCost)}</td>
                          <td className="px-4 py-3 text-right font-display text-on-surface">{formatCurrency(item.totalCost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Footer actions */}
            <div className="p-6 border-t-4 border-black bg-surface-container-low flex justify-between">
              <div>
                {poDetails.status === "draft" && (
                  <button
                    onClick={() => handleDeletePO(poDetails)}
                    className="px-4 py-2 bg-error/10 text-error border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-error hover:text-white transition-all shadow-hard-sm"
                  >
                    <Trash2 className="w-4 h-4 inline mr-1.5" /> Delete PO
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                {poDetails.status === "draft" && (
                  <>
                    <button
                      onClick={() => {
                        setIsFormOpen(true);
                        openEditPO(poDetails);
                        setSelectedPOId(null);
                      }}
                      className="px-4 py-2 border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-surface-container-high transition-all shadow-hard-sm"
                    >
                      <Pencil className="w-4 h-4 inline mr-1.5" /> Edit PO
                    </button>
                    <button
                      onClick={() => handleTransitionStatus(poDetails._id, "sent")}
                      className="px-6 py-2 bg-black text-white rounded font-display text-sm uppercase tracking-tighter hover:bg-neutral-800 transition-all flex items-center gap-1.5 shadow-hard-sm"
                    >
                      Send PO <ArrowRight className="w-4 h-4" />
                    </button>
                  </>
                )}
                {(poDetails.status === "sent" || poDetails.status === "partially_received") && (
                  <>
                    <button
                      onClick={() => {
                        setReceivingPO(poDetails);
                        // Initialize quantities with remaining to be received
                        const initialQuantities: Record<string, string> = {};
                        poDetails.items.forEach((item: any) => {
                          const remaining = Math.max(0, item.quantityOrdered - item.quantityReceived);
                          initialQuantities[item.ingredientId] = remaining.toString();
                        });
                        setReceiveBatchQuantities(initialQuantities);
                      }}
                      className="px-6 py-2 bg-emerald-600 text-white rounded font-display text-sm uppercase tracking-tighter hover:bg-emerald-700 transition-all flex items-center gap-1.5 shadow-hard-sm"
                    >
                      <CheckCircle className="w-4 h-4" /> Receive Stock
                    </button>
                    <button
                      onClick={() => handleTransitionStatus(poDetails._id, "cancelled")}
                      className="px-4 py-2 bg-error/10 text-error border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-error hover:text-white transition-all shadow-hard-sm"
                    >
                      <XCircle className="w-4 h-4 inline mr-1.5" /> Cancel PO
                    </button>
                  </>
                )}
                <button
                  onClick={() => setSelectedPOId(null)}
                  className="px-6 py-2 border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-surface-container-high transition-all shadow-hard-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Receive Stock Modal */}
      {receivingPO && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-xl border-4 border-outline rounded-lg shadow-hard-lg flex flex-col overflow-hidden">
            {/* Header */}
            <div className="p-6 border-b-4 border-black bg-surface-container-low flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded flex items-center justify-center">
                  <Truck className="w-6 h-6" />
                </div>
                <div>
                  <h2 className="text-2xl font-display text-on-surface uppercase tracking-tight leading-none">
                    Receive Stock
                  </h2>
                  <span className="text-[9px] font-black text-on-surface-variant/60 uppercase tracking-widest">
                    PO Code: <strong className="text-on-surface">{receivingPO.orderCode}</strong>
                  </span>
                </div>
              </div>
              <button
                onClick={() => setReceivingPO(null)}
                className="w-10 h-10 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!token) return;

                const itemsToReceive = Object.entries(receiveBatchQuantities)
                  .map(([ingId, qtyStr]) => ({
                    ingredientId: ingId as any,
                    quantityReceived: parseFloat(qtyStr) || 0,
                  }))
                  .filter((item) => item.quantityReceived > 0);

                if (itemsToReceive.length === 0) {
                  toast.error("Please specify a received quantity greater than 0 for at least one item.");
                  return;
                }

                try {
                  toast.loading("Recording receipt...", { id: "rx-po" });
                  await receivePOItems({
                    token,
                    id: receivingPO._id,
                    items: itemsToReceive,
                  });
                  toast.success("Stock received successfully!", { id: "rx-po" });
                  setReceivingPO(null);
                  setSelectedPOId(null); // Close main inspector so it refreshes data
                } catch (err: any) {
                  toast.error(err.message || "Failed to record receipt", { id: "rx-po" });
                }
              }}
              className="p-8 space-y-6"
            >
              <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-2">
                {receivingPO.items.map((item: any) => {
                  const remaining = Math.max(0, item.quantityOrdered - item.quantityReceived);
                  return (
                    <div
                      key={item.ingredientId}
                      className="border-2 border-outline rounded-xl p-4 bg-surface-container-low/40 flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="flex-1">
                        <h4 className="font-display text-sm uppercase text-on-surface">{item.ingredientName}</h4>
                        <div className="flex gap-4 mt-1 text-[9px] font-black uppercase text-on-surface-variant/70 tracking-wider">
                          <span>Ordered: {item.quantityOrdered} {item.ingredientUnit}</span>
                          <span>Received: {item.quantityReceived} {item.ingredientUnit}</span>
                          <span className="text-primary">Remaining: {remaining} {item.ingredientUnit}</span>
                        </div>
                      </div>
                      <div className="w-full md:w-32 space-y-1">
                        <label className="text-[8px] font-black text-on-surface-variant uppercase tracking-widest">
                          Received Qty
                        </label>
                        <input
                          type="number"
                          step="any"
                          value={receiveBatchQuantities[item.ingredientId] || "0"}
                          onChange={(e) => {
                            setReceiveBatchQuantities({
                              ...receiveBatchQuantities,
                              [item.ingredientId]: e.target.value,
                            });
                          }}
                          className="w-full bg-surface-container-low border-2 border-outline rounded px-3 py-1.5 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-6 border-t border-black">
                <button
                  type="button"
                  onClick={() => setReceivingPO(null)}
                  className="px-6 py-3 border-2 border-black rounded font-display text-base uppercase tracking-tighter hover:bg-surface-container-high active:bg-surface-container-highest transition-all shadow-hard-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-brand-gradient text-white border-2 border-black rounded font-display text-base uppercase tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 shadow-hard-sm"
                >
                  <Save className="w-5 h-5" />
                  Save Receipt
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
