"use client";

import { useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Button } from "@/components/ui";
import { RailEmpty } from "./RailEmpty";
import { RailSelected } from "./RailSelected";
import { CustomerSearchPanel } from "./CustomerSearchPanel";
import type { PosContext, PosContextSaleLine } from "./posContext";
import { Search } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * Renders one of three states: empty (no customer, never forced), selected
 * (the rich rail), or a collapsed "quick sale" strip. `context` is fetched
 * once by the parent (`pos/page.tsx`, which also needs it for catalog
 * filtering/sorting) and passed down — this component never queries on its
 * own, so there's exactly one `getPosContext` round trip per customer.
 */
export function CustomerRail({
  customerId,
  context,
  fmt,
  onSelect,
  onClear,
  onBuyAgain,
  onOpenFicha,
}: {
  customerId: Id<"customers"> | null;
  context: PosContext | undefined;
  fmt: (n: number) => string;
  onSelect: (id: Id<"customers">) => void;
  onClear: () => void;
  onBuyAgain: (line: PosContextSaleLine) => void;
  onOpenFicha: () => void;
}) {
  const { t } = useTranslation();
  const [searchOpen, setSearchOpen] = useState(false);
  const [quickSale, setQuickSale] = useState(false);

  return (
    <div className="h-full">
      {customerId ? (
        <RailSelected
          context={context}
          fmt={fmt}
          onClear={onClear}
          onBuyAgain={onBuyAgain}
          onOpenFicha={onOpenFicha}
        />
      ) : quickSale ? (
        <Card className="p-4 h-full flex flex-col items-center justify-center gap-2 text-center">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            {t("Quick sale — no customer")}
          </p>
          <Button variant="ghost" size="sm" onClick={() => setQuickSale(false)}>
            <Search className="w-3.5 h-3.5" /> {t("Select customer")}
          </Button>
        </Card>
      ) : (
        <RailEmpty onSearch={() => setSearchOpen(true)} onQuickSale={() => setQuickSale(true)} />
      )}

      <CustomerSearchPanel
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(id) => {
          setQuickSale(false);
          onSelect(id);
        }}
      />
    </div>
  );
}
