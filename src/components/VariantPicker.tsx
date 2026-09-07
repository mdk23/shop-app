"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { inputClass } from "@/components/ui";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";

export type PickedVariant = {
  variantId: Id<"productVariants">;
  label: string;
  sku: string;
  sellingPrice: number;
  costPrice: number;
};

export function VariantPicker({
  onPick,
  placeholder = "Search product…",
}: {
  onPick: (v: PickedVariant) => void;
  placeholder?: string;
}) {
  const [search, setSearch] = useState("");
  const [openProduct, setOpenProduct] = useState<Id<"products"> | null>(null);
  const products = useQuery(
    api.products.list,
    search.trim() ? { search, includeInactive: false } : "skip"
  );
  const detail = useQuery(
    api.products.get,
    openProduct ? { id: openProduct } : "skip"
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          className={`${inputClass} pl-9`}
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpenProduct(null);
          }}
        />
      </div>
      {search.trim() && (
        <div className="rounded-xl border border-outline bg-surface-container-low max-h-64 overflow-y-auto divide-y divide-outline/30">
          {(products ?? []).map((p) => (
            <div key={p._id}>
              <button
                onClick={() =>
                  setOpenProduct(openProduct === p._id ? null : p._id)
                }
                className="w-full text-left px-3 py-2 text-sm font-bold hover:bg-surface-container flex justify-between"
              >
                <span>{p.name}</span>
                <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                  {p.categoryName} · {p.variantCount}
                </span>
              </button>
              {openProduct === p._id && detail && (
                <div className="px-2 pb-2 space-y-1 bg-surface-container">
                  {detail.variants.map((v) => (
                    <button
                      key={v._id}
                      onClick={() => {
                        onPick({
                          variantId: v._id,
                          label: `${detail.name} — ${[v.color, v.size].filter(Boolean).join(" / ") || v.sku}`,
                          sku: v.sku,
                          sellingPrice: v.sellingPrice,
                          costPrice: v.costPrice,
                        });
                        setSearch("");
                        setOpenProduct(null);
                      }}
                      className={cn(
                        "w-full text-left px-2 py-1.5 rounded-lg text-[11px] font-bold bg-surface-container-low hover:bg-primary hover:text-on-primary flex justify-between"
                      )}
                    >
                      <span>{[v.color, v.size].filter(Boolean).join(" / ") || v.sku}</span>
                      <span className="font-mono opacity-60">{v.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {products && products.length === 0 && (
            <p className="px-3 py-3 text-xs text-on-surface-variant">No products</p>
          )}
        </div>
      )}
    </div>
  );
}
