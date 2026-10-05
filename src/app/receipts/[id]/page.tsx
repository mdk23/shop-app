"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, TextInput, Textarea, Modal, Badge, Spinner, Table, Th, Td } from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Line = {
  _id: Id<"purchaseReceiptItems">;
  productVariantId: Id<"productVariants">;
  productName: string;
  variantLabel: string;
  quantityReceived: number;
  unitCost: number;
  discrepancy?: "OVER" | "UNANNOUNCED";
};

export default function ReceiptDetailPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const receiptId = params.id as Id<"purchaseReceipts">;
  const receipt = useQuery(api.purchaseReceipts.get, { id: receiptId });
  const inspections = useQuery(api.receiptInspections.listByReceipt, { receiptId });
  const createNc = useMutation(api.nonConformities.create);

  const [target, setTarget] = useState<Line | null>(null);
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);

  if (receipt === undefined) {
    return (
      <PageLayout title={t("Goods received")} subtitle="">
        <Spinner />
      </PageLayout>
    );
  }
  if (receipt === null) {
    return (
      <PageLayout title={t("Goods received")} subtitle="">
        <p className="text-sm">{t("Receipt not found.")}</p>
      </PageLayout>
    );
  }

  const logProblem = async () => {
    if (!target) return;
    if (!description.trim()) return toast.error(t("Describe the problem."));
    setBusy(true);
    try {
      await createNc({
        token,
        variantId: target.productVariantId,
        supplierId: receipt.supplierId ?? undefined,
        receiptItemId: target._id,
        description,
        affectedQuantity: Number(quantity),
      });
      toast.success(t("Non-conformity recorded"));
      setTarget(null);
      setDescription("");
      setQuantity("1");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={receipt.receiptNumber} subtitle={`${receipt.supplierName} · ${formatDate(receipt.receivedAt)}`}>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" onClick={() => router.push("/receipts")}>
          <ArrowLeft className="w-3.5 h-3.5" /> {t("Back")}
        </Button>
        <div className="flex items-center gap-2">
          {receipt.orderCode && receipt.purchaseOrderId && (
            <Link href={`/purchase-orders/${receipt.purchaseOrderId}`} className="text-xs underline">
              {receipt.orderCode}
            </Link>
          )}
          <Badge tone={receipt.purchaseOrderId ? "neutral" : "warning"}>
            {receipt.purchaseOrderId ? t("With order") : t("Without order")}
          </Badge>
        </div>
      </div>

      <Card className="mb-4">
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>{t("Item")}</Th>
                <Th className="text-right">{t("Received")}</Th>
                <Th className="text-right">{t("Unit cost")}</Th>
                <Th className="text-right">{t("Line total")}</Th>
                <Th>{t("Flag")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {(receipt.items as Line[]).map((line) => (
                <tr key={line._id}>
                  <Td>
                    {line.productName} <span className="text-on-surface-variant">{line.variantLabel}</span>
                  </Td>
                  <Td className="text-right font-bold">{line.quantityReceived}</Td>
                  <Td className="text-right">{fmt(line.unitCost)}</Td>
                  <Td className="text-right">{fmt(line.unitCost * line.quantityReceived)}</Td>
                  <Td>
                    {line.discrepancy ? (
                      <Badge tone="warning">{line.discrepancy === "OVER" ? t("Over the order") : t("Not on the order")}</Badge>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => setTarget(line)}>
                      <AlertTriangle className="w-3.5 h-3.5" /> {t("Log problem")}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Card className="p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          {t("Check at origin")}
        </p>
        {inspections === undefined ? (
          <Spinner />
        ) : inspections.length === 0 ? (
          <p className="text-xs text-on-surface-variant">{t("No check recorded")}</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {inspections.map((i) => (
              <li key={i._id}>
                <Badge tone={i.result === "OK" ? "success" : "warning"}>
                  {i.result === "OK" ? t("Everything as ordered") : t("Discrepancy")}
                </Badge>{" "}
                {formatDate(i.inspectedAt)} · {i.inspectedByUsername}
                {i.notes ? ` · ${i.notes}` : ""}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={!!target}
        onClose={() => setTarget(null)}
        title={t("Log problem")}
        subtitle={target ? `${target.productName} ${target.variantLabel}` : undefined}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setTarget(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={logProblem} loading={busy}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Quantity affected")} required>
            <TextInput type="number" min={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </Field>
          <Field label={t("What is wrong?")} required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </Modal>
    </PageLayout>
  );
}
