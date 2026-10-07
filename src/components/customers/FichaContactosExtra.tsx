"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Button, Field, TextInput, Select, Badge, Spinner } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

const TYPES = ["PHONE", "WHATSAPP", "EMAIL", "OTHER"] as const;
const TYPE_LABEL: Record<(typeof TYPES)[number], string> = {
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
  EMAIL: "Email",
  OTHER: "Other",
};

/** Extra phone numbers and addresses, plus the customer's tax number (NUIT). */
export function FichaContactosExtra({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const contacts = useQuery(api.contactMeans.listByCustomer, { customerId: customerId });
  const nuit = useQuery(api.fiscalIdentities.getNuit, { customerId: customerId });
  const add = useMutation(api.contactMeans.add);
  const retire = useMutation(api.contactMeans.retire);
  const setNuit = useMutation(api.fiscalIdentities.setNuit);

  const [type, setType] = useState<(typeof TYPES)[number]>("PHONE");
  const [value, setValue] = useState("");
  const [nuitInput, setNuitInput] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await add({ token, customerId: customerId, contactType: type, contactValue: value });
      toast.success(t("Contact added"));
      setValue("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const saveNuit = async () => {
    setBusy(true);
    try {
      await setNuit({ token, customerId: customerId, number: nuitInput });
      toast.success(t("Tax number saved"));
      setNuitInput("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
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

      <Card className="p-4 space-y-3">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Add contact")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
          <Field label={t("Type")}>
            <Select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number])}>
              {TYPES.map((x) => (
                <option key={x} value={x}>
                  {t(TYPE_LABEL[x])}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2 flex gap-2 items-end">
            <div className="flex-1">
              <Field label={t("Contact")}>
                <TextInput value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
            </div>
            <Button size="sm" onClick={save} loading={busy} disabled={!value.trim()}>
              {t("Add")}
            </Button>
          </div>
        </div>
      </Card>

      {contacts === undefined ? (
        <Spinner />
      ) : contacts.length === 0 ? (
        <p className="text-xs text-on-surface-variant">{t("No extra contacts yet")}</p>
      ) : (
        <div className="space-y-1.5">
          {contacts.map((c) => (
            <div
              key={c._id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-container-low border border-outline text-sm"
            >
              <div className="min-w-0">
                <p className="font-bold truncate">{c.contactValue}</p>
                <p className="text-xs text-on-surface-variant">
                  {t(TYPE_LABEL[c.contactType as (typeof TYPES)[number]] ?? "Other")} · {formatDate(c.validFrom)}
                </p>
              </div>
              {c.validTo === undefined ? (
                <Button size="sm" variant="ghost" onClick={() => retire({ token, id: c._id })}>
                  {t("Retire")}
                </Button>
              ) : (
                <Badge tone="neutral">{t("Retired")}</Badge>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
