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
  Pagination,
  Spinner,
  Toolbar,
} from "@/components/ui";
import { VariantPicker, PickedVariant } from "@/components/VariantPicker";
import { useToken, useResolvedBranch } from "@/lib/useShop";
import { useTranslation } from "@/contexts/LanguageContext";
import { usePagedQuery } from "@/lib/pagination";
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
  const { t } = useTranslation();
  const token = useToken();
  const { branches } = useResolvedBranch();
  const {
    rows: list,
    isLoading,
    pageIndex,
    pageSize,
    hasPrev,
    hasNext,
    goPrev,
    goNext,
  } = usePagedQuery(api.stockTransfers.listPaged, {});
  const create = useMutation(api.stockTransfers.create);

  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<Id<"stockTransfers"> | null>(null);
  const [source, setSource] = useState("");
  const [dest, setDest] = useState("");
  const [lines, setLines] = useState<(PickedVariant & { quantity: number })[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (asDraft: boolean) => {
    if (!source || !dest) return toast.error(t("Pick source and destination."));
    if (source === dest) return toast.error(t("Branches must differ."));
    if (lines.length === 0) return toast.error(t("Add at least one item."));
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
      toast.success(asDraft ? t("Draft saved") : t("Transfer submitted"));
      setOpen(false);
      setLines([]);
      setSource("");
      setDest("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Stock Transfers")} subtitle={t("Inventory · move stock between branches")}>
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={() => setOpen(true)} disabled={branches.length < 2}>
          <Plus className="w-3.5 h-3.5" /> {t("New Transfer")}
        </Button>
      </Toolbar>

      {branches.length < 2 && (
        <Card className="p-4 mb-4 text-xs text-on-surface-variant">
          {t("Add a second branch in Settings to use transfers.")}
        </Card>
      )}

      <Card>
        {isLoading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState title={t("No transfers yet")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Number")}</Th>
                <Th>{t("From")}</Th>
                <Th>{t("To")}</Th>
                <Th>{t("Status")}</Th>
                <Th>{t("Created")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((tr) => (
                <tr key={tr._id} className="hover:bg-surface-container-low">
                  <Td className="font-mono text-[11px] font-bold">{tr.transferNumber}</Td>
                  <Td>{branches.find((b) => b._id === tr.sourceBranchId)?.name ?? "—"}</Td>
                  <Td>
                    {branches.find((b) => b._id === tr.destinationBranchId)?.name ?? "—"}
                  </Td>
                  <Td>
                    <Badge tone={TONE[tr.status]}>{t(tr.status.replace("_", " "))}</Badge>
                  </Td>
                  <Td className="text-on-surface-variant text-xs">
                    {new Date(tr.createdAt).toLocaleDateString()}
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setDetailId(tr._id)}>
                      {t("Open")}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!isLoading && list.length > 0 && (
          <Pagination
            pageIndex={pageIndex}
            rowCount={list.length}
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
        size="lg"
        title={t("New Transfer")}
        footer={
          <>
            <Button variant="ghost" onClick={() => submit(true)} loading={busy}>
              {t("Save draft")}
            </Button>
            <Button onClick={() => submit(false)} loading={busy}>
              {t("Submit")}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("From branch")} required>
            <Select value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="">{t("Select…")}</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("To branch")} required>
            <Select value={dest} onChange={(e) => setDest(e.target.value)}>
              <option value="">{t("Select…")}</option>
              {branches.map((b) => (
                <option key={b._id} value={b._id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label={t("Add items")}>
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
  const { t } = useTranslation();
  const transfer = useQuery(api.stockTransfers.get, { id });
  const setStatus = useMutation(api.stockTransfers.setStatus);
  const receive = useMutation(api.stockTransfers.receive);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={transfer ? t("Transfer {number}", { number: transfer.transferNumber }) : t("Transfer")}
      subtitle={
        transfer ? `${transfer.source?.name} → ${transfer.destination?.name}` : undefined
      }
      footer={
        transfer && (
          <div className="flex gap-2">
            {transfer.status === "DRAFT" && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() =>
                  act(
                    () => setStatus({ token, transferId: id, status: "PENDING" }),
                    t("Submitted")
                  )
                }
              >
                {t("Submit")}
              </Button>
            )}
            {(transfer.status === "PENDING" || transfer.status === "DRAFT") && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() =>
                  act(
                    () => setStatus({ token, transferId: id, status: "IN_TRANSIT" }),
                    t("Marked in transit")
                  )
                }
              >
                {t("Mark in transit")}
              </Button>
            )}
            {transfer.status !== "RECEIVED" && transfer.status !== "CANCELLED" && (
              <>
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={() =>
                    act(
                      () => setStatus({ token, transferId: id, status: "CANCELLED" }),
                      t("Cancelled")
                    )
                  }
                >
                  {t("Cancel")}
                </Button>
                <Button
                  loading={busy}
                  onClick={() => act(() => receive({ token, transferId: id }), t("Received"))}
                >
                  {t("Receive")}
                </Button>
              </>
            )}
          </div>
        )
      }
    >
      {!transfer ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("Item")}</Th>
              <Th>{t("SKU")}</Th>
              <Th className="text-right">{t("Qty")}</Th>
            </tr>
          </thead>
          <tbody>
            {transfer.items.map((it) => (
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
