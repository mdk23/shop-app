"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Field,
  TextInput,
  Select,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Kind = "PERCENT_OFF" | "AMOUNT_OFF" | "FIXED_PRICE";
type TargetKind = "PRODUCT" | "CATEGORY" | "COLLECTION";

const KIND_LABEL: Record<Kind, string> = {
  PERCENT_OFF: "Percentage off",
  AMOUNT_OFF: "Amount off",
  FIXED_PRICE: "Fixed price",
};

export default function PromotionsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const promotions = useQuery(api.promotions.list, {});
  const products = useQuery(api.products.list, {});
  const categories = useQuery(api.categories.list, {});
  const collections = useQuery(api.collections.list, {});
  const create = useMutation(api.promotions.create);
  const deactivate = useMutation(api.promotions.deactivate);

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<Kind>("PERCENT_OFF");
  const [value, setValue] = useState("");
  const [validFrom, setValidFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [validTo, setValidTo] = useState("");
  const [targetKind, setTargetKind] = useState<TargetKind>("CATEGORY");
  const [targetId, setTargetId] = useState("");
  const [busy, setBusy] = useState(false);

  const targetOptions =
    targetKind === "PRODUCT"
      ? (products ?? []).map((p) => ({ id: p._id as string, label: p.name }))
      : targetKind === "CATEGORY"
        ? (categories ?? []).map((c) => ({ id: c._id as string, label: c.name }))
        : (collections ?? []).map((c) => ({ id: c._id as string, label: c.name }));

  const reset = () => {
    setCreating(false);
    setName("");
    setValue("");
    setValidTo("");
    setTargetId("");
  };

  const save = async () => {
    if (!targetId) return toast.error(t("Choose what the promotion applies to."));
    setBusy(true);
    try {
      const target =
        targetKind === "PRODUCT"
          ? { productId: targetId as Id<"products"> }
          : targetKind === "CATEGORY"
            ? { categoryId: targetId as Id<"categories"> }
            : { collectionId: targetId as Id<"collections"> };
      await create({
        token,
        name,
        kind,
        value: Number(value),
        validFrom: new Date(validFrom).getTime(),
        validTo: validTo ? new Date(validTo).getTime() : undefined,
        targets: [target],
      });
      toast.success(t("Promotion created"));
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const stop = async (id: Id<"promotions">) => {
    try {
      await deactivate({ token, id });
      toast.success(t("Promotion stopped"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  return (
    <PageLayout title={t("Promotions")} subtitle={t("Discounts on products, categories or collections")}>
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New promotion")}
        </Button>
      </Toolbar>

      <Card>
        {promotions === undefined ? (
          <Spinner />
        ) : promotions.length === 0 ? (
          <EmptyState
            title={t("No promotions yet")}
            message={t("A promotion lowers the price of a product, category or collection for a set period.")}
            action={<Button onClick={() => setCreating(true)}>{t("New promotion")}</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t("Name")}</Th>
                  <Th>{t("Kind")}</Th>
                  <Th className="text-right">{t("Value")}</Th>
                  <Th>{t("Applies to")}</Th>
                  <Th>{t("Valid")}</Th>
                  <Th>{t("Status")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {promotions.map((p) => (
                  <tr key={p._id} className="hover:bg-surface-container-low">
                    <Td className="font-bold">{p.name}</Td>
                    <Td>{t(KIND_LABEL[p.kind])}</Td>
                    <Td className="text-right">
                      {p.kind === "PERCENT_OFF" ? `${p.value}%` : p.value}
                    </Td>
                    <Td>{p.targets.length} {t("target(s)")}</Td>
                    <Td>
                      {formatDate(p.validFrom)}
                      {p.validTo ? ` → ${formatDate(p.validTo)}` : ""}
                    </Td>
                    <Td>
                      <Badge tone={p.active ? "success" : "neutral"}>{p.active ? t("Active") : t("Stopped")}</Badge>
                    </Td>
                    <Td>
                      {p.active && (
                        <Button size="sm" variant="ghost" onClick={() => stop(p._id)}>
                          {t("Stop")}
                        </Button>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={reset}
        title={t("New promotion")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={reset}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy} disabled={!name.trim() || !value}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Name")} required>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Verão 20%")} />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Kind")}>
              <Select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {t(KIND_LABEL[k])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={kind === "PERCENT_OFF" ? t("Percent") : t("Value")} required>
              <TextInput type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("From")} required>
              <TextInput type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
            </Field>
            <Field label={t("Until")}>
              <TextInput type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Applies to")}>
              <Select
                value={targetKind}
                onChange={(e) => {
                  setTargetKind(e.target.value as TargetKind);
                  setTargetId("");
                }}
              >
                <option value="CATEGORY">{t("Category")}</option>
                <option value="PRODUCT">{t("Product")}</option>
                <option value="COLLECTION">{t("Collection")}</option>
              </Select>
            </Field>
            <Field label={t("Choose")} required>
              <Select value={targetId} onChange={(e) => setTargetId(e.target.value)}>
                <option value="">{t("Choose")}</option>
                {targetOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        </div>
      </Modal>
    </PageLayout>
  );
}
