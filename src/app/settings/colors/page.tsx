"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  Field,
  TextInput,
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
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { useClientPage } from "@/lib/pagination";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

type Row = {
  _id: Id<"colors">;
  name: string;
  hex?: string;
  active: boolean;
  sortOrder?: number;
};

export default function ColorsPage() {
  const token = useToken();
  const rows = useQuery(api.colors.list, { includeInactive: true });
  const page = useClientPage(rows ?? []);
  const create = useMutation(api.colors.create);
  const update = useMutation(api.colors.update);
  const remove = useMutation(api.colors.remove);

  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [hex, setHex] = useState("#000000");
  const [sortOrder, setSortOrder] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const openNew = () => {
    setEditing(null);
    setName("");
    setHex("#000000");
    setSortOrder("");
    setOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setName(r.name);
    setHex(r.hex ?? "#000000");
    setSortOrder(r.sortOrder?.toString() ?? "");
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Color name is required.");
    setBusy(true);
    try {
      if (editing) {
        await update({
          token,
          id: editing._id,
          name,
          hex,
          sortOrder: sortOrder ? Number(sortOrder) : undefined,
        });
        toast.success("Color updated");
      } else {
        await create({
          token,
          name,
          hex,
          sortOrder: sortOrder ? Number(sortOrder) : undefined,
        });
        toast.success("Color added");
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: Row) => {
    try {
      await update({ token, id: r._id, active: !r.active });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  return (
    <PageLayout title="Colors" subtitle="Settings · color taxonomy">
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={openNew}>
          <Plus className="w-3.5 h-3.5" /> New Color
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No colors yet"
            message="Add colors like Black, White, Navy — they'll be offered when creating product variants."
            action={<Button onClick={openNew}>New Color</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th className="w-10" />
                <Th>Name</Th>
                <Th className="w-24">Order</Th>
                <Th className="w-24">Status</Th>
                <Th className="w-32" />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r._id} className="hover:bg-surface-container-low">
                  <Td>
                    <span
                      className="inline-block w-5 h-5 rounded-full border border-outline align-middle"
                      style={{ background: r.hex || "transparent" }}
                    />
                  </Td>
                  <Td className="font-bold">{r.name}</Td>
                  <Td>{r.sortOrder ?? "—"}</Td>
                  <Td>
                    <button onClick={() => toggleActive(r as Row)}>
                      <Badge tone={r.active ? "success" : "neutral"}>
                        {r.active ? "Active" : "Inactive"}
                      </Badge>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r as Row)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(r as Row)}>
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

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Color" : "New Color"}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={save} loading={busy}>
              Save
            </Button>
          </>
        }
      >
        <Field label="Name" required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Black" />
        </Field>
        <Field label="Swatch">
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              className="w-10 h-10 rounded-lg border border-outline cursor-pointer bg-transparent"
            />
            <TextInput value={hex} onChange={(e) => setHex(e.target.value)} className="flex-1" />
          </div>
        </Field>
        <Field label="Sort order" hint="Lower numbers show first">
          <TextInput
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete color"
        message={`Delete "${deleting?.name}"? Existing variants keep their color label; only the taxonomy entry is removed.`}
        danger
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove({ token, id: deleting._id });
            toast.success("Color deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
          setDeleting(null);
        }}
      />
    </PageLayout>
  );
}
