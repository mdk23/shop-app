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
import { Plus, Trash2 } from "lucide-react";

const TONE: Record<string, "neutral" | "info" | "warning" | "success" | "error"> = {
  DRAFT: "neutral",
  PENDING: "info",
  IN_TRANSIT: "warning",
  RECEIVED: "success",
  CANCELLED: "error",
};

export default function TransfersPage() {
  const token = useToken();
  const { branches } = useResolvedBranch();
  const list = useQuery(api.stockTransfers.list, { limit: 100 });
  const create = useMutation(api.stockTransfers.create);

  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<Id<"stockTransfers"> | null>(null);
  const [source, setSource] = useState("");
  const [dest, setDest] = useState("");
  const [lines, setLines] = useState<(PickedVariant & { quantity: number })[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (asDraft: boolean) => {
    if (!source || !dest) return toast.error("Pick source and destination.");
    if (source === dest) return toast.error("Branches must differ.");
    if (lines.length === 0) return toast.error("Add at least one item.");
    setBusy(true);
    try {
      await create({
        token,
        sourceBranchId: source as Id<"branches">,
        destinationBranchId: dest as Id<"branches">,
        items: lines.map((l) => ({
          productVariantId: l.variantId,
          quantity: l.quantity,
        })),
        submit: !asDraft,
      });
      toast.success(asDraft ? "Draft saved" : "Transfer submitted");
      setOpen(false);
      setLines([]);
      setSource("");
      setDest("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title="Stock Transfers" subtitle="Inventory · move stock between branches">
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={() => setOpen(true)} disabled={branches.length < 2}>
          <Plus className="w-3.5 h-3.5" /> New Transfer
        </Button>
      </Toolbar>

      {branches.length < 2 && (
        <Card className="p-4 mb-4 text-xs text-on-surface-variant">
          Add a second branch in Settings to use transfers.
        </Card>
      )}

      <Card>
        {list === undefined ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState title="No transfers yet" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Number</Th>
                <Th>From</Th>
                <Th>To</Th>
                <Th>Status</Th>
                <Th>Created</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((t) => (
                <tr key={t._id} className="hover:bg-surface-container-low">
                  <Td className="font-mono text-[11px] font-bold">{t.transferNumber}</Td>
                  <Td>{branches.find((b) => b._id === t.sourceBranchId)?.name ?? "—"}</Td>
                  <Td>
                    {branches.find((b) => b._id === t.destinationBranchId)?.name ?? "—"}
                  </Td>
                  <Td>
                    <Badge tone={TONE[t.status]}>{t.status.replace("_", " ")}</Badge>
                  </Td>
                  <Td className="text-on-surface-variant text-xs">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setDetailId(t._id)}>
                      Open
                    </Button>
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
        size="lg"
        title="New Transfer"
        footer={
          <>
            <Button variant="ghost" onClick={() => submit(true)} loading={busy}>
              Save draft
            </Button>
            <Button onClick={() => submit(false)} loading={busy}>
              Submit
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="From branch" required>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">Select…</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="To branch" required>
            <Select value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="">Select…</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Add items">
          <VariantPicker
            onPick={(v) =>
              setLines((p) =>
                p.some((l) => l.variantId === v.variantId)
                  ? p
                  : [...p, { ...v, quantity: 1 }]
              )
            }
          />
        </Field>

        {lines.length > 0 && (
          <div className="rounded-xl border border-outline divide-y divide-outline/30">
            {lines.map((l, i) => (
              <div key={l.variantId} className="flex items-center gap-2 px-3 py-2">
                <span className="flex-1 text-sm font-bold">{l.label}</span>
                <TextInput
                  type="number"
                  value={l.quantity}
                  onChange={(e) =>
                    setLines((p) =>
                      p.map((x, j) =>
                        j === i ? { ...x, quantity: Number(e.target.value) } : x
                      )
                    )
                  }
                  className="w-20 text-right"
                />
                <button
                  onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                  className="text-on-surface-variant hover:text-error"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {detailId && (
        <TransferDetail
          token={token}
          id={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </PageLayout>
  );
}

function TransferDetail({
  token,
  id,
  onClose,
}: {
  token: string;
  id: Id<"stockTransfers">;
  onClose: () => void;
}) {
  const t = useQuery(api.stockTransfers.get, { id });
  const setStatus = useMutation(api.stockTransfers.setStatus);
  const receive = useMutation(api.stockTransfers.receive);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={t ? `Transfer ${t.transferNumber}` : "Transfer"}
      subtitle={t ? `${t.source?.name} → ${t.destination?.name}` : undefined}
      footer={
        t && (
          <div className="flex gap-2">
            {t.status === "DRAFT" && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() =>
                  act(() => setStatus({ token, transferId: id, status: "PENDING" }), "Submitted")
                }
              >
                Submit
              </Button>
            )}
            {(t.status === "PENDING" || t.status === "DRAFT") && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() =>
                  act(
                    () => setStatus({ token, transferId: id, status: "IN_TRANSIT" }),
                    "Marked in transit"
                  )
                }
              >
                Mark in transit
              </Button>
            )}
            {t.status !== "RECEIVED" && t.status !== "CANCELLED" && (
              <>
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={() =>
                    act(
                      () => setStatus({ token, transferId: id, status: "CANCELLED" }),
                      "Cancelled"
                    )
                  }
                >
                  Cancel
                </Button>
                <Button
                  loading={busy}
                  onClick={() => act(() => receive({ token, transferId: id }), "Received")}
                >
                  Receive
                </Button>
              </>
            )}
          </div>
        )
      }
    >
      {!t ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th>SKU</Th>
              <Th className="text-right">Qty</Th>
            </tr>
          </thead>
          <tbody>
            {t.items.map((it) => (
              <tr key={it._id}>
                <Td>{it.label}</Td>
                <Td className="font-mono text-[11px]">{it.sku}</Td>
                <Td className="text-right font-bold">{it.quantity}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}
