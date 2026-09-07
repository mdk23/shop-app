"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
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
  inputClass,
} from "@/components/ui";
import { useToken, useCurrency } from "@/lib/useShop";
import { toast } from "sonner";
import { Plus, Search, Pencil, Boxes } from "lucide-react";

type ProductRow = {
  _id: Id<"products">;
  name: string;
  categoryId: Id<"categories">;
  brandId?: Id<"brands"> | null;
  categoryName: string;
  brandName: string | null;
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
  const brands = useQuery(api.brands.list, {});
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");

  const products = useQuery(api.products.list, {
    search: search || undefined,
    categoryId: (categoryId || undefined) as Id<"categories"> | undefined,
    brandId: (brandId || undefined) as Id<"brands"> | undefined,
    includeInactive: true,
  });

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<Id<"products"> | null>(null);
  const [variantsFor, setVariantsFor] = useState<Id<"products"> | null>(null);

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
        <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="w-40">
          <option value="">All brands</option>
          {(brands ?? []).map((b) => (
            <option key={b._id} value={b._id}>
              {b.name}
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
        {products === undefined ? (
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
                <Th>Brand</Th>
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
                  <Td className="text-on-surface-variant">{p.brandName ?? "—"}</Td>
                  <Td className="text-right">{fmt(p.defaultCostPrice)}</Td>
                  <Td className="text-right font-bold">{fmt(p.defaultSellingPrice)}</Td>
                  <Td>
                    {p.activeVariantCount}/{p.variantCount}
                  </Td>
                  <Td>
                    <Badge tone={p.active ? "success" : "neutral"}>
                      {p.active ? "Active" : "Archived"}
                    </Badge>
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
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {modalOpen && (
        <ProductModal
          token={token}
          productId={editingId}
          categories={categories ?? []}
          brands={brands ?? []}
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
  brands,
  onClose,
  onSaved,
}: {
  token: string;
  productId: Id<"products"> | null;
  categories: { _id: Id<"categories">; name: string }[];
  brands: { _id: Id<"brands">; name: string }[];
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
  const [brandId, setBrandId] = useState("");
  const [cost, setCost] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  if (productId && existing && !hydrated) {
    setName(existing.name);
    setDescription(existing.description ?? "");
    setCategoryId(existing.categoryId);
    setBrandId(existing.brandId ?? "");
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
          brandId: (brandId || null) as Id<"brands"> | null,
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
          brandId: (brandId || undefined) as Id<"brands"> | undefined,
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
        <Field label="Brand">
          <Select value={brandId} onChange={(e) => setBrandId(e.target.value)}>
            <option value="">None</option>
            {brands.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
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
  const generate = useMutation(api.productVariants.generateMatrix);
  const updateVariant = useMutation(api.productVariants.update);

  const [sizes, setSizes] = useState("");
  const [colors, setColors] = useState("");
  const [reorder, setReorder] = useState("0");
  const [busy, setBusy] = useState(false);

  const runMatrix = async () => {
    const s = sizes.split(",").map((x) => x.trim()).filter(Boolean);
    const c = colors.split(",").map((x) => x.trim()).filter(Boolean);
    if (s.length === 0 && c.length === 0)
      return toast.error("Enter at least one size or colour.");
    setBusy(true);
    try {
      const res = await generate({
        token,
        productId,
        sizes: s,
        colors: c,
        reorderLevel: Number(reorder) || 0,
      });
      toast.success(`${res.created} variant(s) created, ${res.skipped} skipped`);
      setSizes("");
      setColors("");
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
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
          <Field label="Sizes (comma separated)">
            <TextInput value={sizes} onChange={(e) => setSizes(e.target.value)} placeholder="S, M, L, XL" />
          </Field>
          <Field label="Colours (comma separated)">
            <TextInput value={colors} onChange={(e) => setColors(e.target.value)} placeholder="Black, White" />
          </Field>
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
                <Th>Barcode</Th>
                <Th className="text-right w-28">Cost</Th>
                <Th className="text-right w-28">Price</Th>
                <Th className="text-right w-20">Reorder</Th>
                <Th className="w-20">Active</Th>
              </tr>
            </thead>
            <tbody>
              {product.variants.map((v) => (
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
  const [barcode, setBarcode] = useState(variant.barcode ?? "");
  const dirty =
    price !== String(variant.sellingPrice) ||
    cost !== String(variant.costPrice) ||
    reorder !== String(variant.reorderLevel) ||
    barcode !== (variant.barcode ?? "");

  const save = async () => {
    try {
      await onSave({
        token,
        id: variant._id,
        sellingPrice: Number(price),
        costPrice: Number(cost),
        reorderLevel: Number(reorder),
        barcode: barcode || undefined,
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
        <input
          className={mini.replace("text-right", "text-left")}
          value={barcode}
          onChange={(e) => setBarcode(e.target.value)}
          placeholder="—"
        />
      </Td>
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
