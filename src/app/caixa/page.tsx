"use client";

import { useState } from "react";
import { PageLayout } from "@/components/PageLayout";
import { AuthGuard } from "@/components/AuthGuard";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { Id } from "../../../convex/_generated/dataModel";
import { motion, AnimatePresence } from "framer-motion";
import {
  Landmark,
  Plus,
  Minus,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Lock,
} from "lucide-react";
import { formatDistance, format } from "date-fns";

// Extracted Sub-components & Helpers
import { BalanceCard, formatMT } from "@/components/caixa/Shared";
import { OpenRegisterModal } from "@/components/caixa/OpenRegisterModal";
import { CashMovementModal } from "@/components/caixa/CashMovementModal";
import { CloseRegisterModal } from "@/components/caixa/CloseRegisterModal";
import { CashMovementTable } from "@/components/caixa/CashMovementTable";

// ─────────────────────────────────────────────
// STATE A — No Active Session
// ─────────────────────────────────────────────
function NoSessionState({ onOpen, canOpen }: { onOpen: () => void; canOpen: boolean }) {
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
  const addMovement = useMutation(api.caixa.addMovement);
  const closeSession = useMutation(api.caixa.closeSession);

  const [cashInModal, setCashInModal] = useState(false);
  const [cashOutModal, setCashOutModal] = useState(false);
  const [closeModal, setCloseModal] = useState(false);

  const canManage =
    currentUser?.role === "admin" ||
    currentUser?.role === "manager" ||
    currentUser?.role === "pos_seller";

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
      <CashMovementTable movements={data.movements} />

      {/* Modals */}
      {cashInModal && (
        <CashMovementModal
          type="cash_in"
          currentBalance={data.expectedCash}
          onClose={() => setCashInModal(false)}
          onSave={async (amount, description) => {
            await addMovement({ token, sessionId, type: "cash_in", amount, description });
          }}
        />
      )}
      {cashOutModal && (
        <CashMovementModal
          type="cash_out"
          currentBalance={data.expectedCash}
          onClose={() => setCashOutModal(false)}
          onSave={async (amount, description) => {
            await addMovement({ token, sessionId, type: "cash_out", amount, description });
          }}
        />
      )}
      {closeModal && (
        <CloseRegisterModal
          expectedCash={data.expectedCash}
          onClose={() => setCloseModal(false)}
          onSave={async (actualCash, notes) => {
            return await closeSession({ token, sessionId, actualCash, notes });
          }}
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
  const openSession = useMutation(api.caixa.openSession);
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
              canOpen={
                currentUser.role === "admin" ||
                currentUser.role === "manager" ||
                currentUser.role === "pos_seller"
              }
            />
          </motion.div>
        )}
      </AnimatePresence>

      {showOpenModal && token && (
        <OpenRegisterModal
          onClose={() => setShowOpenModal(false)}
          onSave={async (openingAmount, notes) => {
            await openSession({ token, openingAmount, notes });
          }}
        />
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
