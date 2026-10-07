"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import type { FunctionReturnType } from "convex/server";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Field,
  TextInput,
  Modal,
  Table,
  Th,
  Td,
  EmptyState,
  Spinner,
  Toolbar,
  ConfirmDialog,
} from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Component = { componentType: string; value: number };
type LandedCost = FunctionReturnType<typeof api.landedCosts.list>[number];

const SUGGESTED = ["Freight", "Insurance", "Customs duty", "Handling", "Clearing agent"];

const today = () => new Date().toISOString().slice(0, 10);

export default function LandedCostsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const formatMoney = useCurrency();
  const costs = useQuery(api.landedCosts.list, { token });
  const create = useMutation(api.landedCosts.create);
  const update = useMutation(api.landedCosts.update);
  const remove = useMutation(api.landedCosts.remove);

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"landedCosts"> | null>(null);
  const [calculatedFor, setCalculatedFor] = useState(today);
  const [methodVersion, setMethodVersion] = useState("");
  const [components, setComponents] = useState<Component[]>([{ componentType: "", value: 0 }]);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<LandedCost | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const reset = () => {
    setOpen(false);
    setEditingId(null);
    setCalculatedFor(today());
    setMethodVersion("");
    setComponents([{ componentType: "", value: 0 }]);
  };

  const openEdit = (c: LandedCost) => {
    setEditingId(c._id);
    setCalculatedFor(new Date(c.calculatedFor).toISOString().slice(0, 10));
    setMethodVersion(c.methodVersion ?? "");
    setComponents(
      c.components.length > 0
        ? c.components.map((comp) => ({ componentType: comp.componentType, value: comp.componentValue }))
        : [{ componentType: "", value: 0 }]
    );
    setOpen(true);
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        token,
        calculatedFor: new Date(calculatedFor).getTime(),
        methodVersion: methodVersion || undefined,
        components,
      };
      if (editingId) {
        await update({ ...payload, id: editingId });
        toast.success(t("Landed cost updated"));
      } else {
        await create(payload);
        toast.success(t("Landed cost recorded"));
      }
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await remove({ token, id: deleting._id });
      toast.success(t("Landed cost deleted"));
      setDeleting(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to delete"));
    } finally {
      setDeleteBusy(false);
    }
  };

  const updateComponent = (i: number, patch: Partial<Component>) => {
    setComponents(components.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  };

  const canSave = components.length > 0 && components.every((c) => c.componentType.trim().length > 0);

  return (
    <PageLayout
      title={t("Landed costs")}
      info={t("What goods really cost once freight, insurance, duties and handling are added")}
    >
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New calculation")}
        </Button>
      </Toolbar>

      <Card>
        {costs === undefined ? (
          <Spinner />
        ) : costs.length === 0 ? (
          <EmptyState
            title={t("No landed costs yet")}
            message={t("Record the extra costs of a shipment to see its true cost.")}
            action={<Button onClick={() => setOpen(true)}>{t("New calculation")}</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t("Date")}</Th>
                  <Th>{t("Method")}</Th>
                  <Th>{t("Costs")}</Th>
                  <Th className="text-right">{t("Total")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {costs.map((c) => (
                  <tr key={c._id} className="hover:bg-surface-container-low">
                    <Td>{formatDate(c.calculatedFor)}</Td>
                    <Td className="text-xs text-on-surface-variant">{c.methodVersion}</Td>
                    <Td>
                      {c.components.map((comp) => `${comp.componentType} ${formatMoney(comp.componentValue)}`).join(" · ")}
                    </Td>
                    <Td className="text-right font-bold">{formatMoney(c.total)}</Td>
                    <Td>
                      <div className="flex gap-1 justify-end">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)} aria-label={t("Edit")}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setDeleting(c)} aria-label={t("Delete")}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={reset}
        title={editingId ? t("Edit calculation") : t("New calculation")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={reset}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy} disabled={!canSave}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Field label={t("Date")} required>
              <TextInput type="date" value={calculatedFor} onChange={(e) => setCalculatedFor(e.target.value)} />
            </Field>
            <Field label={t("Method")}>
              <TextInput
                value={methodVersion}
                onChange={(e) => setMethodVersion(e.target.value)}
                placeholder={t("manual")}
              />
            </Field>
          </div>
          <Field label={t("Costs")} required>
            <div className="space-y-2">
              {components.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <TextInput
                    list="landed-cost-types"
                    value={c.componentType}
                    onChange={(e) => updateComponent(i, { componentType: e.target.value })}
                    placeholder={t("Cost name")}
                    className="flex-1"
                  />
                  <TextInput
                    type="number"
                    min={0}
                    value={c.value}
                    onChange={(e) => updateComponent(i, { value: Number(e.target.value) })}
                    className="w-28"
                    aria-label={t("Amount")}
                  />
                  <button
                    type="button"
                    onClick={() => setComponents(components.filter((_, j) => j !== i))}
                    disabled={components.length === 1}
                    className="p-1.5 text-on-surface-variant hover:text-error disabled:opacity-30"
                    aria-label={t("Remove")}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
              <datalist id="landed-cost-types">
                {SUGGESTED.map((s) => (
                  <option key={s} value={t(s)} />
                ))}
              </datalist>
              <Button variant="ghost" size="sm" onClick={() => setComponents([...components, { componentType: "", value: 0 }])}>
                <Plus className="w-3.5 h-3.5" /> {t("Add cost")}
              </Button>
            </div>
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={confirmDelete}
        title={t("Delete landed cost")}
        message={t("Delete this landed cost calculation and all of its costs? This cannot be undone.")}
        confirmLabel={t("Delete")}
        danger
        loading={deleteBusy}
      />
    </PageLayout>
  );
}
