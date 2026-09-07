"use client";

import { useMemo, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Table,
  Th,
  Td,
  EmptyState,
  Spinner,
  Toolbar,
  inputClass,
} from "@/components/ui";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useCurrency } from "@/lib/useShop";
import { Search, Printer } from "lucide-react";

export default function ReceiptsPage() {
  const fmt = useCurrency();
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<Id<"sales"> | null>(null);
  const sales = useQuery(api.sales.listRecent, { limit: 100 });

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    return (sales ?? []).filter(
      (s) =>
        !t ||
        s.saleNumber.toLowerCase().includes(t) ||
        (s.customerName ?? "").toLowerCase().includes(t)
    );
  }, [sales, search]);

  return (
    <PageLayout title="Receipts" subtitle="Settings · reprint sale receipts">
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-64`}
            placeholder="Sale # or customer"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </Toolbar>

      <Card>
        {sales === undefined ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No sales" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sale</Th>
                <Th>Date</Th>
                <Th>Customer</Th>
                <Th className="text-right">Total</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s._id} className="hover:bg-surface-container-low">
                  <Td className="font-mono text-[11px] font-bold">{s.saleNumber}</Td>
                  <Td className="text-xs text-on-surface-variant">
                    {new Date(s.createdAt).toLocaleString()}
                  </Td>
                  <Td>{s.customerName ?? "Walk-in"}</Td>
                  <Td className="text-right font-bold">{fmt(s.total)}</Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => setOpenId(s._id)}>
                      <Printer className="w-3.5 h-3.5" /> Print
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {openId && <ReceiptModal saleId={openId} onClose={() => setOpenId(null)} />}
    </PageLayout>
  );
}
