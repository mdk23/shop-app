"use client";

import { Card, Button } from "@/components/ui";
import { Search, Zap } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * No customer selected: two equally weighted actions, never a forced pick.
 * "Venda rápida" isn't required to sell — completing the sale without ever
 * touching this panel already works (see the charge-time attach in
 * `pos/page.tsx`); it just collapses the rail for cashiers who want the
 * screen space back.
 */
export function RailEmpty({
  onSearch,
  onQuickSale,
}: {
  onSearch: () => void;
  onQuickSale: () => void;
}) {
  const { t } = useTranslation();
  return (
    <Card className="p-4 flex flex-col gap-3 h-full justify-center">
      <Button className="w-full" size="lg" onClick={onSearch}>
        <Search className="w-4 h-4" /> {t("Search customer")}
      </Button>
      <Button variant="secondary" className="w-full" size="lg" onClick={onQuickSale}>
        <Zap className="w-4 h-4" /> {t("Quick sale")}
      </Button>
    </Card>
  );
}
