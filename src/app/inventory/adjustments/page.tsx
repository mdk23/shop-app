"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
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
  Spinner,
  Toolbar,
} from "@/components/ui";
import { VariantPicker, PickedVariant } from "@/components/VariantPicker";
import { useToken, useResolvedBranch } from "@/lib/useShop";
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
  const token = useToken();
  const { branchId, branchName, branches } = useResolvedBranch();
  const create = useMutation(api.stockAdjustments.create);
  const rows = useQuery(api.stockAdjustments.listRecent, { limit: 100 });

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
    if (!picked) return toast.error("Pick a product variant.");
    if (!effBranch) return toast.error("Pick a branch.");
    if (!qty) return toast.error("Enter a quantity.");
    if (!notes.trim()) return toast.error("A note is required.");
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
      toast.success("Stock adjusted");
      setOpen(false);
      setPicked(null);
      setQty("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title="Stock Adjustments" subtitle={`Inventory · ${branchName}`}>
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> New Adjustment
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No adjustments yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Variant</Th>
                <Th>Reason</Th>
                <Th className="text-right">Prev</Th>
                <Th className="text-right">Δ</Th>
                <Th className="text-right">New</Th>
                <Th>By</Th>
                <Th>Note</Th>
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
                    <Badge tone="info">{r.reason.replace("_", " ")}</Badge>
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
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New Stock Adjustment"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Apply
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
              Change
            </button>
          </div>
        ) : (
          <Field label="Product variant" required>
            <VariantPicker onPick={setPicked} />
          </Field>
        )}

        {branches.length > 1 && (
          <Field label="Branch" required>
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
          <Field label="Reason" required>
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value as (typeof REASONS)[number])}
            >
              {REASONS.map((r) => (
                <option key={r} value={r}>
                  {r.replace("_", " ")}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mode">
            <Select value={mode} onChange={(e) => setMode(e.target.value as "absolute" | "delta")}>
              <option value="absolute">Set to (count)</option>
              <option value="delta">Change by (+/-)</option>
            </Select>
          </Field>
        </div>
        <Field
          label={mode === "absolute" ? "Counted quantity" : "Change amount (use - to reduce)"}
          required
        >
          <TextInput type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
        </Field>
        <Field label="Note" required>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Modal>
    </PageLayout>
  );
}
