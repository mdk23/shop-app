"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { inputClass } from "@/components/ui";
import { Search, X } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * Picks one product by typing its name. Every product can be found, however large the
 * catalogue: the list is a name search, never the first few hundred products.
 */
export function ProductSearchSelect({
  value,
  onChange,
}: {
  value: Id<"products"> | "";
  onChange: (id: Id<"products"> | "") => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string>("");
  const results = useQuery(
    api.products.list,
    search.trim() ? { search, includeInactive: false } : "skip"
  );

  if (value && picked) {
    return (
      <div className={`${inputClass} flex items-center justify-between`}>
        <span className="font-bold">{picked}</span>
        <button
          type="button"
          onClick={() => {
            onChange("");
            setPicked("");
          }}
          className="text-on-surface-variant hover:text-error"
          aria-label={t("Clear")}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
        <input
          className={`${inputClass} pl-9`}
          placeholder={t("Search product…")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {search.trim() && (
        <div className="rounded-xl border border-outline bg-surface-container-low max-h-56 overflow-y-auto divide-y divide-outline/30">
          {results === undefined ? (
            <p className="px-3 py-2 text-xs text-on-surface-variant">{t("Searching…")}</p>
          ) : results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-on-surface-variant">{t("No products found")}</p>
          ) : (
            results.map((p) => (
              <button
                key={p._id}
                type="button"
                onClick={() => {
                  onChange(p._id);
                  setPicked(p.name);
                  setSearch("");
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-surface-container flex justify-between"
              >
                <span className="font-bold">{p.name}</span>
                <span className="text-[10px] text-on-surface-variant uppercase tracking-wider">
                  {p.categoryName}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
