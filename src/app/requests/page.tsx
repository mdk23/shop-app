"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Badge,
  EmptyState,
  Spinner,
  Table,
  Th,
  Td,
  Toolbar,
  PagedFooter,
  Modal,
  Field,
  TextInput,
  Select,
} from "@/components/ui";
import { LostDemandModal } from "@/components/demands/LostDemandModal";
import { useToken } from "@/lib/useShop";
import { formatDate, cn } from "@/lib/utils";
import { useClientPage } from "@/lib/pagination";
import {
  DEMAND_REASONS,
  DEMAND_REASON_LABEL,
  DEMAND_STAGE_LABEL,
  DEMAND_STAGE_TONE,
  isClosedStage,
  type DemandReason,
  type DemandStage,
} from "@/lib/demands";
import { toast } from "sonner";
import { useTranslation } from "@/contexts/LanguageContext";

type Outcome = "DISPONIVEL" | "ALTERNATIVA" | "PROPOSTA_FUTURA" | "SEM_SOLUCAO_ADEQUADA";
type OfferLine = { description: string; price: string };

const OUTCOMES: { value: Outcome; label: string }[] = [
  { value: "DISPONIVEL", label: "Available now" },
  { value: "ALTERNATIVA", label: "Alternative offered" },
  { value: "PROPOSTA_FUTURA", label: "Future proposal" },
  { value: "SEM_SOLUCAO_ADEQUADA", label: "Nothing suitable" },
];

const STAGES: ("ALL" | DemandStage)[] = ["ALL", "OPEN", "PROCEEDING", "CONVERTED", "FULFILLED", "LOST"];

export default function RequestsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const [stage, setStage] = useState<"ALL" | DemandStage>("OPEN");
  const [reason, setReason] = useState<DemandReason | "ALL">("ALL");

  const demands = useQuery(api.demands.list, {
    stage: stage === "ALL" ? undefined : stage,
    reason: reason === "ALL" ? undefined : reason,
  });
  const counts = useQuery(api.demands.countByReason, {});
  const sizes = useQuery(api.sizes.list, {});
  const colors = useQuery(api.colors.list, {});
  const changeStage = useMutation(api.demands.setStage);
  const respond = useMutation(api.demandResponses.record);
  const page = useClientPage(demands ?? []);

  const [responding, setResponding] = useState<Id<"demands"> | null>(null);
  const [outcome, setOutcome] = useState<Outcome>("DISPONIVEL");
  const [offers, setOffers] = useState<OfferLine[]>([{ description: "", price: "" }]);
  const [busy, setBusy] = useState(false);
  const [losing, setLosing] = useState<Doc<"demands"> | null>(null);

  const closeResponse = () => {
    setResponding(null);
    setOutcome("DISPONIVEL");
    setOffers([{ description: "", price: "" }]);
  };

  const saveResponse = async () => {
    if (!responding) return;
    setBusy(true);
    try {
      const items = offers
        .filter((o) => o.description.trim())
        .map((o) => ({ description: o.description, price: o.price ? Number(o.price) : undefined }));
      await respond({ token, demandId: responding, outcome, items });
      toast.success(t("Response recorded"));
      closeResponse();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const sizeName = (id?: string) => (sizes ?? []).find((s) => s._id === id)?.name ?? "—";
  const colorName = (id?: string) => (colors ?? []).find((c) => c._id === id)?.name ?? "—";

  const move = async (id: Id<"demands">, next: "PROCEEDING" | "FULFILLED") => {
    try {
      await changeStage({ token, id, stage: next });
      toast.success(next === "PROCEEDING" ? t("Moved to opportunities") : t("Request updated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const total = Object.values(counts ?? {}).reduce((s, n) => s + n, 0);

  const actions = (r: Doc<"demands">) =>
    !isClosedStage(r.stage) && (
      <>
        <Button size="sm" variant="secondary" onClick={() => setResponding(r._id)}>
          {t("Respond")}
        </Button>
        {r.stage === "OPEN" && (
          <Button size="sm" variant="secondary" onClick={() => move(r._id, "PROCEEDING")}>
            {t("Proceed")}
          </Button>
        )}
        <Button size="sm" variant="secondary" onClick={() => move(r._id, "FULFILLED")}>
          {t("Mark fulfilled")}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setLosing(r)}>
          {t("Lost")}
        </Button>
      </>
    );

  return (
    <PageLayout title={t("Requests")} subtitle={t("What customers asked for and did not get")}>
      <Card className="p-4 mb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-3">
          {t("Why sales were lost")} · {total}
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {DEMAND_REASONS.map((r) => (
            <button
              key={r.value}
              onClick={() => setReason(reason === r.value ? "ALL" : r.value)}
              className={cn(
                "p-3 rounded-xl border text-left transition-colors",
                reason === r.value
                  ? "border-primary bg-primary/10"
                  : "border-outline bg-surface-container-low hover:border-primary/50"
              )}
            >
              <p className="text-2xl font-black">{counts?.[r.value] ?? 0}</p>
              <p className="text-xs text-on-surface-variant">{t(r.label)}</p>
            </button>
          ))}
        </div>
      </Card>

      <Toolbar>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.map((s) => (
            <button
              key={s}
              onClick={() => setStage(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
                stage === s
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-low text-on-surface-variant border-outline"
              )}
            >
              {s === "ALL" ? t("All") : t(DEMAND_STAGE_LABEL[s])}
            </button>
          ))}
        </div>
      </Toolbar>

      <Card>
        {demands === undefined ? (
          <Spinner />
        ) : demands.length === 0 ? (
          <EmptyState
            title={t("No requests here")}
            message={t("Requests are recorded from a customer's profile when the shop cannot meet them.")}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Request")}</Th>
                    <Th>{t("Customer")}</Th>
                    <Th>{t("Size")}</Th>
                    <Th>{t("Color")}</Th>
                    <Th>{t("Qty")}</Th>
                    <Th>{t("Budget")}</Th>
                    <Th>{t("Reason")}</Th>
                    <Th>{t("Status")}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((r) => (
                    <tr key={r._id} className="hover:bg-surface-container-low">
                      <Td className="font-bold">{r.description}</Td>
                      <Td>{r.customerName ?? t("Walk-in")}</Td>
                      <Td>{sizeName(r.sizeId)}</Td>
                      <Td>{colorName(r.colorId)}</Td>
                      <Td>{r.quantity ?? "—"}</Td>
                      <Td>{r.maxPrice ?? "—"}</Td>
                      <Td>{r.reason ? t(DEMAND_REASON_LABEL[r.reason]) : "—"}</Td>
                      <Td>
                        <Badge tone={DEMAND_STAGE_TONE[r.stage]}>{t(DEMAND_STAGE_LABEL[r.stage])}</Badge>
                      </Td>
                      <Td>
                        <div className="flex gap-1">{actions(r)}</div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="md:hidden space-y-2 p-2">
              {page.rows.map((r) => (
                <div key={r._id} className="p-3 rounded-xl border border-outline bg-surface-container-low space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-sm">{r.description}</span>
                    <Badge tone={DEMAND_STAGE_TONE[r.stage]}>{t(DEMAND_STAGE_LABEL[r.stage])}</Badge>
                  </div>
                  <p className="text-xs text-on-surface-variant">
                    {r.customerName ?? t("Walk-in")} · {formatDate(r.createdAt)}
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">{actions(r)}</div>
                </div>
              ))}
            </div>
            <PagedFooter paged={page} loading={demands === undefined} />
          </>
        )}
      </Card>

      <Modal
        open={responding !== null}
        onClose={closeResponse}
        title={t("Respond to request")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeResponse}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveResponse} loading={busy}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("What did we answer?")} required>
            <Select value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
              {OUTCOMES.map((o) => (
                <option key={o.value} value={o.value}>
                  {t(o.label)}
                </option>
              ))}
            </Select>
          </Field>
          {outcome !== "SEM_SOLUCAO_ADEQUADA" && (
            <Field label={t("What was offered")} required>
              <div className="space-y-2">
                {offers.map((o, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TextInput
                      value={o.description}
                      onChange={(e) =>
                        setOffers(offers.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))
                      }
                      placeholder={t("e.g. Same tee in black, size M")}
                      className="flex-1"
                    />
                    <TextInput
                      type="number"
                      min={0}
                      value={o.price}
                      onChange={(e) =>
                        setOffers(offers.map((x, j) => (j === i ? { ...x, price: e.target.value } : x)))
                      }
                      placeholder={t("Price")}
                      className="w-24"
                    />
                  </div>
                ))}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setOffers([...offers, { description: "", price: "" }])}
                >
                  {t("Add another option")}
                </Button>
              </div>
            </Field>
          )}
        </div>
      </Modal>

      <LostDemandModal demand={losing} onClose={() => setLosing(null)} />
    </PageLayout>
  );
}
