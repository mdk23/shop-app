"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Field,
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
import { useToken } from "@/lib/useShop";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { Plus, PackageCheck, FileText } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Filter = "ALL" | "IN_TRANSIT" | "ARRIVED";

export default function ShipmentsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const [filter, setFilter] = useState<Filter>("IN_TRANSIT");
  const shipments = useQuery(api.shipments.list, filter === "ALL" ? { token } : { token, status: filter });
  const openOrders = useQuery(api.purchaseReceipts.openOrders, { token });
  const create = useMutation(api.shipments.create);
  const arrive = useMutation(api.shipments.markArrived);
  const addCustoms = useMutation(api.shipments.addCustomsDocument);

  const [creating, setCreating] = useState(false);
  // Units to ship per order line; lines may come from several orders.
  const [shipQty, setShipQty] = useState<Record<string, number>>({});
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  const [customsFor, setCustomsFor] = useState<Id<"shipments"> | null>(null);
  const [docType, setDocType] = useState("");
  const [docRef, setDocRef] = useState("");

  const closeCreate = () => {
    setCreating(false);
    setShipQty({});
    setCarrier("");
    setTracking("");
  };

  const shippable = (line: { outstanding: number; inTransit: number }) =>
    Math.max(0, line.outstanding - line.inTransit);
  const shipWholeOrder = (lines: { _id: string; outstanding: number; inTransit: number }[]) =>
    setShipQty((p) => {
      const next = { ...p };
      for (const l of lines) if (shippable(l) > 0) next[l._id] = shippable(l);
      return next;
    });
  const items = Object.entries(shipQty)
    .filter(([, q]) => q > 0)
    .map(([id, quantity]) => ({ purchaseOrderItemId: id as Id<"purchaseOrderItems">, quantity }));

  const saveNew = async () => {
    if (!carrier.trim()) return toast.error(t("Name the carrier."));
    if (items.length === 0) return toast.error(t("Choose what the shipment carries."));
    setBusy(true);
    try {
      await create({
        token,
        items,
        carrier,
        trackingReference: tracking || undefined,
      });
      toast.success(t("Shipment recorded"));
      closeCreate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const markArrived = async (id: Id<"shipments">) => {
    try {
      await arrive({ token, id });
      toast.success(t("Marked as arrived"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const saveCustoms = async () => {
    if (!customsFor) return;
    try {
      await addCustoms({ token, shipmentId: customsFor, documentType: docType, reference: docRef });
      toast.success(t("Customs document added"));
      setCustomsFor(null);
      setDocType("");
      setDocRef("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  return (
    <PageLayout title={t("Shipments")} subtitle={t("Goods on the way from suppliers")}>
      <Toolbar>
        <div className="flex gap-1.5">
          {(["IN_TRANSIT", "ARRIVED", "ALL"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
                filter === f
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-low text-on-surface-variant border-outline"
              )}
            >
              {f === "IN_TRANSIT" ? t("In transit") : f === "ARRIVED" ? t("Arrived") : t("All")}
            </button>
          ))}
        </div>
        <div className="ml-auto" />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New shipment")}
        </Button>
      </Toolbar>

      <Card>
        {shipments === undefined ? (
          <Spinner />
        ) : shipments.length === 0 ? (
          <EmptyState
            title={t("No shipments here")}
            message={t("Record a shipment when a supplier sends goods, so you can follow them until they arrive.")}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t("Departed")}</Th>
                  <Th>{t("Carrier")}</Th>
                  <Th>{t("Tracking")}</Th>
                  <Th>{t("Supplier")}</Th>
                  <Th>{t("Orders")}</Th>
                  <Th>{t("Contents")}</Th>
                  <Th>{t("Customs documents")}</Th>
                  <Th>{t("Status")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {shipments.map((s) => (
                  <tr key={s._id} className="hover:bg-surface-container-low">
                    <Td>{s.departedAt ? formatDate(s.departedAt) : "—"}</Td>
                    <Td className="font-bold">{s.carrier}</Td>
                    <Td className="font-mono">{s.trackingReference ?? "—"}</Td>
                    <Td>{s.supplierName ?? "—"}</Td>
                    <Td>
                      {s.orders.length === 0
                        ? "—"
                        : s.orders.map((o) => (
                            <div key={o._id} className="font-mono whitespace-nowrap">
                              {o.orderCode}
                              {o.received && <span className="ml-1 text-success">✓ {t("received")}</span>}
                            </div>
                          ))}
                    </Td>
                    <Td className="text-xs">
                      {s.items.length === 0
                        ? "—"
                        : s.items.map((i) => (
                            <div key={i._id}>
                              {i.label} <span className="font-bold">×{i.quantity}</span>
                            </div>
                          ))}
                    </Td>
                    <Td>{s.customs.map((c) => `${c.documentType} ${c.reference}`).join(", ") || "—"}</Td>
                    <Td>
                      <Badge tone={s.status === "ARRIVED" ? "success" : "info"}>
                        {s.status === "ARRIVED" ? t("Arrived") : t("In transit")}
                      </Badge>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        {s.status === "IN_TRANSIT" && (
                          <Button size="sm" variant="secondary" onClick={() => markArrived(s._id)}>
                            <PackageCheck className="w-3.5 h-3.5" /> {t("Arrived")}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setCustomsFor(s._id)}>
                          <FileText className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={closeCreate}
        title={t("New shipment")}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveNew} loading={busy} disabled={items.length === 0}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Contents")} required>
            <div className="space-y-3 max-h-80 overflow-y-auto">
              {(openOrders ?? []).length === 0 && (
                <p className="text-xs text-on-surface-variant">{t("No orders are waiting for goods.")}</p>
              )}
              {(openOrders ?? []).map((o) => (
                <div key={o._id} className="rounded-lg border border-outline/40 p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold">
                      <span className="font-mono">{o.orderCode}</span> · {o.supplierName}
                    </span>
                    <Button size="sm" variant="ghost" onClick={() => shipWholeOrder(o.lines)}>
                      {t("Ship all")}
                    </Button>
                  </div>
                  {o.lines.map((l) => (
                    <div key={l._id} className="flex items-center gap-2 text-xs">
                      <span className="flex-1 truncate">
                        {l.productName} {l.variantLabel}
                      </span>
                      <span className="text-on-surface-variant whitespace-nowrap">
                        {t("{count} left to ship", { count: shippable(l) })}
                      </span>
                      <TextInput
                        type="number"
                        min={0}
                        max={shippable(l)}
                        value={shipQty[l._id] ?? 0}
                        disabled={shippable(l) === 0}
                        onChange={(e) => setShipQty((p) => ({ ...p, [l._id]: Number(e.target.value) }))}
                        className="w-20"
                        aria-label={t("Quantity")}
                      />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </Field>
          <Field label={t("Carrier")} required>
            <TextInput value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </Field>
          <Field label={t("Tracking reference")}>
            <TextInput value={tracking} onChange={(e) => setTracking(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!customsFor}
        onClose={() => setCustomsFor(null)}
        title={t("Customs document")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCustomsFor(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveCustoms} disabled={!docType.trim() || !docRef.trim()}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Document type")} required>
            <TextInput value={docType} onChange={(e) => setDocType(e.target.value)} />
          </Field>
          <Field label={t("Reference")} required>
            <TextInput value={docRef} onChange={(e) => setDocRef(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </PageLayout>
  );
}
