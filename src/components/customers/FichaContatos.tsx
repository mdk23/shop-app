"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Button, Field, Select, Textarea, Spinner } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

const CHANNELS = ["PHONE", "WHATSAPP", "IN_STORE", "EMAIL", "OTHER"] as const;
type Channel = (typeof CHANNELS)[number];

const CHANNEL_LABEL: Record<Channel, string> = {
  PHONE: "Phone",
  WHATSAPP: "WhatsApp",
  IN_STORE: "In store",
  EMAIL: "Email",
  OTHER: "Other",
};

export function FichaContatos({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const interactions = useQuery(api.customerInteractions.listByCustomer, { customerId });
  const create = useMutation(api.customerInteractions.create);

  const [channel, setChannel] = useState<Channel>("PHONE");
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!summary.trim()) return toast.error(t("Write a short summary of the contact."));
    setBusy(true);
    try {
      await create({ token, customerId, channel, summary });
      toast.success(t("Contact saved"));
      setSummary("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-surface-container-low">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          {t("Log contact")}
        </p>
        <div className="space-y-2">
          <Field label={t("Channel")}>
            <Select value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {t(CHANNEL_LABEL[c])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Summary of the contact")}>
            <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
          </Field>
          <Button size="sm" onClick={save} loading={busy}>
            {t("Save")}
          </Button>
        </div>
      </Card>

      {interactions === undefined ? (
        <Spinner />
      ) : interactions.length === 0 ? (
        <p className="text-xs text-on-surface-variant">{t("No contacts yet")}</p>
      ) : (
        <div className="space-y-1.5">
          {interactions.map((i) => (
            <div
              key={i._id}
              className="p-2.5 rounded-xl bg-surface-container-low border border-outline text-xs"
            >
              <p className="font-bold">
                {formatDate(i.occurredAt)} · {t(CHANNEL_LABEL[i.channel])} · {i.createdByUsername}
              </p>
              <p className="mt-1 whitespace-pre-wrap">{i.summary}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
