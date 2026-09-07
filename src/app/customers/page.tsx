"use client";

import { useState } from "react";
import { usePaginatedQuery, useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
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
  Toolbar,
  StatCard,
  inputClass,
} from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { toast } from "sonner";
import { Plus, Search, Pencil } from "lucide-react";

type Customer = {
  _id: Id<"customers">;
  name: string;
  phone1: string;
  phone2?: string;
  phone3?: string;
  email?: string;
  address?: string;
  notes?: string;
  customerCode?: string;
  isGeneric?: boolean;
  status?: string;
};

export default function CustomersPage() {
  const token = useToken();
  const [search, setSearch] = useState("");
  const searchResults = useQuery(
    api.customers.search,
    search.trim() ? { query: search } : "skip"
  );
  const { results, status, loadMore } = usePaginatedQuery(
    api.customers.listPaginated,
    {},
    { initialNumItems: 25 }
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [detailId, setDetailId] = useState<Id<"customers"> | null>(null);

  const list = (search.trim() ? searchResults ?? [] : results) as Customer[];

  return (
    <PageLayout title="Customers" subtitle="CRM · accounts, debt & store credit">
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-64`}
            placeholder="Search name / phone / code"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto" />
        <Button
          onClick={() => {
            setEditing(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> New Customer
        </Button>
      </Toolbar>

      <Card>
        {list.length === 0 && status !== "LoadingFirstPage" ? (
          <EmptyState title="No customers" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Name</Th>
                <Th>Phone</Th>
                <Th>Email</Th>
                <Th className="w-24" />
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr
                  key={c._id}
                  className="hover:bg-surface-container-low cursor-pointer"
                  onClick={() => setDetailId(c._id)}
                >
                  <Td className="font-mono text-[11px]">{c.customerCode ?? "—"}</Td>
                  <Td className="font-bold">
                    {c.name}
                    {c.isGeneric && (
                      <Badge tone="neutral">
                        <span className="ml-1">walk-in</span>
                      </Badge>
                    )}
                  </Td>
                  <Td>{c.phone1}</Td>
                  <Td className="text-on-surface-variant">{c.email ?? "—"}</Td>
                  <Td onClick={(e) => e.stopPropagation()}>
                    {!c.isGeneric && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(c);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!search.trim() && status === "CanLoadMore" && (
          <div className="p-3 text-center">
            <Button variant="ghost" onClick={() => loadMore(25)}>
              Load more
            </Button>
          </div>
        )}
      </Card>

      {modalOpen && (
        <CustomerModal
          token={token}
          existing={editing}
          onClose={() => setModalOpen(false)}
        />
      )}
      {detailId && (
        <CustomerDetail
          token={token}
          id={detailId}
          onClose={() => setDetailId(null)}
        />
      )}
    </PageLayout>
  );
}

function CustomerModal({
  token,
  existing,
  onClose,
}: {
  token: string;
  existing: Customer | null;
  onClose: () => void;
}) {
  const create = useMutation(api.customers.create);
  const update = useMutation(api.customers.update);
  const [f, setF] = useState({
    name: existing?.name ?? "",
    phone1: existing?.phone1 ?? "",
    phone2: existing?.phone2 ?? "",
    email: existing?.email ?? "",
    address: existing?.address ?? "",
    notes: existing?.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF((p) => ({ ...p, [k]: v }));

  const save = async () => {
    if (!f.name.trim() || !f.phone1.trim())
      return toast.error("Name and phone are required.");
    setBusy(true);
    try {
      const payload = {
        token,
        name: f.name,
        phone1: f.phone1,
        phone2: f.phone2 || undefined,
        email: f.email || undefined,
        address: f.address || undefined,
        notes: f.notes || undefined,
      };
      if (existing) await update({ ...payload, id: existing._id });
      else await create(payload);
      toast.success(existing ? "Customer updated" : "Customer created");
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
      title={existing ? "Edit Customer" : "New Customer"}
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
      <Field label="Full name" required>
        <TextInput value={f.name} onChange={(e) => set("name", e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Phone" required>
          <TextInput value={f.phone1} onChange={(e) => set("phone1", e.target.value)} />
        </Field>
        <Field label="Alt phone">
          <TextInput value={f.phone2} onChange={(e) => set("phone2", e.target.value)} />
        </Field>
      </div>
      <Field label="Email">
        <TextInput value={f.email} onChange={(e) => set("email", e.target.value)} />
      </Field>
      <Field label="Address">
        <TextInput value={f.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <Field label="Notes">
        <Textarea value={f.notes} onChange={(e) => set("notes", e.target.value)} />
      </Field>
    </Modal>
  );
}

function CustomerDetail({
  token,
  id,
  onClose,
}: {
  token: string;
  id: Id<"customers">;
  onClose: () => void;
}) {
  const fmt = useCurrency();
  const customer = useQuery(api.customers.getById, { id });
  const sales = useQuery(api.sales.listByCustomer, { customerId: id, limit: 20 });
  const credits = useQuery(api.customerCredits.listForCustomer, { customerId: id });
  const grant = useMutation(api.customerCredits.grant);

  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const doGrant = async () => {
    if (!amount || !notes.trim()) return toast.error("Amount and note required.");
    setBusy(true);
    try {
      await grant({ token, customerId: id, amount: Number(amount), notes });
      toast.success("Store credit updated");
      setAmount("");
      setNotes("");
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
      size="lg"
      title={customer?.name ?? "Customer"}
      subtitle={customer?.customerCode ?? undefined}
    >
      {!customer ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <StatCard label="Purchases" value={customer.stats.purchaseCount} />
            <StatCard label="Spent" value={fmt(customer.stats.totalPurchases)} />
            <StatCard
              label="Outstanding"
              value={fmt(customer.stats.outstandingDebt)}
              accent={customer.stats.outstandingDebt > 0 ? "error" : "primary"}
            />
            <StatCard
              label="Store credit"
              value={fmt(customer.stats.storeCredit)}
              accent="success"
            />
          </div>

          {!customer.isGeneric && (
            <Card className="p-3 bg-surface-container-low">
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                Adjust store credit
              </p>
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Amount (+/-)">
                  <TextInput
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-28"
                  />
                </Field>
                <Field label="Reason">
                  <TextInput
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-56"
                  />
                </Field>
                <Button onClick={doGrant} loading={busy}>
                  Apply
                </Button>
              </div>
            </Card>
          )}

          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
              Recent sales
            </p>
            <div className="rounded-xl border border-outline divide-y divide-outline/30 max-h-52 overflow-y-auto">
              {(sales ?? []).map((s) => (
                <div key={s._id} className="flex justify-between px-3 py-2 text-xs">
                  <span className="font-mono">{s.saleNumber}</span>
                  <span className="text-on-surface-variant">
                    {new Date(s.createdAt).toLocaleDateString()}
                  </span>
                  <Badge
                    tone={
                      s.paymentStatus === "PAID"
                        ? "success"
                        : s.paymentStatus === "UNPAID"
                          ? "error"
                          : "warning"
                    }
                  >
                    {s.paymentStatus.replace("_", " ")}
                  </Badge>
                  <span className="font-bold">{fmt(s.total)}</span>
                </div>
              ))}
              {sales && sales.length === 0 && (
                <p className="px-3 py-3 text-xs text-on-surface-variant">No sales yet</p>
              )}
            </div>
          </div>

          {credits && credits.length > 0 && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
                Store credit ledger
              </p>
              <div className="rounded-xl border border-outline divide-y divide-outline/30 max-h-40 overflow-y-auto">
                {credits.map((c) => (
                  <div key={c._id} className="flex justify-between px-3 py-2 text-xs">
                    <span>{c.reason.replace(/_/g, " ")}</span>
                    <span
                      className={c.delta >= 0 ? "text-success font-bold" : "text-error font-bold"}
                    >
                      {c.delta >= 0 ? "+" : ""}
                      {fmt(c.delta)}
                    </span>
                    <span className="text-on-surface-variant">bal {fmt(c.balanceAfter)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
