"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Button, Field, TextInput, Badge, Spinner } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

/** The business relations this customer belongs to, and who else is on each one. */
export function FichaRelacao({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const relations = useQuery(api.businessRelations.listByCustomer, { customerId: customerId });
  const open = useMutation(api.businessRelations.open);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    try {
      await open({ token, customerId: customerId, role });
      toast.success(t("Relation opened"));
      setRole("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-4 grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
        <Field label={t("Role in the relation")} hint={t("e.g. Buyer for the school team")}>
          <TextInput value={role} onChange={(e) => setRole(e.target.value)} />
        </Field>
        <div className="sm:col-span-2">
          <Button onClick={start} loading={busy} disabled={!role.trim()}>
            {t("Open relation")}
          </Button>
        </div>
      </Card>

      {relations === undefined ? (
        <Spinner />
      ) : relations.length === 0 ? (
        <p className="text-xs text-on-surface-variant">{t("No relations yet")}</p>
      ) : (
        relations.map((r) => (
          <Card key={r.relationId} className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">
                {r.role} · {r.startedAt ? formatDate(r.startedAt) : "—"}
              </p>
              {r.endedAt ? <Badge tone="neutral">{t("Ended")}</Badge> : <Badge tone="success">{t("Open")}</Badge>}
            </div>
            <ul className="space-y-1 text-sm">
              {r.people.map((p) => (
                <li key={p._id} className={p.isThisCustomer ? "font-bold" : ""}>
                  {p.name} <span className="text-on-surface-variant">· {p.role}</span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
