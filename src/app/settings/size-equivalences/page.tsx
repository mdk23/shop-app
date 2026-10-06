"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Select, Modal, Table, Th, Td, EmptyState, Spinner, Toolbar } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export default function SizeEquivalencesPage() {
  const { t } = useTranslation();
  const token = useToken();
  const rows = useQuery(api.followUps.listSizeEquivalences, { token });
  const sizes = useQuery(api.sizes.list, {});
  const create = useMutation(api.followUps.createSizeEquivalence);

  const [open, setOpen] = useState(false);
  const [fromSizeId, setFromSizeId] = useState("");
  const [toSizeId, setToSizeId] = useState("");
  const [certainty, setCertainty] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setOpen(false);
    setFromSizeId("");
    setToSizeId("");
    setCertainty("");
  };

  const save = async () => {
    setBusy(true);
    try {
      await create({
        token,
        fromSizeId: fromSizeId as Id<"sizes">,
        toSizeId: toSizeId as Id<"sizes">,
        certainty,
      });
      toast.success(t("Equivalence saved"));
      reset();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout
      title={t("Size equivalences")}
      subtitle={t("Which sizes match across scales, so a customer's size can be offered in another system")}
    >
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={() => setOpen(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New equivalence")}
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t("No equivalences yet")}
            message={t("Link a size to the equivalent size on another scale, and say how sure the match is.")}
            action={<Button onClick={() => setOpen(true)}>{t("New equivalence")}</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t("From")}</Th>
                  <Th>{t("To")}</Th>
                  <Th>{t("Certainty")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="hover:bg-surface-container-low">
                    <Td className="font-bold">{r.fromName}</Td>
                    <Td>{r.toName}</Td>
                    <Td>{r.certainty}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      <Modal
        open={open}
        onClose={reset}
        title={t("New equivalence")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={reset}>
              {t("Cancel")}
            </Button>
            <Button
              onClick={save}
              loading={busy}
              disabled={!fromSizeId || !toSizeId || fromSizeId === toSizeId || !certainty.trim()}
            >
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("From")} required>
            <Select value={fromSizeId} onChange={(e) => setFromSizeId(e.target.value)}>
              <option value="">{t("Choose")}</option>
              {(sizes ?? []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("To")} required>
            <Select value={toSizeId} onChange={(e) => setToSizeId(e.target.value)}>
              <option value="">{t("Choose")}</option>
              {(sizes ?? []).map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Certainty")} required>
            <TextInput
              value={certainty}
              onChange={(e) => setCertainty(e.target.value)}
              placeholder={t("e.g. exact, approximate")}
            />
          </Field>
        </div>
      </Modal>
    </PageLayout>
  );
}
