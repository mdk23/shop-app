"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Field,
  Select,
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
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from "../../../convex/lib/paymentMethods";

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "success" | "error"> = {
  DRAFT: "neutral",
  SENT: "info",
  PARTIALLY_RECEIVED: "warning",
  COMPLETED: "success",
  CANCELLED: "error",
};

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Draft",
  SENT: "Sent to supplier",
  PARTIALLY_RECEIVED: "Partly received",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

const PAYMENT_LABEL: Record<string, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
};

type Line = PickedVariant & { quantityOrdered: number; unitCost: number };

export default function PurchaseOrdersPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const { branchId, branches } = useResolvedBranch();
  const suppliers = useQuery(api.suppliers.list, { status: "ACTIVE" });
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
      <PayablesCard token={token} fmt={fmt} />
      <Toolbar>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        >
          <option value="">{t("All statuses")}</option>
          <option value="DRAFT">{t("Draft")}</option>
          <option value="SENT">{t("Sent")}</option>
          <option value="PARTIALLY_RECEIVED">{t("Partially received")}</option>
          <option value="COMPLETED">{t("Completed")}</option>
          <option value="CANCELLED">{t("Cancelled")}</option>
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
                  <Td className="font-mono text-[11px] font-bold">
                    <Link href={`/purchase-orders/${po._id}`} className="hover:text-primary">
                      {po.orderCode}
                    </Link>
                  </Td>
                  <Td>{po.supplierName}</Td>
                  <Td className="text-on-surface-variant text-xs">
                    {new Date(po.orderDate).toLocaleDateString()}
                  </Td>
                  <Td className="text-right font-bold">{fmt(po.totalAmount)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[po.status]}>
                      {t(STATUS_LABEL[po.status])}
                    </Badge>
                  </Td>
                  <Td>
                    <Badge tone={po.paymentStatus === "PAID" ? "success" : "neutral"}>
                      {t(PAYMENT_LABEL[po.paymentStatus])}
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
            {po.status === "DRAFT" && (
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
                      () => updateStatus({ token, id, status: "SENT" }),
                      t("Marked as sent")
                    )
                  }
                >
                  {t("Mark sent")}
                </Button>
              </>
            )}
            {(po.status === "SENT" || po.status === "PARTIALLY_RECEIVED") && (
              <Button loading={busy} onClick={doReceive}>
                {t("Receive entered qty")}
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
              {(po.status === "SENT" || po.status === "PARTIALLY_RECEIVED") && (
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
                {(po.status === "SENT" || po.status === "PARTIALLY_RECEIVED") && (
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
      {po && po.status !== "DRAFT" && <SupplierPaymentsPanel token={token} po={po} fmt={fmt} />}
    </Modal>
  );
}

/** Payments made to the supplier on this order: what is paid, what is owed, and a form to pay. */
function SupplierPaymentsPanel({
  token,
  po,
  fmt,
}: {
  token: string;
  po: { _id: Id<"purchaseOrders">; status: string; totalAmount: number };
  fmt: (n: number) => string;
}) {
  const { t } = useTranslation();
  const data = useQuery(api.supplierPayments.listByPurchaseOrder, { token, purchaseOrderId: po._id });
  const add = useMutation(api.supplierPayments.add);
  const remove = useMutation(api.supplierPayments.remove);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);

  if (!data) return <Spinner />;
  const canPay = po.status !== "CANCELLED" && data.outstanding > 0;

  const pay = async () => {
    const value = Number(amount || data.outstanding);
    setBusy(true);
    try {
      await add({ token, purchaseOrderId: po._id, amount: value, method, reference: reference || undefined });
      toast.success(t("Payment recorded"));
      setAmount("");
      setReference("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-4 pt-3 border-t border-outline/40 space-y-3">
      <div className="flex flex-wrap gap-4 text-sm">
        <span>
          {t("Total")}: <b>{fmt(po.totalAmount)}</b>
        </span>
        <span>
          {t("Paid")}: <b>{fmt(data.paid)}</b>
        </span>
        <span className={data.outstanding > 0 ? "text-error font-bold" : "text-success font-bold"}>
          {t("Owed")}: {fmt(data.outstanding)}
        </span>
      </div>
      {data.payments.length > 0 && (
        <Table>
          <thead>
            <tr>
              <Th>{t("Date")}</Th>
              <Th>{t("Method")}</Th>
              <Th>{t("Reference")}</Th>
              <Th className="text-right">{t("Amount")}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p._id}>
                <Td className="text-xs">{new Date(p.paidAt).toLocaleString()}</Td>
                <Td className="text-xs">{t(PAYMENT_METHOD_LABEL[p.method])}</Td>
                <Td className="text-xs">{p.reference ?? "—"}</Td>
                <Td className="text-right font-bold">{fmt(p.amount)}</Td>
                <Td className="text-right">
                  <button
                    className="text-on-surface-variant hover:text-error"
                    aria-label={t("Delete")}
                    onClick={async () => {
                      try {
                        await remove({ token, paymentId: p._id });
                        toast.success(t("Deleted"));
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : t("Failed"));
                      }
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      {canPay && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label={t("Amount")}>
            <input
              type="number"
              value={amount}
              placeholder={data.outstanding.toFixed(2)}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32 px-3 py-2 bg-surface-container-low border border-outline rounded-xl text-sm text-right"
            />
          </Field>
          <Field label={t("Method")}>
            <Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(PAYMENT_METHOD_LABEL[m])}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Reference")}>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-40 px-3 py-2 bg-surface-container-low border border-outline rounded-xl text-sm"
            />
          </Field>
          <Button onClick={pay} loading={busy}>
            {t("Record payment")}
          </Button>
        </div>
      )}
    </div>
  );
}

/** What is owed to each supplier on orders sent or received and not fully paid. */
function PayablesCard({ token, fmt }: { token: string; fmt: (n: number) => string }) {
  const { t } = useTranslation();
  const rows = useQuery(api.supplierPayments.payables, { token });
  if (!rows || rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.owed, 0);
  return (
    <Card className="p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-black uppercase tracking-wider">{t("Owed to suppliers")}</h3>
        <span className="text-sm font-bold text-error">{fmt(total)}</span>
      </div>
      <div className="space-y-1">
        {rows.map((r) => (
          <div key={r.supplierId} className="flex justify-between text-sm">
            <span>
              {r.name} <span className="text-xs text-on-surface-variant">· {t("{n} order(s)", { n: r.orders })}</span>
            </span>
            <b>{fmt(r.owed)}</b>
          </div>
        ))}
      </div>
    </Card>
  );
}
