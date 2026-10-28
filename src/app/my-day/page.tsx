"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";
import { PageLayout } from "@/components/PageLayout";
import { Card, Spinner } from "@/components/ui";
import { useCurrency, useResolvedBranch, useToken } from "@/lib/useShop";
import { useTranslation } from "@/contexts/LanguageContext";
import { cn, formatDate } from "@/lib/utils";
import { AlertTriangle, CalendarDays, HeartHandshake, Lightbulb, CalendarClock, ChevronRight, CheckCircle2 } from "lucide-react";

type MyDay = FunctionReturnType<typeof api.myDay.today>;
type Item = MyDay["attention"]["items"][number];
type Phrase = NonNullable<Item["detail"]>;

const REFRESH_MS = 5 * 60 * 1000;
const SECTION = "text-[10px] font-black uppercase tracking-widest text-on-surface-variant";

const TONE_DOT: Record<Item["tone"], string> = {
  error: "bg-error",
  warning: "bg-amber-500",
  info: "bg-primary",
  neutral: "bg-outline",
};

function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** The local midnight and the time now, moved on every few minutes so "today" stays right. */
function useClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return { now, dayStart: startOfDay(now) };
}

function usePhrase() {
  const { t } = useTranslation();
  const fmt = useCurrency();
  return (p: Phrase) => {
    if (!p.params) return t(p.text);
    const params = Object.fromEntries(
      Object.entries(p.params).map(([k, val]) => [k, k === "value" && typeof val === "number" ? fmt(val) : val])
    );
    return t(p.text, params);
  };
}

function ItemRow({ item, showDate }: { item: Item; showDate?: boolean }) {
  const { t } = useTranslation();
  const phrase = usePhrase();
  const body = (
    <div className="flex items-start gap-3 px-4 py-3">
      <span aria-hidden className={cn("mt-1.5 w-2 h-2 rounded-full shrink-0", TONE_DOT[item.tone])} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-on-surface break-words">{phrase(item.title)}</p>
        {item.detail && <p className="text-xs text-on-surface-variant mt-0.5 break-words line-clamp-2">{phrase(item.detail)}</p>}
        {showDate && item.when !== undefined && (
          <p className="text-[11px] text-on-surface-variant mt-0.5">{formatDate(item.when)}</p>
        )}
      </div>
      {item.href && (
        <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-bold text-primary">
          {t("Open")}
          <ChevronRight className="w-3.5 h-3.5" />
        </span>
      )}
    </div>
  );
  return (
    <li className="border-t border-outline first:border-t-0">
      {item.href ? (
        <Link href={item.href} className="block hover:bg-surface-container transition-colors">
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

function Zone({
  id,
  title,
  hint,
  icon: Icon,
  zone,
  empty,
  showDate,
}: {
  id: string;
  title: string;
  hint: string;
  icon: React.ElementType;
  zone: MyDay["attention"];
  empty: string;
  showDate?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Card className="overflow-hidden scroll-mt-4">
      <section id={id}>
        <header className="flex items-center gap-2 px-4 pt-4 pb-3">
          <Icon className="w-4 h-4 text-on-surface-variant" />
          <h2 className="text-sm font-black text-on-surface">{title}</h2>
          <span className="text-xs font-bold text-on-surface-variant">{zone.count}</span>
          <span className="ml-auto text-[11px] text-on-surface-variant hidden sm:inline">{hint}</span>
        </header>
        {zone.items.length === 0 ? (
          <p className="flex items-center gap-2 px-4 pb-4 text-xs text-on-surface-variant">
            <CheckCircle2 className="w-4 h-4 text-success" />
            {empty}
          </p>
        ) : (
          <ul className="border-t border-outline">
            {zone.items.map((item) => (
              <ItemRow key={item.key} item={item} showDate={showDate} />
            ))}
          </ul>
        )}
        {zone.count > zone.items.length && (
          <p className="px-4 py-2 border-t border-outline text-[11px] text-on-surface-variant">
            {t("Showing {shown} of {count}", { shown: zone.items.length, count: zone.count })}
          </p>
        )}
      </section>
    </Card>
  );
}

/** The next 7 days, one group per day. */
function Upcoming({ zone }: { zone: MyDay["upcoming"] }) {
  const { t, language } = useTranslation();
  const days = new Map<number, Item[]>();
  for (const item of zone.items) {
    const day = startOfDay(item.when ?? 0);
    days.set(day, [...(days.get(day) ?? []), item]);
  }
  const dayLabel = (ts: number) =>
    new Date(ts).toLocaleDateString(language === "pt" ? "pt-PT" : "en-GB", { weekday: "long", day: "numeric", month: "long" });
  return (
    <Card className="overflow-hidden">
      <section id="upcoming">
        <header className="flex items-center gap-2 px-4 pt-4 pb-3">
          <CalendarClock className="w-4 h-4 text-on-surface-variant" />
          <h2 className="text-sm font-black text-on-surface">{t("Next days")}</h2>
          <span className="text-xs font-bold text-on-surface-variant">{zone.count}</span>
          <span className="ml-auto text-[11px] text-on-surface-variant hidden sm:inline">{t("Planned, not yet done")}</span>
        </header>
        {days.size === 0 ? (
          <p className="px-4 pb-4 text-xs text-on-surface-variant">{t("Nothing planned for the next 7 days.")}</p>
        ) : (
          [...days].map(([day, items]) => (
            <div key={day} className="border-t border-outline">
              <p className={cn(SECTION, "px-4 pt-3 capitalize")}>{dayLabel(day)}</p>
              <ul>
                {items.map((item) => (
                  <ItemRow key={item.key} item={item} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>
    </Card>
  );
}

function Counter({ href, label, count, icon: Icon, tone }: { href: string; label: string; count: number; icon: React.ElementType; tone?: "error" }) {
  return (
    <a href={href} className="block">
      <Card className="p-4 hover:bg-surface-container transition-colors">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-on-surface-variant" />
          <p className={SECTION}>{label}</p>
        </div>
        <p className={cn("text-2xl font-display tracking-tighter mt-1", tone === "error" && count > 0 ? "text-error" : "text-on-surface")}>
          {count}
        </p>
      </Card>
    </a>
  );
}

export default function MyDayPage() {
  const { t, language } = useTranslation();
  const token = useToken();
  const { branchId, isAll } = useResolvedBranch();
  const { now, dayStart } = useClock();
  const data = useQuery(api.myDay.today, { token, branchId: isAll ? undefined : branchId, dayStart, now });

  const todayLabel = new Date(now).toLocaleDateString(language === "pt" ? "pt-PT" : "en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  if (data === undefined) {
    return (
      <PageLayout title={t("My day")} subtitle={todayLabel}>
        <Spinner />
      </PageLayout>
    );
  }

  return (
    <PageLayout title={t("My day")} subtitle={todayLabel}>
      <div className="space-y-4">
        <p className="text-sm text-on-surface-variant">
          {t("Hello {name}. This is what needs you today; each item opens where it is done.", { name: data.userName })}
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Counter href="#attention" label={t("Needs my attention")} count={data.attention.count} icon={AlertTriangle} tone="error" />
          <Counter href="#today" label={t("Today")} count={data.today.count} icon={CalendarDays} />
          <Counter href="#follow-ups" label={t("Follow-ups")} count={data.followUps.count} icon={HeartHandshake} />
          <Counter href="#knowledge" label={t("Relevant knowledge")} count={data.knowledge.count} icon={Lightbulb} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
          <div className="space-y-4">
            <Zone
              id="attention"
              title={t("Needs my attention")}
              hint={t("Decide or act now")}
              icon={AlertTriangle}
              zone={data.attention}
              empty={t("Nothing waiting for a decision.")}
              showDate
            />
            <Zone
              id="today"
              title={t("Today")}
              hint={t("Today's work")}
              icon={CalendarDays}
              zone={data.today}
              empty={t("Nothing scheduled for today.")}
            />
          </div>
          <div className="space-y-4">
            <Zone
              id="follow-ups"
              title={t("Follow-ups")}
              hint={t("Promises to customers not yet kept")}
              icon={HeartHandshake}
              zone={data.followUps}
              empty={t("No promises pending.")}
              showDate
            />
            <Zone
              id="knowledge"
              title={t("Relevant knowledge")}
              hint={t("What the data says needs a decision")}
              icon={Lightbulb}
              zone={data.knowledge}
              empty={t("Nothing crossing a threshold.")}
            />
            <Upcoming zone={data.upcoming} />
          </div>
        </div>
      </div>
    </PageLayout>
  );
}
