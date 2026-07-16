"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatCurrency } from "@/lib/utils";
import { FileText, Plus, Search, Truck, Receipt } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

// Extracted Sub-components
import { PurchaseOrderTable } from "@/components/purchase-orders/PurchaseOrderTable";
import { PurchaseOrderModal } from "@/components/purchase-orders/PurchaseOrderModal";
import { PODetailDrawer } from "@/components/purchase-orders/PODetailDrawer";
import { POReceiveModal } from "@/components/purchase-orders/POReceiveModal";

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

  // Detail query
  const poDetails = useQuery(
    api.purchaseOrders.get,
    selectedPOId ? { id: selectedPOId as any } : "skip"
  );

  // Modal States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingPO, setEditingPO] = useState<any>(null);

  // Form Items State (shared with PurchaseOrderModal)
  const [formItems, setFormItems] = useState<
    Array<{ ingredientId: string; quantityOrdered: number; unitCost: number }>
  >([]);

  const openCreatePO = () => {
    setEditingPO(null);
    setFormItems([]);
    setIsFormOpen(true);
  };

  const openEditPO = async (po: any) => {
    setEditingPO(po);
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

  const fetchPOData = async (poId: string) => {
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

  const handleFormSubmit = async (data: {
    supplierId: string;
    expectedDeliveryDate: string;
    notes: string;
    items: Array<{ ingredientId: string; quantityOrdered: number; unitCost: number }>;
  }) => {
    if (!token) {
      toast.error("You must be logged in to modify purchase orders");
      return;
    }

    const orderDate = Date.now();
    const expDate = data.expectedDeliveryDate ? new Date(data.expectedDeliveryDate).getTime() : undefined;

    try {
      if (editingPO) {
        await updatePO({
          token,
          id: editingPO._id,
          supplierId: data.supplierId as any,
          orderDate: editingPO.orderDate,
          expectedDeliveryDate: expDate,
          notes: data.notes || undefined,
          items: data.items.map((i) => ({
            ingredientId: i.ingredientId as any,
            quantityOrdered: i.quantityOrdered,
            unitCost: i.unitCost,
          })),
        });
        toast.success("Purchase order updated successfully");
      } else {
        await createPO({
          token,
          supplierId: data.supplierId as any,
          orderDate,
          expectedDeliveryDate: expDate,
          notes: data.notes || undefined,
          items: data.items.map((i) => ({
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
          <PurchaseOrderTable
            filteredPOs={filteredPOs}
            getSupplierName={getSupplierName}
            onSelectPO={setSelectedPOId}
            onEditDraft={openEditPO}
            onDeleteDraft={handleDeletePO}
            onSendDraft={(id) => handleTransitionStatus(id, "sent")}
          />
        </div>
      </div>

      {/* PO Form Modal */}
      <PurchaseOrderModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        editingPO={editingPO}
        suppliers={suppliers || []}
        ingredients={ingredients || []}
        onSubmit={handleFormSubmit}
        formItems={formItems}
        setFormItems={setFormItems}
      />

      {/* PO Detail Inspector Drawer */}
      {selectedPOId && poDetails && (
        <PODetailDrawer
          poDetails={poDetails}
          onClose={() => setSelectedPOId(null)}
          token={token}
          onUpdatePaymentStatus={async (id, paymentStatus) => {
            if (!token) return;
            try {
              await updatePOPaymentStatus({
                token,
                id: id as any,
                paymentStatus: paymentStatus as any,
              });
              toast.success("Payment status updated");
            } catch (err: any) {
              toast.error(err.message || "Failed to update payment status");
            }
          }}
          onDeletePO={handleDeletePO}
          onEditPO={(po) => {
            setIsFormOpen(true);
            openEditPO(po);
            setSelectedPOId(null);
          }}
          onSendPO={(id) => handleTransitionStatus(id, "sent")}
          onReceiveStockClick={(po) => {
            setReceivingPO(po);
          }}
          onCancelPO={(id) => handleTransitionStatus(id, "cancelled")}
        />
      )}

      {/* Receive Stock Modal */}
      {receivingPO && (
        <POReceiveModal
          receivingPO={receivingPO}
          onClose={() => setReceivingPO(null)}
          onSave={async (itemsToReceive) => {
            if (!token) return;
            toast.loading("Recording receipt...", { id: "rx-po" });
            await receivePOItems({
              token,
              id: receivingPO._id,
              items: itemsToReceive as any,
            });
            toast.success("Stock received successfully!", { id: "rx-po" });
            setReceivingPO(null);
            setSelectedPOId(null);
          }}
        />
      )}
    </PageLayout>
  );
}
