"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { PageLayout } from "@/components/PageLayout";
import { Button, Card, Drawer, EmptyState, Select, Spinner, inputClass } from "@/components/ui";
import { CustomerRail } from "@/components/pos/CustomerRail";
import { CustomerFicha } from "@/components/customers/CustomerFicha";
import { SizeConflictBanner } from "@/components/pos/SizeConflictBanner";
import { PaymentModal } from "@/components/pos/PaymentModal";
import { ReceiptModal } from "@/components/pos/ReceiptModal";
import { AnonymousCustomerCapture, type CaptureResult } from "@/components/pos/AnonymousCustomerCapture";
import type { PosContextSaleLine } from "@/components/pos/posContext";
import { TIER_LABEL } from "@/lib/badgeTones";
import { useToken, useCurrency, useResolvedBranch } from "@/lib/useShop";
import { useTranslation } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Gender = "women" | "men" | "unisex";

const GENDER_LABEL: Record<Gender, string> = {
  women: "Woman",
  men: "Man",
  unisex: "Unisex",
};

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

type SizeConflict = {
  categoryId: Id<"categories">;
  categoryName: string;
  knownSizeName: string;
  attemptedSizeName: string;
};

export default function PosPage() {
  const token = useToken();
  const fmt = useCurrency();
  const { branchId, branchName } = useResolvedBranch();
  const { t } = useTranslation();

  const catalog = useQuery(
    api.products.listForPos,
    branchId ? { branchId } : "skip"
  );
  const taxSetting = useQuery(api.settings.getByKey, { key: "taxRatePercent" });
  const sizesList = useQuery(api.sizes.list, {});
  const createSale = useMutation(api.sales.create);
  const getGeneric = useMutation(api.customers.getOrCreateGeneric);
  const setSizeProfile = useMutation(api.customers.setSizeProfile);
  const createMinimalCustomer = useMutation(api.customers.createMinimal);

  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerId, setCustomerId] = useState<Id<"customers"> | null>(null);
  const [saleDiscount, setSaleDiscount] = useState(0);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [gender, setGender] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [onlyCustomerSize, setOnlyCustomerSize] = useState(true);
  const [sizeConflict, setSizeConflict] = useState<SizeConflict | null>(null);
  const [expanded, setExpanded] = useState<Id<"products"> | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [receiptSaleId, setReceiptSaleId] = useState<Id<"sales"> | null>(null);
  const [capture, setCapture] = useState<CaptureResult>({ kind: "none" });
  const [captureWhatsappOptIn, setCaptureWhatsappOptIn] = useState(false);
  const [fichaOpen, setFichaOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const taxRate = Number(taxSetting?.value ?? "0") || 0;

  // Single round trip for everything the rail + catalog need about the
  // selected customer — skipped entirely for anonymous sales.
  const posContext = useQuery(
    api.customers.getPosContext,
    customerId ? { customerId, branchId } : "skip"
  );

  const customerSizeByCategory = useMemo(() => {
    const m = new Map<string, { sizeName: string; categoryId: Id<"categories"> }>();
    for (const s of posContext?.sizes ?? []) {
      m.set(s.categoryName, { sizeName: s.sizeName, categoryId: s.categoryId });
    }
    return m;
  }, [posContext]);

  const sizeIdByName = useMemo(
    () => new Map((sizesList ?? []).map((s) => [s.name, s._id])),
    [sizesList]
  );

  const { categories, genders, sizes, colors } = useMemo(() => {
    const c = new Set<string>();
    const g = new Set<string>();
    const s = new Set<string>();
    const col = new Set<string>();
    for (const p of catalog ?? []) {
      c.add(p.categoryName);
      g.add(p.gender ?? "unisex");
      for (const v of p.variants) {
        if (v.size) s.add(v.size);
        if (v.color) col.add(v.color);
      }
    }
    return {
      categories: [...c].sort(),
      genders: [...g].sort(),
      sizes: [...s].sort(),
      colors: [...col].sort(),
    };
  }, [catalog]);

  const preferredGender = posContext?.customer?.preferredGender;
  const preferredCategoryIds = posContext?.customer?.preferredCategoryIds;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (catalog ?? [])
      .map((p) => {
        const preset =
          !size && onlyCustomerSize && customerId
            ? customerSizeByCategory.get(p.categoryName)?.sizeName
            : undefined;
        return {
          ...p,
          variants: p.variants.filter(
            (v) =>
              (!size || v.size === size) &&
              (!preset || v.size === preset) &&
              (!color || v.color === color)
          ),
        };
      })
      .filter(
        (p) =>
          p.variants.length > 0 &&
          (!category || p.categoryName === category) &&
          (!gender || (p.gender ?? "unisex") === gender) &&
          (!term ||
            p.name.toLowerCase().includes(term) ||
            p.variants.some((v) => v.sku.toLowerCase().includes(term)))
      )
      .sort((a, b) => {
        const scoreOf = (p: (typeof a)) => {
          let s = 0;
          if (preferredGender && (p.gender ?? "unisex") === preferredGender) s += 1;
          if (preferredCategoryIds?.includes(p.categoryId)) s += 1;
          return s;
        };
        return scoreOf(b) - scoreOf(a);
      });
  }, [
    catalog,
    search,
    category,
    gender,
    size,
    color,
    onlyCustomerSize,
    customerId,
    customerSizeByCategory,
    preferredGender,
    preferredCategoryIds,
  ]);

  const addLine = (
    v: {
      _id: Id<"productVariants">;
      sku: string;
      label: string;
      sellingPrice: number;
      stock: number;
      size?: string;
    },
    productName: string,
    categoryName: string
  ) => {
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

    if (customerId && v.size) {
      const known = customerSizeByCategory.get(categoryName);
      if (known && known.sizeName !== v.size) {
        setSizeConflict({
          categoryId: known.categoryId,
          categoryName,
          knownSizeName: known.sizeName,
          attemptedSizeName: v.size,
        });
      }
    }
  };

  const buyAgain = (line: PosContextSaleLine) => {
    const product = (catalog ?? []).find((p) => p._id === line.productId);
    if (!product) {
      toast.error(t("This product is no longer available."));
      return;
    }
    const variant = product.variants.find((v) => v._id === line.productVariantId);
    if (variant && variant.stock > 0) {
      addLine(variant, product.name, product.categoryName);
      toast.success(t("Added to cart"));
    } else {
      setExpanded(product._id);
      toast(t('"{name}" — choose an available size', { name: product.name }));
    }
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
  const manualDiscount = lineDiscountTotal + saleDiscount;
  const tierDiscountPercent = customerId ? posContext?.tierDiscountPercent ?? 0 : 0;
  const preTierBase = Math.max(0, subtotal - manualDiscount);
  // Mirrors performSale's formula purely for display — the server recomputes
  // this itself from the customer's stored tier, never trusting the client.
  const tierDiscountAmount =
    tierDiscountPercent > 0
      ? Math.round(preTierBase * (tierDiscountPercent / 100) * 100) / 100
      : 0;
  const discount = manualDiscount + tierDiscountAmount;
  const taxable = Math.max(0, subtotal - discount);
  const tax = Math.round(taxable * (taxRate / 100) * 100) / 100;
  const total = taxable + tax;

  const completeSale = async (
    payments: { method: string; amount: number }[]
  ): Promise<void> => {
    if (!branchId) {
      toast.error(t("No branch selected."));
      return;
    }
    if (cart.length === 0) {
      toast.error(t("The cart is empty."));
      return;
    }
    try {
      // Resolution order: rail selection → matched phone → newly-created
      // minimal customer → generic walk-in (unchanged if the capture field
      // was left empty — same interaction count as before this feature).
      let effectiveCustomerId = customerId;
      if (!effectiveCustomerId) {
        if (capture.kind === "matched") {
          effectiveCustomerId = capture.customerId;
        } else if (capture.kind === "new") {
          effectiveCustomerId = await createMinimalCustomer({
            token,
            phone1: capture.phone1,
            whatsappOptIn: captureWhatsappOptIn,
          });
        } else {
          effectiveCustomerId = await getGeneric();
        }
      }
      const saleId = await createSale({
        token,
        branchId,
        customerId: effectiveCustomerId,
        items: cart.map((l) => ({
          productVariantId: l.variantId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          discount: l.lineDiscount || undefined,
        })),
        discount: saleDiscount || undefined,
        payments,
      });
      toast.success(t("Sale completed"));
      setPayOpen(false);
      setCart([]);
      setSaleDiscount(0);
      setCapture({ kind: "none" });
      setCaptureWhatsappOptIn(false);
      setReceiptSaleId(saleId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("Sale failed"));
    }
  };

  if (!branchId) {
    return (
      <PageLayout title="POS" subtitle={t("Point of sale")}>
        <EmptyState
          title={t("No branch available")}
          message={t("Create a branch in Settings before selling.")}
        />
      </PageLayout>
    );
  }

  return (
    <PageLayout title="POS" subtitle={t("Point of sale · {branch}", { branch: branchName })} isFullWidth>
      <div className="grid grid-cols-1 md:grid-cols-[300px_1fr_360px] xl:grid-cols-[320px_1fr_380px] gap-4 h-[calc(100vh-9rem)]">
        {/* Customer rail */}
        <div className="min-h-0">
          <CustomerRail
            customerId={customerId}
            context={posContext}
            fmt={fmt}
            onSelect={setCustomerId}
            onClear={() => setCustomerId(null)}
            onBuyAgain={buyAgain}
            onOpenFicha={() => setFichaOpen(true)}
          />
        </div>

        {/* Catalog */}
        <div className="flex flex-col min-h-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <div className="relative flex-1 min-w-56">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" />
              <input
                ref={searchRef}
                className={`${inputClass} pl-9`}
                placeholder={t("Search products…")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-36"
            >
              <option value="">{t("All categories")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Select
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              className="w-28"
            >
              <option value="">{t("All genders")}</option>
              {genders.map((g) => (
                <option key={g} value={g}>
                  {t(GENDER_LABEL[g as Gender] ?? g)}
                </option>
              ))}
            </Select>
            <Select
              value={size}
              onChange={(e) => {
                setSize(e.target.value);
                setOnlyCustomerSize(false);
              }}
              className="w-24"
            >
              <option value="">{t("All sizes")}</option>
              {sizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
            <Select value={color} onChange={(e) => setColor(e.target.value)} className="w-32">
              <option value="">{t("All colors")}</option>
              {colors.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
          </div>

          {customerId && (
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={onlyCustomerSize}
                onChange={(e) => setOnlyCustomerSize(e.target.checked)}
              />
              {t("Only the customer's size")}
            </label>
          )}

          {(category || gender || size || color) && (
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-[9px] font-black uppercase tracking-widest text-on-surface-variant">
                {t("Filters:")}
              </span>
              {category && (
                <ActiveFilterTag label={category} onClear={() => setCategory("")} />
              )}
              {gender && (
                <ActiveFilterTag
                  label={t(GENDER_LABEL[gender as Gender] ?? gender)}
                  onClear={() => setGender("")}
                />
              )}
              {size && <ActiveFilterTag label={size} onClear={() => setSize("")} />}
              {color && <ActiveFilterTag label={color} onClear={() => setColor("")} />}
              <button
                onClick={() => {
                  setCategory("");
                  setGender("");
                  setSize("");
                  setColor("");
                }}
                className="text-[9px] font-black uppercase tracking-widest text-primary hover:underline"
              >
                {t("Clear all")}
              </button>
            </div>
          )}

          <Card className="flex-1 overflow-y-auto p-3">
            {catalog === undefined ? (
              <Spinner />
            ) : filtered.length === 0 ? (
              <EmptyState title={t("No products found")} />
            ) : (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-2">
                {filtered.map((p) => {
                  const knownSize = customerId
                    ? customerSizeByCategory.get(p.categoryName)
                    : undefined;
                  const knownVariant = knownSize
                    ? p.variants.find((v) => v.size === knownSize.sizeName)
                    : undefined;
                  return (
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
                        {knownVariant ? (
                          <p className="text-[9px] uppercase tracking-wider mt-0.5 font-bold">
                            {knownVariant.size}:{" "}
                            {knownVariant.stock > 0
                              ? t("{count} in stock", { count: knownVariant.stock })
                              : t("out of stock")}
                          </p>
                        ) : (
                          <p className="text-[9px] text-on-surface-variant uppercase tracking-wider mt-0.5">
                            {p.variants.length === 1
                              ? t("1 variant")
                              : t("{count} variants", { count: p.variants.length })}
                          </p>
                        )}
                      </button>
                      {expanded === p._id && (
                        <div className="mt-1 p-2 rounded-xl bg-surface-container border border-outline space-y-1">
                          {p.variants.map((v) => (
                            <button
                              key={v._id}
                              disabled={v.stock <= 0}
                              onClick={() => addLine(v, p.name, p.categoryName)}
                              className={cn(
                                "w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-[11px] font-bold transition-colors",
                                v.stock <= 0
                                  ? "opacity-40 cursor-not-allowed bg-surface-container-low"
                                  : "bg-surface-container-low hover:bg-primary hover:text-on-primary"
                              )}
                            >
                              <span>{v.label}</span>
                              <span className="opacity-70">
                                {v.stock > 0
                                  ? t("{count} in stock", { count: v.stock })
                                  : t("out of stock")}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Cart */}
        <Card className="flex flex-col min-h-0">
          <div className="p-3 border-b border-outline/40">
            <p className="text-sm font-black uppercase tracking-wider">
              {posContext?.customer
                ? t("Cart — {name}", { name: posContext.customer.firstName })
                : t("Cart")}
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {sizeConflict && (
              <SizeConflictBanner
                message={t("This customer usually takes {known}. Confirm {attempted}?", {
                  known: sizeConflict.knownSizeName,
                  attempted: sizeConflict.attemptedSizeName,
                })}
                onConfirmUpdate={async () => {
                  const sizeId = sizeIdByName.get(sizeConflict.attemptedSizeName);
                  if (!customerId || !sizeId) {
                    setSizeConflict(null);
                    return;
                  }
                  try {
                    await setSizeProfile({
                      token,
                      customerId,
                      categoryId: sizeConflict.categoryId,
                      sizeId,
                    });
                    toast.success(t("Profile updated"));
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : t("Update failed"));
                  }
                  setSizeConflict(null);
                }}
                onDismiss={() => setSizeConflict(null)}
              />
            )}
            {cart.length === 0 ? (
              <p className="text-center text-xs text-on-surface-variant py-10">
                {t("The cart is empty — tap a product to add it.")}
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
                        {t("disc")}
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
            <Row label={t("Subtotal")} value={fmt(subtotal)} />
            <div className="flex items-center justify-between text-xs">
              <span className="text-on-surface-variant uppercase tracking-wider">
                {t("Sale discount")}
              </span>
              <input
                type="number"
                value={saleDiscount || ""}
                onChange={(e) => setSaleDiscount(Math.max(0, Number(e.target.value)))}
                className="w-24 px-2 py-1 bg-surface-container-low border border-outline rounded-lg text-xs text-right"
                placeholder="0"
              />
            </div>
            {tierDiscountAmount > 0 && posContext?.customer && (
              <Row
                label={t("{tier} discount ({pct}%)", {
                  tier: t(TIER_LABEL[posContext.customer.tier]),
                  pct: tierDiscountPercent,
                })}
                value={`- ${fmt(tierDiscountAmount)}`}
              />
            )}
            {tax > 0 && <Row label={t("Tax ({rate}%)", { rate: taxRate })} value={fmt(tax)} />}
            <div className="flex items-center justify-between pt-1 border-t border-outline/40">
              <span className="text-sm font-black uppercase tracking-wider">{t("Total")}</span>
              <span className="text-xl font-display text-primary">{fmt(total)}</span>
            </div>
            <Button
              className="w-full"
              size="lg"
              disabled={cart.length === 0}
              onClick={() => setPayOpen(true)}
            >
              {t("Charge {total}", { total: fmt(total) })}
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
          extraFields={
            !customerId ? (
              <AnonymousCustomerCapture
                onChange={setCapture}
                onWhatsappOptInChange={setCaptureWhatsappOptIn}
              />
            ) : undefined
          }
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

      {customerId && (
        <Drawer
          open={fichaOpen}
          onClose={() => setFichaOpen(false)}
          title={t("Customer Profile")}
          subtitle={posContext?.customer?.name}
        >
          <CustomerFicha customerId={customerId} variant="drawer" />
        </Drawer>
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
