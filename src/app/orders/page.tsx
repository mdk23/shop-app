"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Field,
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
  PagedFooter,
} from "@/components/ui";
import { useClientPage } from "@/lib/pagination";
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";
import { formatDate, cn } from "@/lib/utils";
import { CustomerSearchPanel } from "@/components/pos/CustomerSearchPanel";
import { VariantPicker, type PickedVariant } from "@/components/VariantPicker";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Status = "OPEN" | "READY" | "COLLECTED" | "CANCELLED";
type Tone = "neutral" | "success" | "warning" | "error" | "info";

const STATUSES: ("ALL" | Status)[] = ["ALL", "OPEN", "READY", "COLLECTED", "CANCELLED"];

const STATUS_TONE: Record<Status, Tone> = {
  OPEN: "info",
  READY: "warning",
  COLLECTED: "success",
  CANCELLED: "error",
};

const STATUS_LABEL: Record<Status, string> = {
  OPEN: "Open",
  READY: "Ready for collection",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
};

export default function OrdersPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const branch = useResolvedBranch();

  const [filter, setFilter] = useState<"ALL" | Status>("ALL");
  const orders = useQuery(api.customerOrders.list, filter === "ALL" ? {} : { status: filter });
  const page = useClientPage(orders ?? []);
  const create = useMutation(api.customerOrders.create);

  const [creating, setCreating] = useState(false);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const customer = useQuery(
    api.customers.getPosContext,
    customerId ? { customerId } : "skip"
  );
  const [lines, setLines] = useState<(PickedVariant & { quantity: number })[]>([]);
  const [reserve, setReserve] = useState(false);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const total = lines.reduce((s, l) => s + l.sellingPrice * l.quantity, 0);

  const closeForm = () => {
    setCreating(false);
    setCustomerId(null);
    setLines([]);
    setReserve(false);
    setNotes("");
  };

  const addVariant = (v: PickedVariant) =>
    setLines((prev) => {
      const hit = prev.find((l) => l.variantId === v.variantId);
      return hit
        ? prev.map((l) => (l.variantId === v.variantId ? { ...l, quantity: l.quantity + 1 } : l))
        : [...prev, { ...v, quantity: 1 }];
    });

  const save = async () => {
    if (!customerId) return toast.error(t("Choose a customer."));
    if (lines.length === 0) return toast.error(t("Add at least one item."));
    if (!branch.branchId) return toast.error(t("Choose a branch."));
    setBusy(true);
    try {
      await create({
        token,
        customerId,
        branchId: branch.branchId,
        items: lines.map((l) => ({
          productVariantId: l.variantId,
          quantity: l.quantity,
        })),
        reserve,
        notes: notes.trim() || undefined,
      });
      toast.success(t("Order created"));
      closeForm();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Customer Orders")} subtitle={t("Goods paid in parts and collected later")}>
      <Toolbar>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
                filter === s
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-low text-on-surface-variant border-outline"
              )}
            >
              {s === "ALL" ? t("All") : t(STATUS_LABEL[s])}
            </button>
          ))}
        </div>
        <div className="ml-auto" />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New order")}
        </Button>
      </Toolbar>

      <Card>
        {orders === undefined ? (
          <Spinner />
        ) : orders.length === 0 ? (
          <EmptyState
            title={t("No orders here")}
            message={t("Create an order when a customer wants goods that are not on the shelf yet.")}
            action={<Button onClick={() => setCreating(true)}>{t("New order")}</Button>}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Order")}</Th>
                    <Th>{t("Customer")}</Th>
                    <Th>{t("Created")}</Th>
                    <Th>{t("Total")}</Th>
                    <Th>{t("Status")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((o) => (
                    <tr key={o._id} className="hover:bg-surface-container-low">
                      <Td>
                        <Link href={`/orders/${o._id}`} className="font-mono font-bold">
                          {o.orderNumber}
                        </Link>
                      </Td>
                      <Td>{o.customerName}</Td>
                      <Td>{formatDate(o.createdAt)}</Td>
                      <Td className="font-bold">{fmt(o.totalAmount)}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[o.status]}>{t(STATUS_LABEL[o.status])}</Badge>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="md:hidden space-y-2 p-2">
              {page.rows.map((o) => (
                <Link
                  key={o._id}
                  href={`/orders/${o._id}`}
                  className="block p-3 rounded-xl border border-outline bg-surface-container-low"
                >
                  <div className="flex justify-between">
                    <span className="font-mono font-bold">{o.orderNumber}</span>
                    <Badge tone={STATUS_TONE[o.status]}>{t(STATUS_LABEL[o.status])}</Badge>
                  </div>
                  <p className="text-sm">{o.customerName}</p>
                  <p className="text-xs text-on-surface-variant">
                    {fmt(o.totalAmount)} · {formatDate(o.createdAt)}
                  </p>
                </Link>
              ))}
            </div>
            <PagedFooter paged={page} loading={orders === undefined} />
          </>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={closeForm}
        title={t("New order")}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeForm}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy}>
              {t("Save order")}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label={t("Customer")} required>
            <div className="flex gap-2">
              <TextInput
                readOnly
                value={customer?.customer?.name ?? ""}
                placeholder={t("Choose a customer")}
              />
              <Button variant="secondary" onClick={() => setPickingCustomer(true)}>
                {t("Search customer")}
              </Button>
            </div>
          </Field>

          <Field label={t("Items")} required>
            <VariantPicker placeholder={t("Search product or SKU")} onPick={addVariant} />
            <div className="mt-2 space-y-1.5">
              {lines.map((l) => (
                <div
                  key={l.variantId}
                  className="flex items-center gap-2 p-2 rounded-xl bg-surface-container-low border border-outline text-sm"
                >
                  <span className="flex-1 min-w-0 truncate">
                    {l.label} <span className="text-on-surface-variant">({l.sku})</span>
                  </span>
                  <TextInput
                    type="number"
                    min={1}
                    value={l.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((x) =>
                          x.variantId === l.variantId
                            ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) }
                            : x
                        )
                      )
                    }
                    className="w-20"
                  />
                  <span className="w-24 text-right font-bold">{fmt(l.sellingPrice * l.quantity)}</span>
                  <button
                    onClick={() => setLines((prev) => prev.filter((x) => x.variantId !== l.variantId))}
                    className="text-on-surface-variant hover:text-error"
                    aria-label={t("Remove")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <p className="mt-2 text-right font-black">
              {t("Total")}: {fmt(total)}
            </p>
          </Field>

          <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
            <input type="checkbox" checked={reserve} onChange={(e) => setReserve(e.target.checked)} />
            {t("Reserve this stock now")}
          </label>

          <Field label={t("Notes")}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <CustomerSearchPanel
        open={pickingCustomer}
        onClose={() => setPickingCustomer(false)}
        onSelect={(id) => setCustomerId(id)}
      />
    </PageLayout>
  );
}
