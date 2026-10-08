"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Card,
  Button,
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
  Pagination,
  Spinner,
  Toolbar,
  ConfirmDialog,
  inputClass,
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { useClientPage } from "@/lib/pagination";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "@/contexts/LanguageContext";

type Supplier = {
  _id: Id<"suppliers">;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  paymentTermId?: Id<"paymentTerms">;
  paymentTermName?: string;
  nuit?: string;
  notes?: string;
  status: "ACTIVE" | "INACTIVE";
};

export default function SuppliersPage() {
  const { t } = useTranslation();
  const token = useToken();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const rows = useQuery(api.suppliers.list, {
    search: search || undefined,
    status: (statusFilter || undefined) as "ACTIVE" | "INACTIVE" | undefined,
  });
  const page = useClientPage(rows ?? []);
  const remove = useMutation(api.suppliers.remove);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  return (
    <PageLayout title={t("Suppliers")} subtitle={t("Purchasing · vendor directory")}>
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-56`}
            placeholder={t("Search suppliers…")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-32"
        >
          <option value="">{t("Any status")}</option>
          <option value="ACTIVE">{t("Active")}</option>
          <option value="INACTIVE">{t("Inactive")}</option>
        </Select>
        <div className="ml-auto" />
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> {t("New Supplier")}
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title={t("No suppliers")} />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Name")}</Th>
                <Th>{t("Contact")}</Th>
                <Th>{t("Phone")}</Th>
                <Th>{t("Terms")}</Th>
                <Th>{t("Status")}</Th>
                <Th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {(page.rows as Supplier[]).map((s) => (
                <tr key={s._id} className="hover:bg-surface-container-low">
                  <Td className="font-bold">
                    <Link href={`/suppliers/${s._id}`} className="hover:text-primary">
                      {s.name}
                    </Link>
                  </Td>
                  <Td className="text-on-surface-variant">{s.contactName ?? "—"}</Td>
                  <Td>{s.phone ?? "—"}</Td>
                  <Td className="text-on-surface-variant">{s.paymentTermName ?? "—"}</Td>
                  <Td>
                    <Badge tone={s.status === "ACTIVE" ? "success" : "neutral"}>
                      {t(s.status === "ACTIVE" ? "Active" : "Inactive")}
                    </Badge>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(s);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDeleting(s)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {rows && rows.length > 0 && (
          <Pagination
            pageIndex={page.pageIndex}
            rowCount={page.rows.length}
            pageSize={page.pageSize}
            hasPrev={page.hasPrev}
            hasNext={page.hasNext}
            onPrev={page.goPrev}
            onNext={page.goNext}
          />
        )}
      </Card>

      {open && (
        <SupplierModal
          token={token}
          existing={editing}
          onClose={() => setOpen(false)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title={t("Delete supplier")}
        message={t('Delete "{name}"? This cannot be undone.', { name: deleting?.name ?? "" })}
        danger
        confirmLabel={t("Delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove({ token, id: deleting._id });
            toast.success(t("Supplier deleted"));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("Failed"));
          }
          setDeleting(null);
        }}
      />
    </PageLayout>
  );
}

function SupplierModal({
  token,
  existing,
  onClose,
}: {
  token: string;
  existing: Supplier | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const create = useMutation(api.suppliers.create);
  const update = useMutation(api.suppliers.update);
  const terms = useQuery(api.commercialSettings.listPaymentTerms, {});
  const [f, setF] = useState({
    name: existing?.name ?? "",
    contactName: existing?.contactName ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    address: existing?.address ?? "",
    nuit: existing?.nuit ?? "",
    paymentTermId: (existing?.paymentTermId ?? "") as string,
    notes: existing?.notes ?? "",
    status: existing?.status ?? "ACTIVE",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) return toast.error(t("Name is required."));
    setBusy(true);
    try {
      const payload = {
        token,
        name: f.name,
        contactName: f.contactName || undefined,
        phone: f.phone || undefined,
        email: f.email || undefined,
        address: f.address || undefined,
        nuit: f.nuit.trim() && f.nuit.trim() !== existing?.nuit ? f.nuit : undefined,
        paymentTermId: f.paymentTermId ? (f.paymentTermId as Id<"paymentTerms">) : undefined,
        notes: f.notes || undefined,
        status: f.status as "ACTIVE" | "INACTIVE",
      };
      if (existing) await update({ ...payload, id: existing._id });
      else await create(payload);
      toast.success(t("Saved"));
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? t("Edit Supplier") : t("New Supplier")}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={save} loading={busy}>
            {t("Save")}
          </Button>
        </>
      }
    >
      <Field label={t("Name")} required>
        <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Contact person")}>
          <TextInput value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label={t("Phone")}>
          <TextInput value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Email")}>
          <TextInput value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label={t("Tax number (NUIT)")}>
          <TextInput value={f.nuit} onChange={(e) => set("nuit", e.target.value)} placeholder="400000000" />
        </Field>
      </div>
      <Field label={t("Address")}>
        <TextInput value={f.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={t("Payment terms")}>
          <Select value={f.paymentTermId} onChange={(e) => set("paymentTermId", e.target.value)}>
            <option value="">{t("Not set")}</option>
            {(terms ?? [])
              .filter((x) => x.active || x._id === f.paymentTermId)
              .map((x) => (
                <option key={x._id} value={x._id}>
                  {x.name}
                </option>
              ))}
          </Select>
        </Field>
        <Field label={t("Status")}>
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="ACTIVE">{t("Active")}</option>
            <option value="INACTIVE">{t("Inactive")}</option>
          </Select>
        </Field>
      </div>
      <Field label={t("Notes")}>
        <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </Modal>
  );
}
