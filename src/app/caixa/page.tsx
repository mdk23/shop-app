"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
  Landmark,
  Plus,
  Minus,
  X,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  DollarSign,
  CheckCircle2,
  Lock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistance, format } from "date-fns";

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

// ─────────────────────────────────────────────
// MODAL — Open Register
// ─────────────────────────────────────────────
function OpenRegisterModal({
  token,
  onClose,
}: {
  token: string;
  onClose: () => void;
}) {
  const openSession = useMutation(api.caixa.openSession);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed < 0) {
      setError("Enter a valid opening amount (0 or more)");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await openSession({ token, openingAmount: parsed, notes: notes || undefined });
      toast.success("Cash register opened successfully!");
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to open register");
    } finally {
      setSubmitting(false);
    }
  };

  const quickAmounts = [0, 100, 200, 500, 1000, 2000, 5000];

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
        <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-surface-container-low shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Landmark className="w-5 h-5 text-primary" />
            </div>
            <h2 className="text-xl font-display text-on-surface">Open Cash Register</h2>
          </div>
          <button type="button" onClick={onClose} className={closeButtonClass}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <ErrorAlert message={error} />}

          <div className="space-y-2">
            <label className={labelClass}>Opening Amount (MT)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              className={inputClass}
              placeholder="0.00"
              autoFocus
              disabled={submitting}
            />
          </div>

          {/* Quick amounts */}
          <div className="space-y-2">
            <p className={labelClass}>Quick Select</p>
            <div className="grid grid-cols-4 gap-2">
              {quickAmounts.map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setAmount(q.toString())}
                  className={cn(
                    "py-2 rounded-xl text-xs font-black uppercase tracking-wider border-2 transition-all",
                    amount === q.toString()
                      ? "bg-primary border-primary text-on-primary shadow-hard"
                      : "bg-surface-container-low border-outline text-on-surface-variant hover:border-primary hover:text-primary"
                  )}
                >
                  {q.toLocaleString()} MT
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Notes (Optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(inputClass, "resize-none h-20")}
              placeholder="Any notes about this opening..."
              disabled={submitting}
            />
          </div>
        </div>

        <div className="p-6 border-t-2 border-outline flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className={cancelButtonClass} disabled={submitting}>
            Cancel
          </button>
          <button type="submit" disabled={submitting} className={submitButtonClass}>
            {submitting ? "Opening..." : "Open Register"}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

// ─────────────────────────────────────────────
// MODAL — Cash In / Cash Out
// ─────────────────────────────────────────────
function CashMovementModal({
  token,
  sessionId,
  type,
  currentBalance,
  onClose,
}: {
  token: string;
  sessionId: Id<"cashRegisterSessions">;
  type: "cash_in" | "cash_out";
  currentBalance: number;
  onClose: () => void;
}) {
  const addMovement = useMutation(api.caixa.addMovement);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCashIn = type === "cash_in";
  const presets = isCashIn
    ? ["Owner Deposit", "Extra Float", "Change Supply", "Other"]
    : ["Buy Ice", "Buy Charcoal", "Emergency Expense", "Supplier Payment", "Other"];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(amount);
    if (isNaN(parsed) || parsed <= 0) {
      setError("Enter an amount greater than 0");
      return;
    }
    if (!isCashIn && parsed > currentBalance) {
      setError(`Insufficient funds. Only ${formatMT(currentBalance)} available.`);
      return;
    }
    if (!description.trim()) {
      setError("A description is required");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await addMovement({ token, sessionId, type, amount: parsed, description });
      toast.success(`${isCashIn ? "Cash In" : "Cash Out"} recorded: ${formatMT(parsed)}`);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to record movement");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
        <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-surface-container-low shrink-0">
          <div className="flex items-center gap-3">
            <div
              className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                isCashIn ? "bg-emerald-500/10" : "bg-error/10"
              )}
            >
              {isCashIn ? (
                <Plus className="w-5 h-5 text-emerald-500" />
              ) : (
                <Minus className="w-5 h-5 text-error" />
              )}
            </div>
            <h2 className="text-xl font-display text-on-surface">
              {isCashIn ? "Cash In" : "Cash Out"}
            </h2>
          </div>
          <button type="button" onClick={onClose} className={closeButtonClass}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && <ErrorAlert message={error} />}

          <div className="space-y-2">
            <label className={labelClass}>Amount (MT)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setError(null); }}
              className={inputClass}
              placeholder="0.00"
              autoFocus
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <label className={labelClass}>Reason</label>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {presets.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setDescription(p !== "Other" ? p : "")}
                  className={cn(
                    "py-2 px-3 rounded-xl text-xs font-black text-left border-2 transition-all",
                    description === p && p !== "Other"
                      ? isCashIn
                        ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-600"
                        : "bg-error/10 border-error/30 text-error"
                      : "bg-surface-container-low border-outline text-on-surface-variant hover:border-outline"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={description}
              onChange={(e) => { setDescription(e.target.value); setError(null); }}
              className={inputClass}
              placeholder="Or type a custom reason..."
              disabled={submitting}
            />
          </div>
        </div>

        <div className="p-6 border-t-2 border-outline flex gap-3 shrink-0">
          <button type="button" onClick={onClose} className={cancelButtonClass} disabled={submitting}>
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className={cn(
              "flex-1 py-3 rounded-xl font-black text-xs uppercase tracking-widest transition-all shadow-hard disabled:opacity-50",
              isCashIn
                ? "bg-emerald-500 text-white hover:opacity-90"
                : "bg-error text-on-error hover:opacity-90"
            )}
          >
            {submitting ? "Saving..." : `Record ${isCashIn ? "Cash In" : "Cash Out"}`}
          </button>
        </div>
      </form>
    </ModalBackdrop>
  );
}

// ─────────────────────────────────────────────
// MODAL — Close Register
// ─────────────────────────────────────────────
function CloseRegisterModal({
  token,
  sessionId,
  expectedCash,
  onClose,
}: {
  token: string;
  sessionId: Id<"cashRegisterSessions">;
  expectedCash: number;
  onClose: () => void;
}) {
  const closeSession = useMutation(api.caixa.closeSession);
  const [actualCash, setActualCash] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ expectedCash: number; difference: number } | null>(null);

  const parsed = parseFloat(actualCash);
  const hasValidAmount = !isNaN(parsed) && parsed >= 0;
  const difference = hasValidAmount ? parsed - expectedCash : null;
  const needsNote = difference !== null && Math.abs(difference) > 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasValidAmount) { setError("Enter the actual cash amount"); return; }
    if (needsNote && !notes.trim()) { setError("A closing note is required for differences over 5 MT."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await closeSession({ token, sessionId, actualCash: parsed, notes: notes || undefined });
      setResult(res);
      toast.success("Cash register closed successfully!");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to close register");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop onClose={onClose}>
      {result ? (
        <div className="p-8 flex flex-col items-center gap-5 text-center">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-emerald-500" />
          </div>
          <div>
            <h2 className="text-2xl font-display text-on-surface mb-1">Register Closed</h2>
            <p className="text-sm text-on-surface-variant font-bold">Session summary</p>
          </div>
          <div className="w-full bg-surface-container-low border-2 border-outline rounded-2xl p-6 space-y-3 text-left">
            <SummaryRow label="Expected Cash" value={formatMT(result.expectedCash)} />
            <SummaryRow label="Actual Cash" value={formatMT(parsed)} />
            <div className="pt-3 border-t border-outline">
              <SummaryRow
                label="Difference"
                value={`${result.difference >= 0 ? "+" : ""}${formatMT(result.difference)}`}
                accent={result.difference === 0 ? "neutral" : result.difference > 0 ? "positive" : "negative"}
              />
            </div>
          </div>
          <button onClick={onClose} className={submitButtonClass}>Done</button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col max-h-[90vh]">
          <div className="p-6 border-b-2 border-outline flex items-center justify-between bg-surface-container-low shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center">
                <Lock className="w-5 h-5 text-error" />
              </div>
              <h2 className="text-xl font-display text-on-surface">Close Cash Register</h2>
            </div>
            <button type="button" onClick={onClose} className={closeButtonClass}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {error && <ErrorAlert message={error} />}

            <div className="p-4 bg-surface-container-low rounded-2xl border border-outline-variant">
              <p className="text-xs font-black text-on-surface-variant uppercase tracking-widest mb-1">
                Expected Cash
              </p>
              <p className="text-3xl font-display text-on-surface">{formatMT(expectedCash)}</p>
            </div>

            <div className="space-y-2">
              <label className={labelClass}>Actual Cash Counted (MT)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={actualCash}
                onChange={(e) => { setActualCash(e.target.value); setError(null); }}
                className={inputClass}
                placeholder="Enter the amount you counted"
                autoFocus
                disabled={submitting}
              />
            </div>

            {/* Live difference preview */}
            {hasValidAmount && difference !== null && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "p-4 rounded-2xl border-2 flex items-center justify-between",
                  difference === 0
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : difference > 0
                    ? "bg-blue-500/10 border-blue-500/30"
                    : "bg-error/10 border-error/30"
                )}
              >
                <p className="text-xs font-black uppercase tracking-widest text-on-surface-variant">
                  Difference
                </p>
                <p
                  className={cn(
                    "text-2xl font-display",
                    difference === 0
                      ? "text-emerald-500"
                      : difference > 0
                      ? "text-blue-500"
                      : "text-error"
                  )}
                >
                  {difference >= 0 ? "+" : ""}{formatMT(difference)}
                </p>
              </motion.div>
            )}

            <div className="space-y-2">
              <label className={labelClass}>Closing Notes {needsNote ? <span className="text-error font-black uppercase">(Required)</span> : "(Optional)"}</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={cn(inputClass, "resize-none h-20")}
                placeholder="Any notes about this closing..."
                disabled={submitting}
              />
            </div>
          </div>

          <div className="p-6 border-t-2 border-outline flex gap-3 shrink-0">
            <button type="button" onClick={onClose} className={cancelButtonClass} disabled={submitting}>
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !hasValidAmount}
              className="flex-1 py-3 rounded-xl bg-error text-on-error font-black text-xs uppercase tracking-widest hover:opacity-90 transition-all shadow-hard disabled:opacity-50"
            >
              {submitting ? "Closing..." : "Close Register"}
            </button>
          </div>
        </form>
      )}
    </ModalBackdrop>
  );
}

// ─────────────────────────────────────────────
// STATE A — No Active Session
// ─────────────────────────────────────────────
function NoSessionState({ onOpen, canOpen }: { onOpen: () => void, canOpen: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center gap-6 text-center"
      >
        <div className="w-28 h-28 rounded-3xl bg-surface border-4 border-outline shadow-hard-lg flex items-center justify-center">
          <Landmark className="w-14 h-14 text-on-surface-variant/40" />
        </div>
        <div>
          <h2 className="text-4xl font-display text-on-surface mb-2">
            No Open Register
          </h2>
          <p className="text-on-surface-variant font-bold text-sm max-w-sm">
            Open the cash register to start accepting cash payments and tracking movements.
          </p>
        </div>
        {canOpen ? (
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onOpen}
            className="flex items-center gap-3 px-8 py-5 bg-primary text-on-primary rounded-2xl font-black text-sm uppercase tracking-widest shadow-hard-lg hover:bg-secondary transition-colors"
            id="open-register-btn"
          >
            <Landmark className="w-5 h-5" />
            Open Cash Register
          </motion.button>
        ) : (
          <div className="p-4 bg-surface-container-low border border-outline rounded-xl mt-4">
            <p className="text-sm font-bold text-on-surface-variant">
              Waiting for a manager to open the cash register.
            </p>
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STATE B — Active Session
// ─────────────────────────────────────────────
function ActiveSessionView({
  sessionId,
  token,
}: {
  sessionId: Id<"cashRegisterSessions">;
  token: string;
}) {
  const { currentUser } = useAuth();
  const data = useQuery(api.caixa.getSessionWithMovements, { sessionId });
  const [cashInModal, setCashInModal] = useState(false);
  const [cashOutModal, setCashOutModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);

  const canManage = currentUser?.role === "admin" || currentUser?.role === "manager" || currentUser?.role === "pos_seller";

  if (!data) {
    return (
      <div className="flex justify-center items-center min-h-[40vh]">
        <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const cashSales = data.movements.filter((m) => m.type === "sale").reduce((s, m) => s + m.amount, 0);
  const cashIn = data.movements.filter((m) => m.type === "cash_in").reduce((s, m) => s + m.amount, 0);
  const cashOut = data.movements.filter((m) => m.type === "cash_out").reduce((s, m) => s + m.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border-2 border-emerald-500/30 flex items-center justify-center">
            <Landmark className="w-6 h-6 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-2xl font-display text-on-surface">Cash Register Open</h1>
            <p className="text-xs font-bold text-on-surface-variant">
              Opened by @{data.username} ·{" "}
              {formatDistance(data.openedAt, Date.now(), { addSuffix: true })} ·{" "}
              {format(data.openedAt, "HH:mm dd/MM/yyyy")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button
              onClick={() => setCloseModal(true)}
              className="flex items-center gap-2 px-5 py-3 bg-error/10 text-error border-2 border-error/30 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-error hover:text-on-error transition-all"
              id="close-register-btn"
            >
              <Lock className="w-4 h-4" />
              Close Register
            </button>
          )}
        </div>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BalanceCard
          label="Opening"
          value={data.openingAmount}
          icon={<Landmark className="w-5 h-5" />}
          color="text-blue-500"
          bg="bg-blue-500/10"
          border="border-blue-500/30"
        />
        <BalanceCard
          label="Cash Sales"
          value={cashSales}
          icon={<TrendingUp className="w-5 h-5" />}
          color="text-emerald-500"
          bg="bg-emerald-500/10"
          border="border-emerald-500/30"
          prefix="+"
        />
        <BalanceCard
          label="Cash In"
          value={cashIn}
          icon={<ChevronUp className="w-5 h-5" />}
          color="text-emerald-600"
          bg="bg-emerald-500/10"
          border="border-emerald-500/30"
          prefix="+"
        />
        <BalanceCard
          label="Cash Out"
          value={cashOut}
          icon={<TrendingDown className="w-5 h-5" />}
          color="text-error"
          bg="bg-error/10"
          border="border-error/30"
          prefix="-"
        />
      </div>

      {/* Expected Balance — Big */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-primary text-on-primary rounded-3xl p-8 flex flex-col sm:flex-row items-center justify-between gap-6 border-2 border-outline shadow-hard-lg relative overflow-hidden"
      >
        <motion.div
          initial={{ x: "-100%" }}
          animate={{ x: "300%" }}
          transition={{ repeat: Infinity, duration: 4, ease: "linear", repeatDelay: 3 }}
          className="absolute inset-0 bg-white/5 skew-x-[20deg]"
        />
        <div className="relative z-10">
          <p className="text-on-primary/70 text-xs font-black uppercase tracking-[0.25em] mb-1">
            Live Expected Balance
          </p>
          <p className="text-5xl font-display tracking-tighter">{formatMT(data.expectedCash)}</p>
        </div>
        <div className="flex gap-3 relative z-10">
          <button
            onClick={() => setCashInModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-on-primary/10 hover:bg-on-primary/20 text-on-primary rounded-xl font-black text-xs uppercase tracking-widest border border-on-primary/20 transition-all"
            id="cash-in-btn"
          >
            <Plus className="w-4 h-4" />
            Cash In
          </button>
          <button
            onClick={() => setCashOutModal(true)}
            className="flex items-center gap-2 px-5 py-3 bg-on-primary/10 hover:bg-on-primary/20 text-on-primary rounded-xl font-black text-xs uppercase tracking-widest border border-on-primary/20 transition-all"
            id="cash-out-btn"
          >
            <Minus className="w-4 h-4" />
            Cash Out
          </button>
        </div>
      </motion.div>

      {/* Movements Table */}
      <div>
        <h2 className="text-xl font-display text-on-surface mb-4">Movements</h2>
        <div className="bg-surface border-2 border-outline rounded-2xl overflow-hidden shadow-hard">
          {data.movements.length === 0 ? (
            <div className="p-8 text-center">
              <DollarSign className="w-8 h-8 text-on-surface-variant/30 mx-auto mb-2" />
              <p className="font-bold text-on-surface-variant text-sm">No movements yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-outline bg-surface-container-low">
                    {["Time", "Type", "Description", "Amount", "User"].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[10px] font-black text-on-surface-variant uppercase tracking-widest"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.movements.map((m) => {
                    const isPositive = m.type === "opening" || m.type === "sale" || m.type === "cash_in";
                    const colorClass = MOVEMENT_COLORS[m.type] || MOVEMENT_COLORS.closing;
                    return (
                      <tr
                        key={m._id}
                        className="border-b border-outline-variant hover:bg-surface-container-low/50 transition-colors"
                      >
                        <td className="px-4 py-3 text-xs font-bold text-on-surface-variant whitespace-nowrap">
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {format(m.createdAt, "HH:mm")}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-flex px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border",
                              colorClass
                            )}
                          >
                            {MOVEMENT_LABELS[m.type]}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-on-surface-variant max-w-[200px] truncate">
                          {m.description}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "font-black text-sm",
                              m.type === "cash_out"
                                ? "text-error"
                                : m.type === "closing"
                                ? "text-on-surface-variant"
                                : "text-emerald-500"
                            )}
                          >
                            {m.type === "cash_out" ? "-" : isPositive ? "+" : ""}
                            {formatMT(m.amount)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs font-bold text-on-surface-variant">
                          @{m.username}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {cashInModal && (
        <CashMovementModal
          token={token}
          sessionId={sessionId}
          type="cash_in"
          currentBalance={data.expectedCash}
          onClose={() => setCashInModal(false)}
        />
      )}
      {cashOutModal && (
        <CashMovementModal
          token={token}
          sessionId={sessionId}
          type="cash_out"
          currentBalance={data.expectedCash}
          onClose={() => setCashOutModal(false)}
        />
      )}
      {closeModal && (
        <CloseRegisterModal
          token={token}
          sessionId={sessionId}
          expectedCash={data.expectedCash}
          onClose={() => setCloseModal(false)}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
function CaixaContent() {
  const { currentUser, token } = useAuth();
  const activeSession = useQuery(api.caixa.getActiveSession, { token });
  const [showOpenModal, setShowOpenModal] = useState(false);

  if (!currentUser || !token) return null;

  return (
    <div>
      <AnimatePresence mode="wait">
        {activeSession === undefined ? (
          // Loading
          <div key="loading" className="flex justify-center items-center min-h-[60vh]">
            <div className="w-10 h-10 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : activeSession ? (
          // Active session
          <motion.div
            key="active"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <ActiveSessionView sessionId={activeSession._id} token={token} />
          </motion.div>
        ) : (
          // No session
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <NoSessionState 
              onOpen={() => setShowOpenModal(true)} 
              canOpen={currentUser.role === "admin" || currentUser.role === "manager" || currentUser.role === "pos_seller"} 
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showOpenModal && token && (
        <OpenRegisterModal token={token} onClose={() => setShowOpenModal(false)} />
      )}
    </div>
  );
}

export default function CaixaPage() {
  return (
    <AuthGuard requiredPermission="access_caixa">
      <PageLayout>
        <CaixaContent />
      </PageLayout>
    </AuthGuard>
  );
}

// ─────────────────────────────────────────────
// SHARED COMPONENTS
// ─────────────────────────────────────────────

function BalanceCard({
  label,
  value,
  icon,
  color,
  bg,
  border,
  prefix = "",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
  prefix?: string;
}) {
  return (
    <div className={cn("p-4 rounded-2xl border-2", bg, border)}>
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center mb-3", bg)}>
        <span className={color}>{icon}</span>
      </div>
      <p className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest mb-1">
        {label}
      </p>
      <p className={cn("text-xl font-display", color)}>
        {prefix}{formatMT(value)}
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: string;
  accent?: "positive" | "negative" | "neutral";
}) {
  return (
    <div className="flex justify-between items-center">
      <p className="text-sm font-bold text-on-surface-variant">{label}</p>
      <p
        className={cn(
          "font-black text-sm",
          accent === "positive" ? "text-emerald-500" : accent === "negative" ? "text-error" : "text-on-surface"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ModalBackdrop({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        className="bg-surface border-2 border-outline rounded-2xl w-full max-w-lg shadow-hard-lg overflow-hidden"
      >
        {children}
      </motion.div>
    </div>
  );
}

function ErrorAlert({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 p-4 bg-error/10 border border-error/30 rounded-xl">
      <AlertCircle className="w-4 h-4 text-error shrink-0 mt-0.5" />
      <p className="text-error text-sm font-bold">{message}</p>
    </div>
  );
}

const inputClass =
  "w-full px-4 py-3 bg-surface-container-low border-2 border-outline rounded-xl font-bold text-on-surface placeholder:text-on-surface-variant/40 focus:outline-none focus:border-primary transition-all text-sm";
const labelClass = "block text-xs font-black text-on-surface uppercase tracking-widest";
const closeButtonClass =
  "w-8 h-8 rounded-lg border border-outline flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all";
const cancelButtonClass =
  "flex-1 py-3 rounded-xl border-2 border-outline font-black text-xs uppercase tracking-widest text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-all";
const submitButtonClass =
  "flex-1 py-3 rounded-xl bg-primary text-on-primary font-black text-xs uppercase tracking-widest hover:bg-secondary transition-colors shadow-hard disabled:opacity-50";
