"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Select, Table, Th, Td, Badge, EmptyState, Spinner } from "@/components/ui";
import { useToken, useResolvedBranch } from "@/lib/useShop";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

const TYPES = [
  { value: "CENTRAL", label: "Central warehouse" },
  { value: "STORE", label: "Store" },
  { value: "CUSTODY", label: "Custody" },
] as const;

export default function LocationsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const branch = useResolvedBranch();
  const [pick, setPick] = useState("");
  const branchId = (pick || branch.branchId) as Id<"branches"> | undefined;
  const locations = useQuery(api.locations.listByBranch, branchId ? { branchId } : "skip");
  const create = useMutation(api.locations.create);

  const [name, setName] = useState("");
  const [type, setType] = useState<(typeof TYPES)[number]["value"]>("STORE");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!branchId) return toast.error(t("Choose a branch."));
    setBusy(true);
    try {
      await create({ token, branchId, name, locationType: type });
      toast.success(t("Location added"));
      setName("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Locations")} subtitle={t("Where stock sits inside each branch")}>
      <Card className="p-4 mb-4 grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
        <Field label={t("Branch")}>
          <Select value={pick || branchId || ""} onChange={(e) => setPick(e.target.value)}>
            {branch.branches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Name")}>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. Armazém")} />
        </Field>
        <Field label={t("Type")}>
          <Select value={type} onChange={(e) => setType(e.target.value as (typeof TYPES)[number]["value"])}>
            {TYPES.map((x) => (
              <option key={x.value} value={x.value}>
                {t(x.label)}
              </option>
            ))}
          </Select>
        </Field>
        <Button onClick={save} loading={busy} disabled={!name.trim()}>
          {t("Add location")}
        </Button>
      </Card>

      <Card>
        {locations === undefined ? (
          <Spinner />
        ) : locations.length === 0 ? (
          <EmptyState title={t("No locations yet")} message={t("Add the central warehouse and each store.")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t("Name")}</Th>
                  <Th>{t("Type")}</Th>
                </tr>
              </thead>
              <tbody>
                {locations.map((l) => (
                  <tr key={l._id}>
                    <Td className="font-bold">{l.name}</Td>
                    <Td>
                      <Badge tone="neutral">
                        {t(TYPES.find((x) => x.value === l.locationType)?.label ?? "Store")}
                      </Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
