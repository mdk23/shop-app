"use client";

import { Badge, Button } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import type { PosContextSale, PosContextSaleLine } from "./posContext";
import { useTranslation } from "@/contexts/LanguageContext";

export function RecentPurchaseRow({
  sale,
  fmt,
  onBuyAgain,
}: {
  sale: PosContextSale;
  fmt: (n: number) => string;
  onBuyAgain: (line: PosContextSaleLine) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="p-2 rounded-lg bg-surface-container-low border border-outline/50 space-y-1">
      <div className="flex items-center justify-between text-[9px] text-on-surface-variant uppercase tracking-wider">
        <span>{formatDate(sale.createdAt)}</span>
        <span className="flex items-center gap-1">
          {sale.hasReturns && <Badge tone="warning">{t("return")}</Badge>}
          <span className="font-bold">{fmt(sale.total)}</span>
        </span>
      </div>
      {sale.lines.map((line) => (
        <div key={line.saleItemId} className="flex items-center justify-between gap-2">
          <span className="text-xs text-on-surface truncate">
            {line.quantity}× {line.productName}
            {line.variantLabel && (
              <span className="text-on-surface-variant"> ({line.variantLabel})</span>
            )}
          </span>
          <Button variant="ghost" size="sm" onClick={() => onBuyAgain(line)}>
            {t("Buy again")}
          </Button>
        </div>
      ))}
    </div>
  );
}
