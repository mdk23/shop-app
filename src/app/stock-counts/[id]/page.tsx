"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Badge, Spinner, Table, Th, Td, TextInput } from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export default function StockCountPage() {
  const { t } = useTranslation();
  const token = useToken();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const countId = params.id as Id<"stockCounts">;
  const count = useQuery(api.stockCounts.get, { id: countId });
  const inventory = useQuery(
    api.stock.listInventory,
    count ? { token, branchId: count.branchId } : "skip"
  );
  const record = useMutation(api.stockCounts.recordCounts);
  const close = useMutation(api.stockCounts.close);

  const [entered, setEntered] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  if (count === undefined || inventory === undefined) {
    return (
      <PageLayout title={t("Stock count")} subtitle="">
        <Spinner />
      </PageLayout>
    );
  }
  if (count === null) {
    return (
      <PageLayout title={t("Stock count")} subtitle="">
        <p className="text-sm">{t("Count not found.")}</p>
      </PageLayout>
    );
  }

  const labels = new Map(inventory.map((r) => [r.productVariantId, r]));
  const lines = count.lines.map((line) => {
    const info = labels.get(line.productVariantId);
    return {
      ...line,
      name: info ? `${info.productName} ${info.label}` : "—",
      sku: info?.sku ?? "—",
    };
  });
  const isOpen = count.status === "OPEN";

  const value = (line: (typeof lines)[number]) =>
    entered[line.productVariantId] ?? (line.countedQuantity !== undefined ? String(line.countedQuantity) : "");

  const save = async () => {
    const counts = Object.entries(entered)
      .filter(([, v]) => v !== "")
      .map(([productVariantId, v]) => ({
        productVariantId: productVariantId as Id<"productVariants">,
        countedQuantity: Math.max(0, Number(v) || 0),
      }));
    if (counts.length === 0) return toast.error(t("Enter at least one count."));
    setBusy(true);
    try {
      await record({ token, countId, counts });
      toast.success(t("Counts saved"));
      setEntered({});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    setBusy(true);
    try {
      const result = await close({ token, countId });
      toast.success(t("Count closed: {applied} adjusted, {uncounted} not counted", result));
      router.push("/stock-counts");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Stock count")} subtitle={`${formatTimestamp(count.startedAt)} · ${count.startedByUsername}`}>
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" onClick={() => router.push("/stock-counts")}>
          <ArrowLeft className="w-3.5 h-3.5" /> {t("Back")}
        </Button>
        <Badge tone={isOpen ? "warning" : "success"}>{isOpen ? t("Open") : t("Closed")}</Badge>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>{t("Item")}</Th>
                <Th>{t("SKU")}</Th>
                <Th className="text-right">{t("Book")}</Th>
                <Th className="text-right">{t("Counted")}</Th>
                <Th className="text-right">{t("Difference")}</Th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const counted = value(line);
                const diff = counted === "" ? null : Number(counted) - line.expectedQuantity;
                return (
                  <tr key={line._id}>
                    <Td>{line.name}</Td>
                    <Td className="font-mono text-[11px]">{line.sku}</Td>
                    <Td className="text-right">{line.expectedQuantity}</Td>
                    <Td className="text-right">
                      {isOpen ? (
                        <TextInput
                          type="number"
                          min={0}
                          value={counted}
                          onChange={(e) =>
                            setEntered((prev) => ({ ...prev, [line.productVariantId]: e.target.value }))
                          }
                          className="w-24 ml-auto"
                        />
                      ) : (
                        line.countedQuantity ?? "—"
                      )}
                    </Td>
                    <Td className="text-right font-bold">
                      {diff === null ? "—" : diff > 0 ? `+${diff}` : diff}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      </Card>

      {isOpen && (
        <div className="flex flex-col sm:flex-row gap-2 justify-end mt-4 sticky bottom-0 bg-surface/90 backdrop-blur p-3">
          <Button variant="secondary" onClick={save} loading={busy}>
            {t("Save counts")}
          </Button>
          <Button onClick={finish} loading={busy}>
            {t("Close count and adjust stock")}
          </Button>
        </div>
      )}
    </PageLayout>
  );
}

function formatTimestamp(ts: number) {
  return new Date(ts).toLocaleString("pt-MZ", { dateStyle: "short", timeStyle: "short" });
}
