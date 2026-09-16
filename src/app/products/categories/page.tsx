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
  _id: Id<"categories">;
  name: string;
  description?: string;
  active: boolean;
  sortOrder?: number;
  productCount?: number;
};

export default function CategoriesPage() {
  const token = useToken();
  const rows = useQuery(api.categories.list, { includeInactive: true });
  const page = useClientPage(rows ?? []);
  const create = useMutation(api.categories.create);
  const update = useMutation(api.categories.update);
  const remove = useMutation(api.categories.remove);

  const [editing, setEditing] = useState<Row | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("");
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deactivateInstead, setDeactivateInstead] = useState<Row | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Row | null>(null);

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
    if (r.active && (r.productCount ?? 0) > 0) {
      setConfirmDeactivate(r);
      return;
    }
    try {
      await update({ token, id: r._id, active: !r.active });
      toast.success(r.active ? "Category deactivated" : "Category activated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await remove({ token, id: deleting._id });
      toast.success(`"${deleting.name}" deleted`);
      setDeleting(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete";
      if (message.includes("products assigned")) {
        setDeleting(null);
        setDeactivateInstead(deleting);
      } else {
        toast.error(message);
      }
    } finally {
      setDeleteBusy(false);
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
                <Th className="w-24">Products</Th>
                <Th className="w-24">Status</Th>
                <Th className="w-36" />
              </tr>
            </thead>
            <tbody>
              {page.rows.map((r) => (
                <tr key={r._id} className="hover:bg-surface-container-low">
                  <Td className="font-bold">{r.name}</Td>
                  <Td className="text-on-surface-variant">{r.description ?? "—"}</Td>
                  <Td>{r.sortOrder ?? "—"}</Td>
                  <Td>{r.productCount ?? 0}</Td>
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
                        <Pencil className="w-3.5 h-3.5" /> Edit
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

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete category"
        message={`Delete "${deleting?.name}"? This cannot be undone. Categories with products assigned can't be deleted — deactivate them instead.`}
        danger
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
        title="Deactivate category"
        message={`"${confirmDeactivate?.name}" has ${confirmDeactivate?.productCount ?? 0} product(s). Deactivating it will also deactivate all of them (and their variants), hiding them from the catalog and POS.`}
        danger
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (!confirmDeactivate) return;
          try {
            const res = await update({ token, id: confirmDeactivate._id, active: false });
            toast.success(
              res.cascadedCount > 0
                ? `Category deactivated — ${res.cascadedCount} product(s) deactivated too`
                : "Category deactivated"
            );
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed");
          }
          setConfirmDeactivate(null);
        }}
      />

      <ConfirmDialog
        open={!!deactivateInstead}
        onClose={() => setDeactivateInstead(null)}
        title="Can't delete — deactivate instead?"
        message={`"${deactivateInstead?.name}" has products assigned to it, so it can't be deleted. Deactivating hides it from new product forms while keeping existing products intact.`}
        confirmLabel="Deactivate"
        onConfirm={async () => {
          if (!deactivateInstead) return;
          try {
            await update({ token, id: deactivateInstead._id, active: false });
            toast.success(`"${deactivateInstead.name}" deactivated`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to deactivate");
          }
          setDeactivateInstead(null);
        }}
      />
    </PageLayout>
  );
}
