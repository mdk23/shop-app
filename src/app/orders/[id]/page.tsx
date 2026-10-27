"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Select, Badge, Spinner, Table, Th, Td, Modal } from "@/components/ui";
import { VariantPicker } from "@/components/VariantPicker";
import { DeliveriesCard } from "@/components/DeliveriesCard";
import { useToken, useCurrency } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Wallet, XCircle, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";
import { RegisterClosedNotice, useRegisterClosed } from "@/components/RegisterClosedNotice";

import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
} from "../../../../convex/lib/paymentMethods";

const STATUS_TONE = {
  OPEN: "info",
  READY: "warning",
  COLLECTED: "success",
  CANCELLED: "error",
} as const;

const STATUS_LABEL = {
  OPEN: "Open",
  READY: "Ready for collection",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
} as const;

const EVENT_LABEL = {
  CREATED: "Created",
  CONFIRMED: "Confirmed",
  CHANGED: "Changed",
  READY: "Ready for collection",
  CANCELLED: "Cancelled",
  COLLECTED: "Collected",
} as const;

type EditLine = { productVariantId: Id<"productVariants">; label: string; quantity: number };

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id as Id<"customerOrders">;
  const order = useQuery(api.customerOrders.get, { token, id: orderId });
  const registerClosed = useRegisterClosed(order?.branchId);

  const addDeposit = useMutation(api.customerOrders.addDeposit);
  const markReady = useMutation(api.customerOrders.markReady);
  const collect = useMutation(api.customerOrders.collect);
  const cancel = useMutation(api.customerOrders.cancel);
  const changeLines = useMutation(api.customerOrders.changeLines);
  const fees = useQuery(api.deliveryFees.list, { token, activeOnly: true });

  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("CARD");
  const [depositRef, setDepositRef] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CARD");
  const [cancelReason, setCancelReason] = useState("");
  const [forDelivery, setForDelivery] = useState(false);
  const [deliveryFeeId, setDeliveryFeeId] = useState("");
  const [editing, setEditing] = useState<EditLine[] | null>(null);
  const [changeReason, setChangeReason] = useState("");
  const [busy, setBusy] = useState(false);

  if (order === undefined) {
    return (
      <PageLayout title={t("Order")} subtitle="">
        <Spinner />
      </PageLayout>
    );
  }
  if (order === null) {
    return (
      <PageLayout title={t("Order")} subtitle="">
        <p className="text-sm">{t("Order not found.")}</p>
      </PageLayout>
    );
  }

  const open = order.status === "OPEN" || order.status === "READY";
  // Collected for delivery, the sale adds the delivery fee to what is due.
  const fee = forDelivery ? (fees ?? []).find((f) => f._id === deliveryFeeId)?.fee ?? 0 : 0;
  const balance = order.balance + fee;

  const run = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(t(success));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout
      title={order.orderNumber}
      subtitle={`${order.customerName ?? ""} · ${formatDate(order.createdAt)}`}
    >
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" onClick={() => router.push("/orders")}>
          <ArrowLeft className="w-3.5 h-3.5" /> {t("Back")}
        </Button>
        <div className="flex items-center gap-2">
          {open &&
            (order.confirmed ? (
              <Badge tone="success">{t("Confirmed")}</Badge>
            ) : (
              <Badge tone="warning">
                {t("Awaiting deposit of {amount}", { amount: fmt(order.requiredDeposit) })}
              </Badge>
            ))}
          <Badge tone={STATUS_TONE[order.status]}>{t(STATUS_LABEL[order.status])}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Total")}</p>
          <p className="text-xl font-black">{fmt(order.totalAmount)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Deposits")}</p>
          <p className="text-xl font-black">{fmt(order.depositsTotal)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Balance due")}</p>
          <p className={`text-xl font-black ${balance > 0 ? "text-error" : "text-primary"}`}>{fmt(balance)}</p>
        </Card>
      </div>

      <Card className="mb-4">
        {open && (
          <div className="flex justify-end p-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setEditing(
                  order.items.map((i) => ({
                    productVariantId: i.productVariantId,
                    label: `${i.productName} ${i.variantLabel}`,
                    quantity: i.quantity,
                  }))
                )
              }
            >
              <Pencil className="w-3.5 h-3.5" /> {t("Change items")}
            </Button>
          </div>
        )}
        <Table>
          <thead>
            <tr>
              <Th>{t("Item")}</Th>
              <Th>{t("Qty")}</Th>
              <Th>{t("Price")}</Th>
              <Th>{t("Total")}</Th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i._id}>
                <Td>
                  {i.productName} <span className="text-on-surface-variant">{i.variantLabel}</span>
                  {i.origins.length > 0 && (
                    <div className="text-xs text-on-surface-variant">
                      {t("From request: {requests}", { requests: i.origins.join(", ") })}
                    </div>
                  )}
                </Td>
                <Td>{i.quantity}</Td>
                <Td>{fmt(i.unitPrice)}</Td>
                <Td className="font-bold">{fmt(i.lineTotal)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      {open && registerClosed && <RegisterClosedNotice className="mb-4" />}
      {open && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          <Card className="p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {t("Take a deposit")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("Amount")}>
                <TextInput type="number" value={depositAmount} onChange={(e) => setDepositAmount(e.target.value)} />
              </Field>
              <Field label={t("Method")}>
                <Select value={depositMethod} onChange={(e) => setDepositMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(PAYMENT_METHOD_LABEL[m])}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label={t("Reference")}>
              <TextInput value={depositRef} onChange={(e) => setDepositRef(e.target.value)} />
            </Field>
            <Button
              loading={busy}
              disabled={registerClosed}
              onClick={() =>
                run(
                  () =>
                    addDeposit({
                      token,
                      orderId,
                      amount: Number(depositAmount),
                      method: depositMethod,
                      referenceExternal: depositRef || undefined,
                    }),
                  "Deposit recorded"
                ).then(() => {
                  setDepositAmount("");
                  setDepositRef("");
                })
              }
            >
              <Wallet className="w-3.5 h-3.5" /> {t("Record deposit")}
            </Button>
          </Card>

          <Card className="p-4 space-y-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {t("Collect")}
            </p>
            {order.status === "OPEN" && (
              <Button
                variant="secondary"
                loading={busy}
                disabled={!order.confirmed}
                onClick={() => run(() => markReady({ token, orderId }), "Order marked ready")}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> {t("Mark ready")}
              </Button>
            )}
            <label className="flex items-center gap-2 text-xs font-bold">
              <input type="checkbox" checked={forDelivery} onChange={(e) => setForDelivery(e.target.checked)} />
              {t("Deliver to the customer")}
            </label>
            {forDelivery && (
              <Field label={t("Delivery fee")}>
                <Select value={deliveryFeeId} onChange={(e) => setDeliveryFeeId(e.target.value)}>
                  <option value="">{t("No fee")}</option>
                  {(fees ?? []).map((f) => (
                    <option key={f._id} value={f._id}>
                      {f.name} · {fmt(f.fee)}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label={t("Balance payment")}>
                <TextInput
                  type="number"
                  value={payAmount || String(balance)}
                  onChange={(e) => setPayAmount(e.target.value)}
                />
              </Field>
              <Field label={t("Method")}>
                <Select value={payMethod} onChange={(e) => setPayMethod(e.target.value as PaymentMethod)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {t(PAYMENT_METHOD_LABEL[m])}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Button
              loading={busy}
              // Paying the balance needs the register; an order fully paid by deposits does not.
              disabled={(balance > 0 && Number(payAmount || balance) < balance) || (balance > 0 && registerClosed)}
              onClick={() =>
                run(
                  () =>
                    collect({
                      token,
                      orderId,
                      payments: [{ method: payMethod, amount: Number(payAmount || balance) }],
                      isDelivery: forDelivery || undefined,
                      deliveryFeeId: forDelivery && deliveryFeeId ? (deliveryFeeId as Id<"deliveryFees">) : undefined,
                    }),
                  "Order collected as a sale"
                )
              }
            >
              {t("Collect and close")}
            </Button>
          </Card>

          <Card className="p-4 space-y-3 lg:col-span-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {t("Cancel order")}
            </p>
            <p className="text-xs text-on-surface-variant">
              {t("Deposits are returned to the customer as store credit.")}
            </p>
            <div className="flex gap-2">
              <TextInput
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder={t("Reason")}
              />
              <Button
                variant="danger"
                loading={busy}
                disabled={!cancelReason.trim()}
                onClick={() =>
                  run(() => cancel({ token, orderId, reason: cancelReason }), "Order cancelled").then(() =>
                    router.push("/orders")
                  )
                }
              >
                <XCircle className="w-3.5 h-3.5" /> {t("Cancel order")}
              </Button>
            </div>
          </Card>
        </div>
      )}

      {order.saleId && (
        <div className="mb-4">
          <DeliveriesCard saleId={order.saleId} />
        </div>
      )}

      <Card className="p-4 mb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          {t("History")}
        </p>
        <ul className="space-y-2 text-sm">
          {order.events.map((e) => (
            <li key={e._id}>
              <span className="font-bold">{t(EVENT_LABEL[e.kind])}</span> · {formatDate(e.occurredAt)} · {e.username}
              {e.totalBefore !== undefined && e.totalAfter !== undefined && e.totalBefore !== e.totalAfter
                ? ` · ${fmt(e.totalBefore)} → ${fmt(e.totalAfter)}`
                : ""}
              {e.reason && <div className="text-xs text-on-surface-variant">{e.reason}</div>}
              {e.lineChanges && (
                <ul className="text-xs text-on-surface-variant">
                  {e.lineChanges.map((c) => (
                    <li key={c.productVariantId}>
                      {c.label}: {c.quantityBefore} → {c.quantityAfter}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
          {order.events.length === 0 && <li className="text-xs text-on-surface-variant">{t("No history recorded")}</li>}
        </ul>
      </Card>

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={t("Change items")}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              {t("Cancel")}
            </Button>
            <Button
              loading={busy}
              disabled={!changeReason.trim()}
              onClick={() =>
                editing &&
                run(
                  () =>
                    changeLines({
                      token,
                      orderId,
                      reason: changeReason,
                      items: editing.map((l) => ({ productVariantId: l.productVariantId, quantity: l.quantity })),
                    }),
                  "Order changed"
                ).then(() => {
                  setEditing(null);
                  setChangeReason("");
                })
              }
            >
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <VariantPicker
            placeholder={t("Search product to add…")}
            onPick={(v) =>
              setEditing((prev) =>
                !prev || prev.some((l) => l.productVariantId === v.variantId)
                  ? prev
                  : [...prev, { productVariantId: v.variantId, label: v.label, quantity: 1 }]
              )
            }
          />
          {(editing ?? []).map((line, i) => (
            <div key={line.productVariantId} className="flex items-center gap-2 p-2 rounded-lg bg-surface-container-low">
              <span className="flex-1 text-sm font-bold truncate">{line.label}</span>
              <TextInput
                type="number"
                min={0}
                value={line.quantity}
                onChange={(e) =>
                  setEditing((prev) => prev && prev.map((l, j) => (j === i ? { ...l, quantity: Number(e.target.value) } : l)))
                }
                className="w-20"
                aria-label={t("Quantity")}
              />
              <button
                type="button"
                onClick={() => setEditing((prev) => prev && prev.filter((_, j) => j !== i))}
                className="p-1.5 text-on-surface-variant hover:text-error"
                aria-label={t("Remove")}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <p className="text-xs text-on-surface-variant">
            {t("Items kept keep their agreed price; new items are priced at today's price.")}
          </p>
          <Field label={t("Reason")} required>
            <TextInput value={changeReason} onChange={(e) => setChangeReason(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Card className="p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          {t("Deposits")}
        </p>
        {order.deposits.length === 0 ? (
          <p className="text-xs text-on-surface-variant">{t("No deposits yet")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {order.deposits.map((d) => (
              <li key={d._id}>
                {formatDate(d.createdAt)} · {t(PAYMENT_METHOD_LABEL[d.method])} · {fmt(d.amount)}
                {d.reference ? ` · ${d.reference}` : ""} · {d.username ?? "—"}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </PageLayout>
  );
}
