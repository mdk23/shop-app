"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Textarea, Select, Modal, Badge, Spinner, Toolbar } from "@/components/ui";
import { LostDemandModal } from "@/components/demands/LostDemandModal";
import { useToken, useCurrency } from "@/lib/useShop";
import { DEMAND_REASON_LABEL, DEMAND_STAGE_LABEL, type DemandStage } from "@/lib/demands";
import { CustomerSearchPanel } from "@/components/pos/CustomerSearchPanel";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

// The board shows demands that proceeded (see `demands.listOpportunities`).
const COLUMNS: DemandStage[] = ["PROCEEDING", "CONVERTED", "FULFILLED", "LOST"];

export default function OpportunitiesPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const opportunities = useQuery(api.demands.listOpportunities, {});
  const create = useMutation(api.demands.create);
  const markConverted = useMutation(api.demands.markConverted);

  const [creating, setCreating] = useState(false);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [description, setDescription] = useState("");
  const [estimate, setEstimate] = useState("");
  const [conditions, setConditions] = useState("");
  const [busy, setBusy] = useState(false);

  const [losing, setLosing] = useState<Doc<"demands"> | null>(null);
  const [convertId, setConvertId] = useState<Id<"demands"> | null>(null);
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
        proceeding: true,
      });
      toast.success(t("Opportunity added"));
      resetCreate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
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
          {COLUMNS.map((stage) => {
            const items = opportunities.filter((o) => o.stage === stage);
            return (
              <div key={stage} className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
                    {t(DEMAND_STAGE_LABEL[stage])}
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
                    {o.stage === "LOST" && o.reason && (
                      <p className="text-xs text-error">{t(DEMAND_REASON_LABEL[o.reason])}</p>
                    )}
                    {o.stage === "PROCEEDING" && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Button size="sm" onClick={() => setConvertId(o._id)}>
                          {t("Convert to order")}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setLosing(o)}>
                          {t("Lost")}
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

      <LostDemandModal demand={losing} onClose={() => setLosing(null)} />

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
