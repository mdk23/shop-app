"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Button, Field, TextInput, Spinner } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

const STATUS_LABEL = {
  OPEN: "Open",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const;

/**
 * What this customer asked for and we didn't have (or was told we'd source).
 * Feeds buying: open requests are the lost-sale list.
 */
export function FichaProcuras({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const requests = useQuery(api.wantList.listOpen, { customerId });
  const create = useMutation(api.wantList.create);
  const resolve = useMutation(api.wantList.resolve);

  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!description.trim()) return toast.error(t("Describe what the customer asked for."));
    setBusy(true);
    try {
      await create({ token, customerId, description });
      toast.success(t("Request recorded"));
      setDescription("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const close = async (id: Id<"wantList">, outcome: "FULFILLED" | "CANCELLED") => {
    try {
      await resolve({ token, id, outcome });
      toast.success(t("Request updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-surface-container-low">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          {t("Add request")}
        </p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Field label={t("What did the customer ask for?")}>
              <TextInput
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={t("e.g. Black running shoes, size 42")}
              />
            </Field>
          </div>
          <Button size="sm" onClick={add} loading={busy}>
            {t("Add")}
          </Button>
        </div>
      </Card>

      {requests === undefined ? (
        <Spinner />
      ) : requests.length === 0 ? (
        <p className="text-xs text-on-surface-variant">{t("No requests yet")}</p>
      ) : (
        <div className="space-y-1.5">
          {requests.map((r) => (
            <div
              key={r._id}
              className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-container-low border border-outline text-xs"
            >
              <div className="min-w-0">
                <p className="font-bold truncate">{r.description}</p>
                <p className="text-on-surface-variant">
                  {formatDate(r.createdAt)} · {t(STATUS_LABEL[r.status])}
                </p>
              </div>
              {r.status === "OPEN" && (
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => close(r._id, "FULFILLED")}>
                    {t("Mark fulfilled")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => close(r._id, "CANCELLED")}>
                    {t("Cancel request")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
