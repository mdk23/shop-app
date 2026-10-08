"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Button, Field, TextInput } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * The customer's tax number (NUIT), kept with history in fiscalIdentities. Phones and
 * email are the customer's own fields, edited in the customer form.
 */
export function FichaNuit({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const nuit = useQuery(api.fiscalIdentities.getNuit, { customerId });
  const setNuit = useMutation(api.fiscalIdentities.setNuit);

  const [nuitInput, setNuitInput] = useState("");
  const [busy, setBusy] = useState(false);

  const saveNuit = async () => {
    setBusy(true);
    try {
      await setNuit({ token, customerId, number: nuitInput });
      toast.success(t("Tax number saved"));
      setNuitInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Tax number (NUIT)")}</p>
      <p className="text-sm">
        {nuit ? <span className="font-mono font-bold">{nuit}</span> : <span className="text-on-surface-variant">{t("Not recorded")}</span>}
      </p>
      <div className="flex gap-2 items-end">
        <Field label={t("New NUIT")}>
          <TextInput value={nuitInput} onChange={(e) => setNuitInput(e.target.value)} placeholder="400000000" />
        </Field>
        <Button size="sm" onClick={saveNuit} loading={busy} disabled={!nuitInput.trim()}>
          {t("Save")}
        </Button>
      </div>
    </Card>
  );
}
