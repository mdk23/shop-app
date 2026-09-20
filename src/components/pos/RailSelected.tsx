"use client";

import { Card, Badge, Button, Spinner } from "@/components/ui";
import { TIER_TONE, TIER_LABEL } from "@/lib/badgeTones";
import { CustomerAvatar } from "./CustomerAvatar";
import { SizeChips } from "./SizeChips";
import { RecentPurchaseRow } from "./RecentPurchaseRow";
import type { PosContext, PosContextSaleLine } from "./posContext";
import { X, FileText } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export function RailSelected({
  context,
  fmt,
  onClear,
  onBuyAgain,
  onOpenFicha,
}: {
  context: PosContext | undefined;
  fmt: (n: number) => string;
  onClear: () => void;
  onBuyAgain: (line: PosContextSaleLine) => void;
  onOpenFicha: () => void;
}) {
  const { t } = useTranslation();

  if (!context || !context.customer) {
    return (
      <Card className="p-4 h-full flex items-center justify-center">
        <Spinner />
      </Card>
    );
  }

  const { customer, money, sizes, recentSales } = context;

  return (
    <Card className="p-4 h-full flex flex-col gap-4 overflow-y-auto">
      <div className="flex items-start gap-3">
        <CustomerAvatar photoUrl={customer.photoUrl} initials={customer.initials} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-black text-sm text-on-surface truncate">{customer.name}</p>
            <Badge tone={TIER_TONE[customer.tier]}>{t(TIER_LABEL[customer.tier])}</Badge>
          </div>
          <p className="text-xs text-on-surface-variant">{customer.phone1}</p>
        </div>
        <button onClick={onClear} className="text-on-surface-variant hover:text-error">
          <X className="w-4 h-4" />
        </button>
      </div>

      <SizeChips sizes={sizes} />

      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="p-2 rounded-xl bg-surface-container-low">
          <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
            {t("Balance")}
          </p>
          <p className="text-sm font-black text-success">{fmt(money.storeCredit)}</p>
        </div>
        <div className="p-2 rounded-xl bg-surface-container-low">
          <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
            {t("Debt")}
          </p>
          <p className={`text-sm font-black ${money.outstandingDebt > 0 ? "text-amber-600" : ""}`}>
            {fmt(money.outstandingDebt)}
          </p>
        </div>
      </div>

      {recentSales.length > 0 && (
        <div className="flex-1 min-h-0">
          <p className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
            {t("Recent purchases")}
          </p>
          <div className="space-y-1.5">
            {recentSales.map((sale) => (
              <RecentPurchaseRow key={sale.saleId} sale={sale} fmt={fmt} onBuyAgain={onBuyAgain} />
            ))}
          </div>
        </div>
      )}

      <Button variant="secondary" className="w-full" onClick={onOpenFicha}>
        <FileText className="w-3.5 h-3.5" /> {t("View full profile")}
      </Button>
    </Card>
  );
}
