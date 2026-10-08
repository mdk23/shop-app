"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Field, Select, Modal, Table, Th, Td, Badge, Spinner } from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";
import { formatPriceRange } from "@/lib/prices";

const POSITIONS = [
  { value: "ESSENTIAL", label: "Essential" },
  { value: "CORE", label: "Core" },
  { value: "PREMIUM", label: "Premium" },
] as const;
type Position = (typeof POSITIONS)[number]["value"];

export default function ProductDetailPage() {
  const { t } = useTranslation();
  const token = useToken();
  const fmt = useCurrency();
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id as Id<"products">;
  const product = useQuery(api.products.get, { id: productId });
  const positioning = useQuery(api.commercialSettings.currentPositioning, { productId });
  const setPositioning = useMutation(api.commercialSettings.setPositioning);
  const [historyFor, setHistoryFor] = useState<Id<"productVariants"> | null>(null);
  const history = useQuery(
    api.productVariants.priceHistory,
    historyFor ? { productVariantId: historyFor } : "skip"
  );
  const [busy, setBusy] = useState(false);

  if (product === undefined) {
    return (
      <PageLayout title={t("Product")} subtitle="">
        <Spinner />
      </PageLayout>
    );
  }
  if (product === null) {
    return (
      <PageLayout title={t("Product")} subtitle="">
        <p className="text-sm">{t("Product not found.")}</p>
      </PageLayout>
    );
  }

  const changePosition = async (value: Position) => {
    setBusy(true);
    try {
      await setPositioning({ token, productId, positioning: value });
      toast.success(t("Positioning saved"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={product.name} subtitle={product.category?.name ?? ""}>
      <Button variant="ghost" className="mb-3" onClick={() => router.push("/products")}>
        <ArrowLeft className="w-3.5 h-3.5" /> {t("Back")}
      </Button>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Price")}</p>
          <p className="text-xl font-black">{formatPriceRange(fmt, product.minPrice, product.maxPrice)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Variants")}</p>
          <p className="text-xl font-black">{product.variants.length}</p>
        </Card>
        <Card className="p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">{t("Positioning")}</p>
          <Field label={t("Positioning")}>
            <Select
              disabled={busy}
              value={positioning?.positioning ?? ""}
              onChange={(e) => changePosition(e.target.value as Position)}
            >
              <option value="" disabled>
                {t("Not set")}
              </option>
              {POSITIONS.map((p) => (
                <option key={p.value} value={p.value}>
                  {t(p.label)}
                </option>
              ))}
            </Select>
          </Field>
          {positioning && (
            <p className="text-xs text-on-surface-variant">
              {t("Since")} {formatDate(positioning.validFrom)}
            </p>
          )}
        </Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <thead>
              <tr>
                <Th>{t("SKU")}</Th>
                <Th>{t("Variant")}</Th>
                <Th className="text-right">{t("Price")}</Th>
                <Th>{t("Status")}</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
                <tr key={v._id}>
                  <Td className="font-mono text-[11px]">{v.sku}</Td>
                  <Td>{[v.color, v.size].filter(Boolean).join(" / ") || "—"}</Td>
                  <Td className="text-right font-bold">{fmt(v.sellingPrice)}</Td>
                  <Td>
                    <Badge tone={v.active ? "success" : "neutral"}>{v.active ? t("Active") : t("Inactive")}</Badge>
                  </Td>
                  <Td>
                    <Button size="sm" variant="ghost" onClick={() => setHistoryFor(v._id)}>
                      {t("Price history")}
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      </Card>

      <Modal
        open={!!historyFor}
        onClose={() => setHistoryFor(null)}
        title={t("Price history")}
        size="sm"
        footer={<Button variant="ghost" onClick={() => setHistoryFor(null)}>{t("Close")}</Button>}
      >
        {history === undefined ? (
          <Spinner />
        ) : history.length === 0 ? (
          <p className="text-sm">{t("No price changes recorded")}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h._id} className="flex justify-between">
                <span>
                  {formatDate(h.validFrom)}
                  {h.validTo ? ` → ${formatDate(h.validTo)}` : ` → ${t("now")}`}
                </span>
                <span className="font-bold">{fmt(h.price)}</span>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </PageLayout>
  );
}
