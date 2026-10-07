"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Table, Th, Td, Badge, Spinner } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

export default function CommercialSettingsPage() {
  const { t } = useTranslation();
  return (
    <PageLayout title={t("Commercial settings")} subtitle={t("Payment terms and pricing policy")}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <PaymentTermsCard />
        <PricingPolicyCard />
      </div>
    </PageLayout>
  );
}

function PaymentTermsCard() {
  const { t } = useTranslation();
  const token = useToken();
  const terms = useQuery(api.commercialSettings.listPaymentTerms, {});
  const create = useMutation(api.commercialSettings.createPaymentTerm);
  const setActive = useMutation(api.commercialSettings.setPaymentTermActive);
  const [name, setName] = useState("");
  const [days, setDays] = useState("0");
  const [deposit, setDeposit] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await create({
        token,
        name,
        days: Number(days),
        depositPercent: deposit ? Number(deposit) : undefined,
      });
      toast.success(t("Payment term added"));
      setName("");
      setDays("0");
      setDeposit("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Payment terms")}</p>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <Field label={t("Name")}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. 30 dias")} />
        </Field>
        <Field label={t("Days")}>
          <TextInput type="number" min={0} value={days} onChange={(e) => setDays(e.target.value)} />
        </Field>
        <Field label={t("Deposit %")}>
          <TextInput type="number" min={0} max={100} value={deposit} onChange={(e) => setDeposit(e.target.value)} />
        </Field>
        <Button onClick={save} loading={busy} disabled={!name.trim()}>
          {t("Add")}
        </Button>
      </div>
      {terms === undefined ? (
        <Spinner />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>{t("Name")}</Th>
              <Th className="text-right">{t("Days")}</Th>
              <Th className="text-right">{t("Deposit %")}</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {terms.map((x) => (
              <tr key={x._id}>
                <Td>{x.name}</Td>
                <Td className="text-right">{x.days}</Td>
                <Td className="text-right">{x.depositPercent ?? "—"}</Td>
                <Td>
                  <button onClick={() => setActive({ token, id: x._id as Id<"paymentTerms">, active: !x.active })}>
                    <Badge tone={x.active ? "success" : "neutral"}>{x.active ? t("Active") : t("Inactive")}</Badge>
                  </button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

function PricingPolicyCard() {
  const { t } = useTranslation();
  const token = useToken();
  const policies = useQuery(api.commercialSettings.listPricingPolicies, {});
  const create = useMutation(api.commercialSettings.createPricingPolicy);
  const [name, setName] = useState("");
  const [margin, setMargin] = useState("");
  const [rounding, setRounding] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await create({
        token,
        name,
        marginPercent: margin ? Number(margin) : undefined,
        roundingRule: rounding || undefined,
      });
      toast.success(t("Pricing policy saved"));
      setName("");
      setMargin("");
      setRounding("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const current = policies?.find((p) => p.validTo === undefined);

  return (
    <Card className="p-4 space-y-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Pricing policy")}</p>
      {current && (
        <p className="text-sm">
          {t("Current")}: <span className="font-bold">{current.name}</span>
          {current.marginPercent !== undefined ? ` · ${t("margin")} ${current.marginPercent}%` : ""}
          {current.roundingRule ? ` · ${current.roundingRule}` : ""}
        </p>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end">
        <Field label={t("Name")}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label={t("Margin %")}>
          <TextInput type="number" min={0} value={margin} onChange={(e) => setMargin(e.target.value)} />
        </Field>
        <Field label={t("Rounding")}>
          <TextInput value={rounding} onChange={(e) => setRounding(e.target.value)} placeholder={t("e.g. to 5 MT")} />
        </Field>
        <Button onClick={save} loading={busy} disabled={!name.trim()}>
          {t("Save policy")}
        </Button>
      </div>
      <p className="text-xs text-on-surface-variant">{t("A new policy replaces the current one from today; the old one stays in history.")}</p>
    </Card>
  );
}
