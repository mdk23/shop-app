"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import {
  Button,
  Card,
  ConfirmDialog,
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
  inputClass,
} from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { usePagedQuery, useClientPage } from "@/lib/pagination";
import { toast } from "sonner";
import { Plus, Search, Pencil, Boxes, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

type Gender = "women" | "men" | "unisex";

const GENDER_LABEL: Record<Gender, string> = {
  women: "Women",
  men: "Men",
  unisex: "Unisex",
};

type ProductRow = {
  _id: Id<"products">;
  name: string;
  categoryId: Id<"categories">;
  categoryName: string;
  gender?: Gender;
  defaultCostPrice: number;
  defaultSellingPrice: number;
  active: boolean;
  variantCount: number;
  activeVariantCount: number;
};

export default function ProductsPage() {
  const token = useToken();
  const fmt = useCurrency();

  const categories = useQuery(api.categories.list, {});
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");

  const {
    rows: products,
    isLoading,
    pageIndex,
    pageSize,
    hasPrev,
    hasNext,
    goPrev,
    goNext,
  } = usePagedQuery(api.products.listPaged, {
    search: search || undefined,
    categoryId: (categoryId || undefined) as Id<"categories"> | undefined,
  });
  const updateProduct = useMutation(api.products.update);
  const removeProduct = useMutation(api.products.remove);
  const archiveProduct = useMutation(api.products.archive);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"products"> | null>(null);
  const [variantsFor, setVariantsFor] = useState<Id<"products"> | null>(null);
  const [deleting, setDeleting] = useState<ProductRow | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [archiveInstead, setArchiveInstead] = useState<ProductRow | null>(null);

  const toggleActive = async (p: ProductRow) => {
    try {
      await updateProduct({ token, id: p._id, active: !p.active });
      toast.success(p.active ? "Product archived" : "Product restored");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update status");
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await removeProduct({ token, id: deleting._id });
      toast.success(`"${deleting.name}" deleted`);
      setDeleting(null);
    } catch (e) {
      const message = e instanceof Error ? e.message : "Failed to delete";
      if (message.includes("sales history")) {
        setDeleting(null);
        setArchiveInstead(deleting);
      } else {
        toast.error(message);
      }
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <PageLayout title="Products" subtitle="Catalog · commercial items & variants">
      <Toolbar>
        <div className="relative">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
          <input
            className={`${inputClass} pl-9 w-56`}
            placeholder="Search products…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-40">
          <option value="">All categories</option>
          {(categories ?? []).map((c) => (
            <option key={c._id} value={c._id}>
              {c.name}
            </option>
          ))}
        </Select>
        <div className="ml-auto" />
        <Button
          onClick={() => {
            setEditingId(null);
            setModalOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5" /> New Product
        </Button>
      </Toolbar>

      <Card>
        {isLoading ? (
          <Spinner />
        ) : products.length === 0 ? (
          <EmptyState
            title="No products"
            message="Create a product, then generate its size / colour variants."
            action={
              <Button onClick={() => setModalOpen(true)}>
                <Plus className="w-3.5 h-3.5" /> New Product
              </Button>
            }
          />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Product</Th>
                <Th>Category</Th>
                <Th className="w-20">Gender</Th>
                <Th className="text-right">Cost</Th>
                <Th className="text-right">Price</Th>
                <Th className="w-24">Variants</Th>
                <Th className="w-20">Status</Th>
                <Th className="w-40" />
              </tr>
            </thead>
            <tbody>
              {(products as ProductRow[]).map((p) => (
                <tr key={p._id} className="hover:bg-surface-container-low">
                  <Td className="font-bold">{p.name}</Td>
                  <Td className="text-on-surface-variant">{p.categoryName}</Td>
                  <Td>
                    <Badge tone="info">{GENDER_LABEL[p.gender ?? "unisex"]}</Badge>
                  </Td>
                  <Td className="text-right">{fmt(p.defaultCostPrice)}</Td>
                  <Td className="text-right font-bold">{fmt(p.defaultSellingPrice)}</Td>
                  <Td>
                    {p.activeVariantCount}/{p.variantCount}
                  </Td>
                  <Td>
                    <button onClick={() => toggleActive(p)} title="Click to toggle status">
                      <Badge tone={p.active ? "success" : "neutral"}>
                        {p.active ? "Active" : "Archived"}
                      </Badge>
                    </button>
                  </Td>
                  <Td>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setVariantsFor(p._id)}
                      >
                        <Boxes className="w-3.5 h-3.5" /> Variants
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditingId(p._id);
                          setModalOpen(true);
                        }}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDeleting(p)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {!isLoading && products.length > 0 && (
          <Pagination
            pageIndex={pageIndex}
            rowCount={products.length}
            pageSize={pageSize}
            hasPrev={hasPrev}
            hasNext={hasNext}
            onPrev={goPrev}
            onNext={goNext}
          />
        )}
      </Card>

      {modalOpen && (
        <ProductModal
          token={token}
          productId={editingId}
          categories={categories ?? []}
          onClose={() => setModalOpen(false)}
          onSaved={(id) => {
            setModalOpen(false);
            if (!editingId) setVariantsFor(id);
          }}
        />
      )}

      {variantsFor && (
        <VariantManager
          token={token}
          productId={variantsFor}
          fmt={fmt}
          onClose={() => setVariantsFor(null)}
        />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete product"
        message={`Delete "${deleting?.name}" and all of its variants? This cannot be undone. Products with sales history can't be deleted — archive them instead.`}
        danger
        confirmLabel="Delete"
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={!!archiveInstead}
        onClose={() => setArchiveInstead(null)}
        title="Can't delete — archive instead?"
        message={`"${archiveInstead?.name}" has sales history, so it can't be deleted. Archiving hides it (and its variants) from the catalog and POS while keeping past sales intact.`}
        confirmLabel="Archive"
        onConfirm={async () => {
          if (!archiveInstead) return;
          try {
            await archiveProduct({ token, id: archiveInstead._id });
            toast.success(`"${archiveInstead.name}" archived`);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to archive");
          }
          setArchiveInstead(null);
        }}
      />
    </PageLayout>
  );
}

// ─────────────────────────────────────────────
// Product create / edit
// ─────────────────────────────────────────────

function ProductModal({
  token,
  productId,
  categories,
  onClose,
  onSaved,
}: {
  token: string;
  productId: Id<"products"> | null;
  categories: { _id: Id<"categories">; name: string }[];
  onClose: () => void;
  onSaved: (id: Id<"products">) => void;
}) {
  const existing = useQuery(
    api.products.get,
    productId ? { id: productId } : "skip"
  );
  const create = useMutation(api.products.create);
  const update = useMutation(api.products.update);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [gender, setGender] = useState<Gender>("unisex");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  if (productId && existing && !hydrated) {
    setName(existing.name);
    setDescription(existing.description ?? "");
    setCategoryId(existing.categoryId);
    setGender((existing.gender as Gender | undefined) ?? "unisex");
    setCost(String(existing.defaultCostPrice));
    setPrice(String(existing.defaultSellingPrice));
    setHydrated(true);
  }

  const save = async () => {
    if (!name.trim() || !categoryId) return toast.error("Name and category are required.");
    setBusy(true);
    try {
      if (productId) {
        await update({
          token,
          id: productId,
          name,
          description: description || undefined,
          categoryId: categoryId as Id<"categories">,
          gender,
          defaultCostPrice: Number(cost) || 0,
          defaultSellingPrice: Number(price) || 0,
        });
        toast.success("Product updated");
        onSaved(productId);
      } else {
        const id = await create({
          token,
          name,
          description: description || undefined,
          categoryId: categoryId as Id<"categories">,
          gender,
          defaultCostPrice: Number(cost) || 0,
          defaultSellingPrice: Number(price) || 0,
        });
        toast.success("Product created — now add its variants");
        onSaved(id);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={productId ? "Edit Product" : "New Product"}
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
      <Field label="Product name" required>
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Classic Polo Shirt"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Category" required>
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Select…</option>
            {categories.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Gender" required>
          <Select value={gender} onChange={(e) => setGender(e.target.value as Gender)}>
            <option value="unisex">Unisex</option>
            <option value="women">Women</option>
            <option value="men">Men</option>
          </Select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Default cost price">
          <TextInput type="number" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
        <Field label="Default selling price">
          <TextInput type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </Modal>
  );
}

// ─────────────────────────────────────────────
// Variant manager (list + inline edit + matrix generator)
// ─────────────────────────────────────────────

function VariantManager({
  token,
  productId,
  fmt,
  onClose,
}: {
  token: string;
  productId: Id<"products">;
  fmt: (n: number) => string;
  onClose: () => void;
}) {
  const product = useQuery(api.products.get, { id: productId });
  const availableSizes = useQuery(api.sizes.list, {});
  const availableColors = useQuery(api.colors.list, {});
  const generate = useMutation(api.productVariants.generateMatrix);
  const updateVariant = useMutation(api.productVariants.update);

  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [reorder, setReorder] = useState("0");
  const [busy, setBusy] = useState(false);
  const variantPage = useClientPage(product?.variants ?? []);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const runMatrix = async () => {
    if (sizes.length === 0 && colors.length === 0)
      return toast.error("Pick at least one size or colour.");
    setBusy(true);
    try {
      const res = await generate({
        token,
        productId,
        sizes,
        colors,
        reorderLevel: Number(reorder) || 0,
      });
      toast.success(`${res.created} variant(s) created, ${res.skipped} skipped`);
      setSizes([]);
      setColors([]);
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
      size="xl"
      title={product ? `Variants · ${product.name}` : "Variants"}
      footer={
        <Button variant="ghost" onClick={onClose}>
          Done
        </Button>
      }
    >
      <Card className="p-4 bg-surface-container-low">
        <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-2">
          Generate size × colour grid
        </p>
        {(availableSizes?.length === 0 || availableColors?.length === 0) && (
          <p className="text-xs text-on-surface-variant mb-3">
            No sizes/colours configured yet — add them in{" "}
            <span className="font-bold">Settings → Sizes / Colors</span> first.
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
              Sizes
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(availableSizes ?? []).map((s) => (
                <button
                  key={s._id}
                  onClick={() => toggle(sizes, setSizes, s.name)}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                    sizes.includes(s.name)
                      ? "bg-primary text-on-primary border-primary"
                      : "bg-surface border-outline text-on-surface-variant hover:border-primary/50"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant mb-1.5">
              Colours
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(availableColors ?? []).map((c) => (
                <button
                  key={c._id}
                  onClick={() => toggle(colors, setColors, c.name)}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors",
                    colors.includes(c.name)
                      ? "bg-primary text-on-primary border-primary"
                      : "bg-surface border-outline text-on-surface-variant hover:border-primary/50"
                  )}
                >
                  <span
                    className="w-3 h-3 rounded-full border border-outline/50"
                    style={{ background: c.hex || "transparent" }}
                  />
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex items-end gap-3 mt-3">
          <Field label="Reorder level">
            <TextInput type="number" value={reorder} onChange={(e) => setReorder(e.target.value)} />
          </Field>
          <Button onClick={runMatrix} loading={busy}>
            Generate
          </Button>
        </div>
      </Card>

      <div className="mt-4">
        {!product ? (
          <Spinner />
        ) : product.variants.length === 0 ? (
          <EmptyState title="No variants yet" message="Use the generator above." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>SKU</Th>
                <Th>Colour</Th>
                <Th>Size</Th>
                <Th className="text-right w-28">Cost</Th>
                <Th className="text-right w-28">Price</Th>
                <Th className="text-right w-20">Reorder</Th>
                <Th className="w-20">Active</Th>
              </tr>
            </thead>
            <tbody>
              {variantPage.rows.map((v) => (
                <VariantRow
                  key={v._id}
                  token={token}
                  variant={v}
                  fmt={fmt}
                  onSave={updateVariant}
                />
              ))}
            </tbody>
          </Table>
        )}
        {product && product.variants.length > 0 && (
          <Pagination
            pageIndex={variantPage.pageIndex}
            rowCount={variantPage.rows.length}
            pageSize={variantPage.pageSize}
            hasPrev={variantPage.hasPrev}
            hasNext={variantPage.hasNext}
            onPrev={variantPage.goPrev}
            onNext={variantPage.goNext}
          />
        )}
      </div>
    </Modal>
  );
}

function VariantRow({
  token,
  variant,
  fmt,
  onSave,
}: {
  token: string;
  variant: {
    _id: Id<"productVariants">;
    sku: string;
    barcode?: string;
    size?: string;
    color?: string;
    costPrice: number;
    sellingPrice: number;
    reorderLevel: number;
    active: boolean;
  };
  fmt: (n: number) => string;
  onSave: ReturnType<typeof useMutation>;
}) {
  const [price, setPrice] = useState(String(variant.sellingPrice));
  const [cost, setCost] = useState(String(variant.costPrice));
  const [reorder, setReorder] = useState(String(variant.reorderLevel));
  const dirty =
    price !== String(variant.sellingPrice) ||
    cost !== String(variant.costPrice) ||
    reorder !== String(variant.reorderLevel);

  const save = async () => {
    try {
      await onSave({
        token,
        id: variant._id,
        sellingPrice: Number(price),
        costPrice: Number(cost),
        reorderLevel: Number(reorder),
      });
      toast.success(`${variant.sku} saved`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  };

  const mini = "w-full px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right";

  return (
    <tr className="hover:bg-surface-container-low">
      <Td className="font-mono text-[11px]">{variant.sku}</Td>
      <Td>{variant.color ?? "—"}</Td>
      <Td>{variant.size ?? "—"}</Td>
      <Td>
        <input className={mini} value={cost} onChange={(e) => setCost(e.target.value)} />
      </Td>
      <Td>
        <input className={mini} value={price} onChange={(e) => setPrice(e.target.value)} />
      </Td>
      <Td>
        <input className={mini} value={reorder} onChange={(e) => setReorder(e.target.value)} />
      </Td>
      <Td>
        {dirty ? (
          <Button size="sm" onClick={save}>
            Save
          </Button>
        ) : (
          <Badge tone={variant.active ? "success" : "neutral"}>
            {variant.active ? "Active" : "Off"}
          </Badge>
        )}
      </Td>
    </tr>
  );
}
