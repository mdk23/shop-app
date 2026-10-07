"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc } from "../../../convex/_generated/dataModel";
import { Button, Field, Modal, Select } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { DEMAND_REASONS, type DemandReason } from "@/lib/demands";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

/** Marks a demand LOST. The reason starts from the one recorded with the demand, if any. */
export function LostDemandModal({
  demand,
  onClose,
}: {
  demand: Pick<Doc<"demands">, "_id" | "reason"> | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const token = useToken();
  const setStage = useMutation(api.demands.setStage);
  const [reason, setReason] = useState<DemandReason | "">("");
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Start from the demand's recorded reason each time a different demand is opened.
  if (demand && demand._id !== shownFor) {
    setShownFor(demand._id);
    setReason(demand.reason ?? "");
  }

  const save = async () => {
    if (!demand || !reason) return;
    setBusy(true);
    try {
      await setStage({ token, id: demand._id, stage: "LOST", reason });
      toast.success(t("Recorded"));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!demand}
      onClose={onClose}
      title={t("Why was the sale lost?")}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} loading={busy} disabled={!reason}>
            {t("Save")}
          </Button>
        </>
      }
    >
      <Field label={t("Reason")} required>
        <Select value={reason} onChange={(e) => setReason(e.target.value as DemandReason)}>
          <option value="">{t("Choose a reason")}</option>
          {DEMAND_REASONS.map((r) => (
            <option key={r.value} value={r.value}>
              {t(r.label)}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
