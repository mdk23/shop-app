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
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Source = "RECEIPT" | "STOCK" | "CUSTOMER";
const SOURCE_LABEL: Record<Source, string> = {
  RECEIPT: "On receipt",
  STOCK: "In store",
  CUSTOMER: "From a customer",
};

type Treatment = "RETURN_TO_SUPPLIER" | "DISCOUNT" | "ACCEPT_AS_IS" | "DESTROY";
const TREATMENTS: { value: Treatment; label: string }[] = [
  { value: "RETURN_TO_SUPPLIER", label: "Return to supplier" },
  { value: "DISCOUNT", label: "Discount from supplier" },
  { value: "ACCEPT_AS_IS", label: "Accept as is" },
  { value: "DESTROY", label: "Destroy" },
];

type Line = PickedVariant & { quantity: number };

export default function QualityPage() {
  const { t } = useTranslation();
  const token = useToken();
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [source, setSource] = useState<Source | "ALL">("ALL");
  const rows = useQuery(api.qualityIssues.list, { token, source: source === "ALL" ? undefined : source });
  const suppliers = useQuery(api.suppliers.list, {});
  const openComplaints = useQuery(api.complaints.list, { status: "OPEN" });
  const create = useMutation(api.qualityIssues.create);
  const treat = useMutation(api.qualityIssues.treat);

  const shown = (rows ?? []).filter((r) => (onlyOpen ? r.open : true));
  const page = useClientPage(shown);

  const [creating, setCreating] = useState(false);
  const [newSource, setNewSource] = useState<Source>("STOCK");
  const [lines, setLines] = useState<Line[]>([]);
  const [supplierId, setSupplierId] = useState("");
  const [complaintId, setComplaintId] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const [treating, setTreating] = useState<Id<"qualityIssues"> | null>(null);
  const [treatment, setTreatment] = useState<Treatment>("RETURN_TO_SUPPLIER");
  const [notes, setNotes] = useState("");

  const closeCreate = () => {
    setCreating(false);
    setNewSource("STOCK");
    setLines([]);
    setSupplierId("");
    setComplaintId("");
    setDescription("");
  };

  const saveNew = async () => {
    if (lines.length === 0) return toast.error(t("Choose the product."));
    setBusy(true);
    try {
      await create({
        token,
        source: newSource,
        description,
        supplierId: supplierId ? (supplierId as Id<"suppliers">) : undefined,
        complaintId: complaintId ? (complaintId as Id<"complaints">) : undefined,
        items: lines.map((l) => ({ productVariantId: l.variantId, affectedQuantity: l.quantity })),
      });
      toast.success(t("Quality issue recorded"));
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
      await treat({ token, id: treating, treatment, notes: notes || undefined });
      toast.success(t("Treatment recorded"));
      setTreating(null);
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  const chip = (active: boolean) =>
    cn(
      "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
      active
        ? "bg-primary text-on-primary border-primary"
        : "bg-surface-container-low text-on-surface-variant border-outline"
    );

  return (
    <PageLayout title={t("Quality")} subtitle={t("Defects found on receipt, in store or by customers")}>
      <Toolbar>
        <div className="flex flex-wrap gap-1.5">
          {[true, false].map((flag) => (
            <button key={String(flag)} onClick={() => setOnlyOpen(flag)} className={chip(onlyOpen === flag)}>
              {flag ? t("Open") : t("All")}
            </button>
          ))}
          <span className="w-px bg-outline/40 mx-1" />
          {(["ALL", "RECEIPT", "STOCK", "CUSTOMER"] as const).map((s) => (
            <button key={s} onClick={() => setSource(s)} className={chip(source === s)}>
              {s === "ALL" ? t("Any source") : t(SOURCE_LABEL[s])}
            </button>
          ))}
        </div>
        <div className="ml-auto" />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("Record quality issue")}
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : shown.length === 0 ? (
          <EmptyState
            title={t("Nothing open")}
            message={t("Defective goods are recorded here and treated.")}
          />
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Date")}</Th>
                    <Th>{t("Source")}</Th>
                    <Th>{t("Items")}</Th>
                    <Th className="text-right">{t("Qty")}</Th>
                    <Th>{t("Problem")}</Th>
                    <Th>{t("Supplier")}</Th>
                    <Th>{t("Treatment")}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r._id} className="hover:bg-surface-container-low">
                      <Td>{formatDate(r.recognizedAt)}</Td>
                      <Td>
                        <Badge tone="neutral">{t(SOURCE_LABEL[r.source])}</Badge>
                      </Td>
                      <Td>{r.items.map((i) => i.label).join(" · ")}</Td>
                      <Td className="text-right">{r.affectedQuantity}</Td>
                      <Td>
                        {r.description}
                        {r.complaintIds.length > 0 && (
                          <span className="ml-1">
                            <Badge tone="info">
                              {r.complaintIds.length} {t("linked complaint(s)")}
                            </Badge>
                          </span>
                        )}
                      </Td>
                      <Td>{r.supplierName ?? "—"}</Td>
                      <Td>
                        {r.treatment ? (
                          <Badge tone="success">
                            {t(TREATMENTS.find((x) => x.value === r.treatment)?.label ?? "Other")}
                          </Badge>
                        ) : (
                          <Badge tone="warning">{t("Open")}</Badge>
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
        title={t("Record quality issue")}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveNew} loading={busy} disabled={!description.trim() || lines.length === 0}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Field label={t("Where was it found?")} required>
              <Select value={newSource} onChange={(e) => setNewSource(e.target.value as Source)}>
                {(Object.keys(SOURCE_LABEL) as Source[]).map((s) => (
                  <option key={s} value={s}>
                    {t(SOURCE_LABEL[s])}
                  </option>
                ))}
              </Select>
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
          </div>
          {newSource === "CUSTOMER" && (
            <Field label={t("Linked complaint")}>
              <Select value={complaintId} onChange={(e) => setComplaintId(e.target.value)}>
                <option value="">{t("None")}</option>
                {(openComplaints ?? []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {(c.customerName ?? t("Walk-in")) + " — " + c.description.slice(0, 40)}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label={t("What is wrong?")} required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label={t("Affected products")} required>
            <div className="space-y-2">
              <VariantPicker
                placeholder={t("Search product to add…")}
                onPick={(v) => {
                  if (lines.some((l) => l.variantId === v.variantId)) return;
                  setLines([...lines, { ...v, quantity: 1 }]);
                }}
              />
              {lines.map((line, i) => (
                <div key={line.variantId} className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low">
                  <span className="flex-1 text-sm font-bold truncate">{line.label}</span>
                  <TextInput
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) =>
                      setLines(lines.map((l, j) => (j === i ? { ...l, quantity: Number(e.target.value) } : l)))
                    }
                    className="w-20"
                    aria-label={t("Affected quantity")}
                  />
                  <button
                    type="button"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    className="p-1.5 text-on-surface-variant hover:text-error"
                    aria-label={t("Remove")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!treating}
        onClose={() => setTreating(null)}
        title={t("Treat quality issue")}
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
