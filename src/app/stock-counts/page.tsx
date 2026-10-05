"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, EmptyState, Spinner, Table, Th, Td, Toolbar, Badge } from "@/components/ui";
import { useToken, useResolvedBranch } from "@/lib/useShop";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

export default function StockCountsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const branch = useResolvedBranch();
  const counts = useQuery(
    api.stockCounts.listByBranch,
    branch.branchId ? { branchId: branch.branchId } : "skip"
  );
  const start = useMutation(api.stockCounts.start);

  const open = (counts ?? []).find((c) => c.status === "OPEN");

  const startCount = async () => {
    if (!branch.branchId) return toast.error(t("Choose a branch."));
    try {
      await start({ token, branchId: branch.branchId as Id<"branches"> });
      toast.success(t("Count started"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  return (
    <PageLayout title={t("Stock counts")} subtitle={`${t("Physical count of")} ${branch.branchName}`}>
      <Toolbar>
        <div className="ml-auto" />
        {open ? (
          <Link href={`/stock-counts/${open._id}`}>
            <Button>{t("Continue open count")}</Button>
          </Link>
        ) : (
          <Button onClick={startCount}>
            <Plus className="w-3.5 h-3.5" /> {t("Start count")}
          </Button>
        )}
      </Toolbar>

      <Card>
        {counts === undefined ? (
          <Spinner />
        ) : counts.length === 0 ? (
          <EmptyState
            title={t("No counts yet")}
            message={t("A count compares what is on the shelf with the books, and corrects the difference.")}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <thead>
                <tr>
                  <Th>{t("Started")}</Th>
                  <Th>{t("By")}</Th>
                  <Th>{t("Closed")}</Th>
                  <Th>{t("Status")}</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {counts.map((c) => (
                  <tr key={c._id} className="hover:bg-surface-container-low">
                    <Td>{formatDate(c.startedAt)}</Td>
                    <Td>{c.startedByUsername}</Td>
                    <Td>{c.closedAt ? formatDate(c.closedAt) : "—"}</Td>
                    <Td>
                      <Badge tone={c.status === "OPEN" ? "warning" : "success"}>
                        {c.status === "OPEN" ? t("Open") : t("Closed")}
                      </Badge>
                    </Td>
                    <Td>
                      <Link href={`/stock-counts/${c._id}`} className="underline">
                        {t("Open")}
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>
    </PageLayout>
  );
}
