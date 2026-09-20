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
import { useTranslation } from "@/contexts/LanguageContext";

type Row = {
  _id: Id<"categories">;
  name: string;
  description?: string;
  active: boolean;
  sortOrder?: number;
  productCount?: number;
};

export default function CategoriesPage() {
  const { t } = useTranslation();
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
    if (!name.trim()) return toast.error(t("Name is required."));
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
        toast.success(t("Category updated"));
      } else {
        await create({
          token,
          name,
          description: description || undefined,
          sortOrder: sortOrder ? Number(sortOrder) : undefined,
        });
        toast.success(t("Category created"));
      }
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed to save"));
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
      toast.success(r.active ? t("Category deactivated") : t("Category activated"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Failed"));
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await remove({ token, id: deleting._id });
      toast.success(t('"{name}" deleted', { name: deleting.name }));
      setDeleting(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : t("Failed to delete");
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
    <PageLayout title={t("Categories")} subtitle={t("Product catalog · categories")}>
      <Toolbar>
        <div className="ml-auto" />
        <Button onClick={openNew}>
          <Plus className="w-3.5 h-3.5" /> {t("New Category")}
        </Button>
      </Toolbar>

      <Card>
        {rows === undefined ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t("No categories yet")}
            message={t("Create your first category to start organising products.")}
            action={<Button onClick={openNew}>{t("New Category")}</Button>}
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t("Name")}</Th>
                <Th>{t("Description")}</Th>
                <Th className="w-24">{t("Order")}</Th>
                <Th className="w-24">{t("Products")}</Th>
                <Th className="w-24">{t("Status")}</Th>
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
                        {r.active ? t("Active") : t("Inactive")}
                      </Badge>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => openEdit(r as Row)}>
                        <Pencil className="w-3.5 h-3.5" /> {t("Edit")}
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
        title={editing ? t("Edit Category") : t("New Category")}
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Cancel")}
            </Button>
            <Button onClick={save} loading={busy}>
              {t("Save")}
            </Button>
          </>
        }
      >
        <Field label={t("Name")} required>
          <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder={t("e.g. T-Shirts")} />
        </Field>
        <Field label={t("Description")}>
          <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        <Field label={t("Sort order")} hint={t("Lower numbers show first")}>
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
        title={t("Delete category")}
        message={t(
          "Delete \"{name}\"? This cannot be undone. Categories with products assigned can't be deleted — deactivate them instead.",
          { name: deleting?.name ?? "" }
        )}
        danger
        confirmLabel={t("Delete")}
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
        title={t("Deactivate category")}
        message={t(
          '"{name}" has {count} product(s). Deactivating it will also deactivate all of them (and their variants), hiding them from the catalog and POS.',
          { name: confirmDeactivate?.name ?? "", count: confirmDeactivate?.productCount ?? 0 }
        )}
        danger
        confirmLabel={t("Deactivate")}
        onConfirm={async () => {
          if (!confirmDeactivate) return;
          try {
            const res = await update({ token, id: confirmDeactivate._id, active: false });
            toast.success(
              res.cascadedCount > 0
                ? t("Category deactivated — {count} product(s) deactivated too", {
                    count: res.cascadedCount,
                  })
                : t("Category deactivated")
            );
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("Failed"));
          }
          setConfirmDeactivate(null);
        }}
      />

      <ConfirmDialog
        open={!!deactivateInstead}
        onClose={() => setDeactivateInstead(null)}
        title={t("Can't delete — deactivate instead?")}
        message={t(
          '"{name}" has products assigned to it, so it can\'t be deleted. Deactivating hides it from new product forms while keeping existing products intact.',
          { name: deactivateInstead?.name ?? "" }
        )}
        confirmLabel={t("Deactivate")}
        onConfirm={async () => {
          if (!deactivateInstead) return;
          try {
            await update({ token, id: deactivateInstead._id, active: false });
            toast.success(t('"{name}" deactivated', { name: deactivateInstead.name }));
          } catch (e) {
            toast.error(e instanceof Error ? e.message : t("Failed to deactivate"));
          }
          setDeactivateInstead(null);
        }}
      />
    </PageLayout>
  );
}
