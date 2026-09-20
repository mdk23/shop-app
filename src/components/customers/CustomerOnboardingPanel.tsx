"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Modal, Button, Spinner } from "@/components/ui";
import { FichaTamanhos } from "./FichaTamanhos";
import { FichaPreferencias } from "./FichaPreferencias";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * The optional "conhecer o cliente" step (Tier 2) — a cashier opens this only
 * when there's no queue, right after creating a customer, or later from the
 * Ficha. Fully skippable: closing without touching anything leaves the
 * customer record exactly as `createMinimal`/`CustomerFormModal` left it.
 * Composes the existing `FichaTamanhos`/`FichaPreferencias` tabs (each saves
 * independently) rather than duplicating their size/preference logic.
 */
export function CustomerOnboardingPanel({
  customerId,
  onClose,
}: {
  customerId: Id<"customers">;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const context = useQuery(api.customers.getPosContext, { customerId });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t("Get to know the customer")}
      subtitle={t("Optional — skip anytime, or fill this in later from their profile.")}
      footer={<Button onClick={onClose}>{t("Done")}</Button>}
    >
      {!context ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
              {t("Sizes")}
            </p>
            <FichaTamanhos customerId={customerId} context={context} />
          </div>
          <div className="border-t border-outline/40 pt-4">
            <FichaPreferencias customerId={customerId} context={context} />
          </div>
        </div>
      )}
    </Modal>
  );
}
