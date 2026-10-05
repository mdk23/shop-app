"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Textarea, Select, Modal, Badge, Spinner, Toolbar } from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { CustomerSearchPanel } from "@/components/pos/CustomerSearchPanel";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Stage = "OPEN" | "PROCEEDING" | "CONVERTED" | "NOT_PROCEEDING";
type Reason = "PRICE" | "SIZE" | "COLOR" | "STOCK" | "OTHER";

const COLUMNS: { stage: Stage; label: string }[] = [
  { stage: "OPEN", label: "Open" },
  { stage: "PROCEEDING", label: "Proceeding" },
  { stage: "CONVERTED", label: "Converted" },
  { stage: "NOT_PROCEEDING", label: "Did not proceed" },
];

const REASONS: { value: Reason; label: string }[] = [
  { value: "PRICE", label: "Price too high" },
  { value: "SIZE", label: "No size" },
  { value: "COLOR", label: "No color" },
  { value: "STOCK", label: "Not in stock" },
  { value: "OTHER", label: "Other" },
];

export default function OpportunitiesPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const opportunities = useQuery(api.opportunities.list, {});
  const create = useMutation(api.opportunities.create);
  const setStage = useMutation(api.opportunities.setStage);
  const markConverted = useMutation(api.opportunities.markConverted);

  const [creating, setCreating] = useState(false);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [description, setDescription] = useState("");
  const [estimate, setEstimate] = useState("");
  const [conditions, setConditions] = useState("");
  const [busy, setBusy] = useState(false);

  const [lostId, setLostId] = useState<Id<"opportunities"> | null>(null);
  const [lostReason, setLostReason] = useState<Reason>("PRICE");
  const [convertId, setConvertId] = useState<Id<"opportunities"> | null>(null);
  const [orderId, setOrderId] = useState("");

  const convertCustomer = opportunities?.find((o) => o._id === convertId)?.customerId;
  const openOrders = useQuery(
    api.customerOrders.list,
    convertId ? { status: "OPEN" } : "skip"
  );
  const candidateOrders = (openOrders ?? []).filter(
    (o) => !convertCustomer || o.customerId === convertCustomer
  );

  const resetCreate = () => {
    setCreating(false);
    setCustomerId(null);
    setDescription("");
    setEstimate("");
    setConditions("");
  };

  const saveNew = async () => {
    if (!description.trim()) return toast.error(t("Describe the interest."));
    setBusy(true);
    try {
      await create({
        token,
        description,
        customerId: customerId ?? undefined,
        estimatedValue: estimate ? Number(estimate) : undefined,
        conditions: conditions || undefined,
      });
      toast.success(t("Opportunity added"));
      resetCreate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const move = async (id: Id<"opportunities">, stage: "PROCEEDING" | "OPEN") => {
    try {
      await setStage({ token, id, stage });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const confirmLost = async () => {
    if (!lostId) return;
    try {
      await setStage({ token, id: lostId, stage: "NOT_PROCEEDING", reasonNotProceeding: lostReason });
      toast.success(t("Recorded"));
      setLostId(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const confirmConvert = async () => {
    if (!convertId || !orderId) return;
    try {
      await markConverted({ token, id: convertId, orderId: orderId as Id<"customerOrders"> });
      toast.success(t("Opportunity converted"));
      setConvertId(null);
      setOrderId("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  return (
    <PageLayout title={t("Opportunities")} subtitle={t("Interest that may become a sale")}>
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New opportunity")}
        </Button>
      </Toolbar>

      {opportunities === undefined ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {COLUMNS.map((col) => {
            const items = opportunities.filter((o) => o.stage === col.stage);
            return (
              <div key={col.stage} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    {t(col.label)}
                  </p>
                  <Badge tone="neutral">{items.length}</Badge>
                </div>
                {items.length === 0 && (
                  <p className="text-xs text-on-surface-variant px-1">{t("Nothing here yet")}</p>
                )}
                {items.slice(0, 15).map((o) => (
                  <Card key={o._id} className="p-3 space-y-2">
                    <p className="font-bold text-sm">{o.description}</p>
                    <p className="text-xs text-on-surface-variant">
                      {o.customerName ?? t("Walk-in")}
                      {o.estimatedValue !== undefined ? ` · ${fmt(o.estimatedValue)}` : ""}
                    </p>
                    {o.conditions && <p className="text-xs">{o.conditions}</p>}
                    {o.reasonNotProceeding && (
                      <p className="text-xs text-error">
                        {t(REASONS.find((r) => r.value === o.reasonNotProceeding)?.label ?? "Other")}
                      </p>
                    )}
                    {(o.stage === "OPEN" || o.stage === "PROCEEDING") && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {o.stage === "OPEN" && (
                          <Button size="sm" variant="secondary" onClick={() => move(o._id, "PROCEEDING")}>
                            {t("Proceed")}
                          </Button>
                        )}
                        {o.stage === "PROCEEDING" && (
                          <Button size="sm" onClick={() => setConvertId(o._id)}>
                            {t("Convert to order")}
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setLostId(o._id)}>
                          {t("Did not proceed")}
                        </Button>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        onClose={resetCreate}
        title={t("New opportunity")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={resetCreate}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveNew} loading={busy}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("What is the customer interested in?")} required>
            <TextInput value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Field label={t("Customer")}>
            <Button variant="secondary" onClick={() => setPickingCustomer(true)}>
              {customerId ? t("Customer chosen") : t("Search customer")}
            </Button>
          </Field>
          <Field label={t("Estimated value")}>
            <TextInput type="number" value={estimate} onChange={(e) => setEstimate(e.target.value)} />
          </Field>
          <Field label={t("Conditions")}>
            <Textarea value={conditions} onChange={(e) => setConditions(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!lostId}
        onClose={() => setLostId(null)}
        title={t("Why did it not go ahead?")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setLostId(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={confirmLost}>{t("Save")}</Button>
          </>
        }
      >
        <Field label={t("Reason")} required>
          <Select value={lostReason} onChange={(e) => setLostReason(e.target.value as Reason)}>
            {REASONS.map((r) => (
              <option key={r.value} value={r.value}>
                {t(r.label)}
              </option>
            ))}
          </Select>
        </Field>
      </Modal>

      <Modal
        open={!!convertId}
        onClose={() => setConvertId(null)}
        title={t("Convert to order")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConvertId(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={confirmConvert} disabled={!orderId}>
              {t("Convert")}
            </Button>
          </>
        }
      >
        {candidateOrders.length === 0 ? (
          <p className="text-sm">
            {t("No open order for this customer. Create one in Customer Orders first.")}
          </p>
        ) : (
          <Field label={t("Order")} required>
            <Select value={orderId} onChange={(e) => setOrderId(e.target.value)}>
              <option value="">{t("Choose an order")}</option>
              {candidateOrders.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.orderNumber} · {o.customerName}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Modal>

      <CustomerSearchPanel
        open={pickingCustomer}
        onClose={() => setPickingCustomer(false)}
        onSelect={(id) => setCustomerId(id)}
      />
    </PageLayout>
  );
}
