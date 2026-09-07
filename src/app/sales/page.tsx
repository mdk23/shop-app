"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Select,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
  StatCard,
  Field,
  TextInput,
  ConfirmDialog,
  inputClass,
} from "@/components/ui";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";
import { toast } from "sonner";
import { Search, Download } from "lucide-react";

const RANGES = [
  { key: "today", label: "Today" },
  { key: "7", label: "Last 7 days" },
  { key: "30", label: "Last 30 days" },
  { key: "90", label: "Last 90 days" },
];

const STATUS_TONE: Record<string, "neutral" | "info" | "warning" | "success" | "error"> = {
  COMPLETED: "success",
  PARTIALLY_PAID: "warning",
  PENDING: "info",
  CANCELLED: "neutral",
  REFUNDED: "error",
  PARTIALLY_REFUNDED: "error",
};

export default function SalesPage() {
  const fmt = useCurrency();
  const token = useToken();
  const { branchId, isAll } = useResolvedBranch();
  const [range, setRange] = useState("30");
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<Id<"sales"> | null>(null);

  const { start, end } = useMemo(() => {
    const now = Date.now();
    if (range === "today") {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return { start: d.getTime(), end: now };
    }
    return { start: now - Number(range) * 86400000, end: now };
  }, [range]);

  const sales = useQuery(api.sales.listByRange, {
    start,
    end,
    branchId: isAll ? undefined : branchId,
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (sales ?? []).filter(
      (s) =>
        (!statusFilter || s.status === statusFilter) &&
        (!term ||
          s.saleNumber.toLowerCase().includes(term) ||
          (s.customerName ?? "").toLowerCase().includes(term))
    );
  }, [sales, statusFilter, search]);

  const totals = useMemo(() => {
    const active = filtered.filter((s) => s.status !== "CANCELLED");
    return {
      count: active.length,
      revenue: active.reduce((a, s) => a + s.total, 0),
      collected: active.reduce((a, s) => a + s.paidAmount, 0),
      outstanding: active.reduce((a, s) => a + s.balance, 0),
    };
  }, [filtered]);

  const exportCsv = () => {
    const header = "sale,date,customer,status,subtotal,discount,tax,total,paid,balance";
    const body = filtered
      .map((s) =>
        [
          s.saleNumber,
          new Date(s.createdAt).toISOString(),
          (s.customerName ?? "").replace(/,/g, " "),
          s.status,
          s.subtotal,
          s.discount,
          s.tax,
          s.total,
          s.paidAmount,
          s.balance,
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sales-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <PageLayout title="Sales" subtitle="Transactions & receivables">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Sales" value={totals.count} />
        <StatCard label="Revenue" value={fmt(totals.revenue)} />
        <StatCard label="Collected" value={fmt(totals.collected)} accent="success" />
        <StatCard
          label="Outstanding"
          value={fmt(totals.outstanding)}
          accent={totals.outstanding > 0 ? "error" : "primary"}
        />
      </div>

      <Toolbar>
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-36">
          {RANGES.map((r) => (
            <option key={r.key} value={r.key}>
              {r.label}
            </option>
          ))}
        </Select>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-44"
        >
          <option value="">All statuses</option>
          {Object.keys(STATUS_TONE).map((s) => (
            <option key={s} value={s}>
              {s.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-52`}
            placeholder="Sale # or customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto" />
        <Button variant="secondary" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </Toolbar>

      <Card>
        {sales === undefined ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No sales in range" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sale</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th className="text-right">Total</Th>
                <Th className="text-right">Balance</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr
                  key={s._id}
                  className="hover:bg-surface-container-low cursor-pointer"
                  onClick={() => setDetailId(s._id)}
                >
                  <Td className="font-mono text-[11px] font-bold">{s.saleNumber}</Td>
                  <Td className="text-on-surface-variant text-xs">
                    {new Date(s.createdAt).toLocaleString()}
                  </Td>
                  <Td>{s.customerName ?? "Walk-in"}</Td>
                  <Td className="text-right font-bold">{fmt(s.total)}</Td>
                  <Td className={`text-right ${s.balance > 0 ? "text-error font-bold" : ""}`}>
                    {fmt(s.balance)}
                  </Td>
                  <Td>
                    <Badge tone={STATUS_TONE[s.status]}>{s.status.replace(/_/g, " ")}</Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {detailId && (
        <SaleDetail token={token} id={detailId} fmt={fmt} onClose={() => setDetailId(null)} />
      )}
    </PageLayout>
  );
}

function SaleDetail({
  token,
  id,
  fmt,
  onClose,
}: {
  token: string;
  id: Id<"sales">;
  fmt: (n: number) => string;
  onClose: () => void;
}) {
  const sale = useQuery(api.sales.get, { id });
  const addPayment = useMutation(api.payments.add);
  const cancelSale = useMutation(api.sales.cancel);
  const [method, setMethod] = useState("Cash");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);

  const pay = async () => {
    if (!amount || Number(amount) <= 0) return toast.error("Enter an amount.");
    setBusy(true);
    try {
      await addPayment({ token, saleId: id, method, amount: Number(amount) });
      toast.success("Payment recorded");
      setAmount("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open
        onClose={onClose}
        size="lg"
        title={sale ? `Sale ${sale.saleNumber}` : "Sale"}
        subtitle={sale ? `${sale.customerName ?? "Walk-in"} · ${new Date(sale.createdAt).toLocaleString()}` : undefined}
        footer={
          sale && (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowReceipt(true)}>
                Receipt
              </Button>
              {sale.status !== "CANCELLED" &&
                sale.status !== "REFUNDED" &&
                sale.status !== "PARTIALLY_REFUNDED" && (
                  <Button variant="danger" onClick={() => setConfirmCancel(true)}>
                    Cancel sale
                  </Button>
                )}
            </div>
          )
        }
      >
        {!sale ? (
          <Spinner />
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-outline divide-y divide-outline/30">
              {sale.items.map((it) => (
                <div key={it._id} className="flex justify-between px-3 py-2 text-xs">
                  <span>
                    {it.quantity}× {it.productName}{" "}
                    <span className="text-on-surface-variant">({it.variantLabel})</span>
                  </span>
                  <span className="font-bold">{fmt(it.total)}</span>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <Line label="Subtotal" value={fmt(sale.subtotal)} />
              <Line label="Discount" value={fmt(sale.discount)} />
              <Line label="Tax" value={fmt(sale.tax)} />
              <Line label="Total" value={fmt(sale.total)} bold />
              <Line label="Paid" value={fmt(sale.paidAmount)} />
              <Line label="Balance" value={fmt(sale.balance)} bold />
            </div>

            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                Payments
              </p>
              <div className="rounded-xl border border-outline divide-y divide-outline/30">
                {sale.payments.map((p) => (
                  <div key={p._id} className="flex justify-between px-3 py-2 text-xs">
                    <span>
                      {p.kind === "refund" ? "Refund · " : ""}
                      {p.method}
                    </span>
                    <span className={p.amount < 0 ? "text-error font-bold" : "font-bold"}>
                      {fmt(p.amount)}
                    </span>
                  </div>
                ))}
                {sale.payments.length === 0 && (
                  <p className="px-3 py-2 text-xs text-on-surface-variant">No payments</p>
                )}
              </div>
            </div>

            {sale.balance > 0 && sale.status !== "CANCELLED" && (
              <Card className="p-3 bg-surface-container-low">
                <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                  Collect payment
                </p>
                <div className="flex items-end gap-2">
                  <Field label="Method">
                    <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                      {["Cash", "Card", "MPESA", "EMOLA", "Bank Transfer", "Other"].map((m) => (
                        <option key={m}>{m}</option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Amount">
                    <TextInput
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-28"
                    />
                  </Field>
                  <Button onClick={pay} loading={busy}>
                    Record
                  </Button>
                </div>
              </Card>
            )}
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Cancel sale"
        message="This reverses stock and refunds any cash taken. The sale record is kept for audit."
        danger
        confirmLabel="Cancel sale"
        onConfirm={async () => {
          try {
            await cancelSale({ token, saleId: id, reason: "Cancelled from sales screen" });
            toast.success("Sale cancelled");
            setConfirmCancel(false);
            onClose();
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
        }}
      />

      {showReceipt && <ReceiptModal saleId={id} onClose={() => setShowReceipt(false)} />}
    </>
  );
}

function Line({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-on-surface-variant uppercase tracking-wider">{label}</span>
      <span className={bold ? "font-black" : "font-bold"}>{value}</span>
    </div>
  );
}
