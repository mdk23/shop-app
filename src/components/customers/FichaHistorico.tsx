"use client";

import { Fragment, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Card, Table, Th, Td, Badge, PagedFooter, Spinner, EmptyState } from "@/components/ui";
import { usePagedQuery } from "@/lib/pagination";
import { useCurrency } from "@/lib/useShop";
import { formatDateTime } from "@/lib/utils";
import { SALE_STATUS_TONE, SALE_STATUS_LABEL, type SaleStatus } from "@/lib/badgeTones";
import { useTranslation } from "@/contexts/LanguageContext";

/** Unbounded sales history for one customer — the one Ficha tab that doesn't share `getPosContext`. */
export function FichaHistorico({ customerId }: { customerId: Id<"customers"> }) {
  const { t } = useTranslation();
  const fmt = useCurrency();
  const [expandedId, setExpandedId] = useState<Id<"sales"> | null>(null);
  const history = usePagedQuery(api.sales.listByCustomerPaged, { customerId });
  const expanded = useQuery(api.sales.get, expandedId ? { id: expandedId } : "skip");

  if (history.isLoading) return <Spinner />;
  if (history.rows.length === 0) return <EmptyState title={t("No sales yet")} />;

  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>{t("Sale")}</Th>
            <Th>{t("Date")}</Th>
            <Th>{t("Status")}</Th>
            <Th className="text-right">{t("Total")}</Th>
          </tr>
        </thead>
        <tbody>
          {history.rows.map((s) => (
            <Fragment key={s._id}>
              <tr
                className="hover:bg-surface-container-low cursor-pointer"
                onClick={() => setExpandedId(expandedId === s._id ? null : s._id)}
              >
                <Td className="font-mono text-[11px] font-bold">{s.saleNumber}</Td>
                <Td className="text-xs text-on-surface-variant">{formatDateTime(s.createdAt)}</Td>
                <Td>
                  <Badge tone={SALE_STATUS_TONE[s.status as SaleStatus]}>
                    {t(SALE_STATUS_LABEL[s.status as SaleStatus])}
                  </Badge>
                </Td>
                <Td className="text-right font-bold">{fmt(s.total)}</Td>
              </tr>
              {expandedId === s._id && (
                <tr>
                  <Td colSpan={4}>
                    {!expanded ? (
                      <Spinner />
                    ) : (
                      <div className="py-1">
                        <div className="rounded-xl border border-outline divide-y divide-outline/30">
                          {expanded.items.map((it) => (
                            <div key={it._id} className="flex justify-between px-3 py-2 text-xs">
                              <span>
                                {it.quantity}× {it.productName}{" "}
                                <span className="text-on-surface-variant">({it.variantLabel})</span>
                              </span>
                              <span className="font-bold">{fmt(it.total)}</span>
                            </div>
                          ))}
                        </div>
                        {expanded.returns.length > 0 && (
                          <p className="text-[10px] text-error font-black uppercase tracking-wider mt-1.5">
                            {t("{count} return(s) processed", { count: expanded.returns.length })}
                          </p>
                        )}
                      </div>
                    )}
                  </Td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </Table>
      <PagedFooter paged={history} />
    </Card>
  );
}
