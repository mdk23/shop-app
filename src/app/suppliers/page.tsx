"use client";

import { useState } from "react";
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
  Spinner,
  Toolbar,
  ConfirmDialog,
  inputClass,
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";

type Supplier = {
  _id: Id<"suppliers">;
  name: string;
  contactName?: string;
  phone?: string;
  email?: string;
  address?: string;
  taxNumber?: string;
  paymentTerms?: string;
  notes?: string;
  status: "active" | "inactive";
};

export default function SuppliersPage() {
  const token = useToken();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const rows = useQuery(api.suppliers.list, {
    search: search || undefined,
    status: (statusFilter || undefined) as "active" | "inactive" | undefined,
  });
  const remove = useMutation(api.suppliers.remove);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);

  return (
    <PageLayout title="Suppliers" subtitle="Purchasing · vendor directory">
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-56`}
            placeholder="Search suppliers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="w-32"
        >
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </Select>
        <div className="ml-auto" />
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> New Supplier
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState title="No suppliers" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Contact</Th>
                <Th>Phone</Th>
                <Th>Terms</Th>
                <Th>Status</Th>
                <Th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {(rows as Supplier[]).map((s) => (
                <tr key={s._id} className="hover:bg-surface-container-low">
                  <Td className="font-bold">{s.name}</Td>
                  <Td className="text-on-surface-variant">{s.contactName ?? "—"}</Td>
                  <Td>{s.phone ?? "—"}</Td>
                  <Td className="text-on-surface-variant">{s.paymentTerms ?? "—"}</Td>
                  <Td>
                    <Badge tone={s.status === "active" ? "success" : "neutral"}>
                      {s.status}
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
        title="Delete supplier"
        message={`Delete "${deleting?.name}"? This cannot be undone.`}
        danger
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove({ token, id: deleting._id });
            toast.success("Supplier deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
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
  const create = useMutation(api.suppliers.create);
  const update = useMutation(api.suppliers.update);
  const [f, setF] = useState({
    name: existing?.name ?? "",
    contactName: existing?.contactName ?? "",
    phone: existing?.phone ?? "",
    email: existing?.email ?? "",
    address: existing?.address ?? "",
    taxNumber: existing?.taxNumber ?? "",
    paymentTerms: existing?.paymentTerms ?? "",
    notes: existing?.notes ?? "",
    status: existing?.status ?? "active",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim()) return toast.error("Name is required.");
    setBusy(true);
    try {
      const payload = {
        token,
        name: f.name,
        contactName: f.contactName || undefined,
        phone: f.phone || undefined,
        email: f.email || undefined,
        address: f.address || undefined,
        taxNumber: f.taxNumber || undefined,
        paymentTerms: f.paymentTerms || undefined,
        notes: f.notes || undefined,
        status: f.status as "active" | "inactive",
      };
      if (existing) await update({ ...payload, id: existing._id });
      else await create(payload);
      toast.success("Saved");
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? "Edit Supplier" : "New Supplier"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} loading={busy}>
            Save
          </Button>
        </>
      }
    >
      <Field label="Name" required>
        <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact person">
          <TextInput value={f.contactName} onChange={(e) => set("contactName", e.target.value)} />
        </Field>
        <Field label="Phone">
          <TextInput value={f.phone} onChange={(e) => set("phone", e.target.value)} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Email">
          <TextInput value={f.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Tax number">
          <TextInput value={f.taxNumber} onChange={(e) => set("taxNumber", e.target.value)} />
        </Field>
      </div>
      <Field label="Address">
        <TextInput value={f.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Payment terms">
          <TextInput
            value={f.paymentTerms}
            onChange={(e) => set("paymentTerms", e.target.value)}
            placeholder="e.g. Net 30"
          />
        </Field>
        <Field label="Status">
          <Select value={f.status} onChange={(e) => set("status", e.target.value)}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </Select>
        </Field>
      </div>
      <Field label="Notes">
        <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </Modal>
  );
}
