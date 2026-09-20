"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { FichaResumo } from "./FichaResumo";
import { FichaTamanhos } from "./FichaTamanhos";
import { FichaHistorico } from "./FichaHistorico";
import { FichaPreferencias } from "./FichaPreferencias";
import { useTranslation } from "@/contexts/LanguageContext";

const TABS = ["Summary", "Sizes", "History", "Preferences"] as const;
type Tab = (typeof TABS)[number];

/**
 * Tab shell shared by the POS drawer and the full `/customers/[id]` page —
 * `variant` only affects chrome, never content, so the two can't drift.
 * One `getPosContext` query (branchId omitted) feeds every tab except
 * Histórico, which is unbounded and paginates on its own.
 */
export function CustomerFicha({
  customerId,
  variant,
}: {
  customerId: Id<"customers">;
  variant: "drawer" | "page";
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("Summary");
  const context = useQuery(api.customers.getPosContext, { customerId });

  if (!context || !context.customer) {
    return (
      <div className={cn("flex items-center justify-center", variant === "page" ? "py-16" : "py-8")}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((tabKey) => (
          <button
            key={tabKey}
            onClick={() => setTab(tabKey)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
              tab === tabKey
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-outline"
            )}
          >
            {t(tabKey)}
          </button>
        ))}
      </div>

      {tab === "Summary" && <FichaResumo context={context} />}
      {tab === "Sizes" && <FichaTamanhos customerId={customerId} context={context} />}
      {tab === "History" && <FichaHistorico customerId={customerId} />}
      {tab === "Preferences" && <FichaPreferencias customerId={customerId} context={context} />}
    </div>
  );
}
