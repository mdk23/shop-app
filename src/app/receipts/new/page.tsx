"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Field,
  TextInput,
  Textarea,
  Select,
  Table,
  Th,
  Td,
  Badge,
  Spinner,
} from "@/components/ui";
import { VariantPicker, type PickedVariant } from "@/components/VariantPicker";
import { useToken, useResolvedBranch, useCurrency } from "@/lib/useShop";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Line = { productVariantId: Id<"productVariants">; label: string; quantity: number; unitCost: number; outstanding?: number };

export default function NewReceiptPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const router = useRouter();
  const branch = useResolvedBranch();
  const openOrders = useQuery(api.purchaseReceipts.openOrders, {});
  const suppliers = useQuery(api.suppliers.list, {});
  const create = useMutation(api.purchaseReceipts.create);
  const inspect = useMutation(api.receiptInspections.create);

  const [source, setSource] = useState<string>("");
  const [supplierId, setSupplierId] = useState<string>("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [result, setResult] = useState<"OK" | "DISCREPANCY">("OK");
  const [inspectionNotes, setInspectionNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const pickSource = (value: string) => {
    setSource(value);
    setLines([]);
    const found = openOrders?.find((o) => o._id === value);
    if (found) {
      setLines(
        found.lines.map((l) => ({
          productVariantId: l.productVariantId!,
          label: `${l.productName} ${l.variantLabel}`,
          quantity: l.outstanding,
          unitCost: l.unitCost,
          outstanding: l.outstanding,
        }))
      );
    }
  };

  const addUnannounced = (v: PickedVariant) =>
    setLines((prev) =>
      prev.some((l) => l.productVariantId === v.variantId)
        ? prev
        : [...prev, { productVariantId: v.variantId, label: `${v.label} (${v.sku})`, quantity: 1, unitCost: v.costPrice }]
    );

  const save = async () => {
    const received = lines.filter((l) => l.quantity > 0);
    if (received.length === 0) return toast.error(t("Enter at least one quantity."));
    if (!source && !supplierId) return toast.error(t("Choose an order or a supplier."));
    if (!source && !branch.branchId) return toast.error(t("Choose a branch."));
    if (result === "DISCREPANCY" && !inspectionNotes.trim()) {
      return toast.error(t("Describe the discrepancy."));
    }
    setBusy(true);
    try {
      const receiptId = await create({
        token,
        purchaseOrderId: source ? (source as Id<"purchaseOrders">) : undefined,
        supplierId: source ? undefined : (supplierId as Id<"suppliers">),
        branchId: source ? undefined : branch.branchId,
        deliveryNoteRef: deliveryNote || undefined,
        notes: notes || undefined,
        lines: received.map((l) => ({
          productVariantId: l.productVariantId,
          quantityReceived: l.quantity,
          unitCost: source ? undefined : l.unitCost,
        })),
      });
      await inspect({
        token,
        receiptId,
        result,
        notes: inspectionNotes || undefined,
      });
      toast.success(t("Receipt booked into stock"));
      router.push("/receipts");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("New receipt")} subtitle={t("Book a delivery into stock")}>
      <Button variant="ghost" className="mb-3" onClick={() => router.push("/receipts")}>
        <ArrowLeft className="w-3.5 h-3.5" /> {t("Back")}
      </Button>

      {openOrders === undefined ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <Card className="p-4 space-y-3">
              <Field label={t("Where did the goods come from?")} required>
                <Select value={source} onChange={(e) => pickSource(e.target.value)}>
                  <option value="">{t("Goods without an order")}</option>
                  {openOrders.map((o) => (
                    <option key={o._id} value={o._id}>
                      {o.orderCode} · {o.supplierName}
                    </option>
                  ))}
                </Select>
              </Field>
              {!source && (
                <>
                  <Field label={t("Supplier")} required>
                    <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                      <option value="">{t("Choose a supplier")}</option>
                      {(suppliers ?? []).map((s) => (
                        <option key={s._id} value={s._id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={t("Add item")}>
                    <VariantPicker placeholder={t("Search product or SKU")} onPick={addUnannounced} />
                  </Field>
                </>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label={t("Delivery note")}>
                  <TextInput value={deliveryNote} onChange={(e) => setDeliveryNote(e.target.value)} />
                </Field>
                <Field label={t("Notes")}>
                  <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
              </div>
            </Card>

            <Card>
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Item")}</Th>
                    <Th className="text-right">{t("Outstanding")}</Th>
                    <Th className="text-right">{t("Received now")}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {lines.length === 0 && (
                    <tr>
                      <Td colSpan={4} className="text-center text-on-surface-variant">
                        {t("No lines yet")}
                      </Td>
                    </tr>
                  )}
                  {lines.map((l, idx) => {
                    const over = l.outstanding !== undefined && l.quantity > l.outstanding;
                    return (
                      <tr key={l.productVariantId}>
                        <Td>{l.label}</Td>
                        <Td className="text-right">{l.outstanding ?? "—"}</Td>
                        <Td className="text-right">
                          <TextInput
                            type="number"
                            min={0}
                            value={l.quantity}
                            onChange={(e) =>
                              setLines((prev) =>
                                prev.map((x, i) =>
                                  i === idx ? { ...x, quantity: Math.max(0, Number(e.target.value) || 0) } : x
                                )
                              )
                            }
                            className="w-24 ml-auto"
                          />
                        </Td>
                        <Td>{over && <Badge tone="warning">{t("Over the order")}</Badge>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          </div>

          <Card className="p-4 space-y-3 h-fit">
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">
              {t("Check at origin")}
            </p>
            <Field label={t("Result")} required>
              <Select value={result} onChange={(e) => setResult(e.target.value as "OK" | "DISCREPANCY")}>
                <option value="OK">{t("Everything as ordered")}</option>
                <option value="DISCREPANCY">{t("Discrepancy")}</option>
              </Select>
            </Field>
            <Field label={t("Inspection notes")} hint={result === "DISCREPANCY" ? t("Required for a discrepancy") : undefined}>
              <Textarea value={inspectionNotes} onChange={(e) => setInspectionNotes(e.target.value)} />
            </Field>
            <p className="text-xs text-on-surface-variant">
              {t("Total at cost")}:{" "}
              {fmt(lines.reduce((s, l) => s + l.quantity * l.unitCost, 0))}
            </p>
            <Button className="w-full" loading={busy} onClick={save}>
              {t("Book receipt")}
            </Button>
          </Card>
        </div>
      )}
    </PageLayout>
  );
}
