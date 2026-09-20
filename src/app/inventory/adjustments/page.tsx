"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Field,
  Select,
  TextInput,
  Textarea,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Pagination,
  Spinner,
  Toolbar,
} from "@/components/ui";
import { VariantPicker, PickedVariant } from "@/components/VariantPicker";
import { useToken, useResolvedBranch } from "@/lib/useShop";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePagedQuery } from "@/lib/pagination";
import { toast } from "sonner";
import { Plus } from "lucide-react";

const REASONS = [
  "PHYSICAL_COUNT",
  "DAMAGED",
  "MISSING",
  "FOUND",
  "INITIAL_STOCK",
  "CORRECTION",
] as const;

export default function AdjustmentsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const { branchId, branchName, branches } = useResolvedBranch();
  const create = useMutation(api.stockAdjustments.create);
  const { rows, isLoading, pageIndex, pageSize, hasPrev, hasNext, goPrev, goNext } =
    usePagedQuery(api.stockAdjustments.listPaged, {});

  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<PickedVariant | null>(null);
  const [targetBranch, setTargetBranch] = useState<string>("");
  const [reason, setReason] = useState<(typeof REASONS)[number]>("PHYSICAL_COUNT");
  const [mode, setMode] = useState<"absolute" | "delta">("absolute");
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const effBranch = (targetBranch || branchId) as Id<"branches"> | undefined;

  const submit = async () => {
    if (!picked) return toast.error(t("Pick a product variant."));
    if (!effBranch) return toast.error(t("Pick a branch."));
    if (!qty) return toast.error(t("Enter a quantity."));
    if (!notes.trim()) return toast.error(t("A note is required."));
    setBusy(true);
    try {
      await create({
        token,
        branchId: effBranch,
        productVariantId: picked.variantId,
        reason,
        newQuantity: mode === "absolute" ? Number(qty) : undefined,
        adjustmentQuantity: mode === "delta" ? Number(qty) : undefined,
        notes,
      });
      toast.success(t("Stock adjusted"));
      setOpen(false);
      setPicked(null);
      setQty("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Stock Adjustments")} subtitle={t("Inventory · {branch}", { branch: branchName })}>
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New Adjustment")}
        </Button>
      </Toolbar>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title={t("No adjustments yet")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("When")}</Th>
                <Th>{t("Variant")}</Th>
                <Th>{t("Reason")}</Th>
                <Th className="text-right">{t("Prev")}</Th>
                <Th className="text-right">Δ</Th>
                <Th className="text-right">{t("New")}</Th>
                <Th>{t("By")}</Th>
                <Th>{t("Note")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="hover:bg-surface-container-low">
                  <Td className="text-on-surface-variant text-xs">
                    {new Date(r.createdAt).toLocaleString()}
                  </Td>
                  <Td className="font-mono text-[11px]">{r.productVariantId.slice(-8)}</Td>
                  <Td>
                    <Badge tone="info">{t(r.reason.replace("_", " "))}</Badge>
                  </Td>
                  <Td className="text-right">{r.previousQuantity}</Td>
                  <Td
                    className={`text-right font-bold ${
                      r.adjustmentQuantity >= 0 ? "text-success" : "text-error"
                    }`}
                  >
                    {r.adjustmentQuantity >= 0 ? "+" : ""}
                    {r.adjustmentQuantity}
                  </Td>
                  <Td className="text-right font-bold">{r.newQuantity}</Td>
                  <Td className="text-on-surface-variant">{r.username}</Td>
                  <Td className="text-on-surface-variant text-xs max-w-xs truncate">
                    {r.notes}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!isLoading && rows.length > 0 && (
          <Pagination
            pageIndex={pageIndex}
            rowCount={rows.length}
            pageSize={pageSize}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t("New Stock Adjustment")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={submit} loading={busy}>
              {t("Apply")}
            </Button>
          </>
        }
      >
        {picked ? (
          <div className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low border border-outline">
            <span className="text-sm font-bold">{picked.label}</span>
            <button
              className="text-[10px] uppercase tracking-widest text-primary font-black"
              onClick={() => setPicked(null)}
            >
              {t("Change selection")}
            </button>
          </div>
        ) : (
          <Field label={t("Product variant")} required>
            <VariantPicker onPick={setPicked} />
          </Field>
        )}

        {branches.length > 1 && (
          <Field label={t("Branch")} required>
            <Select
              value={targetBranch || branchId || ""}
              onChange={(e) => setTargetBranch(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Reason")} required>
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {t(r.replace("_", " "))}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Mode")}>
            <Select value={mode} onChange={(e) => setMode(e.target.value as "absolute" | "delta")}>
              <option value="absolute">{t("Set to (count)")}</option>
              <option value="delta">{t("Change by (+/-)")}</option>
            </Select>
          </Field>
        </div>
        <Field
          label={mode === "absolute" ? t("Counted quantity") : t("Change amount (use - to reduce)")}
          required
        >
          <TextInput type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label={t("Note")} required>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Modal>
    </PageLayout>
  );
}
