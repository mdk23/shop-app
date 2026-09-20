"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Card, StatCard, Badge, Field, TextInput, Textarea, Button } from "@/components/ui";
import { TIER_TONE, TIER_LABEL } from "@/lib/badgeTones";
import { formatDate } from "@/lib/utils";
import { useToken, useCurrency } from "@/lib/useShop";
import { toast } from "sonner";
import type { PosContext } from "@/components/pos/posContext";
import { useTranslation } from "@/contexts/LanguageContext";

export function FichaResumo({ context }: { context: PosContext }) {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const { customer, money } = context;

  const [notes, setNotes] = useState(customer?.notes ?? "");
  const [notesDirty, setNotesDirty] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);
  const updateProfile = useMutation(api.customers.updateProfile);

  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [grantBusy, setGrantBusy] = useState(false);
  const grant = useMutation(api.customerCredits.grant);

  if (!customer) return null;

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateProfile({ token, id: customer._id, notes });
      toast.success(t("Notes saved"));
      setNotesDirty(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setSavingNotes(false);
    }
  };

  const doGrant = async () => {
    if (!amount || !reason.trim()) return toast.error(t("Enter the amount and reason."));
    setGrantBusy(true);
    try {
      await grant({ token, customerId: customer._id, amount: Number(amount), notes: reason });
      toast.success(t("Balance updated"));
      setAmount("");
      setReason("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setGrantBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Badge tone={TIER_TONE[customer.tier]}>{t(TIER_LABEL[customer.tier])}</Badge>
        {customer.customerCode && (
          <span className="text-xs font-mono text-on-surface-variant">{customer.customerCode}</span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t("Total spent")} value={fmt(money.lifetimeSpend)} />
        <StatCard label={t("Purchases")} value={money.saleCount} />
        <StatCard label={t("Average ticket")} value={fmt(money.avgTicket)} />
        <StatCard
          label={t("Debt")}
          value={fmt(money.outstandingDebt)}
          accent={money.outstandingDebt > 0 ? "error" : "primary"}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs text-on-surface-variant">
        <div>
          {t("First purchase: {date}", {
            date: money.firstPurchase ? formatDate(money.firstPurchase) : "—",
          })}
        </div>
        <div>
          {t("Last purchase: {date}", {
            date: money.lastPurchase ? formatDate(money.lastPurchase) : "—",
          })}
        </div>
      </div>

      {!customer.isGeneric && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Derived from purchase history")}
          </p>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-on-surface-variant">{t("Purchase frequency")}: </span>
              <span className="font-bold">
                {money.purchaseFrequencyPerMonth > 0
                  ? t("{count}/month", {
                      count: money.purchaseFrequencyPerMonth.toFixed(1),
                    })
                  : "—"}
              </span>
            </div>
            <div>
              <span className="text-on-surface-variant">{t("Return rate")}: </span>
              <span className="font-bold">{money.returnRatePercent.toFixed(0)}%</span>
            </div>
            <div>
              <span className="text-on-surface-variant">{t("Top category")}: </span>
              <span className="font-bold">{customer.topCategoryName ?? "—"}</span>
            </div>
            <div>
              <span className="text-on-surface-variant">{t("Top color")}: </span>
              <span className="font-bold">{customer.topColorName ?? "—"}</span>
            </div>
          </div>
        </div>
      )}

      {!customer.isGeneric && (
        <Card className="p-3 bg-surface-container-low">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Adjust balance (credit)")}
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <Field label={t("Amount (+/-)")}>
              <TextInput
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-28"
              />
            </Field>
            <Field label={t("Reason")}>
              <TextInput value={reason} onChange={(e) => setReason(e.target.value)} className="w-56" />
            </Field>
            <Button onClick={doGrant} loading={grantBusy}>
              {t("Apply")}
            </Button>
          </div>
        </Card>
      )}

      <Field label={t("Notes")}>
        <Textarea
          value={notes}
          onChange={(e) => {
            setNotes(e.target.value);
            setNotesDirty(true);
          }}
        />
      </Field>
      {notesDirty && (
        <Button size="sm" onClick={saveNotes} loading={savingNotes}>
          {t("Save notes")}
        </Button>
      )}
    </div>
  );
}
