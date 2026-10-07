"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Select, Badge, Spinner, Table, Th, Td } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate, cn } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

const TREATMENT_LABEL = {
  RETURN_TO_SUPPLIER: "Return to supplier",
  DISCOUNT: "Discount from supplier",
  ACCEPT_AS_IS: "Accept as is",
  DESTROY: "Destroy",
} as const;

type Tab = "EVALUATION" | "TERMS" | "QUALITY" | "SHIPMENTS";
const TABS: { key: Tab; label: string }[] = [
  { key: "EVALUATION", label: "Evaluation" },
  { key: "TERMS", label: "Relation & terms" },
  { key: "QUALITY", label: "Non-conformities" },
  { key: "SHIPMENTS", label: "Shipments" },
];

const TERM_TYPES = ["PRODUCTS", "PRICES", "DEADLINES", "RESPONSIBILITIES", "CUSTOMIZATION", "PAYMENT"] as const;
const TERM_LABEL: Record<(typeof TERM_TYPES)[number], string> = {
  PRODUCTS: "Products and models",
  PRICES: "Prices and conditions",
  DEADLINES: "Deadlines",
  RESPONSIBILITIES: "Responsibilities",
  CUSTOMIZATION: "Customization",
  PAYMENT: "Payment",
};

export default function SupplierDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const supplierId = params.id as Id<"suppliers">;
  const suppliers = useQuery(api.suppliers.list, {});
  const supplier = suppliers?.find((s) => s._id === supplierId);
  const [tab, setTab] = useState<Tab>("EVALUATION");

  if (suppliers === undefined) {
    return (
      <PageLayout title={t("Supplier")} subtitle="">
        <Spinner />
      </PageLayout>
    );
  }
  if (!supplier) {
    return (
      <PageLayout title={t("Supplier")} subtitle="">
        <p className="text-sm">{t("Supplier not found.")}</p>
      </PageLayout>
    );
  }

  return (
    <PageLayout title={supplier.name} subtitle={supplier.contactName ?? supplier.phone ?? ""}>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" onClick={() => router.push("/suppliers")}>
          <ArrowLeft className="w-3.5 h-3.5" /> {t("Back")}
        </Button>
        <Badge tone={supplier.status === "active" ? "success" : "neutral"}>
          {supplier.status === "active" ? t("Active") : t("Inactive")}
        </Badge>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {TABS.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
              tab === item.key
                ? "bg-primary text-on-primary border-primary"
                : "bg-surface-container-low text-on-surface-variant border-outline"
            )}
          >
            {t(item.label)}
          </button>
        ))}
      </div>

      {tab === "EVALUATION" && <EvaluationTab supplierId={supplierId} />}
      {tab === "TERMS" && <TermsTab supplierId={supplierId} />}
      {tab === "QUALITY" && <QualityTab supplierId={supplierId} />}
      {tab === "SHIPMENTS" && <ShipmentsTab supplierId={supplierId} />}
      <p className="mt-4 text-xs">
        <Link href="/purchase-orders" className="underline">
          {t("Purchase orders")}
        </Link>
      </p>
    </PageLayout>
  );
}

function EvaluationTab({ supplierId }: { supplierId: Id<"suppliers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const rows = useQuery(api.supplierEvaluations.listBySupplier, { supplierId });
  const create = useMutation(api.supplierEvaluations.create);
  const [quality, setQuality] = useState("4");
  const [punctuality, setPunctuality] = useState("90");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await create({
        token,
        supplierId,
        qualityScore: Number(quality),
        punctualityPercent: Number(punctuality),
        costScore: cost ? Number(cost) : undefined,
        notes: notes || undefined,
      });
      toast.success(t("Evaluation saved"));
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <Card className="p-4 space-y-3 h-fit">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("New evaluation")}</p>
        <Field label={t("Quality (1–5)")}>
          <Select value={quality} onChange={(e) => setQuality(e.target.value)}>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Punctuality (%)")}>
          <TextInput type="number" min={0} max={100} value={punctuality} onChange={(e) => setPunctuality(e.target.value)} />
        </Field>
        <Field label={t("Cost (1–5, optional)")}>
          <TextInput type="number" min={1} max={5} value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label={t("Notes")}>
          <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
        <Button className="w-full" loading={busy} onClick={save}>
          {t("Save evaluation")}
        </Button>
      </Card>
      <Card className="lg:col-span-2">
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <p className="p-4 text-sm text-on-surface-variant">{t("No evaluations yet")}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t("Date")}</Th>
                  <Th className="text-right">{t("Quality")}</Th>
                  <Th className="text-right">{t("Punctuality")}</Th>
                  <Th className="text-right">{t("Cost")}</Th>
                  <Th>{t("Notes")}</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id}>
                    <Td>{formatDate(r.evaluatedAt)}</Td>
                    <Td className="text-right font-bold">{r.qualityScore}</Td>
                    <Td className="text-right">{r.punctualityPercent}%</Td>
                    <Td className="text-right">{r.costScore ?? "—"}</Td>
                    <Td className="text-on-surface-variant">{r.notes ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}

function TermsTab({ supplierId }: { supplierId: Id<"suppliers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const relations = useQuery(api.supplyRelations.listBySupplier, { supplierId });
  const createRelation = useMutation(api.supplyRelations.createRelation);
  const addTerm = useMutation(api.supplyRelations.addTerm);
  const [termType, setTermType] = useState<(typeof TERM_TYPES)[number]>("DEADLINES");
  const [content, setContent] = useState("");
  const open = (relations ?? []).find((r) => r.endedAt === undefined);
  const activeRelation = open?._id ?? null;

  const start = async () => {
    try {
      await createRelation({ token, supplierId });
      toast.success(t("Relation opened"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const save = async () => {
    if (!activeRelation) return;
    try {
      await addTerm({ token, supplyRelationId: activeRelation, termType, content });
      toast.success(t("Term saved"));
      setContent("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  if (relations === undefined) return <Spinner />;

  return (
    <div className="space-y-4">
      {!open && (
        <Card className="p-4 flex items-center justify-between gap-3">
          <p className="text-sm">{t("No open relation with this supplier.")}</p>
          <Button onClick={start}>{t("Open relation")}</Button>
        </Card>
      )}
      {open && (
        <Card className="p-4 space-y-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Add term")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <Field label={t("Type")}>
              <Select value={termType} onChange={(e) => setTermType(e.target.value as (typeof TERM_TYPES)[number])}>
                {TERM_TYPES.map((x) => (
                  <option key={x} value={x}>
                    {t(TERM_LABEL[x])}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={t("Term")}>
                <TextInput value={content} onChange={(e) => setContent(e.target.value)} />
              </Field>
            </div>
          </div>
          <Button size="sm" onClick={save} disabled={!content.trim()}>
            {t("Save term")}
          </Button>
        </Card>
      )}
      {relations.map((rel) => (
        <Card key={rel._id} className="p-4 space-y-2">
          <p className="text-sm font-bold">
            {t("Since")} {formatDate(rel.startedAt)} {rel.endedAt ? `· ${t("Ended")} ${formatDate(rel.endedAt)}` : ""}
          </p>
          {rel.terms.filter((x) => x.validTo === undefined).length === 0 ? (
            <p className="text-xs text-on-surface-variant">{t("No terms yet")}</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {rel.terms
                .filter((x) => x.validTo === undefined)
                .map((x) => (
                  <li key={x._id}>
                    <span className="font-bold">{t(TERM_LABEL[x.termType as (typeof TERM_TYPES)[number]] ?? x.termType)}:</span>{" "}
                    {x.content}
                  </li>
                ))}
            </ul>
          )}
        </Card>
      ))}
    </div>
  );
}

function QualityTab({ supplierId }: { supplierId: Id<"suppliers"> }) {
  const { t } = useTranslation();
  const token = useToken();
  const rows = useQuery(api.qualityIssues.list, { token, supplierId });
  if (rows === undefined) return <Spinner />;
  if (rows.length === 0) return <p className="text-sm text-on-surface-variant">{t("No quality issues recorded")}</p>;
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>{t("Date")}</Th>
              <Th>{t("Item")}</Th>
              <Th className="text-right">{t("Qty")}</Th>
              <Th>{t("Problem")}</Th>
              <Th>{t("Treatment")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r._id}>
                <Td>{formatDate(r.recognizedAt)}</Td>
                <Td>{r.items.map((i) => i.label).join(" · ")}</Td>
                <Td className="text-right">{r.affectedQuantity}</Td>
                <Td>{r.description}</Td>
                <Td>{r.treatment ? t(TREATMENT_LABEL[r.treatment]) : <Badge tone="warning">{t("Open")}</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}

function ShipmentsTab({ supplierId }: { supplierId: Id<"suppliers"> }) {
  const { t } = useTranslation();
  const rows = useQuery(api.shipments.list, { supplierId });
  if (rows === undefined) return <Spinner />;
  if (rows.length === 0) return <p className="text-sm text-on-surface-variant">{t("No shipments yet")}</p>;
  return (
    <Card>
      <div className="overflow-x-auto">
        <Table>
          <thead>
            <tr>
              <Th>{t("Carrier")}</Th>
              <Th>{t("Tracking")}</Th>
              <Th>{t("Order")}</Th>
              <Th>{t("Status")}</Th>
              <Th>{t("Customs documents")}</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s._id}>
                <Td>{s.carrier}</Td>
                <Td className="font-mono">{s.trackingReference ?? "—"}</Td>
                <Td className="font-mono">{s.orderCode ?? "—"}</Td>
                <Td>
                  <Badge tone={s.status === "ARRIVED" ? "success" : "info"}>
                    {s.status === "ARRIVED" ? t("Arrived") : t("In transit")}
                  </Badge>
                </Td>
                <Td>{s.customs.map((c) => `${c.documentType} ${c.reference}`).join(", ") || "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </Card>
  );
}
