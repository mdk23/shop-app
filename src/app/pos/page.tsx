"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, EmptyState, Select, Spinner, inputClass } from "@/components/ui";
import { CustomerSelect } from "@/components/pos/CustomerSelect";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type CartLine = {
  variantId: Id<"productVariants">;
  productName: string;
  label: string;
  sku: string;
  unitPrice: number;
  quantity: number;
  lineDiscount: number;
  stock: number;
};

export default function PosPage() {
  const token = useToken();
  const fmt = useCurrency();
  const { branchId, branchName } = useResolvedBranch();

  const catalog = useQuery(
    api.products.listForPos,
    branchId ? { branchId } : "skip"
  );
  const taxSetting = useQuery(api.settings.getByKey, { key: "taxRatePercent" });
  const createSale = useMutation(api.sales.create);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [expanded, setExpanded] = useState<Id<"products"> | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [receiptSaleId, setReceiptSaleId] = useState<Id<"sales"> | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const taxRate = Number(taxSetting?.value ?? "0") || 0;

  const { categories, sizes, colors } = useMemo(() => {
    const c = new Set<string>();
    const s = new Set<string>();
    const col = new Set<string>();
    for (const p of catalog ?? []) {
      c.add(p.categoryName);
      for (const v of p.variants) {
        if (v.size) s.add(v.size);
        if (v.color) col.add(v.color);
      }
    }
    return {
      categories: [...c].sort(),
      sizes: [...s].sort(),
      colors: [...col].sort(),
    };
  }, [catalog]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (catalog ?? [])
      .map((p) => ({
        ...p,
        variants: p.variants.filter(
          (v) =>
            (!size || v.size === size) &&
            (!color || v.color === color)
        ),
      }))
      .filter(
        (p) =>
          p.variants.length > 0 &&
          (!category || p.categoryName === category) &&
          (!term ||
            p.name.toLowerCase().includes(term) ||
            p.variants.some((v) => v.sku.toLowerCase().includes(term)))
      );
  }, [catalog, search, category, size, color]);

  const addLine = (v: {
    _id: Id<"productVariants">;
    sku: string;
    label: string;
    sellingPrice: number;
    stock: number;
  }, productName: string) => {
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.variantId === v._id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [
        ...prev,
        {
          variantId: v._id,
          productName,
          label: v.label,
          sku: v.sku,
          unitPrice: v.sellingPrice,
          quantity: 1,
          lineDiscount: 0,
          stock: v.stock,
        },
      ];
    });
  };

  const setQty = (variantId: Id<"productVariants">, qty: number) =>
    setCart((prev) =>
      qty <= 0
        ? prev.filter((l) => l.variantId !== variantId)
        : prev.map((l) => (l.variantId === variantId ? { ...l, quantity: qty } : l))
    );

  const setLineDiscount = (variantId: Id<"productVariants">, d: number) =>
    setCart((prev) =>
      prev.map((l) =>
        l.variantId === variantId ? { ...l, lineDiscount: Math.max(0, d) } : l
      )
    );

  const subtotal = cart.reduce((s, l) => s + l.unitPrice * l.quantity, 0);
  const lineDiscountTotal = cart.reduce((s, l) => s + l.lineDiscount, 0);
  const discount = lineDiscountTotal + saleDiscount;
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * (taxRate / 100) * 100) / 100;
  const total = taxable + tax;

  const completeSale = async (
    payments: { method: string; amount: number }[]
  ): Promise<void> => {
    if (!branchId) {
      toast.error("No branch selected.");
      return;
    }
    if (!customerId) {
      toast.error("Select a customer.");
      return;
    }
    if (cart.length === 0) {
      toast.error("Cart is empty.");
      return;
    }
    try {
      const saleId = await createSale({
        token,
        branchId,
        customerId,
        items: cart.map((l) => ({
          productVariantId: l.variantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.lineDiscount || undefined,
        })),
        discount: saleDiscount || undefined,
        payments,
      });
      toast.success("Sale completed");
      setPayOpen(false);
      setCart([]);
      setSaleDiscount(0);
      setReceiptSaleId(saleId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sale failed");
    }
  };

  if (!branchId) {
    return (
      <PageLayout title="POS" subtitle="Point of sale">
        <EmptyState
          title="No branch available"
          message="Create a branch in Settings before selling."
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="POS" subtitle={`Point of sale · ${branchName}`} isFullWidth>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4 h-[calc(100vh-9rem)]">
        {/* Catalog */}
        <div className="flex flex-col min-h-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="relative flex-1 min-w-56">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                ref={searchRef}
                className={`${inputClass} pl-9`}
                placeholder="Search products…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-36"
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select value={size} onChange={(e) => setSize(e.target.value)} className="w-24">
              <option value="">All sizes</option>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select value={color} onChange={(e) => setColor(e.target.value)} className="w-32">
              <option value="">All colors</option>
              {colors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          {(category || size || color) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
                Filters:
              </span>
              {category && (
                <ActiveFilterTag label={category} onClear={() => setCategory("")} />
              )}
              {size && <ActiveFilterTag label={size} onClear={() => setSize("")} />}
              {color && <ActiveFilterTag label={color} onClear={() => setColor("")} />}
              <button
                onClick={() => {
                  setCategory("");
                  setSize("");
                  setColor("");
                }}
                className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline"
              >
                Clear all
              </button>
            </div>
          )}

          <Card className="flex-1 overflow-y-auto p-3">
            {catalog === undefined ? (
              <Spinner />
            ) : filtered.length === 0 ? (
              <EmptyState title="No products match" />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                {filtered.map((p) => (
                  <div key={p._id}>
                    <button
                      onClick={() =>
                        setExpanded(expanded === p._id ? null : p._id)
                      }
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-colors",
                        expanded === p._id
                          ? "border-primary bg-primary/5"
                          : "border-outline bg-surface-container-low hover:border-primary/50"
                      )}
                    >
                      <p className="font-bold text-xs text-on-surface line-clamp-2 min-h-8">
                        {p.name}
                      </p>
                      <p className="text-[10px] text-on-surface-variant mt-1">
                        {p.categoryName}
                      </p>
                      <p className="text-sm font-display text-primary mt-1">
                        {fmt(p.defaultSellingPrice)}
                      </p>
                      <p className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-0.5">
                        {p.variants.length} variant{p.variants.length === 1 ? "" : "s"}
                      </p>
                    </button>
                    {expanded === p._id && (
                      <div className="mt-1 p-2 rounded-xl bg-surface-container border border-outline space-y-1">
                        {p.variants.map((v) => (
                          <button
                            key={v._id}
                            disabled={v.stock <= 0}
                            onClick={() => addLine(v, p.name)}
                            className={cn(
                              "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors",
                              v.stock <= 0
                                ? "opacity-40 cursor-not-allowed bg-surface-container-low"
                                : "bg-surface-container-low hover:bg-primary hover:text-on-primary"
                            )}
                          >
                            <span>{v.label}</span>
                            <span className="opacity-70">
                              {v.stock > 0 ? `${v.stock} in stock` : "out"}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Cart */}
        <Card className="flex flex-col min-h-0">
          <div className="p-3 border-b border-outline/40">
            <CustomerSelect selectedCustomerId={customerId} onSelect={setCustomerId} />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {cart.length === 0 ? (
              <p className="text-center text-xs text-on-surface-variant py-10">
                Cart is empty — tap a product to add it.
              </p>
            ) : (
              cart.map((l) => (
                <div
                  key={l.variantId}
                  className="p-2.5 rounded-xl bg-surface-container-low border border-outline"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-on-surface truncate">
                        {l.productName}
                      </p>
                      <p className="text-[10px] text-on-surface-variant">
                        {l.label} · {fmt(l.unitPrice)}
                      </p>
                    </div>
                    <button
                      onClick={() => setQty(l.variantId, 0)}
                      className="text-on-surface-variant hover:text-error"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setQty(l.variantId, l.quantity - 1)}
                        className="w-6 h-6 rounded-lg bg-surface border border-outline flex items-center justify-center"
                      >
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="w-8 text-center text-sm font-bold">
                        {l.quantity}
                      </span>
                      <button
                        onClick={() => setQty(l.variantId, l.quantity + 1)}
                        className="w-6 h-6 rounded-lg bg-surface border border-outline flex items-center justify-center"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="text-[9px] uppercase tracking-wider text-on-surface-variant">
                        disc
                      </span>
                      <input
                        type="number"
                        value={l.lineDiscount || ""}
                        onChange={(e) =>
                          setLineDiscount(l.variantId, Number(e.target.value))
                        }
                        className="w-16 px-2 py-1 bg-surface border border-outline rounded-lg text-xs text-right"
                        placeholder="0"
                      />
                    </div>
                    <span className="text-sm font-bold">
                      {fmt(l.unitPrice * l.quantity - l.lineDiscount)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="p-3 border-t border-outline/40 space-y-2">
            <Row label="Subtotal" value={fmt(subtotal)} />
            <div className="flex items-center justify-between text-xs">
              <span className="text-on-surface-variant uppercase tracking-wider">
                Sale discount
              </span>
              <input
                type="number"
                value={saleDiscount || ""}
                onChange={(e) => setSaleDiscount(Math.max(0, Number(e.target.value)))}
                className="w-24 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right"
                placeholder="0"
              />
            </div>
            {tax > 0 && <Row label={`Tax (${taxRate}%)`} value={fmt(tax)} />}
            <div className="flex items-center justify-between pt-1 border-t border-outline/40">
              <span className="text-sm font-black uppercase tracking-wider">Total</span>
              <span className="text-xl font-display text-primary">{fmt(total)}</span>
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0}
              onClick={() => setPayOpen(true)}
            >
              Charge {fmt(total)}
            </Button>
          </div>
        </Card>
      </div>

      {payOpen && (
        <PaymentModal
          total={total}
          fmt={fmt}
          onClose={() => setPayOpen(false)}
          onComplete={completeSale}
        />
      )}

      {receiptSaleId && (
        <ReceiptModal
          saleId={receiptSaleId}
          onClose={() => {
            setReceiptSaleId(null);
            searchRef.current?.focus();
          }}
        />
      )}
    </PageLayout>
  );
}

function ActiveFilterTag({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button
      onClick={onClear}
      className="flex items-center gap-1 pl-2.5 pr-1.5 py-1 rounded-full text-[10px] font-bold bg-primary/10 text-primary border border-primary/30 hover:bg-primary/20 transition-colors"
    >
      {label}
      <X className="w-3 h-3" />
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-on-surface-variant uppercase tracking-wider">{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}
