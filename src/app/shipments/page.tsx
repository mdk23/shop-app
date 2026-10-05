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
  Select,
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
  const shipments = useQuery(api.shipments.list, filter === "ALL" ? {} : { status: filter });
  const openOrders = useQuery(api.purchaseReceipts.openOrders, {});
  const create = useMutation(api.shipments.create);
  const arrive = useMutation(api.shipments.markArrived);
  const addCustoms = useMutation(api.shipments.addCustomsDocument);

  const [creating, setCreating] = useState(false);
  const [orderId, setOrderId] = useState("");
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  const [customsFor, setCustomsFor] = useState<Id<"shipments"> | null>(null);
  const [docType, setDocType] = useState("");
  const [docRef, setDocRef] = useState("");

  const closeCreate = () => {
    setCreating(false);
    setOrderId("");
    setCarrier("");
    setTracking("");
  };

  const saveNew = async () => {
    if (!carrier.trim()) return toast.error(t("Name the carrier."));
    setBusy(true);
    try {
      await create({
        token,
        purchaseOrderId: orderId ? (orderId as Id<"purchaseOrders">) : undefined,
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
                  <Th>{t("Order")}</Th>
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
                    <Td className="font-mono">{s.orderCode ?? "—"}</Td>
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
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveNew} loading={busy}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Order")}>
            <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">{t("Not linked to an order")}</option>
              {(openOrders ?? []).map((o) => (
                <option key={o._id} value={o._id}>
                  {o.orderCode} · {o.supplierName}
                </option>
              ))}
            </Select>
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
