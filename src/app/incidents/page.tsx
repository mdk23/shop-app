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
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
} from "@/components/ui";
import { VariantPicker, type PickedVariant } from "@/components/VariantPicker";
import { useToken, useResolvedBranch } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Line = PickedVariant & { quantity: number };

const MATERIAL_TYPES = ["DAMAGE", "LOSS", "THEFT", "OTHER"] as const;
type MaterialType = (typeof MATERIAL_TYPES)[number];
const MATERIAL_LABEL: Record<MaterialType, string> = {
  DAMAGE: "Damaged",
  LOSS: "Lost",
  THEFT: "Stolen",
  OTHER: "Other (record only)",
};

/** Picks variants and quantities for an incident. Shared by both incident kinds. */
function LinesEditor({
  lines,
  onChange,
  quantityLabel,
  quantityMin,
}: {
  lines: Line[];
  onChange: (lines: Line[]) => void;
  quantityLabel: string;
  quantityMin: number;
}) {
  const { t } = useTranslation();
  return (
    <div className="space-y-2">
      <VariantPicker
        placeholder={t("Search product to add…")}
        onPick={(v) => {
          if (lines.some((l) => l.variantId === v.variantId)) return;
          onChange([...lines, { ...v, quantity: 1 }]);
        }}
      />
      {lines.map((line, i) => (
        <div key={line.variantId} className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low">
          <span className="flex-1 text-sm font-bold truncate">{line.label}</span>
          <TextInput
            type="number"
            min={quantityMin}
            value={line.quantity}
            onChange={(e) => {
              const next = [...lines];
              next[i] = { ...line, quantity: Number(e.target.value) };
              onChange(next);
            }}
            className="w-20"
            aria-label={quantityLabel}
          />
          <button
            type="button"
            onClick={() => onChange(lines.filter((_, j) => j !== i))}
            className="p-1.5 text-on-surface-variant hover:text-error"
            aria-label={t("Remove")}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}

export default function IncidentsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const { branchId } = useResolvedBranch();
  const qualityIncidents = useQuery(api.qualityIncidents.list, { token });
  const materialIncidents = useQuery(api.materialIncidents.list, { token });
  const openComplaints = useQuery(api.complaints.list, { status: "OPEN" });
  const createQuality = useMutation(api.qualityIncidents.create);
  const createMaterial = useMutation(api.materialIncidents.create);

  const [qualityOpen, setQualityOpen] = useState(false);
  const [qualityText, setQualityText] = useState("");
  const [qualityComplaint, setQualityComplaint] = useState("");
  const [qualityLines, setQualityLines] = useState<Line[]>([]);

  const [materialOpen, setMaterialOpen] = useState(false);
  const [materialType, setMaterialType] = useState<MaterialType>("DAMAGE");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [materialNotes, setMaterialNotes] = useState("");
  const [materialLines, setMaterialLines] = useState<Line[]>([]);

  const [busy, setBusy] = useState(false);

  const resetQuality = () => {
    setQualityOpen(false);
    setQualityText("");
    setQualityComplaint("");
    setQualityLines([]);
  };
  const resetMaterial = () => {
    setMaterialOpen(false);
    setMaterialType("DAMAGE");
    setMaterialNotes("");
    setMaterialLines([]);
  };

  const saveQuality = async () => {
    setBusy(true);
    try {
      await createQuality({
        token,
        description: qualityText,
        complaintId: qualityComplaint ? (qualityComplaint as Id<"complaints">) : undefined,
        items: qualityLines.map((l) => ({
          variantId: l.variantId,
          affectedQuantity: l.quantity,
        })),
      });
      toast.success(t("Quality incident recorded"));
      resetQuality();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const saveMaterial = async () => {
    if (!branchId) return toast.error(t("Choose a branch first."));
    setBusy(true);
    try {
      await createMaterial({
        token,
        branchId,
        incidentType: materialType,
        occurredAt: new Date(occurredAt).getTime(),
        notes: materialNotes || undefined,
        items: materialLines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })),
      });
      toast.success(
        materialType === "OTHER" ? t("Incident recorded") : t("Incident recorded and stock updated")
      );
      resetMaterial();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout
      title={t("Incidents")}
      subtitle={t("Quality problems found in goods, and stock that was damaged, lost or stolen")}
    >
      {/* Quality incidents */}
      <section className="mb-8 space-y-3">
        <Toolbar>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">{t("Quality incidents")}</h2>
            <p className="text-xs text-on-surface-variant">
              {t("A fault found in products, optionally linked to a complaint.")}
            </p>
          </div>
          <div className="ml-auto" />
          <Button onClick={() => setQualityOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> {t("New quality incident")}
          </Button>
        </Toolbar>
        <Card>
          {qualityIncidents === undefined ? (
            <Spinner />
          ) : qualityIncidents.length === 0 ? (
            <EmptyState title={t("No quality incidents")} message={t("Record a fault here when a product is found defective.")} />
          ) : (
            <div className="divide-y divide-outline/30">
              {qualityIncidents.map((q) => (
                <div key={q._id} className="p-4 space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-sm">{q.description}</span>
                    <span className="text-xs text-on-surface-variant">{formatDate(q.recognizedAt)}</span>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {q.items.length === 0
                      ? t("No products listed")
                      : q.items.map((i) => `${i.label}${i.affectedQuantity ? ` ×${i.affectedQuantity}` : ""}`).join(" · ")}
                  </p>
                  {q.complaintIds.length > 0 && (
                    <Badge tone="info">
                      {q.complaintIds.length} {t("linked complaint(s)")}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      {/* Material incidents */}
      <section className="space-y-3">
        <Toolbar>
          <div>
            <h2 className="text-sm font-black uppercase tracking-widest">{t("Material incidents")}</h2>
            <p className="text-xs text-on-surface-variant">
              {t("Damaged, lost or stolen stock. Damage, loss and theft take the quantity out of stock.")}
            </p>
          </div>
          <div className="ml-auto" />
          <Button onClick={() => setMaterialOpen(true)}>
            <Plus className="w-3.5 h-3.5" /> {t("New material incident")}
          </Button>
        </Toolbar>
        <Card>
          {materialIncidents === undefined ? (
            <Spinner />
          ) : materialIncidents.length === 0 ? (
            <EmptyState title={t("No material incidents")} message={t("Record stock that was damaged, lost or stolen.")} />
          ) : (
            <div className="divide-y divide-outline/30">
              {materialIncidents.map((m) => (
                <div key={m._id} className="p-4 space-y-1">
                  <div className="flex flex-wrap justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={m.incidentType === "OTHER" ? "neutral" : "warning"}>
                        {t(MATERIAL_LABEL[m.incidentType as MaterialType] ?? m.incidentType)}
                      </Badge>
                      <span className="text-xs text-on-surface-variant">{formatDate(m.occurredAt)}</span>
                    </div>
                  </div>
                  <p className="text-sm">
                    {m.items.map((i) => `${i.label}${i.quantity ? ` ×${i.quantity}` : ""}`).join(" · ") || "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Modal
        open={qualityOpen}
        onClose={resetQuality}
        title={t("New quality incident")}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={resetQuality}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveQuality} loading={busy} disabled={!qualityText.trim()}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("What is wrong?")} required>
            <Textarea value={qualityText} onChange={(e) => setQualityText(e.target.value)} />
          </Field>
          <Field label={t("Linked complaint")}>
            <Select value={qualityComplaint} onChange={(e) => setQualityComplaint(e.target.value)}>
              <option value="">{t("None")}</option>
              {(openComplaints ?? []).map((c) => (
                <option key={c._id} value={c._id}>
                  {(c.customerName ?? t("Walk-in")) + " — " + c.description.slice(0, 40)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Affected products")}>
            <LinesEditor
              lines={qualityLines}
              onChange={setQualityLines}
              quantityLabel={t("Affected quantity")}
              quantityMin={1}
            />
          </Field>
        </div>
      </Modal>

      <Modal
        open={materialOpen}
        onClose={resetMaterial}
        title={t("New material incident")}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={resetMaterial}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveMaterial} loading={busy} disabled={materialLines.length === 0}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Kind")} required>
              <Select value={materialType} onChange={(e) => setMaterialType(e.target.value as MaterialType)}>
                {MATERIAL_TYPES.map((k) => (
                  <option key={k} value={k}>
                    {t(MATERIAL_LABEL[k])}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("Date")} required>
              <TextInput type="date" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} />
            </Field>
          </div>
          <Field label={t("Notes")}>
            <TextInput value={materialNotes} onChange={(e) => setMaterialNotes(e.target.value)} />
          </Field>
          <Field label={t("Products")} required>
            <LinesEditor
              lines={materialLines}
              onChange={setMaterialLines}
              quantityLabel={t("Quantity")}
              quantityMin={1}
            />
          </Field>
          {materialType !== "OTHER" && (
            <p className="text-xs text-on-surface-variant">
              {t("These quantities are taken out of the branch's stock when you save.")}
            </p>
          )}
        </div>
      </Modal>
    </PageLayout>
  );
}
