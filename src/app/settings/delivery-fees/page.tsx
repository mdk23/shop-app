"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { Id } from "../../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Edit2,
  X,
  Search,
  Check,
  Trash2,
  AlertCircle,
  Truck,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Coins,
  Settings2,
} from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

// ─────────────────────────────────────────────
// COMPONENT HELPERS
// ─────────────────────────────────────────────

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-12">
      <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-2xl">
      <AlertCircle className="w-5 h-5 text-error shrink-0 mt-0.5" />
      <p className="text-error text-xs font-bold">{message}</p>
    </div>
  );
}

function ModalWrapper({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-surface-container-lowest border-2 border-outline rounded-3xl shadow-hard-lg w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]"
      >
        {children}
      </motion.div>
    </div>
  );
}

function ModalHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-primary/5">
      <h3 className="text-lg font-black text-on-surface uppercase tracking-wider">{title}</h3>
      <button
        type="button"
        onClick={onClose}
        className="w-10 h-10 rounded-xl border border-outline hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-all cursor-pointer"
      >
        <X className="w-5 h-5" />
      </button>
    </div>
  );
}

function ModalFooter({
  onClose,
  submitLabel,
  submitting,
}: {
  onClose: () => void;
  submitLabel: string;
  submitting: boolean;
}) {
  return (
    <div className="p-6 border-t-2 border-outline flex items-center justify-end gap-3 bg-surface-container-low/20">
      <button
        type="button"
        onClick={onClose}
        disabled={submitting}
        className="px-6 py-3 rounded-xl border-2 border-outline font-black text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all cursor-pointer disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={submitting}
        className="px-6 py-3 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-widest hover:bg-secondary transition-all shadow-hard active:scale-95 disabled:opacity-50 cursor-pointer"
      >
        {submitting ? "Processing..." : submitLabel}
      </button>
    </div>
  );
}

function FormField({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5 text-left">
      <label htmlFor={htmlFor} className="block text-[10px] font-black text-on-surface-variant uppercase tracking-widest ml-1">
        {label}
      </label>
      {children}
    </div>
  );
}

const inputClass =
  "w-full px-4 py-3 bg-surface border-2 border-outline rounded-xl font-bold text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all";

function ActionBtn({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-2 rounded-lg border-2 border-outline hover:shadow-hard-sm transition-all active:scale-90 cursor-pointer flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider bg-surface-container-low",
        danger
          ? "hover:bg-error/10 hover:text-error hover:border-error"
          : "hover:bg-primary/10 hover:text-primary hover:border-primary"
      )}
      title={label}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

// ─────────────────────────────────────────────
// MODAL — Create / Edit Delivery Fee
// ─────────────────────────────────────────────
function DeliveryFeeFormModal({
  feeObj,
  onClose,
}: {
  feeObj?: { _id: Id<"deliveryFees">; name: string; fee: number; description?: string; active: boolean };
  onClose: () => void;
}) {
  const { token } = useAuth();
  const createFee = useMutation(api.deliveryFees.create);
  const updateFee = useMutation(api.deliveryFees.update);

  const isEdit = !!feeObj;

  const [name, setName] = useState(feeObj?.name ?? "");
  const [fee, setFee] = useState(feeObj?.fee ? feeObj.fee.toString() : "");
  const [description, setDescription] = useState(feeObj?.description ?? "");
  const [active, setActive] = useState(feeObj?.active ?? true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const feeNum = parseFloat(fee);
    if (isNaN(feeNum) || feeNum <= 0) {
      setError("Delivery Fee must be greater than 0");
      setSubmitting(false);
      return;
    }

    try {
      if (isEdit) {
        await updateFee({
          token: token!,
          id: feeObj._id,
          name,
          fee: feeNum,
          description: description || undefined,
          active,
        });
        toast.success("Delivery fee updated successfully");
      } else {
        await createFee({
          token: token!,
          name,
          fee: feeNum,
          description: description || undefined,
          active,
        });
        toast.success(`Delivery fee "${name}" created successfully`);
      }
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalWrapper onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col h-full">
        <ModalHeader
          title={isEdit ? "Edit Delivery Fee" : "Create New Zone Fee"}
          onClose={onClose}
        />

        <div className="flex-1 p-6 space-y-5 overflow-y-auto">
          {error && <ErrorAlert message={error} />}

          <FormField label="Zone Name" htmlFor="name">
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={inputClass}
              placeholder="e.g. Zone A - Downtown"
              required
              disabled={submitting}
            />
          </FormField>

          <FormField label="Delivery Fee Amount (MT)" htmlFor="fee">
            <input
              id="fee"
              type="number"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className={inputClass}
              placeholder="e.g. 50"
              required
              disabled={submitting}
            />
          </FormField>

          <FormField label="Description (Optional)" htmlFor="description">
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={cn(inputClass, "h-24 resize-none")}
              placeholder="e.g. Near main avenue, includes downtown office deliveries"
              disabled={submitting}
            />
          </FormField>

          <FormField label="Fulfillment Status" htmlFor="active">
            <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-2xl border border-outline-variant">
              <span className="font-black text-on-surface-variant text-xs uppercase tracking-widest">
                Active status: {active ? <span className="text-primary">Active</span> : <span className="text-on-surface-variant/50">Inactive</span>}
              </span>
              
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={cn(
                  "relative inline-flex h-8 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 transition-colors duration-200 ease-in-out focus:outline-none",
                  active
                    ? "bg-primary border-primary"
                    : "bg-surface-container-highest border-outline-variant"
                )}
              >
                <span className="sr-only">Toggle Active status</span>
                <span
                  className={cn(
                    "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                    active ? "translate-x-3" : "-translate-x-3"
                  )}
                />
              </button>
            </div>
          </FormField>
        </div>

        <ModalFooter
          onClose={onClose}
          submitLabel={isEdit ? "Save Changes" : "Create Zone"}
          submitting={submitting}
        />
      </form>
    </ModalWrapper>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function DeliveryFeesPage() {
  const { currentUser, token, isLoading: authLoading } = useAuth();
  const [search, setSearch] = useState("");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingFee, setEditingFee] = useState<any>(null);

  const deliveryFees = useQuery(api.deliveryFees.list, { search });
  const updateFee = useMutation(api.deliveryFees.update);
  const removeFee = useMutation(api.deliveryFees.remove);

  if (authLoading) {
    return (
      <PageLayout>
        <LoadingSpinner />
      </PageLayout>
    );
  }

  // Authorize Admin / Manager
  if (!currentUser || (currentUser.role !== "admin" && currentUser.role !== "manager")) {
    return (
      <PageLayout>
        <div className="max-w-md mx-auto text-center py-12 space-y-4">
          <h1 className="text-2xl font-black text-error">Access Denied</h1>
          <p className="text-on-surface-variant font-medium">You do not have permission to manage delivery fees.</p>
        </div>
      </PageLayout>
    );
  }

  // Handle active status quick toggle
  const handleToggleActive = async (feeObj: any) => {
    try {
      await updateFee({
        token: token!,
        id: feeObj._id,
        name: feeObj.name,
        fee: feeObj.fee,
        description: feeObj.description,
        active: !feeObj.active,
      });
      toast.success(`Delivery zone "${feeObj.name}" ${!feeObj.active ? "activated" : "deactivated"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to toggle status");
    }
  };

  // Handle delete click
  const handleDeleteFee = async (feeObj: any) => {
    const confirmDelete = window.confirm(`Are you sure you want to delete delivery fee "${feeObj.name}"?`);
    if (!confirmDelete) return;

    try {
      await removeFee({
        token: token!,
        id: feeObj._id,
      });
      toast.success("Delivery fee deleted successfully");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete delivery fee");
    }
  };

  // Sort fees
  const sortedFees = [...(deliveryFees ?? [])].sort((a, b) => {
    const comp = a.name.localeCompare(b.name);
    return sortOrder === "asc" ? comp : -comp;
  });

  return (
    <PageLayout>
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black text-on-surface tracking-tighter flex items-center gap-3">
              <Truck className="w-8 h-8 text-primary" />
              Delivery Zones & Fees
            </h1>
            <p className="text-on-surface-variant font-medium mt-2">
              Configure zone-based delivery charges applied during POS checkout.
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-primary text-on-primary rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-secondary transition-all shadow-hard active:scale-95 cursor-pointer border-2 border-outline"
          >
            <Plus className="w-4 h-4" />
            New Delivery Zone
          </button>
        </div>

        {/* Filters Ribbon */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant opacity-45" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by zone name..."
              className="w-full pl-11 pr-4 py-3 bg-surface border-2 border-outline rounded-2xl font-bold text-sm text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all"
            />
          </div>
          <button
            onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
            className="px-4 py-3 bg-surface border-2 border-outline rounded-2xl font-black text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface flex items-center justify-center gap-2 transition-all cursor-pointer shadow-hard-sm"
          >
            <ArrowUpDown className="w-4 h-4" />
            Sort: Name ({sortOrder === "asc" ? "A-Z" : "Z-A"})
          </button>
        </div>

        {/* Table list */}
        <div className="bg-surface border-2 border-outline rounded-3xl overflow-hidden shadow-hard">
          {deliveryFees === undefined ? (
            <LoadingSpinner />
          ) : sortedFees.length === 0 ? (
            <div className="p-12 text-center">
              <Truck className="w-12 h-12 text-on-surface-variant/30 mx-auto mb-3" />
              <p className="font-black text-on-surface-variant">No delivery zones configured</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="border-b-2 border-outline bg-surface-container-low">
                    {["Zone Name", "Delivery Fee", "Description", "Status", "Created By", "Date Added", "Actions"].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-6 py-4 text-[10px] font-black text-on-surface-variant uppercase tracking-widest"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/30">
                  <AnimatePresence initial={false}>
                    {sortedFees.map((fee) => (
                      <motion.tr
                        key={fee._id}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="hover:bg-surface-container-low/30 transition-colors"
                      >
                        <td className="px-6 py-4 font-black text-sm text-on-surface">
                          {fee.name}
                        </td>
                        <td className="px-6 py-4 font-display text-primary text-sm">
                          {formatCurrency(fee.fee)}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-on-surface-variant max-w-[200px] truncate" title={fee.description}>
                          {fee.description || "---"}
                        </td>
                        <td className="px-6 py-4">
                          <button
                            onClick={() => handleToggleActive(fee)}
                            className={cn(
                              "inline-flex items-center gap-1 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest cursor-pointer transition-all border",
                              fee.active
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                                : "bg-surface-container-high text-on-surface-variant border-outline-variant"
                            )}
                          >
                            <span className={cn("w-1.5 h-1.5 rounded-full", fee.active ? "bg-emerald-500" : "bg-on-surface-variant/40")} />
                            {fee.active ? "Active" : "Inactive"}
                          </button>
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-on-surface-variant uppercase tracking-wide">
                          {fee.createdBy}
                        </td>
                        <td className="px-6 py-4 text-xs font-bold text-on-surface-variant">
                          {new Date(fee.createdAt).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <ActionBtn
                              icon={<Edit2 className="w-3.5 h-3.5" />}
                              label="Edit"
                              onClick={() => setEditingFee(fee)}
                            />
                            <ActionBtn
                              icon={<Trash2 className="w-3.5 h-3.5" />}
                              label="Delete"
                              danger
                              onClick={() => handleDeleteFee(fee)}
                            />
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <DeliveryFeeFormModal onClose={() => setShowCreateModal(false)} />
      )}
      {editingFee && (
        <DeliveryFeeFormModal
          feeObj={editingFee}
          onClose={() => setEditingFee(null)}
        />
      )}
    </PageLayout>
  );
}
