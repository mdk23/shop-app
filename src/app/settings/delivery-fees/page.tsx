"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
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
  ConfirmDialog,
  inputClass,
} from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { toast } from "sonner";
import { Plus, Search, Pencil, Trash2 } from "lucide-react";

type Fee = {
  _id: Id<"deliveryFees">;
  name: string;
  fee: number;
  description?: string;
  active: boolean;
};

export default function DeliveryFeesPage() {
  const token = useToken();
  const fmt = useCurrency();
  const [search, setSearch] = useState("");
  const fees = useQuery(api.deliveryFees.list, { search });
  const update = useMutation(api.deliveryFees.update);
  const remove = useMutation(api.deliveryFees.remove);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Fee | null>(null);
  const [deleting, setDeleting] = useState<Fee | null>(null);

  return (
    <PageLayout title="Delivery Fees" subtitle="Settings · delivery zones & charges">
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-56`}
            placeholder="Search zones…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="ml-auto" />
        <Button
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> New Zone
        </Button>
      </Toolbar>

      <Card>
        {fees === undefined ? (
          <Spinner />
        ) : fees.length === 0 ? (
          <EmptyState title="No delivery zones" />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Zone</Th>
                <Th className="text-right">Fee</Th>
                <Th>Description</Th>
                <Th>Status</Th>
                <Th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {(fees as Fee[]).map((f) => (
                <tr key={f._id} className="hover:bg-surface-container-low">
                  <Td className="font-bold">{f.name}</Td>
                  <Td className="text-right font-bold">{fmt(f.fee)}</Td>
                  <Td className="text-on-surface-variant text-xs max-w-xs truncate">
                    {f.description ?? "—"}
                  </Td>
                  <Td>
                    <button
                      onClick={() =>
                        update({
                          token,
                          id: f._id,
                          name: f.name,
                          fee: f.fee,
                          description: f.description,
                          active: !f.active,
                        }).catch((e) =>
                          toast.error(e instanceof Error ? e.message : "Failed")
                        )
                      }
                    >
                      <Badge tone={f.active ? "success" : "neutral"}>
                        {f.active ? "Active" : "Inactive"}
                      </Badge>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditing(f);
                          setOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(f)}>
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
        <FeeModal token={token} existing={editing} onClose={() => setOpen(false)} />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete delivery zone"
        message={`Delete "${deleting?.name}"?`}
        danger
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove({ token, id: deleting._id });
            toast.success("Deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
          setDeleting(null);
        }}
      />
    </PageLayout>
  );
}

function FeeModal({
  token,
  existing,
  onClose,
}: {
  token: string;
  existing: Fee | null;
  onClose: () => void;
}) {
  const create = useMutation(api.deliveryFees.create);
  const update = useMutation(api.deliveryFees.update);
  const [name, setName] = useState(existing?.name ?? "");
  const [fee, setFee] = useState(existing ? String(existing.fee) : "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [active, setActive] = useState(existing?.active ?? true);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const n = parseFloat(fee);
    if (!name.trim() || isNaN(n) || n <= 0)
      return toast.error("Name and a fee greater than 0 are required.");
    setBusy(true);
    try {
      if (existing) {
        await update({
          token,
          id: existing._id,
          name,
          fee: n,
          description: description || undefined,
          active,
        });
      } else {
        await create({
          token,
          name,
          fee: n,
          description: description || undefined,
          active,
        });
      }
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
      size="sm"
      title={existing ? "Edit Delivery Zone" : "New Delivery Zone"}
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
      <Field label="Zone name" required>
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Fee" required>
        <TextInput type="number" value={fee} onChange={(e) => setFee(e.target.value)} />
      </Field>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <label className="flex items-center gap-2 text-xs font-bold">
        <input
          type="checkbox"
          checked={active}
          onChange={(e) => setActive(e.target.checked)}
        />
        Active
      </label>
    </Modal>
  );
}
