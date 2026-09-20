"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
  Field,
  TextInput,
  Textarea,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  StatCard,
} from "@/components/ui";
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { ArrowDownCircle, ArrowUpCircle, Lock } from "lucide-react";

const MOVE_TONE: Record<string, "neutral" | "success" | "error" | "info" | "warning"> = {
  opening: "neutral",
  sale: "success",
  refund: "error",
  cash_in: "info",
  cash_out: "warning",
  closing: "neutral",
};

export default function CashRegisterPage() {
  const token = useToken();
  const fmt = useCurrency();
  const { branchId, branchName } = useResolvedBranch();
  const { t } = useTranslation();

  const session = useQuery(
    api.cashRegister.getActiveSession,
    token ? { token, branchId: branchId ?? undefined } : "skip"
  );
  const detail = useQuery(
    api.cashRegister.getSessionWithMovements,
    session ? { sessionId: session._id } : "skip"
  );

  const openSession = useMutation(api.cashRegister.openSession);
  const addMovement = useMutation(api.cashRegister.addMovement);
  const closeSession = useMutation(api.cashRegister.closeSession);

  const [opening, setOpening] = useState("");
  const [openNotes, setOpenNotes] = useState("");
  const [moveOpen, setMoveOpen] = useState<null | "cash_in" | "cash_out">(null);
  const [moveAmount, setMoveAmount] = useState("");
  const [moveDesc, setMoveDesc] = useState("");
  const [closeOpen, setCloseOpen] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const doOpen = async () => {
    setBusy(true);
    try {
      await openSession({
        token,
        openingAmount: Number(opening) || 0,
        notes: openNotes || undefined,
        branchId: branchId ?? undefined,
      });
      toast.success(t("Register opened"));
      setOpening("");
      setOpenNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  const doMove = async () => {
    if (!session || !moveOpen) return;
    if (!moveAmount || Number(moveAmount) <= 0) return toast.error(t("Enter amount."));
    if (!moveDesc.trim()) return toast.error(t("Enter a description."));
    setBusy(true);
    try {
      await addMovement({
        token,
        sessionId: session._id,
        type: moveOpen,
        amount: Number(moveAmount),
        description: moveDesc,
      });
      toast.success(t("Recorded"));
      setMoveOpen(null);
      setMoveAmount("");
      setMoveDesc("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  const doClose = async () => {
    if (!session) return;
    setBusy(true);
    try {
      const res = await closeSession({
        token,
        sessionId: session._id,
        actualCash: Number(actualCash) || 0,
        notes: closeNotes || undefined,
      });
      toast.success(
        t("Closed · difference {diff}", { diff: fmt(res.difference) })
      );
      setCloseOpen(false);
      setActualCash("");
      setCloseNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageLayout title={t("Cash Register")} subtitle={t("Session · {branch}", { branch: branchName })}>
      {session === undefined ? (
        <Spinner />
      ) : !session ? (
        <Card className="max-w-md mx-auto p-6">
          <h3 className="text-sm font-black uppercase tracking-wider mb-1">
            {t("Open the register")}
          </h3>
          <p className="text-xs text-on-surface-variant mb-4">
            {t("No open session for {branch}. Enter the starting cash float.", { branch: branchName })}
          </p>
          <Field label={t("Opening amount")} required>
            <TextInput
              type="number"
              value={opening}
              onChange={(e) => setOpening(e.target.value)}
            />
          </Field>
          <Field label={t("Notes")}>
            <Textarea value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} />
          </Field>
          <Button className="w-full mt-3" onClick={doOpen} loading={busy}>
            {t("Open Register")}
          </Button>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label={t("Opening float")} value={fmt(session.openingAmount)} />
            <StatCard
              label={t("Cash sales")}
              value={fmt(detail?.movements.filter((m) => m.type === "sale").reduce((a, m) => a + m.amount, 0) ?? 0)}
              accent="success"
            />
            <StatCard
              label={t("Refunds")}
              value={fmt(detail?.movements.filter((m) => m.type === "refund").reduce((a, m) => a + m.amount, 0) ?? 0)}
              accent="error"
            />
            <StatCard
              label={t("Expected in drawer")}
              value={fmt(detail?.expectedCash ?? session.openingAmount)}
              accent="primary"
            />
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Button variant="secondary" onClick={() => setMoveOpen("cash_in")}>
              <ArrowDownCircle className="w-3.5 h-3.5" /> {t("Cash In")}
            </Button>
            <Button variant="secondary" onClick={() => setMoveOpen("cash_out")}>
              <ArrowUpCircle className="w-3.5 h-3.5" /> {t("Cash Out")}
            </Button>
            <div className="ml-auto" />
            <Button variant="danger" onClick={() => setCloseOpen(true)}>
              <Lock className="w-3.5 h-3.5" /> {t("Close Register")}
            </Button>
          </div>

          <Card>
            {!detail ? (
              <Spinner />
            ) : detail.movements.length === 0 ? (
              <EmptyState title={t("No movements yet")} />
            ) : (
              <Table>
                <thead>
                  <tr>
                    <Th>{t("When")}</Th>
                    <Th>{t("Type")}</Th>
                    <Th>{t("Description")}</Th>
                    <Th className="text-right">{t("Amount")}</Th>
                    <Th>{t("By")}</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.movements.map((m) => (
                    <tr key={m._id} className="hover:bg-surface-container-low">
                      <Td className="text-xs text-on-surface-variant">
                        {new Date(m.createdAt).toLocaleTimeString()}
                      </Td>
                      <Td>
                        <Badge tone={MOVE_TONE[m.type] ?? "neutral"}>
                          {t(m.type.replace("_", " "))}
                        </Badge>
                      </Td>
                      <Td className="text-xs">{m.description}</Td>
                      <Td
                        className={`text-right font-bold ${
                          m.type === "cash_out" || m.type === "refund"
                            ? "text-error"
                            : ""
                        }`}
                      >
                        {fmt(m.amount)}
                      </Td>
                      <Td className="text-on-surface-variant text-xs">{m.username}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </Card>
        </>
      )}

      <Modal
        open={!!moveOpen}
        onClose={() => setMoveOpen(null)}
        size="sm"
        title={moveOpen === "cash_in" ? t("Cash In") : t("Cash Out")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setMoveOpen(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={doMove} loading={busy}>
              {t("Record")}
            </Button>
          </>
        }
      >
        <Field label={t("Amount")} required>
          <TextInput
            type="number"
            value={moveAmount}
            onChange={(e) => setMoveAmount(e.target.value)}
          />
        </Field>
        <Field label={t("Description")} required>
          <TextInput value={moveDesc} onChange={(e) => setMoveDesc(e.target.value)} />
        </Field>
      </Modal>

      <Modal
        open={closeOpen}
        onClose={() => setCloseOpen(false)}
        size="sm"
        title={t("Close Register")}
        subtitle={t("Expected {amount}", { amount: fmt(detail?.expectedCash ?? 0) })}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCloseOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button variant="danger" onClick={doClose} loading={busy}>
              {t("Close")}
            </Button>
          </>
        }
      >
        <Field label={t("Counted cash")} required>
          <TextInput
            type="number"
            value={actualCash}
            onChange={(e) => setActualCash(e.target.value)}
          />
        </Field>
        <Field label={t("Closing notes")} hint={t("Required if there is a discrepancy over 5")}>
          <Textarea value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
        </Field>
      </Modal>
    </PageLayout>
  );
}
