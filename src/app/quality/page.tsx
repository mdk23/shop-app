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
  Textarea,
  Select,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
  PagedFooter,
} from "@/components/ui";
import { VariantPicker, type PickedVariant } from "@/components/VariantPicker";
import { useToken } from "@/lib/useShop";
import { formatDate, cn } from "@/lib/utils";
import { useClientPage } from "@/lib/pagination";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Treatment = "RETURN_TO_SUPPLIER" | "DISCOUNT" | "ACCEPT_AS_IS" | "DESTROY";
const TREATMENTS: { value: Treatment; label: string }[] = [
  { value: "RETURN_TO_SUPPLIER", label: "Return to supplier" },
  { value: "DISCOUNT", label: "Discount from supplier" },
  { value: "ACCEPT_AS_IS", label: "Accept as is" },
  { value: "DESTROY", label: "Destroy" },
];

export default function QualityPage() {
  const { t } = useTranslation();
  const token = useToken();
  const [onlyOpen, setOnlyOpen] = useState(true);
  const rows = useQuery(api.nonConformities.list, {});
  const suppliers = useQuery(api.suppliers.list, {});
  const create = useMutation(api.nonConformities.create);
  const treat = useMutation(api.nonConformities.treat);

  const shown = (rows ?? []).filter((r) => (onlyOpen ? r.open : true));
  const page = useClientPage(shown);

  const [creating, setCreating] = useState(false);
  const [variant, setVariant] = useState<PickedVariant | null>(null);
  const [supplierId, setSupplierId] = useState("");
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);

  const [treating, setTreating] = useState<Id<"nonConformities"> | null>(null);
  const [treatment, setTreatment] = useState<Treatment>("RETURN_TO_SUPPLIER");
  const [notes, setNotes] = useState("");

  const closeCreate = () => {
    setCreating(false);
    setVariant(null);
    setSupplierId("");
    setDescription("");
    setQuantity("1");
  };

  const saveNew = async () => {
    if (!variant) return toast.error(t("Choose the product."));
    setBusy(true);
    try {
      await create({
        token,
        variantId: variant.variantId,
        supplierId: supplierId ? (supplierId as Id<"suppliers">) : undefined,
        description,
        affectedQuantity: Number(quantity),
      });
      toast.success(t("Non-conformity recorded"));
      closeCreate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const confirmTreat = async () => {
    if (!treating) return;
    setBusy(true);
    try {
      await treat({ token, nonConformityId: treating, treatmentType: treatment, notes: notes || undefined });
      toast.success(t("Treatment recorded"));
      setTreating(null);
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Quality")} subtitle={t("Goods that did not meet the order")}>
      <Toolbar>
        <div className="flex gap-1.5">
          {[true, false].map((flag) => (
            <button
              key={String(flag)}
              onClick={() => setOnlyOpen(flag)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
                onlyOpen === flag
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-low text-on-surface-variant border-outline"
              )}
            >
              {flag ? t("Open") : t("All")}
            </button>
          ))}
        </div>
        <div className="ml-auto" />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("Record non-conformity")}
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : shown.length === 0 ? (
          <EmptyState
            title={t("Nothing open")}
            message={t("Goods that arrive wrong or damaged are recorded here and treated.")}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Date")}</Th>
                    <Th>{t("Item")}</Th>
                    <Th className="text-right">{t("Qty")}</Th>
                    <Th>{t("Problem")}</Th>
                    <Th>{t("Treatment")}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r._id} className="hover:bg-surface-container-low">
                      <Td>{formatDate(r.recognizedAt)}</Td>
                      <Td>
                        {r.productName} <span className="text-on-surface-variant">{r.variantLabel}</span>
                      </Td>
                      <Td className="text-right">{r.affectedQuantity}</Td>
                      <Td>{r.description}</Td>
                      <Td>
                        {r.open ? (
                          <Badge tone="warning">{t("Open")}</Badge>
                        ) : (
                          <Badge tone="success">{t(TREATMENTS.find((x) => x.value === r.treatments[0].treatmentType)?.label ?? "Other")}</Badge>
                        )}
                      </Td>
                      <Td>
                        {r.open && (
                          <Button size="sm" variant="secondary" onClick={() => setTreating(r._id)}>
                            {t("Treat")}
                          </Button>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <PagedFooter paged={page} loading={rows === undefined} />
          </>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={closeCreate}
        title={t("Record non-conformity")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveNew} loading={busy}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Product")} required>
            <VariantPicker placeholder={t("Search product or SKU")} onPick={setVariant} />
            {variant && <p className="text-xs mt-1">{variant.label} ({variant.sku})</p>}
          </Field>
          <Field label={t("Supplier")}>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{t("Not known")}</option>
              {(suppliers ?? []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Quantity affected")} required>
            <TextInput type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label={t("What is wrong?")} required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!treating}
        onClose={() => setTreating(null)}
        title={t("Treat non-conformity")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTreating(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={confirmTreat} loading={busy}>
              {t("Save treatment")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Treatment")} required>
            <Select value={treatment} onChange={(e) => setTreatment(e.target.value as Treatment)}>
              {TREATMENTS.map((x) => (
                <option key={x.value} value={x.value}>
                  {t(x.label)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Notes")}>
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </PageLayout>
  );
}
