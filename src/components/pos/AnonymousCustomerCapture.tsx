"use client";

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Field, TextInput } from "@/components/ui";
import { TIER_LABEL } from "@/lib/badgeTones";
import { useTranslation } from "@/contexts/LanguageContext";

export type CaptureResult =
  | { kind: "none" }
  | { kind: "matched"; customerId: Id<"customers"> }
  | { kind: "new"; phone1: string };

/**
 * Optional phone field shown on the payment step of an anonymous sale only
 * (never rendered when a customer is already selected in the rail). Not
 * autofocused, so it never steals focus from the cash-amount input — the
 * keyboard flow for a sale with this left empty is unchanged.
 */
export function AnonymousCustomerCapture({
  onChange,
  onWhatsappOptInChange,
}: {
  onChange: (result: CaptureResult) => void;
  onWhatsappOptInChange: (optIn: boolean) => void;
}) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState(false);
  const digits = phone.replace(/\D/g, "");
  const eligible = digits.length >= 7;

  const match = useQuery(api.customers.findByPhone, eligible ? { phone } : "skip");

  useEffect(() => {
    if (!eligible) {
      onChange({ kind: "none" });
    } else if (match === null) {
      onChange({ kind: "new", phone1: digits });
    } else if (match) {
      onChange({ kind: "matched", customerId: match._id });
    }
    // `match === undefined` (still loading) intentionally reports nothing —
    // the previous result stays in effect until this resolves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligible, digits, match]);

  return (
    <div className="mt-3 pt-3 border-t border-outline/40 space-y-2">
      <Field label={t("Customer phone (optional)")}>
        <TextInput
          inputMode="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="84 123 4567"
        />
      </Field>
      {eligible && match && (
        <p className="text-xs text-success">
          {t("Customer: {name} · {tier}", { name: match.name, tier: t(TIER_LABEL[match.tier]) })}
        </p>
      )}
      {eligible && match === null && (
        <p className="text-xs text-on-surface-variant">
          {t("New customer will be created with this number.")}
        </p>
      )}
      {eligible && (
        <label className="flex items-center gap-2 text-xs font-bold cursor-pointer">
          <input
            type="checkbox"
            checked={whatsapp}
            onChange={(e) => {
              setWhatsapp(e.target.checked);
              onWhatsappOptInChange(e.target.checked);
            }}
          />
          {t("Send receipt via WhatsApp")}
        </label>
      )}
    </div>
  );
}
