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
  Textarea,
  Modal,
  Table,
  Th,
  Td,
  Badge,
  EmptyState,
  Spinner,
  Toolbar,
} from "@/components/ui";
import { useToken } from "@/lib/useShop";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";

type Row = {
  _id: Id<"categories">;
  name: string;
  description?: string;
  active: boolean;
  sortOrder?: number;
};

export default function CategoriesPage() {
  const token = useToken();
  const rows = useQuery(api.categories.list, { includeInactive: true });
  const create = useMutation(api.categories.create);
  const update = useMutation(api.categories.update);

  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [busy, setBusy] = useState(false);

  const openNew = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setSortOrder("");
    setOpen(true);
  };
  const openEdit = (r: Row) => {
    setEditing(r);
    setName(r.name);
    setDescription(r.description ?? "");
    setSortOrder(r.sortOrder?.toString() ?? "");
    setOpen(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Name is required.");
    setBusy(true);
    try {
      if (editing) {
        await update({
          token,
          id: editing._id,
          name,
          description: description || undefined,
          sortOrder: sortOrder ? Number(sortOrder) : undefined,
        });
        toast.success("Category updated");
      } else {
        await create({
          token,
          name,
          description: description || undefined,
          sortOrder: sortOrder ? Number(sortOrder) : undefined,
        });
        toast.success("Category created");
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
    <PageLayout title="Categories" subtitle="Product catalog · categories">
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={openNew}>
          <Plus className="w-3.5 h-3.5" /> New Category
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No categories yet"
            message="Create your first category to start organising products."
            action={<Button onClick={openNew}>New Category</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Description</Th>
                <Th className="w-24">Order</Th>
                <Th className="w-24">Status</Th>
                <Th className="w-28" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="hover:bg-surface-container-low">
                  <Td className="font-bold">{r.name}</Td>
                  <Td className="text-on-surface-variant">{r.description ?? "—"}</Td>
                  <Td>{r.sortOrder ?? "—"}</Td>
                  <Td>
                    <button onClick={() => toggleActive(r as Row)}>
                      <Badge tone={r.active ? "success" : "neutral"}>
                        {r.active ? "Active" : "Inactive"}
                      </Badge>
                    </button>
                  </Td>
                  <Td>
                    <Button variant="ghost" size="sm" onClick={() => openEdit(r as Row)}>
                      <Pencil className="w-3.5 h-3.5" /> Edit
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? "Edit Category" : "New Category"}
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
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. T-Shirts" />
        </Field>
        <Field label="Description">
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label="Sort order" hint="Lower numbers show first">
          <TextInput
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </Field>
      </Modal>
    </PageLayout>
  );
}
