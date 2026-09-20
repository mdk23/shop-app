"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal, Button } from "@/components/ui";
import { CustomerFormModal } from "@/components/customers/CustomerFormModal";
import { CustomerOnboardingPanel } from "@/components/customers/CustomerOnboardingPanel";
import { Search, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";

/**
 * Search/create customer panel — extracted from the old always-visible
 * `CustomerSelect` header so it can be opened on demand from the POS rail's
 * empty state ("Procurar cliente") instead of embedded in the cart.
 * "Novo cliente" hands off to the same `CustomerFormModal` used by the CRM's
 * `/customers` page, so both places collect the same fields.
 */
export function CustomerSearchPanel({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (id: Id<"customers">) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [onboardingId, setOnboardingId] = useState<Id<"customers"> | null>(null);

  const results = useQuery(api.customers.search, query.trim() ? { query } : "skip");

  const reset = () => {
    setQuery("");
    setCreateOpen(false);
  };

  if (onboardingId) {
    return (
      <CustomerOnboardingPanel
        customerId={onboardingId}
        onClose={() => setOnboardingId(null)}
      />
    );
  }

  if (open && createOpen) {
    return (
      <CustomerFormModal
        onClose={() => setCreateOpen(false)}
        onSaved={(id) => {
          reset();
          onClose();
          onSelect(id);
          // Non-blocking: the cashier can start the sale immediately. This
          // toast is the "opens only if there's no queue" offer from the
          // spec — dismiss it, and the customer stays exactly as
          // `createMinimal` left it.
          toast(t("New customer created"), {
            description: t("Get to know the customer? Only if there's no queue."),
            action: {
              label: t("Get to know the customer"),
              onClick: () => setOnboardingId(id),
            },
          });
        }}
      />
    );
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title={t("Search customer")}
      size="sm"
    >
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            autoFocus
            placeholder={t("Name or phone…")}
            className="w-full pl-9 bg-surface-container-low border border-outline rounded-xl py-2.5 px-3 text-sm focus:outline-none focus:border-primary"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="max-h-72 overflow-y-auto space-y-1">
          {(results ?? []).map((c) => (
            <button
              key={c._id}
              onClick={() => {
                reset();
                onClose();
                onSelect(c._id);
              }}
              className={cn(
                "w-full flex items-center gap-2 p-2.5 rounded-xl text-left transition-colors hover:bg-surface-container-low"
              )}
            >
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm truncate">{c.name}</p>
                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant opacity-60">
                  {c.phone1}
                </p>
              </div>
            </button>
          ))}
          {query.trim() && results && results.length === 0 && (
            <p className="p-4 text-center text-xs text-on-surface-variant">
              {t("No results")}
            </p>
          )}
        </div>
        <Button variant="secondary" className="w-full" onClick={() => setCreateOpen(true)}>
          <UserPlus className="w-3.5 h-3.5" /> {t("New customer")}
        </Button>
      </div>
    </Modal>
  );
}
