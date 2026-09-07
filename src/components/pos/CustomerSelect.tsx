"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { cn } from "@/lib/utils";
import { Search, UserPlus, User, Check } from "lucide-react";
import { toast } from "sonner";
import { Modal, Button, Field, TextInput } from "@/components/ui";
import { useToken } from "@/lib/useShop";

export function CustomerSelect({
  selectedCustomerId,
  onSelect,
}: {
  selectedCustomerId: Id<"customers"> | null;
  onSelect: (id: Id<"customers">) => void;
}) {
  const token = useToken();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const results = useQuery(api.customers.search, { query });
  const selected = useQuery(
    api.customers.getById,
    selectedCustomerId ? { id: selectedCustomerId } : "skip"
  );
  const getGeneric = useMutation(api.customers.getOrCreateGeneric);
  const createCustomer = useMutation(api.customers.create);

  useEffect(() => {
    if (!selectedCustomerId) getGeneric().then((id) => onSelect(id));
  }, [selectedCustomerId, getGeneric, onSelect]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const [name, setName] = useState("");
  const [phone1, setPhone1] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || !phone1.trim())
      return toast.error("Name and phone are required.");
    setBusy(true);
    try {
      const id = await createCustomer({ token, name, phone1 });
      onSelect(id);
      setShowNew(false);
      setOpen(false);
      setName("");
      setPhone1("");
      toast.success("Customer added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative w-full" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "w-full flex items-center gap-3 bg-surface-container-low border border-outline rounded-xl p-3 text-left transition-colors hover:border-primary/50",
          open && "border-primary"
        )}
      >
        <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary flex-shrink-0">
          <User className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-sm text-on-surface truncate">
            {selected?.name ?? "Walk-in Customer"}
          </p>
          <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant opacity-60">
            {selected?.phone1 ?? "—"}
            {selected && selected.stats && selected.stats.storeCredit > 0 && (
              <span className="text-success"> · credit {selected.stats.storeCredit.toFixed(2)}</span>
            )}
          </p>
        </div>
        <Search className="w-4 h-4 text-on-surface-variant" />
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-2 bg-surface border border-outline rounded-2xl shadow-hard-lg overflow-hidden">
          <div className="p-2 border-b border-outline/40">
            <input
              autoFocus
              placeholder="Search name or phone…"
              className="w-full bg-surface-container-low border border-outline rounded-xl py-2 px-3 text-sm focus:outline-none focus:border-primary"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1.5 space-y-1">
            {(results ?? []).map((c) => (
              <button
                key={c._id}
                onClick={() => {
                  onSelect(c._id);
                  setOpen(false);
                  setQuery("");
                }}
                className={cn(
                  "w-full flex items-center gap-2 p-2.5 rounded-xl text-left transition-colors",
                  selectedCustomerId === c._id
                    ? "bg-primary text-on-primary"
                    : "hover:bg-surface-container-low"
                )}
              >
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm truncate">{c.name}</p>
                  <p className="text-[10px] font-bold uppercase tracking-wider opacity-60">
                    {c.phone1}
                  </p>
                </div>
                {selectedCustomerId === c._id && <Check className="w-4 h-4" />}
              </button>
            ))}
            {results && results.length === 0 && (
              <p className="p-4 text-center text-xs text-on-surface-variant">
                No matches
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setShowNew(true);
              setOpen(false);
            }}
            className="w-full flex items-center justify-center gap-2 p-3 bg-primary/5 hover:bg-primary/10 text-primary text-xs font-black uppercase tracking-widest border-t border-outline/40"
          >
            <UserPlus className="w-4 h-4" /> Add New Customer
          </button>
        </div>
      )}

      <Modal
        open={showNew}
        onClose={() => setShowNew(false)}
        title="New Customer"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
            <Button onClick={create} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Full name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Phone" required>
          <TextInput value={phone1} onChange={(e) => setPhone1(e.target.value)} />
        </Field>
      </Modal>
    </div>
  );
}
