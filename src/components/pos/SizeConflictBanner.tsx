"use client";

import { Button } from "@/components/ui";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * Advisory, non-blocking prompt shown above the cart when the cashier adds a
 * variant whose size contradicts the customer's known size for that
 * category. The item is already in the cart by the time this renders — this
 * only offers to update (or not update) the remembered profile.
 */
export function SizeConflictBanner({
  message,
  onConfirmUpdate,
  onDismiss,
}: {
  message: string;
  onConfirmUpdate: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs mb-2">
      <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
      <span className="flex-1 text-on-surface">{message}</span>
      <Button size="sm" onClick={onConfirmUpdate}>
        {t("Yes, update profile")}
      </Button>
      <Button variant="ghost" size="sm" onClick={onDismiss}>
        {t("Just this once")}
      </Button>
    </div>
  );
}
