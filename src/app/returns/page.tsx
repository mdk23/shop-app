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
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Pagination,
  Spinner,
  Toolbar,
  inputClass,
} from "@/components/ui";
import { VariantPicker, PickedVariant } from "@/components/VariantPicker";
import { useToken, useCurrency } from "@/lib/useShop";
import { usePagedQuery } from "@/lib/pagination";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { Search } from "lucide-react";

const REASONS = [
  "WRONG_SIZE",
  "WRONG_COLOR",
  "DEFECTIVE",
  "CUSTOMER_CHANGED_MIND",
  "WRONG_ITEM",
  "OTHER",
] as const;

const REFUND_METHODS = [
  "CASH",
  "CARD",
  "MPESA",
  "EMOLA",
  "BANK_TRANSFER",
  "STORE_CREDIT",
  "OTHER",
] as const;

export default function ReturnsPage() {
  const { t } = useTranslation();
  const fmt = useCurrency();
  const [saleQuery, setSaleQuery] = useState("");
  const [pickedSaleId, setPickedSaleId] = useState<Id<"sales"> | null>(null);
  const {
    rows: recent,
    isLoading: recentLoading,
    pageIndex,
    pageSize,
    hasPrev,
    hasNext,
    goPrev,
    goNext,
  } = usePagedQuery(api.salesReturns.listPaged, {});

  const found = useQuery(
    api.sales.get,
    pickedSaleId ? { id: pickedSaleId } : "skip"
  );
  const saleMatches = useQuery(
    api.sales.listRecent,
    saleQuery.trim() ? { limit: 50 } : "skip"
  );

  return (
    <PageLayout title={t("Returns")} subtitle={t("Sales · returns & refunds")}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Find the original sale")}
          </p>
          <div className="relative mb-2">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              className={`${inputClass} pl-9`}
              placeholder={t("Sale number or customer")}
              value={saleQuery}
              onChange={(e) => setSaleQuery(e.target.value)}
            />
          </div>
          {saleQuery.trim() && (
            <div className="rounded-xl border border-outline divide-y divide-outline/30 max-h-72 overflow-y-auto">
              {(saleMatches ?? [])
                .filter(
                  (s) =>
                    s.saleNumber.toLowerCase().includes(saleQuery.toLowerCase()) ||
                    (s.customerName ?? "")
                      .toLowerCase()
                      .includes(saleQuery.toLowerCase())
                )
                .slice(0, 20)
                .map((s) => (
                  <button
                    key={s._id}
                    onClick={() => {
                      setPickedSaleId(s._id);
                      setSaleQuery("");
                    }}
                    className="w-full flex justify-between px-3 py-2 text-xs hover:bg-surface-container-low text-left"
                  >
                    <span className="font-mono font-bold">{s.saleNumber}</span>
                    <span className="text-on-surface-variant">
                      {s.customerName ?? t("Walk-in")}
                    </span>
                    <span className="font-bold">{fmt(s.total)}</span>
                  </button>
                ))}
            </div>
          )}
        </Card>

        <Card className="p-0">
          <div className="px-4 py-3 border-b border-outline/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {t("Recent returns")}
            </p>
          </div>
          <div>
            {recentLoading ? (
              <Spinner />
            ) : recent.length === 0 ? (
              <EmptyState title={t("No returns yet")} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Return")}</Th>
                    <Th>{t("Method")}</Th>
                    <Th className="text-right">{t("Refund")}</Th>
                    <Th>{t("When")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => (
                    <tr key={r._id}>
                      <Td className="font-mono text-[11px]">{r.returnNumber}</Td>
                      <Td>
                        <Badge tone="info">{r.refundMethod}</Badge>
                      </Td>
                      <Td className="text-right font-bold">{fmt(r.refundAmount)}</Td>
                      <Td className="text-on-surface-variant text-xs">
                        {new Date(r.createdAt).toLocaleDateString()}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
          {!recentLoading && recent.length > 0 && (
            <Pagination
              pageIndex={pageIndex}
              rowCount={recent.length}
              pageSize={pageSize}
              hasPrev={hasPrev}
              hasNext={hasNext}
              onPrev={goPrev}
              onNext={goNext}
            />
          )}
        </Card>
      </div>

      {pickedSaleId && found && (
        <ReturnModal
          sale={found}
          fmt={fmt}
          onClose={() => setPickedSaleId(null)}
        />
      )}
    </PageLayout>
  );
}

function ReturnModal({
  sale,
  fmt,
  onClose,
}: {
  sale: {
    _id: Id<"sales">;
    saleNumber: string;
    customerName?: string;
    items: {
      _id: Id<"saleItems">;
      productName: string;
      variantLabel: string;
      quantity: number;
      unitPrice: number;
      total: number;
    }[];
  };
  fmt: (n: number) => string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const token = useToken();
  const process = useMutation(api.salesReturns.create);
  const exchange = useMutation(api.salesReturns.exchange);
  const [mode, setMode] = useState<"return" | "exchange">("return");
  const [rows, setRows] = useState<
    Record<string, { qty: number; reason: (typeof REASONS)[number]; restock: boolean }>
  >({});
  const [refundMethod, setRefundMethod] =
    useState<(typeof REFUND_METHODS)[number]>("CASH");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [replacements, setReplacements] = useState<
    (PickedVariant & { quantity: number })[]
  >([]);
  const [extraPayMethod, setExtraPayMethod] = useState("Cash");

  const toggle = (id: string, item: (typeof sale.items)[number]) =>
    setRows((p) =>
      p[id]
        ? Object.fromEntries(Object.entries(p).filter(([k]) => k !== id))
        : { ...p, [id]: { qty: item.quantity, reason: "WRONG_SIZE", restock: true } }
    );

  const estRefund = Object.entries(rows).reduce((sum, [id, r]) => {
    const it = sale.items.find((x) => x._id === id);
    if (!it) return sum;
    return sum + (it.total / it.quantity) * r.qty;
  }, 0);
  const replacementTotal = replacements.reduce(
    (s, r) => s + r.sellingPrice * r.quantity,
    0
  );
  const difference = replacementTotal - estRefund;

  const submit = async () => {
    const items = Object.entries(rows).map(([saleItemId, r]) => ({
      saleItemId: saleItemId as Id<"saleItems">,
      quantity: r.qty,
      reason: r.reason,
      restock: r.restock,
    }));
    if (items.length === 0) return toast.error(t("Select at least one item."));
    setBusy(true);
    try {
      if (mode === "exchange") {
        if (replacements.length === 0)
          return toast.error(t("Add at least one replacement item."));
        const res = await exchange({
          token,
          saleId: sale._id,
          returnItems: items,
          replacementItems: replacements.map((r) => ({
            productVariantId: r.variantId,
            quantity: r.quantity,
            unitPrice: r.sellingPrice,
          })),
          additionalPayments:
            difference > 0
              ? [{ method: extraPayMethod, amount: difference }]
              : undefined,
          refundMethod,
          notes: notes || undefined,
        });
        const detail =
          res.difference > 0
            ? t("customer paid {amount}", { amount: fmt(res.difference) })
            : res.difference < 0
              ? t("store credit {amount}", { amount: fmt(-res.difference) })
              : t("even");
        toast.success(t("Exchange done · {detail}", { detail }));
      } else {
        await process({
          token,
          saleId: sale._id,
          items,
          refundMethod,
          notes: notes || undefined,
        });
        toast.success(t("Return processed"));
      }
      onClose();
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
      title={`${mode === "exchange" ? t("Exchange") : t("Return")} · ${sale.saleNumber}`}
      subtitle={sale.customerName ?? t("Walk-in")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} loading={busy}>
            {mode === "exchange"
              ? difference > 0
                ? t("Collect {amount}", { amount: fmt(difference) })
                : difference < 0
                  ? t("Credit {amount}", { amount: fmt(-difference) })
                  : t("Complete exchange")
              : t("Refund {amount}", { amount: fmt(estRefund) })}
          </Button>
        </>
      }
    >
      <div className="flex gap-1.5 mb-2">
        {(["return", "exchange"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors " +
              (mode === m
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-outline")
            }
          >
            {t(m)}
          </button>
        ))}
      </div>
      <Table>
        <thead>
          <tr>
            <Th className="w-8" />
            <Th>{t("Item")}</Th>
            <Th className="text-right">{t("Sold")}</Th>
            <Th className="text-right w-20">{t("Return")}</Th>
            <Th className="w-40">{t("Reason")}</Th>
            <Th className="w-20">{t("Restock")}</Th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((it) => {
            const row = rows[it._id];
            return (
              <tr key={it._id}>
                <Td>
                  <input
                    type="checkbox"
                    checked={!!row}
                    onChange={() => toggle(it._id, it)}
                  />
                </Td>
                <Td className="text-xs">
                  {it.productName}{" "}
                  <span className="text-on-surface-variant">({it.variantLabel})</span>
                </Td>
                <Td className="text-right">{it.quantity}</Td>
                <Td>
                  <input
                    type="number"
                    disabled={!row}
                    value={row?.qty ?? ""}
                    min={1}
                    max={it.quantity}
                    onChange={(e) =>
                      setRows((p) => ({
                        ...p,
                        [it._id]: { ...p[it._id], qty: Number(e.target.value) },
                      }))
                    }
                    className="w-16 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right disabled:opacity-40"
                  />
                </Td>
                <Td>
                  <Select
                    disabled={!row}
                    value={row?.reason ?? "WRONG_SIZE"}
                    onChange={(e) =>
                      setRows((p) => ({
                        ...p,
                        [it._id]: {
                          ...p[it._id],
                          reason: e.target.value as (typeof REASONS)[number],
                        },
                      }))
                    }
                  >
                    {REASONS.map((r) => (
                      <option key={r} value={r}>
                        {r.replace(/_/g, " ")}
                      </option>
                    ))}
                  </Select>
                </Td>
                <Td>
                  <input
                    type="checkbox"
                    disabled={!row}
                    checked={row?.restock ?? true}
                    onChange={(e) =>
                      setRows((p) => ({
                        ...p,
                        [it._id]: { ...p[it._id], restock: e.target.checked },
                      }))
                    }
                  />
                </Td>
              </tr>
            );
          })}
        </tbody>
      </Table>

      {mode === "exchange" && (
        <div className="mt-3 rounded-xl border border-outline bg-surface-container-low p-3 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
            {t("Replacement items")}
          </p>
          <VariantPicker
            onPick={(v) =>
              setReplacements((p) =>
                p.some((x) => x.variantId === v.variantId)
                  ? p
                  : [...p, { ...v, quantity: 1 }]
              )
            }
          />
          {replacements.map((r, i) => (
            <div key={r.variantId} className="flex items-center gap-2">
              <span className="flex-1 text-xs font-bold">{r.label}</span>
              <span className="text-xs text-on-surface-variant">{fmt(r.sellingPrice)}</span>
              <input
                type="number"
                value={r.quantity}
                min={1}
                onChange={(e) =>
                  setReplacements((p) =>
                    p.map((x, j) =>
                      j === i ? { ...x, quantity: Number(e.target.value) } : x
                    )
                  )
                }
                className="w-14 px-2 py-1 bg-surface border border-outline rounded-lg text-xs text-right"
              />
              <button
                onClick={() =>
                  setReplacements((p) => p.filter((_, j) => j !== i))
                }
                className="text-on-surface-variant hover:text-error text-xs"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="flex justify-between text-xs pt-1 border-t border-outline/40">
            <span className="text-on-surface-variant uppercase tracking-wider">
              {t("Replacement {total} − return {refund}", {
                total: fmt(replacementTotal),
                refund: fmt(estRefund),
              })}
            </span>
            <span
              className={
                difference > 0
                  ? "font-black text-error"
                  : difference < 0
                    ? "font-black text-success"
                    : "font-black"
              }
            >
              {difference > 0
                ? t("customer pays {amount}", { amount: fmt(difference) })
                : difference < 0
                  ? t("store credit {amount}", { amount: fmt(-difference) })
                  : t("even")}
            </span>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 mt-2">
        <Field
          label={mode === "exchange" ? t("Extra charge via") : t("Refund method")}
          required
        >
          {mode === "exchange" && difference > 0 ? (
            <Select
              value={extraPayMethod}
              onChange={(e) => setExtraPayMethod(e.target.value)}
            >
              {["Cash", "Card", "MPESA", "EMOLA", "Bank Transfer", "Other"].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </Select>
          ) : (
            <Select
              value={refundMethod}
              onChange={(e) =>
                setRefundMethod(e.target.value as (typeof REFUND_METHODS)[number])
              }
            >
              {REFUND_METHODS.map((m) => (
                <option key={m} value={m}>
                  {m.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label={t("Notes")}>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
