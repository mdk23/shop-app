"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Select,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
  StatCard,
  inputClass,
  Button,
} from "@/components/ui";
import { useCurrency, useResolvedBranch } from "@/lib/useShop";
import { useTranslation } from "@/contexts/LanguageContext";
import { Search } from "lucide-react";
import Link from "next/link";

const STATUS_TONE = {
  IN_STOCK: "success",
  LOW_STOCK: "warning",
  OUT_OF_STOCK: "error",
} as const;

export default function InventoryPage() {
  const { t } = useTranslation();
  const fmt = useCurrency();
  const { branchId, branchName, branches } = useResolvedBranch();
  const [pickBranch, setPickBranch] = useState<string>("");
  const effectiveBranch = (pickBranch || branchId) as Id<"branches"> | undefined;

  const categories = useQuery(api.categories.list, {});
  const sizes = useQuery(api.sizes.list, {});
  const colors = useQuery(api.colors.list, {});
  const [categoryId, setCategoryId] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const rows = useQuery(
    api.stock.listInventory,
    effectiveBranch
      ? {
          branchId: effectiveBranch,
          categoryId: (categoryId || undefined) as Id<"categories"> | undefined,
          size: size || undefined,
          color: color || undefined,
          status: (status || undefined) as
            | "IN_STOCK"
            | "LOW_STOCK"
            | "OUT_OF_STOCK"
            | undefined,
          search: search || undefined,
        }
      : "skip"
  );
  const valuation = useQuery(
    api.analytics.inventoryValuation,
    effectiveBranch ? { branchId: effectiveBranch } : "skip"
  );

  return (
    <PageLayout
      title={t("Stock")}
      subtitle={t("Inventory · {branch}", {
        branch: branches.find((b) => b._id === effectiveBranch)?.name ?? branchName,
      })}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label={t("Stock units")} value={valuation?.units ?? "—"} />
        <StatCard
          label={t("Stock value (cost)")}
          value={valuation ? fmt(valuation.costValue) : "—"}
        />
        <StatCard
          label={t("Low stock")}
          value={valuation?.lowStockCount ?? "—"}
          accent="primary"
        />
        <StatCard
          label={t("Out of stock")}
          value={valuation?.outOfStockCount ?? "—"}
          accent="error"
        />
      </div>

      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-52`}
            placeholder={t("Product / SKU / barcode")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        {branches.length > 1 && (
          <Select
            value={pickBranch || branchId || ""}
            onChange={(e) => setPickBranch(e.target.value)}
            className="w-40"
          >
            {branches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-36">
          <option value="">{t("All categories")}</option>
          {(categories ?? []).map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={size} onChange={(e) => setSize(e.target.value)} className="w-28">
          <option value="">{t("All sizes")}</option>
          {(sizes ?? []).map((s) => (
            <option key={s._id} value={s.name}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select value={color} onChange={(e) => setColor(e.target.value)} className="w-32">
          <option value="">{t("All colors")}</option>
          {(colors ?? []).map((c) => (
            <option key={c._id} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-32">
          <option value="">{t("Any status")}</option>
          <option value="IN_STOCK">{t("In stock")}</option>
          <option value="LOW_STOCK">{t("Low stock")}</option>
          <option value="OUT_OF_STOCK">{t("Out of stock")}</option>
        </Select>
        <div className="ml-auto" />
        <Link href="/inventory/adjustments">
          <Button variant="secondary">{t("Adjust stock")}</Button>
        </Link>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title={t("No matching stock")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Product")}</Th>
                <Th>{t("Variant")}</Th>
                <Th>{t("SKU")}</Th>
                <Th>{t("Category")}</Th>
                <Th className="text-right">{t("On hand")}</Th>
                <Th className="text-right">{t("Reorder")}</Th>
                <Th className="text-right">{t("Cost")}</Th>
                <Th className="text-right">{t("Price")}</Th>
                <Th>{t("Status")}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.productVariantId} className="hover:bg-surface-container-low">
                  <Td className="font-bold">{r.productName}</Td>
                  <Td>{r.label}</Td>
                  <Td className="font-mono text-[11px]">{r.sku}</Td>
                  <Td className="text-on-surface-variant">{r.categoryName}</Td>
                  <Td className="text-right font-bold">{r.quantity}</Td>
                  <Td className="text-right text-on-surface-variant">{r.reorderLevel}</Td>
                  <Td className="text-right">{fmt(r.costPrice)}</Td>
                  <Td className="text-right">{fmt(r.sellingPrice)}</Td>
                  <Td>
                    <Badge tone={STATUS_TONE[r.status]}>
                      {t(r.status.replace("_", " "))}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </PageLayout>
  );
}
