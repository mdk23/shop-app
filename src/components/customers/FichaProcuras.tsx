"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { Card, Button, Field, TextInput, Select, Spinner } from "@/components/ui";
import { LostDemandModal } from "@/components/demands/LostDemandModal";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import {
  DEMAND_REASONS,
  DEMAND_REASON_LABEL,
  DEMAND_STAGE_LABEL,
  isClosedStage,
  type DemandReason,
} from "@/lib/demands";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

/**
 * What this customer asked for and we didn't have (or was told we'd source).
 * Structured size, colour, budget and reason make the request countable for buying.
 */
export function FichaProcuras({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const requests = useQuery(api.demands.listByCustomer, { customerId });
  const sizes = useQuery(api.sizes.list, {});
  const colors = useQuery(api.colors.list, {});
  const create = useMutation(api.demands.create);
  const setStage = useMutation(api.demands.setStage);
  const [losing, setLosing] = useState<Doc<"demands"> | null>(null);

  const [description, setDescription] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [colorId, setColorId] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [reason, setReason] = useState<DemandReason | "">("");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    if (!description.trim()) return toast.error(t("Describe what the customer asked for."));
    setBusy(true);
    try {
      await create({
        token,
        customerId,
        description,
        sizeId: sizeId ? (sizeId as Id<"sizes">) : undefined,
        colorId: colorId ? (colorId as Id<"colors">) : undefined,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        reason: reason || undefined,
      });
      toast.success(t("Request recorded"));
      setDescription("");
      setSizeId("");
      setColorId("");
      setMaxPrice("");
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const fulfil = async (id: Id<"demands">) => {
    try {
      await setStage({ token, id, stage: "FULFILLED" });
      toast.success(t("Request updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const sizeName = (id?: string) => (sizes ?? []).find((s) => s._id === id)?.name;
  const colorName = (id?: string) => (colors ?? []).find((c) => c._id === id)?.name;

  return (
    <div className="space-y-4">
      <Card className="p-3 bg-surface-container-low">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          {t("Add request")}
        </p>
        <div className="space-y-2">
          <Field label={t("What did the customer ask for?")}>
            <TextInput
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("e.g. Black running shoes, size 42")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Size")}>
              <Select value={sizeId} onChange={(e) => setSizeId(e.target.value)}>
                <option value="">{t("Any size")}</option>
                {(sizes ?? []).map((s) => (
                  <option key={s._id} value={s._id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Color")}>
              <Select value={colorId} onChange={(e) => setColorId(e.target.value)}>
                <option value="">{t("Any color")}</option>
                {(colors ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Budget (max price)")}>
              <TextInput
                type="number"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </Field>
            <Field label={t("Reason")}>
              <Select value={reason} onChange={(e) => setReason(e.target.value as DemandReason | "")}>
                <option value="">{t("Not recorded")}</option>
                {DEMAND_REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {t(r.label)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={add} loading={busy}>
              {t("Add")}
            </Button>
          </div>
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
                  {[
                    sizeName(r.sizeId) && `${t("Size")} ${sizeName(r.sizeId)}`,
                    colorName(r.colorId) && `${t("Color")} ${colorName(r.colorId)}`,
                    r.maxPrice !== undefined && `${t("Budget")} ${r.maxPrice}`,
                    r.reason && t(DEMAND_REASON_LABEL[r.reason]),
                    `${formatDate(r.createdAt)} · ${t(DEMAND_STAGE_LABEL[r.stage])}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              {!isClosedStage(r.stage) && (
                <div className="flex gap-1.5 shrink-0">
                  <Button size="sm" variant="secondary" onClick={() => fulfil(r._id)}>
                    {t("Mark fulfilled")}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setLosing(r)}>
                    {t("Lost")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <LostDemandModal demand={losing} onClose={() => setLosing(null)} />
    </div>
  );
}
