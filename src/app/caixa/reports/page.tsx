"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useQuery } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import { cn } from "@/lib/utils";
import { format, formatDistance } from "date-fns";
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Users,
  Filter,
  ChevronDown,
} from "lucide-react";
import { Id } from "../../../../convex/_generated/dataModel";

function formatMT(amount: number): string {
  return `${amount.toLocaleString("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MT`;
}

const MOVEMENT_COLORS: Record<string, string> = {
  opening: "text-blue-500 bg-blue-500/10 border-blue-500/30",
  sale: "text-emerald-500 bg-emerald-500/10 border-emerald-500/30",
  cash_in: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
  cash_out: "text-error bg-error/10 border-error/30",
  closing: "text-on-surface-variant bg-surface-container border-outline",
};

const MOVEMENT_LABELS: Record<string, string> = {
  opening: "Opening",
  sale: "Cash Sale",
  cash_in: "Cash In",
  cash_out: "Cash Out",
  closing: "Closing",
};

type SessionStatus = "all" | "open" | "closed";

import { useBranch } from "@/contexts/BranchContext";

function CaixaReportsContent() {
  const [statusFilter, setStatusFilter] = useState<SessionStatus>("all");
  const { selectedBranchId } = useBranch();

  const sessions = useQuery(api.caixa.listSessions, {
    status: statusFilter === "all" ? undefined : statusFilter,
    branchId: selectedBranchId,
    limit: 100,
  });

  const allSessions = sessions ?? [];

  // Summary stats
  const openCount = allSessions.filter((s) => s.status === "open").length;
  const closedCount = allSessions.filter((s) => s.status === "closed").length;
  const shortages = allSessions.filter(
    (s) => s.status === "closed" && s.difference !== undefined && s.difference < 0
  );
  const surpluses = allSessions.filter(
    (s) => s.status === "closed" && s.difference !== undefined && s.difference > 0
  );
  const totalCashSales = allSessions.reduce((sum, s) => sum + (s.cashSalesTotal ?? 0), 0);
  const totalCashIn = allSessions.reduce((sum, s) => sum + (s.cashInTotal ?? 0), 0);
  const totalCashOut = allSessions.reduce((sum, s) => sum + (s.cashOutTotal ?? 0), 0);

  return (
    <div className="space-y-6">

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Cash Sales"
          value={formatMT(totalCashSales)}
          icon={<TrendingUp className="w-5 h-5" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          border="border-emerald-500/30"
        />
        <StatCard
          label="Total Cash In"
          value={formatMT(totalCashIn)}
          icon={<Landmark className="w-5 h-5" />}
          color="text-blue-500"
          bg="bg-blue-500/10"
          border="border-blue-500/30"
        />
        <StatCard
          label="Total Cash Out"
          value={formatMT(totalCashOut)}
          icon={<TrendingDown className="w-5 h-5" />}
          color="text-error"
          bg="bg-error/10"
          border="border-error/30"
        />
        <StatCard
          label="Shortages"
          value={shortages.length.toString()}
          icon={<AlertTriangle className="w-5 h-5" />}
          color={shortages.length > 0 ? "text-error" : "text-on-surface-variant"}
          bg={shortages.length > 0 ? "bg-error/10" : "bg-surface-container-low"}
          border={shortages.length > 0 ? "border-error/30" : "border-outline"}
        />
      </div>

      {/* Status + Shortage Alerts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl border-2 border-outline bg-surface flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
            <Landmark className="w-5 h-5 text-on-surface-variant" />
          </div>
          <div>
            <p className="text-2xl font-display text-on-surface">{openCount}</p>
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              Open Sessions
            </p>
          </div>
        </div>
        <div className="p-4 rounded-2xl border-2 border-outline bg-surface flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center">
            <CheckCircle2 className="w-5 h-5 text-emerald-500" />
          </div>
          <div>
            <p className="text-2xl font-display text-on-surface">{closedCount}</p>
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              Closed Sessions
            </p>
          </div>
        </div>
        <div className={cn(
          "p-4 rounded-2xl border-2 flex items-center gap-3",
          surpluses.length > 0 ? "bg-blue-500/10 border-blue-500/30" : "bg-surface border-outline"
        )}>
          <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-display text-on-surface">{surpluses.length}</p>
            <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
              Surpluses
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 text-on-surface-variant">
          <Filter className="w-4 h-4" />
          <span className="text-xs font-black uppercase tracking-widest">Filter:</span>
        </div>
        {(["all", "open", "closed"] as SessionStatus[]).map((f) => (
          <button
            key={f}
            onClick={() => setStatusFilter(f)}
            className={cn(
              "px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest border-2 transition-all",
              statusFilter === f
                ? "bg-primary border-primary text-on-primary shadow-hard"
                : "bg-surface border-outline text-on-surface-variant hover:border-primary hover:text-primary"
            )}
          >
            {f === "all" ? "All Sessions" : f === "open" ? "Open" : "Closed"}
          </button>
        ))}
      </div>

      {/* Sessions Table */}
      <div className="bg-surface border-2 border-outline rounded-2xl overflow-hidden shadow-hard">
        <div className="px-4 py-3 border-b-2 border-outline bg-surface-container-low flex items-center justify-between">
          <h2 className="font-display text-on-surface text-xl">
            Sessions ({allSessions.length})
          </h2>
        </div>

        {sessions === undefined ? (
          <div className="p-12 flex justify-center">
            <div className="w-8 h-8 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : allSessions.length === 0 ? (
          <div className="p-12 text-center">
            <Landmark className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-2" />
            <p className="font-bold text-on-surface-variant text-sm">No sessions found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-outline-variant">
                  {["Opened By", "Status", "Opened", "Opening", "Cash Sales", "Cash In", "Cash Out", "Expected", "Actual", "Difference"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allSessions.map((session) => (
                  <SessionRow key={session._id} session={session} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: any }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const isOpen = session.status === "open";
  const diff = session.difference;
  const hasDiff = diff !== undefined && diff !== null;

  return (
    <>
      <tr
        className="border-b border-outline-variant hover:bg-surface-container-low/50 transition-colors cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Users className="w-3.5 h-3.5 text-primary" />
            </div>
            <div>
              <p className="text-xs font-black text-on-surface">{session.userName}</p>
              <p className="text-[10px] font-bold text-on-surface-variant">@{session.username}</p>
            </div>
          </div>
        </td>
        <td className="px-4 py-3">
          <span
            className={cn(
              "inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider",
              isOpen
                ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/30"
                : "bg-surface-container text-on-surface-variant border border-outline"
            )}
          >
            {isOpen ? <Clock className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
            {isOpen ? "Open" : "Closed"}
          </span>
        </td>
        <td className="px-4 py-3 text-xs font-bold text-on-surface-variant whitespace-nowrap">
          {format(session.openedAt, "dd/MM HH:mm")}
          {session.closedAt && (
            <div className="text-[10px] opacity-60">
              → {format(session.closedAt, "dd/MM HH:mm")}
            </div>
          )}
        </td>
        <AmountCell value={session.openingAmount} />
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-black text-emerald-500">{formatMT(session.cashSalesTotal || 0)}</span>
            {session.salesByUser && session.salesByUser.length > 0 && (
              <div className="flex flex-col gap-0.5 mt-1">
                {session.salesByUser.map((s: { username: string; amount: number }) => (
                  <span key={s.username} className="text-[9px] font-bold text-on-surface-variant uppercase">
                    @{s.username}: {formatMT(s.amount)}
                  </span>
                ))}
              </div>
            )}
          </div>
        </td>
        <AmountCell value={session.cashInTotal} color="text-emerald-600" />
        <AmountCell value={session.cashOutTotal} color="text-error" prefix="-" />
        <AmountCell value={session.expectedCash} bold />
        <AmountCell value={session.actualCash} />
        <td className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            {hasDiff ? (
              <span
                className={cn(
                  "font-black text-sm",
                  diff === 0
                    ? "text-emerald-500"
                    : diff > 0
                    ? "text-blue-500"
                    : "text-error"
                )}
              >
                {diff > 0 ? "+" : ""}{formatMT(diff)}
              </span>
            ) : (
              <span className="text-on-surface-variant text-xs">—</span>
            )}
            <ChevronDown className={cn("w-4 h-4 text-on-surface-variant/50 transition-transform duration-200", isExpanded && "transform rotate-180")} />
          </div>
        </td>
      </tr>
      {isExpanded && <SessionDetailsRow sessionId={session._id} />}
    </>
  );
}

function SessionDetailsRow({ sessionId }: { sessionId: Id<"cashRegisterSessions"> }) {
  const data = useQuery(api.caixa.getSessionWithMovements, { sessionId });

  return (
    <tr className="bg-surface-container-lowest/30 border-b border-outline-variant">
      <td colSpan={10} className="px-4 py-3">
        <div className="bg-surface border-2 border-outline rounded-2xl p-4 max-w-4xl shadow-inner space-y-3">
          <h3 className="text-xs font-black text-on-surface uppercase tracking-widest flex items-center gap-2">
            <Landmark className="w-4 h-4 text-primary" />
            Session Movements History
          </h3>
          
          {!data ? (
            <div className="py-6 flex justify-center">
              <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            </div>
          ) : data.movements.length === 0 ? (
            <p className="text-xs text-on-surface-variant font-bold text-center py-4">No movements recorded in this session</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b-2 border-outline text-[10px] uppercase tracking-wider text-on-surface-variant font-black">
                    <th className="pb-2 font-black">Time</th>
                    <th className="pb-2 font-black">Type</th>
                    <th className="pb-2 font-black">Description</th>
                    <th className="pb-2 font-black">Amount</th>
                    <th className="pb-2 font-black">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/50">
                  {data.movements.map((m) => {
                    const isPositive = m.type === "opening" || m.type === "sale" || m.type === "cash_in";
                    const colorClass = MOVEMENT_COLORS[m.type] || MOVEMENT_COLORS.closing;
                    return (
                      <tr key={m._id} className="hover:bg-surface-container-low/35 transition-colors">
                        <td className="py-2.5 font-bold text-on-surface-variant">
                          {format(m.createdAt, "HH:mm")}
                        </td>
                        <td className="py-2.5">
                          <span className={cn("inline-flex px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border", colorClass)}>
                            {MOVEMENT_LABELS[m.type]}
                          </span>
                        </td>
                        <td className="py-2.5 font-bold text-on-surface">{m.description}</td>
                        <td className="py-2.5 font-black text-sm">
                          <span className={cn(
                            m.type === "cash_out" ? "text-error" : m.type === "closing" ? "text-on-surface-variant" : "text-emerald-500"
                          )}>
                            {m.type === "cash_out" ? "-" : isPositive ? "+" : ""}
                            {formatMT(m.amount)}
                          </span>
                        </td>
                        <td className="py-2.5 font-bold text-on-surface-variant">@{m.username}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </td>
    </tr>
  );
}

function AmountCell({
  value,
  color = "text-on-surface",
  prefix = "",
  bold = false,
}: {
  value?: number;
  color?: string;
  prefix?: string;
  bold?: boolean;
}) {
  return (
    <td className="px-4 py-3">
      {value !== undefined ? (
        <span className={cn("text-xs font-bold", color, bold && "font-black")}>
          {prefix}{formatMT(value)}
        </span>
      ) : (
        <span className="text-on-surface-variant text-xs">—</span>
      )}
    </td>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
  bg,
  border,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}) {
  return (
    <div className={cn("p-5 rounded-2xl border-2 flex flex-col gap-3", bg, border)}>
      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", bg)}>
        <span className={color}>{icon}</span>
      </div>
      <div>
        <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">
          {label}
        </p>
        <p className={cn("text-xl font-display mt-0.5", color)}>{value}</p>
      </div>
    </div>
  );
}

export default function CaixaReportsPage() {
  return (
    <AuthGuard requiredRoles={["admin", "manager"]}>
      <PageLayout
        title="Caixa Reports"
        subtitle="Cash register sessions overview and analysis"
      >
        <CaixaReportsContent />
      </PageLayout>
    </AuthGuard>
  );
}
