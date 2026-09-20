"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";
import { usePagedQuery } from "@/lib/pagination";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "success" | "error"> = {
  draft: "neutral",
  sent: "info",
  partially_received: "warning",
  completed: "success",
  cancelled: "error",
};

type Line = PickedVariant & { quantityOrdered: number; unitCost: number };

export default function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const { branchId, branches } = useResolvedBranch();
  const suppliers = useQuery(api.suppliers.list, { status: "active" });
  const [statusFilter, setStatusFilter] = useState("");
  const {
    rows: list,
    isLoading,
    pageIndex,
    pageSize,
    hasPrev,
    hasNext,
    goPrev,
    goNext,
  } = usePagedQuery(api.purchaseOrders.listPaged, {
    status: (statusFilter || undefined) as never,
  });
  const create = useMutation(api.purchaseOrders.create);

  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<Id<"purchaseOrders"> | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [poBranch, setPoBranch] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((s, l) => s + l.quantityOrdered * l.unitCost, 0);

  const submit = async () => {
    const b = (poBranch || branchId) as Id<"branches"> | undefined;
    if (!supplierId || !b) return toast.error(t("Supplier and branch required."));
    if (lines.length === 0) return toast.error(t("Add at least one line."));
    setBusy(true);
    try {
      await create({
        token,
        supplierId: supplierId as Id<"suppliers">,
        branchId: b,
        orderDate: Date.now(),
        notes: notes || undefined,
        items: lines.map((l) => ({
          productVariantId: l.variantId,
          quantityOrdered: l.quantityOrdered,
          unitCost: l.unitCost,
        })),
      });
      toast.success(t("Purchase order created"));
      setOpen(false);
      setLines([]);
      setSupplierId("");
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Purchase Orders")} subtitle={t("Purchasing · restock from suppliers")}>
      <Toolbar>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        >
          <option value="">{t("All statuses")}</option>
          <option value="draft">{t("Draft")}</option>
          <option value="sent">{t("Sent")}</option>
          <option value="partially_received">{t("Partially received")}</option>
          <option value="completed">{t("Completed")}</option>
          <option value="cancelled">{t("Cancelled")}</option>
        </Select>
        <div className="ml-auto" />
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New PO")}
        </Button>
      </Toolbar>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : list.length === 0 ? (
          <EmptyState title={t("No purchase orders")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Code")}</Th>
                <Th>{t("Supplier")}</Th>
                <Th>{t("Date")}</Th>
                <Th className="text-right">{t("Total")}</Th>
                <Th>{t("Status")}</Th>
                <Th>{t("Payment")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {list.map((po) => (
                <tr key={po._id} className="hover:bg-surface-container-low">
                  <Td className="font-mono text-[11px] font-bold">{po.orderCode}</Td>
                  <Td>{po.supplierName}</Td>
                  <Td className="text-on-surface-variant text-xs">
                    {new Date(po.orderDate).toLocaleDateString()}
                  </Td>
                  <Td className="text-right font-bold">{fmt(po.totalAmount)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[po.status]}>
                      {po.status.replace(/_/g, " ")}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={po.paymentStatus === "paid" ? "success" : "neutral"}>
                      {po.paymentStatus.replace("_", " ")}
                    </Badge>
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setDetailId(po._id)}>
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
        title={t("New Purchase Order")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={submit} loading={busy}>
              {t("Create ({total})", { total: fmt(total) })}
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("Supplier")} required>
            <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">{t("Select…")}</option>
              {(suppliers ?? []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Receive into branch")} required>
            <Select
              value={poBranch || branchId || ""}
              onChange={(e) => setPoBranch(e.target.value)}
            >
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
                  : [...p, { ...v, quantityOrdered: 1, unitCost: v.costPrice }]
              )
            }
          />
        </Field>

        {lines.length > 0 && (
          <Table>
            <thead>
              <tr>
                <Th>{t("Item")}</Th>
                <Th className="text-right w-20">{t("Qty")}</Th>
                <Th className="text-right w-28">{t("Unit cost")}</Th>
                <Th className="text-right w-28">{t("Line")}</Th>
                <Th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={l.variantId}>
                  <Td className="text-xs">{l.label}</Td>
                  <Td>
                    <input
                      type="number"
                      value={l.quantityOrdered}
                      onChange={(e) =>
                        setLines((p) =>
                          p.map((x, j) =>
                            j === i
                              ? { ...x, quantityOrdered: Number(e.target.value) }
                              : x
                          )
                        )
                      }
                      className="w-16 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right"
                    />
                  </Td>
                  <Td>
                    <input
                      type="number"
                      value={l.unitCost}
                      onChange={(e) =>
                        setLines((p) =>
                          p.map((x, j) =>
                            j === i ? { ...x, unitCost: Number(e.target.value) } : x
                          )
                        )
                      }
                      className="w-20 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right"
                    />
                  </Td>
                  <Td className="text-right text-xs font-bold">
                    {fmt(l.quantityOrdered * l.unitCost)}
                  </Td>
                  <Td>
                    <button
                      onClick={() => setLines((p) => p.filter((_, j) => j !== i))}
                      className="text-on-surface-variant hover:text-error"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <Field label={t("Notes")}>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </Modal>

      {detailId && (
        <PODetail token={token} id={detailId} fmt={fmt} onClose={() => setDetailId(null)} />
      )}
    </PageLayout>
  );
}

function PODetail({
  token,
  id,
  fmt,
  onClose,
}: {
  token: string;
  id: Id<"purchaseOrders">;
  fmt: (n: number) => string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const po = useQuery(api.purchaseOrders.get, { id });
  const updateStatus = useMutation(api.purchaseOrders.updateStatus);
  const receiveItems = useMutation(api.purchaseOrders.receiveItems);
  const updatePayment = useMutation(api.purchaseOrders.updatePaymentStatus);
  const removePo = useMutation(api.purchaseOrders.remove);
  const [receiving, setReceiving] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>, msg: string) => {
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

  const doReceive = () => {
    const items = Object.entries(receiving)
      .map(([variantId, q]) => ({
        productVariantId: variantId as Id<"productVariants">,
        quantityReceived: Number(q) || 0,
      }))
      .filter((x) => x.quantityReceived > 0);
    if (items.length === 0) return toast.error(t("Enter received quantities."));
    run(
      () => receiveItems({ token, id, items }).then(() => setReceiving({})),
      t("Stock received")
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={po ? t("PO {code}", { code: po.orderCode }) : t("Purchase Order")}
      subtitle={po ? `${po.supplierName}${po.branchName ? ` → ${po.branchName}` : ""}` : undefined}
      footer={
        po && (
          <div className="flex flex-wrap gap-2">
            {po.status === "draft" && (
              <>
                <Button
                  variant="danger"
                  loading={busy}
                  onClick={() =>
                    run(() => removePo({ token, id }).then(onClose), t("Deleted"))
                  }
                >
                  {t("Delete")}
                </Button>
                <Button
                  loading={busy}
                  onClick={() =>
                    run(
                      () => updateStatus({ token, id, status: "sent" }),
                      t("Marked as sent")
                    )
                  }
                >
                  {t("Mark sent")}
                </Button>
              </>
            )}
            {(po.status === "sent" || po.status === "partially_received") && (
              <Button loading={busy} onClick={doReceive}>
                {t("Receive entered qty")}
              </Button>
            )}
            {po.paymentStatus !== "paid" && po.status !== "cancelled" && (
              <Button
                variant="secondary"
                loading={busy}
                onClick={() =>
                  run(
                    () => updatePayment({ token, id, paymentStatus: "paid" }),
                    t("Marked paid")
                  )
                }
              >
                {t("Mark paid")}
              </Button>
            )}
          </div>
        )
      }
    >
      {!po ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("Item")}</Th>
              <Th className="text-right">{t("Ordered")}</Th>
              <Th className="text-right">{t("Received")}</Th>
              <Th className="text-right">{t("Unit cost")}</Th>
              {(po.status === "sent" || po.status === "partially_received") && (
                <Th className="text-right w-24">{t("Receive")}</Th>
              )}
            </tr>
          </thead>
          <tbody>
            {po.items.map((it) => (
              <tr key={it._id}>
                <Td className="text-xs">
                  {it.productName} <span className="text-on-surface-variant">({it.variantLabel})</span>
                </Td>
                <Td className="text-right">{it.quantityOrdered}</Td>
                <Td className="text-right font-bold">{it.quantityReceived}</Td>
                <Td className="text-right">{fmt(it.unitCost)}</Td>
                {(po.status === "sent" || po.status === "partially_received") && (
                  <Td>
                    <input
                      type="number"
                      value={
                        it.productVariantId
                          ? receiving[it.productVariantId] ?? ""
                          : ""
                      }
                      onChange={(e) =>
                        it.productVariantId &&
                        setReceiving((p) => ({
                          ...p,
                          [it.productVariantId as string]: e.target.value,
                        }))
                      }
                      placeholder={String(it.quantityOrdered - it.quantityReceived)}
                      className="w-20 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right"
                    />
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Modal>
  );
}
