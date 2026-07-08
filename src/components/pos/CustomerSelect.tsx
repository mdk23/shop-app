"use client";

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { formatCurrency } from "@/lib/utils";
import { Search, UserPlus, X, Check, Phone, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

interface CustomerSelectProps {
  selectedCustomerId: string | null;
  onSelect: (customerId: string) => void;
}

export function CustomerSelect({ selectedCustomerId, onSelect }: CustomerSelectProps) {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [showNewModal, setShowNewModal] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const customers = useQuery(api.customers.search, { query });
  const selectedCustomer = useQuery(api.customers.getById, 
    (selectedCustomerId && selectedCustomerId !== "") ? { id: selectedCustomerId as any } : "skip"
  );
  
  const getOrCreateGeneric = useMutation(api.customers.getOrCreateGeneric);
  const createCustomer = useMutation(api.customers.create);

  // Initialize with Generic Client if none selected
  useEffect(() => {
    if (!selectedCustomerId) {
      getOrCreateGeneric().then((c) => onSelect(c));
    }
  }, [selectedCustomerId, getOrCreateGeneric, onSelect]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreateCustomer = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name") as string;
    const phone1 = formData.get("phone1") as string;
    
    if (!name || !phone1) {
      toast.error("Name and Phone Number 1 are required");
      return;
    }

    try {
      const id = await createCustomer({
        name,
        phone1,
        phone2: formData.get("phone2") as string || undefined,
        phone3: formData.get("phone3") as string || undefined,
      });
      onSelect(id);
      setShowNewModal(false);
      setIsOpen(false);
      setQuery("");
      toast.success("Customer created successfully");
    } catch (error: any) {
      toast.error(error.message || "Failed to create customer");
    }
  };

  return (
    <div className="relative w-full" ref={containerRef}>
      <label className="block text-sm font-bold text-on-surface-variant mb-2 ml-1">
        Customer
      </label>
      
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "flex items-center gap-3 bg-surface-container-high border border-outline-variant rounded-xl p-3 cursor-pointer transition-all hover:border-primary/50",
          isOpen && "border-primary ring-2 ring-primary/20 shadow-soft"
        )}
      >
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <User className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0 pr-4">
          <p className="font-bold text-on-surface truncate">
            {selectedCustomer?.name || "Loading..."}
          </p>
          <p className="text-xs text-on-surface-variant font-medium">
            {selectedCustomer?.phone1 || "Searching..."}
          </p>
        </div>
        

        <Search className="w-5 h-5 text-on-surface-variant ml-2" />
      </div>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute z-50 left-0 right-0 mt-2 bg-surface-container-highest border border-outline-variant rounded-2xl shadow-prominent overflow-hidden"
          >
            <div className="p-3 border-b border-outline-variant bg-surface-container-high">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Search name or phone..."
                  className="w-full bg-surface-container-low border border-outline-variant rounded-xl py-2 pl-10 pr-4 text-sm focus:outline-none focus:border-primary transition-all"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="max-h-[300px] overflow-y-auto p-2 space-y-1">
              {customers?.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant italic text-sm">
                  No customers found
                </div>
              ) : (
                customers?.map((customer) => (
                  <button
                    key={customer._id}
                    onClick={() => {
                      onSelect(customer._id);
                      setIsOpen(false);
                      setQuery("");
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left",
                      selectedCustomerId === customer._id 
                        ? "bg-primary text-on-primary shadow-soft" 
                        : "hover:bg-surface-container-low text-on-surface"
                    )}
                  >
                    <div className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center",
                      selectedCustomerId === customer._id ? "bg-on-primary/20" : "bg-primary/10 text-primary"
                    )}>
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0 pr-2">
                      <p className="font-bold text-sm truncate">{customer.name}</p>
                      <p className={cn(
                        "text-[10px] font-bold uppercase tracking-wider opacity-60",
                        selectedCustomerId === customer._id ? "text-on-primary" : "text-on-surface-variant"
                      )}>
                        {customer.phone1}
                      </p>
                    </div>
                    {selectedCustomerId === customer._id && <Check className="w-4 h-4 ml-2" />}
                  </button>
                ))
              )}
            </div>

            <button
              onClick={() => {
                setShowNewModal(true);
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 p-4 bg-primary/5 hover:bg-primary/10 text-primary font-bold border-t border-outline-variant transition-all"
            >
              <UserPlus className="w-5 h-5" />
              Add New Customer
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showNewModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-surface-container-lowest border border-outline-variant rounded-3xl shadow-prominent w-full max-w-md overflow-hidden"
            >
              <div className="p-6 border-b border-outline-variant flex items-center justify-between bg-primary/5">
                <h3 className="text-xl font-black text-on-surface flex items-center gap-2">
                  <UserPlus className="w-6 h-6 text-primary" />
                  New Customer
                </h3>
                <button 
                  onClick={() => setShowNewModal(false)}
                  className="p-2 hover:bg-surface-container-high rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateCustomer} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-bold text-on-surface-variant mb-1.5 ml-1">
                    Full Name
                  </label>
                  <input
                    name="name"
                    required
                    type="text"
                    placeholder="John Doe"
                    className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-3 focus:outline-none focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-on-surface-variant mb-1.5 ml-1">
                    Phone Number 1 (Required)
                  </label>
                  <input
                    name="phone1"
                    required
                    type="tel"
                    placeholder="840000000"
                    className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-3 focus:outline-none focus:border-primary transition-all"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-bold text-on-surface-variant mb-1.5 ml-1">
                      Phone 2 (Optional)
                    </label>
                    <input
                      name="phone2"
                      type="tel"
                      className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-3 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-bold text-on-surface-variant mb-1.5 ml-1">
                      Phone 3 (Optional)
                    </label>
                    <input
                      name="phone3"
                      type="tel"
                      className="w-full bg-surface-container-high border border-outline-variant rounded-xl p-3 focus:outline-none focus:border-primary transition-all"
                    />
                  </div>
                </div>

                <div className="pt-4 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setShowNewModal(false)}
                    className="flex-1 py-4 rounded-xl font-bold text-on-surface-variant hover:bg-surface-container-high transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-4 bg-primary text-on-primary rounded-xl font-black shadow-soft hover:bg-terracotta transition-all"
                  >
                    Save Customer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
