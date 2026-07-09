"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { useAuth } from "@/contexts/AuthContext";
import { cn } from "@/lib/utils";
import {
  Truck,
  Plus,
  Search,
  Pencil,
  Trash2,
  X,
  Save,
  Phone,
  Mail,
  MapPin,
  CreditCard,
  User,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { Id } from "../../../convex/_generated/dataModel";

export default function SuppliersPage() {
  const { token } = useAuth();
  
  // Queries & Mutations
  const suppliers = useQuery(api.suppliers.list, {});
  const createSupplier = useMutation(api.suppliers.create);
  const updateSupplier = useMutation(api.suppliers.update);
  const removeSupplier = useMutation(api.suppliers.remove);

  // Component States
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  
  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<any>(null);
  
  // Form States
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [status, setStatus] = useState<"active" | "inactive">("active");

  const openAddModal = () => {
    setEditingSupplier(null);
    setName("");
    setContactName("");
    setPhone("");
    setEmail("");
    setAddress("");
    setPaymentTerms("");
    setStatus("active");
    setIsModalOpen(true);
  };

  const openEditModal = (supplier: any) => {
    setEditingSupplier(supplier);
    setName(supplier.name);
    setContactName(supplier.contactName || "");
    setPhone(supplier.phone || "");
    setEmail(supplier.email || "");
    setAddress(supplier.address || "");
    setPaymentTerms(supplier.paymentTerms || "");
    setStatus(supplier.status);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Supplier name is required");
      return;
    }
    if (!token) {
      toast.error("You must be logged in to modify suppliers");
      return;
    }

    try {
      if (editingSupplier) {
        await updateSupplier({
          token,
          id: editingSupplier._id,
          name,
          contactName: contactName || undefined,
          phone: phone || undefined,
          email: email || undefined,
          address: address || undefined,
          paymentTerms: paymentTerms || undefined,
          status,
        });
        toast.success("Supplier updated successfully");
      } else {
        await createSupplier({
          token,
          name,
          contactName: contactName || undefined,
          phone: phone || undefined,
          email: email || undefined,
          address: address || undefined,
          paymentTerms: paymentTerms || undefined,
          status,
        });
        toast.success("Supplier added successfully");
      }
      setIsModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || "Failed to save supplier");
    }
  };

  const handleDelete = (supplier: any) => {
    if (!token) {
      toast.error("You must be logged in to delete suppliers");
      return;
    }

    toast.warning(`Delete supplier "${supplier.name}"?`, {
      description: "This action cannot be undone.",
      action: {
        label: "Delete",
        onClick: async () => {
          try {
            await removeSupplier({ token, id: supplier._id });
            toast.success("Supplier deleted successfully");
          } catch (err: any) {
            toast.error(err.message || "Failed to delete supplier");
          }
        },
      },
      duration: 5000,
    });
  };

  // Filter & Search Logic
  const filteredSuppliers = (suppliers || []).filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.contactName && s.contactName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (s.phone && s.phone.includes(searchTerm));
    
    const matchesStatus = statusFilter === "all" || s.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <PageLayout>
      <div className="space-y-12">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div>
            <h1 className="text-on-surface mb-2 font-display text-4xl uppercase tracking-tighter">Suppliers</h1>
            <p className="text-on-surface-variant font-black uppercase tracking-[0.3em] text-[10px] opacity-60 flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" /> Vendor & Supplier Directory
            </p>
          </div>
          <button
            onClick={openAddModal}
            className="bg-brand-gradient text-white border-4 border-black px-8 py-4 rounded-lg font-display text-2xl uppercase tracking-tighter shadow-hard hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-3 self-start lg:self-auto"
          >
            <Plus className="w-8 h-8" strokeWidth={3} />
            Add New Supplier
          </button>
        </div>

        {/* Directory Controls */}
        <div className="bg-surface border-4 border-outline rounded-xl shadow-hard flex flex-col min-h-[500px]">
          <div className="p-6 border-b-4 border-outline flex flex-col md:flex-row items-center gap-4 bg-surface-container-low/50">
            {/* Search Input */}
            <div className="relative flex-1 w-full max-w-md">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" />
              <input
                type="text"
                placeholder="Search by name, contact, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-surface-container-high border-2 border-outline rounded-lg pl-12 pr-4 py-3 outline-none focus:border-primary transition-all font-black uppercase tracking-wider text-[10px] shadow-hard-sm"
              />
            </div>
            
            {/* Status Filters */}
            <div className="flex border-2 border-outline rounded-lg overflow-hidden w-full md:w-auto shadow-hard-sm">
              {(["all", "active", "inactive"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setStatusFilter(filter)}
                  className={cn(
                    "flex-1 md:flex-initial px-6 py-2.5 font-black uppercase text-[10px] tracking-wider transition-all",
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

          {/* Supplier Grid */}
          <div className="flex-1 p-6 overflow-auto">
            {suppliers === undefined ? (
              <div className="flex flex-col items-center justify-center py-24 text-on-surface-variant/40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="mt-4 font-black uppercase tracking-wider text-[10px]">Loading Suppliers...</p>
              </div>
            ) : filteredSuppliers.length === 0 ? (
              <div className="text-center py-24 text-on-surface-variant/40 font-black uppercase tracking-wider text-[10px]">
                <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-35" />
                No suppliers found in directory
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredSuppliers.map((supplier) => (
                  <div
                    key={supplier._id}
                    className="bg-surface-container-low border-2 border-outline rounded-xl p-5 shadow-hard flex flex-col justify-between hover:translate-x-0.5 hover:translate-y-0.5 transition-all"
                  >
                    <div>
                      {/* Name & Status */}
                      <div className="flex justify-between items-start gap-4 mb-4">
                        <div>
                          <h3 className="font-display text-xl uppercase tracking-tight text-on-surface line-clamp-1">
                            {supplier.name}
                          </h3>
                          {supplier.contactName && (
                            <span className="text-[10px] font-black text-on-surface-variant/60 uppercase tracking-wider flex items-center gap-1.5 mt-0.5">
                              <User className="w-3.5 h-3.5 text-primary" /> {supplier.contactName}
                            </span>
                          )}
                        </div>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest",
                            supplier.status === "active"
                              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
                              : "bg-error/10 text-error border border-error/20"
                          )}
                        >
                          {supplier.status}
                        </span>
                      </div>

                      {/* Details list */}
                      <div className="space-y-2 border-t border-outline/50 pt-4 text-xs font-bold text-on-surface-variant">
                        {supplier.phone && (
                          <div className="flex items-center gap-2.5">
                            <Phone className="w-4 h-4 text-on-surface-variant/60 flex-shrink-0" />
                            <span>{supplier.phone}</span>
                          </div>
                        )}
                        {supplier.email && (
                          <div className="flex items-center gap-2.5">
                            <Mail className="w-4 h-4 text-on-surface-variant/60 flex-shrink-0" />
                            <span className="truncate">{supplier.email}</span>
                          </div>
                        )}
                        {supplier.address && (
                          <div className="flex items-start gap-2.5">
                            <MapPin className="w-4 h-4 text-on-surface-variant/60 mt-0.5 flex-shrink-0" />
                            <span className="line-clamp-2">{supplier.address}</span>
                          </div>
                        )}
                        {supplier.paymentTerms && (
                          <div className="flex items-center gap-2.5">
                            <CreditCard className="w-4 h-4 text-on-surface-variant/60 flex-shrink-0" />
                            <span>Terms: <strong className="text-on-surface uppercase">{supplier.paymentTerms}</strong></span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex justify-end gap-3 mt-6 border-t border-outline/50 pt-4">
                      <button
                        onClick={() => openEditModal(supplier)}
                        className="px-4 py-2 border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-surface-container-high active:bg-surface-container-highest transition-all shadow-hard-sm"
                      >
                        <Pencil className="w-4 h-4 inline mr-1.5" /> Edit
                      </button>
                      <button
                        onClick={() => handleDelete(supplier)}
                        className="px-4 py-2 bg-error/10 text-error border-2 border-black rounded font-display text-sm uppercase tracking-tighter hover:bg-error hover:text-white transition-all shadow-hard-sm"
                      >
                        <Trash2 className="w-4 h-4 inline mr-1.5" /> Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal - Add / Edit */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
          <div className="bg-surface w-full max-w-lg border-4 border-outline rounded-lg shadow-hard-lg flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-6 border-b-4 border-black bg-surface-container-low flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary text-on-primary rounded flex items-center justify-center">
                  <Truck className="w-6 h-6" />
                </div>
                <h2 className="text-3xl font-display text-on-surface uppercase tracking-tighter">
                  {editingSupplier ? "Edit Supplier" : "Add Supplier"}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-10 h-10 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-8 space-y-5 overflow-y-auto max-h-[70vh]">
              {/* Supplier Name */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  Supplier Name *
                </label>
                <input
                  required
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                  placeholder="e.g. Maputo Poultry Ltd"
                />
              </div>

              {/* Contact Person */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  Contact Person
                </label>
                <input
                  type="text"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                  placeholder="e.g. Carlos Tembe"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Phone */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                    placeholder="e.g. +258 84 123 4567"
                  />
                </div>

                {/* Email */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                    placeholder="e.g. contact@maputopoultry.co.mz"
                  />
                </div>
              </div>

              {/* Address */}
              <div className="space-y-2">
                <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                  Address
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                  placeholder="e.g. Av. Moçambique, Maputo"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Payment Terms */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Payment Terms
                  </label>
                  <input
                    type="text"
                    value={paymentTerms}
                    onChange={(e) => setPaymentTerms(e.target.value)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                    placeholder="e.g. Cash, Net 15"
                  />
                </div>

                {/* Status */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
                    Status
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-black uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm h-[46px]"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-6 border-t border-black mt-6">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-3 border-2 border-black rounded font-display text-base uppercase tracking-tighter hover:bg-surface-container-high active:bg-surface-container-highest transition-all shadow-hard-sm"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-3 bg-brand-gradient text-white border-2 border-black rounded font-display text-base uppercase tracking-tighter hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center gap-2 shadow-hard-sm"
                >
                  <Save className="w-5 h-5" />
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageLayout>
  );
}
