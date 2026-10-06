"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Select, Modal, Badge, EmptyState, Spinner, Toolbar } from "@/components/ui";
import { VariantPicker, type PickedVariant } from "@/components/VariantPicker";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Line = PickedVariant & { quantity: number };
type Dialog = null | "need" | "decision" | "cover";

export default function ProcurementPlanningPage() {
  const { t } = useTranslation();
  const token = useToken();
  const overview = useQuery(api.procurementPlanning.overview, { token });
  const createNeed = useMutation(api.procurementPlanning.createNeed);
  const createDecision = useMutation(api.procurementPlanning.createDecision);
  const coverNeed = useMutation(api.procurementPlanning.coverNeed);

  const [dialog, setDialog] = useState<Dialog>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [decisionType, setDecisionType] = useState("");
  const [decisionItemId, setDecisionItemId] = useState("");
  const [needItemId, setNeedItemId] = useState("");
  const [coverQty, setCoverQty] = useState(1);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setDialog(null);
    setLines([]);
    setDecisionType("");
    setDecisionItemId("");
    setNeedItemId("");
    setCoverQty(1);
  };

  const save = async () => {
    setBusy(true);
    try {
      const items = lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity }));
      if (dialog === "need") {
        await createNeed({ token, items });
        toast.success(t("Need recognised"));
      } else if (dialog === "decision") {
        await createDecision({ token, decisionType, items });
        toast.success(t("Decision recorded"));
      } else if (dialog === "cover") {
        await coverNeed({
          token,
          decisionItemId: decisionItemId as Id<"procurementDecisionItems">,
          needItemId: needItemId as Id<"procurementNeedItems">,
          quantity: coverQty,
        });
        toast.success(t("Need linked to decision"));
      }
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const allDecisionItems = (overview?.decisions ?? []).flatMap((d) =>
    d.items.map((i) => ({ _id: i._id, label: `${i.label} — ${d.decisionType} (${i.quantityDecided})` }))
  );
  const allNeedItems = (overview?.needs ?? []).flatMap((n) =>
    n.items.map((i) => ({ _id: i._id, label: `${i.label} (${i.quantityRecognized})` }))
  );

  const canSave =
    dialog === "need"
      ? lines.length > 0
      : dialog === "decision"
        ? lines.length > 0 && decisionType.trim().length > 0
        : !!decisionItemId && !!needItemId && coverQty > 0;

  return (
    <PageLayout
      title={t("Procurement planning")}
      subtitle={t("What the shop needs to buy, the decisions taken, and which decision covers which need")}
    >
      <Toolbar>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDialog("cover")}>
            {t("Link need to decision")}
          </Button>
        </div>
        <div className="ml-auto" />
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setDialog("decision")}>
            <Plus className="w-3.5 h-3.5" /> {t("New decision")}
          </Button>
          <Button onClick={() => setDialog("need")}>
            <Plus className="w-3.5 h-3.5" /> {t("New need")}
          </Button>
        </div>
      </Toolbar>

      {overview === undefined ? (
        <Spinner />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <section className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-widest">{t("Recognised needs")}</h2>
            <Card>
              {overview.needs.length === 0 ? (
                <EmptyState title={t("No needs yet")} message={t("Record what the shop should buy, from stock and demand.")} />
              ) : (
                <div className="divide-y divide-outline/30">
                  {overview.needs.map((n) => (
                    <div key={n._id} className="p-3 space-y-1">
                      <p className="text-xs text-on-surface-variant">{formatDate(n.recognizedAt)}</p>
                      {n.items.map((i) => (
                        <p key={i._id} className="text-sm">
                          {i.label} <span className="font-bold">×{i.quantityRecognized}</span>
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-black uppercase tracking-widest">{t("Decisions")}</h2>
            <Card>
              {overview.decisions.length === 0 ? (
                <EmptyState title={t("No decisions yet")} message={t("Record what is being bought to cover the needs.")} />
              ) : (
                <div className="divide-y divide-outline/30">
                  {overview.decisions.map((d) => (
                    <div key={d._id} className="p-3 space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-bold text-sm">{d.decisionType}</span>
                        <span className="text-xs text-on-surface-variant">{formatDate(d.decidedAt)}</span>
                      </div>
                      {d.items.map((i) => (
                        <div key={i._id} className="flex justify-between gap-2 text-sm">
                          <span>{i.label}</span>
                          <Badge tone={i.coverages > 0 ? "success" : "warning"}>
                            {i.quantityDecided} · {i.coverages > 0 ? t("covers a need") : t("not linked")}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </section>
        </div>
      )}

      <Modal
        open={dialog !== null}
        onClose={close}
        title={
          dialog === "need"
            ? t("New need")
            : dialog === "decision"
              ? t("New decision")
              : t("Link need to decision")
        }
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy} disabled={!canSave}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          {dialog === "decision" && (
            <Field label={t("Kind of decision")} required>
              <TextInput
                value={decisionType}
                onChange={(e) => setDecisionType(e.target.value)}
                placeholder={t("e.g. Buy from supplier, Transfer from another branch")}
              />
            </Field>
          )}
          {(dialog === "need" || dialog === "decision") && (
            <Field label={t("Products")} required>
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
                      onChange={(e) => {
                        const next = [...lines];
                        next[i] = { ...line, quantity: Number(e.target.value) };
                        setLines(next);
                      }}
                      className="w-20"
                      aria-label={t("Quantity")}
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
          )}
          {dialog === "cover" && (
            <>
              <Field label={t("Need")} required>
                <Select value={needItemId} onChange={(e) => setNeedItemId(e.target.value)}>
                  <option value="">{t("Choose")}</option>
                  {allNeedItems.map((i) => (
                    <option key={i._id} value={i._id}>
                      {i.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("Decision that covers it")} required>
                <Select value={decisionItemId} onChange={(e) => setDecisionItemId(e.target.value)}>
                  <option value="">{t("Choose")}</option>
                  {allDecisionItems.map((i) => (
                    <option key={i._id} value={i._id}>
                      {i.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("Quantity covered")} required>
                <TextInput type="number" min={1} value={coverQty} onChange={(e) => setCoverQty(Number(e.target.value))} />
              </Field>
              <p className="text-xs text-on-surface-variant">
                {t("Only a decision for the same product variant can cover a need.")}
              </p>
            </>
          )}
        </div>
      </Modal>
    </PageLayout>
  );
}
