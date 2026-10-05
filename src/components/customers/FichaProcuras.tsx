"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Button, Field, TextInput, Select, Spinner } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

const STATUS_LABEL = {
  OPEN: "Open",
  FULFILLED: "Fulfilled",
  CANCELLED: "Cancelled",
} as const;

const REASONS = ["WRONG_SIZE", "WRONG_COLOR", "PRICE_TOO_HIGH", "NOT_IN_STOCK", "OTHER"] as const;
type Reason = (typeof REASONS)[number];

const REASON_LABEL: Record<Reason, string> = {
  WRONG_SIZE: "Wrong size",
  WRONG_COLOR: "Wrong color",
  PRICE_TOO_HIGH: "Price too high",
  NOT_IN_STOCK: "Not in stock",
  OTHER: "Other",
};

/**
 * What this customer asked for and we didn't have (or was told we'd source).
 * Structured size, colour, budget and reason make the request countable for buying.
 */
export function FichaProcuras({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const requests = useQuery(api.wantList.listOpen, { customerId });
  const sizes = useQuery(api.sizes.list, {});
  const colors = useQuery(api.colors.list, {});
  const create = useMutation(api.wantList.create);
  const resolve = useMutation(api.wantList.resolve);

  const [description, setDescription] = useState("");
  const [sizeId, setSizeId] = useState("");
  const [colorId, setColorId] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [reason, setReason] = useState<Reason | "">("");
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

  const close = async (id: Id<"wantList">, outcome: "FULFILLED" | "CANCELLED") => {
    try {
      await resolve({ token, id, outcome });
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
              <Select value={reason} onChange={(e) => setReason(e.target.value as Reason | "")}>
                <option value="">{t("Not recorded")}</option>
                {REASONS.map((r) => (
                  <option key={r} value={r}>
                    {t(REASON_LABEL[r])}
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
                    r.reason && t(REASON_LABEL[r.reason]),
                    `${formatDate(r.createdAt)} · ${t(STATUS_LABEL[r.status])}`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
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
