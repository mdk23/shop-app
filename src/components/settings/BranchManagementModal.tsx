"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Store, X, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

interface BranchManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  branchToEdit?: any | null;
}

export function BranchManagementModal({
  isOpen,
  onClose,
  branchToEdit,
}: BranchManagementModalProps) {
  const createBranch = useMutation(api.branches.create);
  const updateBranch = useMutation(api.branches.update);

  const [name, setName] = useState(branchToEdit?.name || "");
  const [code, setCode] = useState(branchToEdit?.code || "");
  const [address, setAddress] = useState(branchToEdit?.address || "");
  const [phone, setPhone] = useState(branchToEdit?.phone || "");
  const [isDefault, setIsDefault] = useState(branchToEdit?.isDefault || false);
  const [status, setStatus] = useState<"active" | "inactive">(
    branchToEdit?.status || "active"
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !code.trim()) {
      toast.error("Branch name and unique code are required.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (branchToEdit) {
        await updateBranch({
          id: branchToEdit._id,
          name: name.trim(),
          code: code.trim().toUpperCase(),
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          status,
          isDefault,
        });
        toast.success("Store branch updated successfully!");
      } else {
        await createBranch({
          name: name.trim(),
          code: code.trim().toUpperCase(),
          address: address.trim() || undefined,
          phone: phone.trim() || undefined,
          isDefault,
        });
        toast.success("Store branch created successfully!");
      }
      onClose();
    } catch (err: any) {
      toast.error(err.message || "Failed to save branch.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface border border-outline/30 rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-fadeIn">
        <div className="p-6 border-b border-outline/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-primary/10 text-primary flex items-center justify-center border border-primary/20">
              <Store className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-black text-on-surface">
                {branchToEdit ? "Edit Store Branch" : "Add Store Branch"}
              </h3>
              <p className="text-xs font-medium text-on-surface-variant">
                Define location details and store code
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wider mb-1">
              Branch Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Downtown Main Store"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface border border-outline/30 rounded-xl px-3.5 py-2.5 outline-none focus:border-primary text-sm font-bold text-on-surface shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wider mb-1">
              Branch Unique Code *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. MAIN or BR01"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="w-full bg-surface border border-outline/30 rounded-xl px-3.5 py-2.5 outline-none focus:border-primary text-sm font-bold text-on-surface uppercase shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wider mb-1">
              Physical Address
            </label>
            <input
              type="text"
              placeholder="e.g. Av. 24 de Julho, No. 120"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full bg-surface border border-outline/30 rounded-xl px-3.5 py-2.5 outline-none focus:border-primary text-sm font-medium text-on-surface shadow-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-on-surface uppercase tracking-wider mb-1">
              Contact Phone
            </label>
            <input
              type="text"
              placeholder="e.g. +258 84 123 4567"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-surface border border-outline/30 rounded-xl px-3.5 py-2.5 outline-none focus:border-primary text-sm font-medium text-on-surface shadow-sm"
            />
          </div>

          {branchToEdit && (
            <div>
              <label className="block text-xs font-bold text-on-surface uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-surface border border-outline/30 rounded-xl px-3.5 py-2.5 outline-none focus:border-primary text-sm font-bold text-on-surface shadow-sm cursor-pointer"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="isDefault"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 rounded border-outline/30 text-primary focus:ring-primary cursor-pointer"
            />
            <label
              htmlFor="isDefault"
              className="text-xs font-bold text-on-surface cursor-pointer"
            >
              Set as Default Main Store Branch
            </label>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-outline/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-outline/30 font-bold text-xs uppercase tracking-wider text-on-surface-variant hover:bg-surface-container transition-all cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-xs uppercase tracking-wider hover:bg-secondary transition-all shadow-sm flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Check className="w-4 h-4" />
              )}
              {branchToEdit ? "Save Changes" : "Create Branch"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
