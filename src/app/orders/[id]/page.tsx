"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Select, Badge, Spinner, Table, Th, Td } from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Wallet, XCircle } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

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

export default function OrderDetailPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const orderId = params.id as Id<"customerOrders">;
  const order = useQuery(api.customerOrders.get, { id: orderId });

  const addDeposit = useMutation(api.customerOrders.addDeposit);
  const markReady = useMutation(api.customerOrders.markReady);
  const collect = useMutation(api.customerOrders.collect);
  const cancel = useMutation(api.customerOrders.cancel);

  const [depositAmount, setDepositAmount] = useState("");
  const [depositMethod, setDepositMethod] = useState<PaymentMethod>("CARD");
  const [depositRef, setDepositRef] = useState("");
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("CARD");
  const [cancelReason, setCancelReason] = useState("");
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
  const balance = order.balance;

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
        <Badge tone={STATUS_TONE[order.status]}>{t(STATUS_LABEL[order.status])}</Badge>
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
                </Td>
                <Td>{i.quantity}</Td>
                <Td>{fmt(i.unitPrice)}</Td>
                <Td className="font-bold">{fmt(i.lineTotal)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

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
                onClick={() => run(() => markReady({ token, orderId }), "Order marked ready")}
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> {t("Mark ready")}
              </Button>
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
              disabled={balance > 0 && Number(payAmount || balance) < balance}
              onClick={() =>
                run(
                  () =>
                    collect({
                      token,
                      orderId,
                      payments: [{ method: payMethod, amount: Number(payAmount || balance) }],
                    }),
                  "Order collected as a sale"
                ).then(() => router.push("/orders"))
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
