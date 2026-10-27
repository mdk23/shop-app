"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { FunctionReturnType } from "convex/server";
import { Card, Select, Spinner, Table, Th, Td, Badge, Button, Field, TextInput } from "@/components/ui";
import { useCurrency, useResolvedBranch, useToken } from "@/lib/useShop";
import { useTranslation } from "@/contexts/LanguageContext";
import { formatDate, cn } from "@/lib/utils";
import { DEMAND_REASON_LABEL, type DemandReason } from "@/lib/demands";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  AlertTriangle,
  RotateCcw,
  Users,
  Sprout,
  Percent,
  BarChart3,
  ShoppingBag,
  Target,
  Package,
} from "lucide-react";

type Overview = FunctionReturnType<typeof api.knowledge.overview>;

const ALERT_ICON = { STOCK: AlertTriangle, RETURNS: RotateCcw, INACTIVE: Users, GROWTH: Sprout, MARGIN: Percent } as const;
const SECTION = "text-[10px] font-black uppercase tracking-widest text-on-surface-variant";

/** ▲ / ▼ / – with the change, in text colours (the arrow carries the direction). */
function Change({ value, unit = "%" }: { value: number | null; unit?: string }) {
  const { t } = useTranslation();
  if (value === null) return <span className="text-xs text-on-surface-variant">{t("no previous data")}</span>;
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-bold", value > 0 ? "text-success" : value < 0 ? "text-error" : "text-on-surface-variant")}>
      <Icon className="w-3.5 h-3.5" />
      {value > 0 ? "+" : ""}
      {value}
      {unit}
    </span>
  );
}

function Kpi({ label, value, change, icon: Icon }: { label: string; value: React.ReactNode; change: React.ReactNode; icon: React.ElementType }) {
  const { t } = useTranslation();
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className={SECTION}>{label}</p>
        <p className="text-2xl font-display tracking-tighter">{value}</p>
        <p className="text-[11px] text-on-surface-variant">
          {change} {t("vs previous period")}
        </p>
      </div>
    </Card>
  );
}

/** Real months, then the forecast; the forecast starts at the last real month so the lines join. */
function forecastSeries(data: Overview): { month: string; actual?: number; forecast?: number }[] {
  const rows: { month: string; actual?: number; forecast?: number }[] = data.months.map((m) => ({
    month: m.month,
    actual: m.revenue,
  }));
  if (rows.length > 0) rows[rows.length - 1].forecast = rows[rows.length - 1].actual;
  return [...rows, ...data.forecast.map((f) => ({ month: f.month, forecast: f.revenue }))];
}

/** Price/volume what-if on a category's real sales in the period. */
function Scenario({ base }: { base: Overview["scenarioBase"] }) {
  const { t } = useTranslation();
  const fmt = useCurrency();
  const [categoryId, setCategoryId] = useState("");
  const [price, setPrice] = useState("10");
  const [volume, setVolume] = useState("0");
  const row = base.find((c) => c.categoryId === categoryId) ?? base[0];
  if (!row) return <p className="text-xs text-on-surface-variant">{t("No sales in this period to simulate on.")}</p>;
  const p = (Number(price) || 0) / 100;
  const q = (Number(volume) || 0) / 100;
  // Cost per unit stays; price and units move. Revenue here is before IVA.
  const cost = row.revenue - row.profit;
  const newRevenue = row.revenue * (1 + p) * (1 + q);
  const newProfit = newRevenue - cost * (1 + q);
  const marginBefore = row.revenue > 0 ? (row.profit / row.revenue) * 100 : 0;
  const marginAfter = newRevenue > 0 ? (newProfit / newRevenue) * 100 : 0;
  const pctChange = (a: number, b: number) => (b !== 0 ? ((a - b) / Math.abs(b)) * 100 : 0);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <Field label={t("Category")}>
          <Select value={row.categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            {base.map((c) => (
              <option key={c.categoryId} value={c.categoryId}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={t("Price change (%)")}>
          <TextInput type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
        <Field label={t("Expected units change (%)")}>
          <TextInput type="number" value={volume} onChange={(e) => setVolume(e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-container-low p-2">
          <p className={SECTION}>{t("Revenue")}</p>
          <p className="font-black">{fmt(newRevenue)}</p>
          <Change value={Math.round(pctChange(newRevenue, row.revenue) * 10) / 10} />
        </div>
        <div className="rounded-xl bg-surface-container-low p-2">
          <p className={SECTION}>{t("Profit")}</p>
          <p className="font-black">{fmt(newProfit)}</p>
          <Change value={Math.round(pctChange(newProfit, row.profit) * 10) / 10} />
        </div>
        <div className="rounded-xl bg-surface-container-low p-2">
          <p className={SECTION}>{t("Margin")}</p>
          <p className="font-black">{marginAfter.toFixed(1)}%</p>
          <Change value={Math.round((marginAfter - marginBefore) * 10) / 10} unit=" p.p." />
        </div>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        {t("Based on this category's sales in the period: the cost per unit stays, and units change only by what you enter. An estimate, not a forecast.")}
      </p>
    </div>
  );
}

export function KnowledgeActive() {
  const { t } = useTranslation();
  const fmt = useCurrency();
  const token = useToken();
  const { branchId, isAll } = useResolvedBranch();
  const [range, setRange] = useState("30");
  const [now] = useState(() => Date.now());
  const { start, end } = useMemo(() => ({ start: now - Number(range) * 86400000, end: now }), [range, now]);
  const data = useQuery(api.knowledge.overview, { token, start, end, branchId: isAll ? "all" : branchId });

  const exportCsv = () => {
    if (!data) return;
    const lines = [
      ["section", "name", "value", "detail"],
      ["kpi", "sales", data.kpis.revenue.value, data.kpis.revenue.change ?? ""],
      ["kpi", "active customers", data.kpis.activeCustomers.value, data.kpis.activeCustomers.change ?? ""],
      ["kpi", "conversion %", data.kpis.conversion.value ?? "", data.kpis.conversion.changePoints ?? ""],
      ["kpi", "stock rotation", data.kpis.rotation.value ?? "", data.kpis.rotation.change ?? ""],
      ...data.categories.map((c) => ["category", c.name, c.revenue, c.growth ?? ""]),
      ...data.topProducts.map((p) => ["product", p.name, p.qty, p.revenue]),
      ...data.topCustomers.map((c) => ["customer", c.name, c.value, c.purchases]),
      ...data.alerts.map((a) => ["alert", a.title, "", t(a.detail.text, a.detail.params)]),
    ];
    const csv = lines.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: `conhecimento-${new Date(now).toISOString().slice(0, 10)}.csv` });
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={range} onChange={(e) => setRange(e.target.value)} className="w-40">
          <option value="7">{t("Last 7 days")}</option>
          <option value="30">{t("Last 30 days")}</option>
          <option value="90">{t("Last 90 days")}</option>
          <option value="365">{t("Last year")}</option>
        </Select>
        <span className="text-xs text-on-surface-variant">
          {formatDate(start)} – {formatDate(end)} · {t("compared with the period before")}
        </span>
        <div className="ml-auto" />
        <Button variant="secondary" onClick={exportCsv} disabled={!data}>
          <Download className="w-3.5 h-3.5" /> {t("Export")}
        </Button>
      </div>

      {!data ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            <Kpi label={t("Sales")} icon={BarChart3} value={fmt(data.kpis.revenue.value)} change={<Change value={data.kpis.revenue.change} />} />
            <Kpi label={t("Active customers")} icon={Users} value={data.kpis.activeCustomers.value} change={<Change value={data.kpis.activeCustomers.change} />} />
            <Kpi
              label={t("Requests converted")}
              icon={Target}
              value={data.kpis.conversion.value === null ? "—" : `${data.kpis.conversion.value}%`}
              change={<Change value={data.kpis.conversion.changePoints} unit=" p.p." />}
            />
            <Kpi
              label={t("Stock rotation")}
              icon={Package}
              value={data.kpis.rotation.value ?? "—"}
              change={<Change value={data.kpis.rotation.change} />}
            />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Sales and margin: two charts on one date axis — never two scales on one chart. */}
            <Card className="p-4">
              <p className={SECTION}>{t("Sales and margin")}</p>
              {data.days.length === 0 ? (
                <p className="text-xs text-on-surface-variant mt-3">{t("No sales in this period.")}</p>
              ) : (
                <>
                  <p className="text-[11px] text-on-surface-variant mt-2">{t("Sales")}</p>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.days} syncId="sales-margin" margin={{ left: 0, right: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--outline)" vertical={false} />
                        <XAxis dataKey="date" hide />
                        <YAxis tick={{ fontSize: 10 }} width={48} />
                        <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Bar dataKey="revenue" name={t("Sales")} fill="var(--primary)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-on-surface-variant">{t("Margin (%)")}</p>
                  <div className="h-28">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={data.days} syncId="sales-margin" margin={{ left: 0, right: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--outline)" vertical={false} />
                        <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(d: string) => d.slice(5)} />
                        <YAxis tick={{ fontSize: 10 }} width={48} unit="%" />
                        <Tooltip formatter={(v) => `${v}%`} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                        <Line type="monotone" dataKey="marginPct" name={t("Margin")} stroke="var(--secondary, #c9a227)" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </>
              )}
            </Card>

            <Card className="p-4">
              <p className={SECTION}>{t("Sales forecast (next 3 months)")}</p>
              <div className="h-60 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={forecastSeries(data)} margin={{ left: 0, right: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--outline)" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} width={48} />
                    <Tooltip formatter={(v) => fmt(Number(v))} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area type="monotone" dataKey="actual" name={t("Actual sales")} stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.15} strokeWidth={2} />
                    <Area type="monotone" dataKey="forecast" name={t("Forecast")} stroke="var(--primary)" strokeDasharray="5 4" fill="none" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="text-[11px] text-on-surface-variant">
                {t("A straight line through the last 6 months. A projection, not a fact.")}
              </p>
            </Card>

            <Card className="p-4">
              <p className={SECTION}>{t("Categories with most potential")}</p>
              <div className="mt-2"><Table>
                <thead>
                  <tr>
                    <Th>{t("Category")}</Th>
                    <Th className="text-right">{t("Growth")}</Th>
                    <Th className="text-right">{t("Open requests")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.slice(0, 6).map((c) => (
                    <tr key={c.categoryId}>
                      <Td>{c.name}</Td>
                      <Td className="text-right">
                        <Change value={c.growth} />
                      </Td>
                      <Td className="text-right text-xs">
                        {c.openRequests > 0 ? `${c.openRequests} · ${fmt(c.openRequestValue)}` : "—"}
                      </Td>
                    </tr>
                  ))}
                  {data.categories.length === 0 && (
                    <tr>
                      <Td colSpan={3} className="text-xs text-on-surface-variant">
                        {t("No category sales or requests in this period.")}
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table></div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <Card className="p-4">
              <p className={SECTION}>{t("Main insights")}</p>
              {data.insights.length === 0 ? (
                <p className="text-xs text-on-surface-variant mt-3">{t("Nothing stands out in this period.")}</p>
              ) : (
                <ol className="mt-3 space-y-2">
                  {data.insights.map((phrase, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="w-5 h-5 rounded-full bg-primary text-on-primary text-[11px] font-black flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <span>
                        {t(phrase.text, {
                          ...phrase.params,
                          // A lost-sale reason arrives as its code; show its label.
                          ...(phrase.params?.reason
                            ? { reason: t(DEMAND_REASON_LABEL[phrase.params.reason as DemandReason] ?? "Other").toLowerCase() }
                            : {}),
                        })}
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </Card>

            <Card className="p-4">
              <p className={SECTION}>{t("Alerts and recommended actions")}</p>
              {data.alerts.length === 0 ? (
                <p className="text-xs text-on-surface-variant mt-3">{t("No alerts: nothing crossed its threshold.")}</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.alerts.map((a) => {
                    const Icon = ALERT_ICON[a.kind as keyof typeof ALERT_ICON] ?? AlertTriangle;
                    return (
                      <li key={a.kind} className="flex items-center gap-2">
                        <Icon className="w-4 h-4 flex-shrink-0 text-on-surface-variant" aria-hidden />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold">{t(a.title)}</p>
                          <p className="text-xs text-on-surface-variant truncate">{t(a.detail.text, a.detail.params)}</p>
                        </div>
                        <Link href={a.href}>
                          <Badge tone={a.tone}>{t(a.action)}</Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card className="p-4">
              <p className={SECTION}>{t("Scenario and simulation")}</p>
              <div className="mt-3">
                <Scenario base={data.scenarioBase} />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card className="p-4">
              <p className={SECTION}>{t("Highest-value customers (last 12 months)")}</p>
              <div className="mt-2"><Table>
                <thead>
                  <tr>
                    <Th>{t("Customer")}</Th>
                    <Th className="text-right">{t("Purchases")}</Th>
                    <Th className="text-right">{t("Total value")}</Th>
                    <Th>{t("Last purchase")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.topCustomers.map((c) => (
                    <tr key={c.customerId}>
                      <Td>
                        <Link href={`/customers?id=${c.customerId}`} className="hover:underline">
                          {c.name}
                        </Link>
                      </Td>
                      <Td className="text-right">{c.purchases}</Td>
                      <Td className="text-right font-bold">{fmt(c.value)}</Td>
                      <Td className="text-xs">
                        {c.lastPurchase ? formatDate(c.lastPurchase) : "—"}
                        {!c.recent && <span className="ml-1"><Badge tone="warning">{t("inactive")}</Badge></span>}
                      </Td>
                    </tr>
                  ))}
                  {data.topCustomers.length === 0 && (
                    <tr>
                      <Td colSpan={4} className="text-xs text-on-surface-variant">
                        {t("No named-customer sales in the last 12 months.")}
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table></div>
            </Card>

            <Card className="p-4">
              <p className={SECTION}>{t("Featured products")}</p>
              <div className="mt-2"><Table>
                <thead>
                  <tr>
                    <Th>{t("Product")}</Th>
                    <Th className="text-right">{t("Units")}</Th>
                    <Th className="text-right">{t("Revenue")}</Th>
                    <Th className="text-right">{t("Trend")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.topProducts.map((p) => (
                    <tr key={p.productId}>
                      <Td>{p.name}</Td>
                      <Td className="text-right">{p.qty}</Td>
                      <Td className="text-right font-bold">{fmt(p.revenue)}</Td>
                      <Td className="text-right">
                        <Change value={p.previousQty > 0 ? Math.round(((p.qty - p.previousQty) / p.previousQty) * 1000) / 10 : null} />
                      </Td>
                    </tr>
                  ))}
                  {data.topProducts.length === 0 && (
                    <tr>
                      <Td colSpan={4} className="text-xs text-on-surface-variant">
                        {t("No sales in this period.")}
                      </Td>
                    </tr>
                  )}
                </tbody>
              </Table></div>
            </Card>
          </div>

          <Card className="p-4">
            <p className={SECTION}>{t("Business memory")}</p>
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-2">
              {[
                { href: "/reports", icon: BarChart3, title: "Sales patterns", detail: "Sales by period, category, size and colour" },
                { href: "/customers", icon: Users, title: "Customer behaviour", detail: "Purchases, preferences and tiers" },
                { href: "/products", icon: ShoppingBag, title: "Product performance", detail: "Sales, margin and stock" },
                { href: "/complaints", icon: AlertTriangle, title: "Complaints and resolutions", detail: "Complaints, returns and outcomes" },
                { href: "/opportunities", icon: Target, title: "Lost opportunities", detail: "Requests not converted and why" },
              ].map((m) => (
                <Link key={m.href} href={m.href} className="flex items-center gap-2 p-2 rounded-xl hover:bg-surface-container-low">
                  <m.icon className="w-4 h-4 text-primary flex-shrink-0" />
                  <span>
                    <span className="block text-sm font-bold">{t(m.title)}</span>
                    <span className="block text-[11px] text-on-surface-variant">{t(m.detail)}</span>
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
