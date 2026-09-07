"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Select,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
} from "@/components/ui";
import { useResolvedBranch } from "@/lib/useShop";
import { Download } from "lucide-react";

const TYPES = [
  "INITIAL_STOCK",
  "PURCHASE",
  "PURCHASE_RETURN",
  "SALE",
  "SALE_RETURN",
  "SALE_CANCELLATION",
  "STOCK_ADJUSTMENT",
  "TRANSFER_IN",
  "TRANSFER_OUT",
  "DAMAGE",
  "LOSS",
  "FOUND",
];

export default function LedgerPage() {
  const { branchId, branches } = useResolvedBranch();
  const [type, setType] = useState("");
  const [branch, setBranch] = useState("");
  const [days, setDays] = useState("30");

  const start = useMemo(
    () => Date.now() - Number(days) * 24 * 60 * 60 * 1000,
    [days]
  );

  const rows = useQuery(api.inventory.listMovements, {
    start,
    movementType: type || undefined,
    branchId: (branch || branchId || undefined) as Id<"branches"> | undefined,
    limit: 1000,
  });

  const exportCsv = () => {
    if (!rows) return;
    const header = "date,type,product,variant,sku,qty,prev,new,ref,notes,user";
    const body = rows
      .map((r) =>
        [
          new Date(r.movementDate).toISOString(),
          r.movementType,
          r.productName ?? "",
          r.variantLabel ?? "",
          r.sku ?? "",
          r.quantity,
          r.previousBalance,
          r.newBalance,
          r.referenceType ?? "",
          (r.notes ?? "").replace(/,/g, ";"),
          r.username ?? "",
        ].join(",")
      )
      .join("\n");
    const blob = new Blob([`${header}\n${body}`], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `stock-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <PageLayout title="Stock Ledger" subtitle="Inventory · immutable movement history">
      <Toolbar>
        <Select value={days} onChange={(e) => setDays(e.target.value)} className="w-32">
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="365">Last year</option>
        </Select>
        <Select value={type} onChange={(e) => setType(e.target.value)} className="w-44">
          <option value="">All types</option>
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t.replace(/_/g, " ")}
            </option>
          ))}
        </Select>
        {branches.length > 1 && (
          <Select value={branch} onChange={(e) => setBranch(e.target.value)} className="w-40">
            <option value="">All branches</option>
            {branches.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </Select>
        )}
        <div className="ml-auto" />
        <Button variant="secondary" onClick={exportCsv} disabled={!rows?.length}>
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No movements in range" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>When</Th>
                <Th>Type</Th>
                <Th>Product</Th>
                <Th>Variant</Th>
                <Th className="text-right">Qty</Th>
                <Th className="text-right">Prev → New</Th>
                <Th>Ref</Th>
                <Th>By</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="hover:bg-surface-container-low">
                  <Td className="text-xs text-on-surface-variant">
                    {new Date(r.movementDate).toLocaleString()}
                  </Td>
                  <Td>
                    <Badge tone={r.quantity >= 0 ? "success" : "error"}>
                      {r.movementType.replace(/_/g, " ")}
                    </Badge>
                  </Td>
                  <Td className="font-bold">{r.productName ?? "—"}</Td>
                  <Td>{r.variantLabel ?? "—"}</Td>
                  <Td
                    className={`text-right font-bold ${
                      r.quantity >= 0 ? "text-success" : "text-error"
                    }`}
                  >
                    {r.quantity >= 0 ? "+" : ""}
                    {r.quantity}
                  </Td>
                  <Td className="text-right text-on-surface-variant text-xs">
                    {r.previousBalance} → {r.newBalance}
                  </Td>
                  <Td className="text-on-surface-variant text-xs">
                    {r.referenceType ?? "—"}
                  </Td>
                  <Td className="text-on-surface-variant text-xs">{r.username ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </PageLayout>
  );
}
