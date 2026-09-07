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
import { Search } from "lucide-react";
import Link from "next/link";

const STATUS_TONE = {
  IN_STOCK: "success",
  LOW_STOCK: "warning",
  OUT_OF_STOCK: "error",
} as const;

export default function InventoryPage() {
  const fmt = useCurrency();
  const { branchId, branchName, branches } = useResolvedBranch();
  const [pickBranch, setPickBranch] = useState<string>("");
  const effectiveBranch = (pickBranch || branchId) as Id<"branches"> | undefined;

  const categories = useQuery(api.categories.list, {});
  const brands = useQuery(api.brands.list, {});
  const [categoryId, setCategoryId] = useState("");
  const [brandId, setBrandId] = useState("");
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");

  const rows = useQuery(
    api.stock.listInventory,
    effectiveBranch
      ? {
          branchId: effectiveBranch,
          categoryId: (categoryId || undefined) as Id<"categories"> | undefined,
          brandId: (brandId || undefined) as Id<"brands"> | undefined,
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
      title="Stock"
      subtitle={`Inventory · ${branches.find((b) => b._id === effectiveBranch)?.name ?? branchName}`}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Stock units" value={valuation?.units ?? "—"} />
        <StatCard
          label="Stock value (cost)"
          value={valuation ? fmt(valuation.costValue) : "—"}
        />
        <StatCard
          label="Low stock"
          value={valuation?.lowStockCount ?? "—"}
          accent="primary"
        />
        <StatCard
          label="Out of stock"
          value={valuation?.outOfStockCount ?? "—"}
          accent="error"
        />
      </div>

      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-52`}
            placeholder="Product / SKU / barcode"
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
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-32">
          <option value="">All brands</option>
          {(brands ?? []).map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
            </option>
          ))}
        </Select>
        <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-32">
          <option value="">Any status</option>
          <option value="IN_STOCK">In stock</option>
          <option value="LOW_STOCK">Low stock</option>
          <option value="OUT_OF_STOCK">Out of stock</option>
        </Select>
        <div className="ml-auto" />
        <Link href="/inventory/adjustments">
          <Button variant="secondary">Adjust stock</Button>
        </Link>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No matching stock" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Variant</Th>
                <Th>SKU</Th>
                <Th>Category</Th>
                <Th className="text-right">On hand</Th>
                <Th className="text-right">Reorder</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Price</Th>
                <Th>Status</Th>
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
                      {r.status.replace("_", " ")}
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
