"use client";

import { useState, useEffect } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { X, Save, UserPlus, UserCircle2 } from "lucide-react";
import { Id } from "../../convex/_generated/dataModel";
import { toast } from "sonner";

interface CustomerModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialData?: {
    _id: Id<"customers">;
    name: string;
    phone1: string;
    phone2?: string;
    phone3?: string;
    isGeneric?: boolean;
  } | null;
}

export function CustomerModal({ isOpen, onClose, initialData }: CustomerModalProps) {
  const createCustomer = useMutation(api.customers.create);
  const updateCustomer = useMutation(api.customers.update);

  const [name, setName] = useState("");
  const [phone1, setPhone1] = useState("");
  const [phone2, setPhone2] = useState("");
  const [phone3, setPhone3] = useState("");
  const [isGeneric, setIsGeneric] = useState(false);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setPhone1(initialData.phone1);
      setPhone2(initialData.phone2 || "");
      setPhone3(initialData.phone3 || "");
      setIsGeneric(initialData.isGeneric ?? false);
    } else {
      setName("");
      setPhone1("");
      setPhone2("");
      setPhone3("");
      setIsGeneric(false);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !phone1) {
      toast.error("Name and primary phone are required");
      return;
    }

    try {
      if (initialData) {
        await updateCustomer({
          id: initialData._id,
          name,
          phone1,
          phone2: phone2 || undefined,
          phone3: phone3 || undefined,
          isGeneric,
        });
        toast.success("Client updated successfully");
      } else {
        await createCustomer({
          name,
          phone1,
          phone2: phone2 || undefined,
          phone3: phone3 || undefined,
          isGeneric,
        });
        toast.success("Client created successfully");
      }
      onClose();
    } catch (error: any) {
      toast.error(error.message || "Failed to save client");
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-lg border-4 border-outline rounded-lg shadow-hard-lg flex flex-col overflow-hidden">
        <div className="p-6 border-b-4 border-black bg-surface-container-low flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary text-on-primary rounded flex items-center justify-center">
              {initialData ? <UserCircle2 className="w-6 h-6" /> : <UserPlus className="w-6 h-6" />}
            </div>
            <h2 className="text-3xl font-display text-on-surface uppercase tracking-tighter">
              {initialData ? "Edit Client" : "New Client"}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded bg-surface-container-highest text-on-surface hover:bg-error hover:text-white transition-colors shadow-hard border-2 border-outline"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-8 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Client Name *</label>
            <input
              required
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
              placeholder="e.g. John Doe"
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Primary Phone *</label>
              <input
                required
                type="text"
                value={phone1}
                onChange={(e) => setPhone1(e.target.value)}
                className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                placeholder="e.g. 841234567"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Alt Phone 2 (Optional)</label>
              <input
                type="text"
                value={phone2}
                onChange={(e) => setPhone2(e.target.value)}
                className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                placeholder="e.g. 821234567"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Alt Phone 3 (Optional)</label>
              <input
                type="text"
                value={phone3}
                onChange={(e) => setPhone3(e.target.value)}
                className="w-full bg-surface-container-low border-2 border-outline rounded px-4 py-3 text-on-surface font-bold uppercase tracking-wider text-xs focus:border-primary outline-none transition-all shadow-hard-sm"
                placeholder="e.g. 871234567"
              />
            </div>
          </div>

          <div className="pt-4 flex gap-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-4 border-2 border-outline rounded font-black uppercase tracking-widest text-[10px] hover:bg-surface-container-low transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 py-4 rounded bg-primary text-on-primary border-2 border-outline font-black uppercase tracking-widest text-[10px] shadow-hard hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              <Save className="w-4 h-4" />
              {initialData ? "Update Client" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
