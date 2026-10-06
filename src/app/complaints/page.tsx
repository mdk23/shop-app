"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Field,
  TextInput,
  Textarea,
  Select,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
  PagedFooter,
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { formatDate, cn } from "@/lib/utils";
import { useClientPage } from "@/lib/pagination";
import { CustomerSearchPanel } from "@/components/pos/CustomerSearchPanel";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Status = "OPEN" | "RESOLVED" | "REJECTED";
type Complaint = {
  _id: Id<"complaints">;
  customerId?: Id<"customers">;
  customerName?: string;
  description: string;
  status: Status;
  resolutionId?: Id<"resolutions">;
  createdAt: number;
};
type Resolution = "TROCA" | "DEVOLUCAO" | "REEMBOLSO" | "CREDITO" | "REPARACAO" | "RECUSA";

const STATUSES: ("ALL" | Status)[] = ["ALL", "OPEN", "RESOLVED", "REJECTED"];
const STATUS_LABEL: Record<Status, string> = {
  OPEN: "Open",
  RESOLVED: "Resolved",
  REJECTED: "Rejected",
};
const STATUS_TONE: Record<Status, "info" | "success" | "error"> = {
  OPEN: "info",
  RESOLVED: "success",
  REJECTED: "error",
};

const RESOLUTIONS: { value: Resolution; label: string }[] = [
  { value: "TROCA", label: "Exchange" },
  { value: "DEVOLUCAO", label: "Return" },
  { value: "REEMBOLSO", label: "Refund" },
  { value: "CREDITO", label: "Store credit" },
  { value: "REPARACAO", label: "Repair" },
  { value: "RECUSA", label: "Reject complaint" },
];

export default function ComplaintsPage() {
  const { t } = useTranslation();
  const token = useToken();
  const [status, setStatus] = useState<"ALL" | Status>("OPEN");
  const complaints = useQuery(api.complaints.list, status === "ALL" ? {} : { status });
  const page = useClientPage(complaints ?? []);
  const create = useMutation(api.complaints.create);
  const resolve = useMutation(api.complaints.resolve);
  const followUps = useQuery(api.followUps.listFollowUps, { token });
  const commitFollowUp = useMutation(api.followUps.commitFollowUp);
  const recordSatisfaction = useMutation(api.followUps.recordSatisfaction);
  const supersede = useMutation(api.followUps.supersedeResolution);

  const [promising, setPromising] = useState<Complaint | null>(null);
  const [promise, setPromise] = useState("");
  const [promiseDue, setPromiseDue] = useState("");
  const [superseding, setSuperseding] = useState<Complaint | null>(null);
  const [newResolution, setNewResolution] = useState<Resolution>("CREDITO");

  const [creating, setCreating] = useState(false);
  const [pickingCustomer, setPickingCustomer] = useState(false);
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  const [resolving, setResolving] = useState<Id<"complaints"> | null>(null);
  const [resolution, setResolution] = useState<Resolution>("REPARACAO");
  const [notes, setNotes] = useState("");

  const closeCreate = () => {
    setCreating(false);
    setCustomerId(null);
    setDescription("");
  };

  const saveNew = async () => {
    if (!description.trim()) return toast.error(t("Describe the complaint."));
    setBusy(true);
    try {
      await create({ token, customerId: customerId ?? undefined, description });
      toast.success(t("Complaint recorded"));
      closeCreate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const confirmResolve = async () => {
    if (!resolving) return;
    setBusy(true);
    try {
      await resolve({ token, id: resolving, resolutionType: resolution, notes: notes || undefined });
      toast.success(t("Complaint closed"));
      setResolving(null);
      setNotes("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  const savePromise = async () => {
    if (!promising?.customerId) return;
    setBusy(true);
    try {
      await commitFollowUp({
        token,
        customerId: promising.customerId,
        description: promise,
        dueAt: promiseDue ? new Date(promiseDue).getTime() : undefined,
        complaintId: promising._id,
      });
      toast.success(t("Promise recorded"));
      setPromising(null);
      setPromise("");
      setPromiseDue("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
    } finally {
      setBusy(false);
    }
  };

  const saveSupersede = async () => {
    if (!superseding?.resolutionId) return;
    setBusy(true);
    try {
      await supersede({
        token,
        previousResolutionId: superseding.resolutionId,
        resolutionType: newResolution,
        complaintId: superseding._id,
      });
      toast.success(t("Resolution changed"));
      setSuperseding(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  const markSatisfied = async (followUpId: Id<"followUpCommitments">) => {
    try {
      await recordSatisfaction({ token, followUpId });
      toast.success(t("Customer satisfied recorded"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const extraActions = (c: Complaint) => (
    <>
      {c.customerId && (
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            setPromising(c);
            setPromise("");
            setPromiseDue("");
          }}
        >
          {t("Promise follow-up")}
        </Button>
      )}
      {c.status === "RESOLVED" && c.resolutionId && (
        <Button size="sm" variant="ghost" onClick={() => setSuperseding(c)}>
          {t("Change resolution")}
        </Button>
      )}
    </>
  );

  return (
    <PageLayout title={t("Complaints")} subtitle={t("Problems customers report after a purchase")}>
      <Toolbar>
        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-colors",
                status === s
                  ? "bg-primary text-on-primary border-primary"
                  : "bg-surface-container-low text-on-surface-variant border-outline"
              )}
            >
              {s === "ALL" ? t("All") : t(STATUS_LABEL[s])}
            </button>
          ))}
        </div>
        <div className="ml-auto" />
        <Button onClick={() => setCreating(true)}>
          <Plus className="w-3.5 h-3.5" /> {t("New complaint")}
        </Button>
      </Toolbar>

      <Card>
        {complaints === undefined ? (
          <Spinner />
        ) : complaints.length === 0 ? (
          <EmptyState
            title={t("No complaints here")}
            message={t("Record a complaint when a customer reports a fault after buying.")}
            action={<Button onClick={() => setCreating(true)}>{t("New complaint")}</Button>}
          />
        ) : (
          <>
            <div className="hidden md:block">
              <Table>
                <thead>
                  <tr>
                    <Th>{t("Date")}</Th>
                    <Th>{t("Customer")}</Th>
                    <Th>{t("Complaint")}</Th>
                    <Th>{t("Status")}</Th>
                    <Th />
                  </tr>
                </thead>
                <tbody>
                  {page.rows.map((c) => (
                    <tr key={c._id} className="hover:bg-surface-container-low">
                      <Td>{formatDate(c.createdAt)}</Td>
                      <Td>{c.customerName ?? t("Walk-in")}</Td>
                      <Td className="max-w-md truncate">{c.description}</Td>
                      <Td>
                        <Badge tone={STATUS_TONE[c.status]}>{t(STATUS_LABEL[c.status])}</Badge>
                      </Td>
                      <Td>
                        {c.status === "OPEN" && (
                          <Button size="sm" variant="secondary" onClick={() => setResolving(c._id)}>
                            {t("Resolve")}
                          </Button>
                        )}
                        <div className="flex gap-1">{extraActions(c)}</div>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="md:hidden space-y-2 p-2">
              {page.rows.map((c) => (
                <div key={c._id} className="p-3 rounded-xl border border-outline bg-surface-container-low space-y-1">
                  <div className="flex justify-between gap-2">
                    <span className="font-bold text-sm">{c.customerName ?? t("Walk-in")}</span>
                    <Badge tone={STATUS_TONE[c.status]}>{t(STATUS_LABEL[c.status])}</Badge>
                  </div>
                  <p className="text-sm">{c.description}</p>
                  <p className="text-xs text-on-surface-variant">{formatDate(c.createdAt)}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {c.status === "OPEN" && (
                      <Button size="sm" variant="secondary" onClick={() => setResolving(c._id)}>
                        {t("Resolve")}
                      </Button>
                    )}
                    {extraActions(c)}
                  </div>
                </div>
              ))}
            </div>
            <PagedFooter paged={page} loading={complaints === undefined} />
          </>
        )}
      </Card>

      <Modal
        open={creating}
        onClose={closeCreate}
        title={t("New complaint")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={closeCreate}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveNew} loading={busy}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Customer")}>
            <Button variant="secondary" onClick={() => setPickingCustomer(true)}>
              {customerId ? t("Customer chosen") : t("Search customer")}
            </Button>
          </Field>
          <Field label={t("What is wrong?")} required>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!resolving}
        onClose={() => setResolving(null)}
        title={t("Resolve complaint")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolving(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={confirmResolve} loading={busy}>
              {t("Close complaint")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("Resolution")} required>
            <Select value={resolution} onChange={(e) => setResolution(e.target.value as Resolution)}>
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.label)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t("Notes")}>
            <TextInput value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <section className="mt-6 space-y-2">
        <h2 className="text-sm font-black uppercase tracking-widest">{t("Promises to customers")}</h2>
        <Card>
          {followUps === undefined ? (
            <Spinner />
          ) : followUps.length === 0 ? (
            <EmptyState
              title={t("No promises yet")}
              message={t("When a complaint or return ends with a promise, it is tracked here until the customer confirms it.")}
            />
          ) : (
            <div className="divide-y divide-outline/30">
              {followUps.map((f) => (
                <div key={f._id} className="p-4 flex flex-wrap justify-between gap-2 items-center">
                  <div>
                    <p className="text-sm font-bold">{f.description}</p>
                    <p className="text-xs text-on-surface-variant">
                      {f.customerName}
                      {f.dueAt ? ` · ${t("due")} ${formatDate(f.dueAt)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={f.satisfied ? "success" : "warning"}>
                      {f.satisfied ? t("Customer satisfied") : t("Open")}
                    </Badge>
                    {!f.satisfied && (
                      <Button size="sm" variant="secondary" onClick={() => markSatisfied(f._id)}>
                        {t("Mark satisfied")}
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </section>

      <Modal
        open={!!promising}
        onClose={() => setPromising(null)}
        title={t("Promise follow-up")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPromising(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={savePromise} loading={busy} disabled={!promise.trim()}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label={t("What was promised?")} required>
            <Textarea value={promise} onChange={(e) => setPromise(e.target.value)} />
          </Field>
          <Field label={t("Due by")}>
            <TextInput type="date" value={promiseDue} onChange={(e) => setPromiseDue(e.target.value)} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={!!superseding}
        onClose={() => setSuperseding(null)}
        title={t("Change resolution")}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSuperseding(null)}>
              {t("Cancel")}
            </Button>
            <Button onClick={saveSupersede} loading={busy}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-on-surface-variant">
            {t("The earlier decision is kept in the history. The complaint points to the new resolution.")}
          </p>
          <Field label={t("New resolution")} required>
            <Select value={newResolution} onChange={(e) => setNewResolution(e.target.value as Resolution)}>
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {t(r.label)}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Modal>

      <CustomerSearchPanel
        open={pickingCustomer}
        onClose={() => setPickingCustomer(false)}
        onSelect={(id) => setCustomerId(id)}
      />
    </PageLayout>
  );
}
