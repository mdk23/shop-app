"use client";

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageLayout } from "@/components/PageLayout";
import { Card, Spinner, Table, Th, Td, EmptyState } from "@/components/ui";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { useTranslation } from "@/contexts/LanguageContext";
import { useToken } from "@/lib/useShop";
import { DEMAND_REASON_LABEL, DEMAND_STAGE_LABEL, type DemandReason, type DemandStage } from "@/lib/demands";

const PALETTE = ["#8b2d3a", "#c9a227", "#2f6f4e", "#3b6ea5", "#7a5c99"];

// Stages a proceeded demand can be in (the Oportunidades board).
const OPPORTUNITY_STAGES: DemandStage[] = ["PROCEEDING", "CONVERTED", "FULFILLED", "LOST"];

export default function InsightsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const reasons = useQuery(api.demands.countByReason, {});
  const opportunities = useQuery(api.demands.listOpportunities, {});
  const scorecard = useQuery(api.supplierEvaluations.scorecard, {});
  const quality = useQuery(api.qualityIssues.list, { token });

  if (reasons === undefined || opportunities === undefined || scorecard === undefined || quality === undefined) {
    return (
      <PageLayout title={t("Business insights")} subtitle="">
        <Spinner />
      </PageLayout>
    );
  }

  const reasonData = Object.entries(reasons).map(([key, count]) => ({
    name: t(DEMAND_REASON_LABEL[key as DemandReason] ?? "Other"),
    count,
  }));

  const stageData = OPPORTUNITY_STAGES.map((stage) => ({
    name: t(DEMAND_STAGE_LABEL[stage]),
    value: opportunities.filter((o) => o.stage === stage).length,
  }));
  const won = opportunities.filter((o) => o.stage === "CONVERTED" || o.stage === "FULFILLED").length;
  const decided = won + opportunities.filter((o) => o.stage === "LOST").length;

  const supplierData = scorecard
    .filter((s) => s.evaluations > 0)
    .map((s) => ({ name: s.name, quality: s.avgQuality ? Number(s.avgQuality.toFixed(2)) : 0 }));

  const treated = quality.filter((q) => !q.open).length;
  const open = quality.length - treated;

  return (
    <PageLayout title={t("Business insights")} subtitle={t("What customers, suppliers and stock are telling us")}>
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Why sales were lost")}
          </p>
          {reasonData.length === 0 ? (
            <EmptyState title={t("No requests recorded yet")} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reasonData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis allowDecimals={false} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="count" fill={PALETTE[0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Opportunities")} · {t("Conversion")} {decided > 0 ? Math.round((won / decided) * 100) : 0}%
          </p>
          {opportunities.length === 0 ? (
            <EmptyState title={t("No opportunities yet")} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stageData} dataKey="value" nameKey="name" outerRadius={90} label>
                    {stageData.map((_, i) => (
                      <Cell key={i} fill={PALETTE[i % PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Supplier quality (average, 1–5)")}
          </p>
          {supplierData.length === 0 ? (
            <EmptyState title={t("No evaluations yet")} />
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={supplierData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} />
                  <YAxis domain={[0, 5]} fontSize={11} />
                  <Tooltip />
                  <Bar dataKey="quality" fill={PALETTE[2]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card className="p-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
            {t("Quality issues")} · {t("Open")} {open} · {t("Treated")} {treated}
          </p>
          <Table>
            <thead>
              <tr>
                <Th>{t("Supplier")}</Th>
                <Th className="text-right">{t("Punctuality")}</Th>
                <Th className="text-right">{t("Open")}</Th>
              </tr>
            </thead>
            <tbody>
              {scorecard.map((s) => (
                <tr key={s.supplierId}>
                  <Td>{s.name}</Td>
                  <Td className="text-right">{s.avgPunctuality !== null ? `${Math.round(s.avgPunctuality)}%` : "—"}</Td>
                  <Td className="text-right">{s.openQualityIssues}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>
    </PageLayout>
  );
}
