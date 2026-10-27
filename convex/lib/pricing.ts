import { QueryCtx } from "../_generated/server";
import { Doc, Id } from "../_generated/dataModel";
import { round2 } from "./fiscal";
import { formatVariantLabel, variantNames } from "./variantNames";
import { loadPromotions } from "./promotions";
import { getSetting, numberSetting } from "../settings";

/**
 * The one way a sale is priced: till prices (promotions included), line and sale
 * discounts, the customer's automatic tier discount, IVA per line and the delivery fee.
 * `performSale` charges exactly this, and the till and order screens show it (via
 * `sales.quote`), so what the cashier sees is what is saved.
 */

export type PriceInput = {
  /** Absent for a walk-in sale. */
  customerId?: Id<"customers">;
  items: {
    productVariantId: Id<"productVariants">;
    quantity: number;
    unitPrice?: number;
    discount?: number;
  }[];
  discount?: number;
  deliveryFeeId?: Id<"deliveryFees">;
  /** Prices agreed earlier (a customer order being collected): not price overrides. */
  agreedPrices?: boolean;
};

export type PricedLine = {
  productVariantId: Id<"productVariants">;
  variant: Doc<"productVariants">;
  product: Doc<"products">;
  productName: string;
  label: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  costPriceAtSale: number;
  size?: string;
  color?: string;
  categoryName: string;
  taxRateId?: Id<"taxRates">;
  taxPercent: number;
  net: number;
  taxAmount: number;
  promotionId?: Id<"promotions">;
  promotionName?: string;
};

/** Refuses anything but a whole number above 0 — clothes are not sold in halves. */
export function assertWholeQuantity(quantity: number, what = "Quantities") {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error(`${what} must be whole numbers above 0.`);
  }
}

export async function priceSale(ctx: QueryCtx, input: PriceInput) {
  if (input.items.length === 0) throw new Error("A sale needs at least one item.");
  // A walk-in sale has no customer; the old walk-in placeholder counts as none.
  const found = input.customerId ? await ctx.db.get(input.customerId) : null;
  if (input.customerId && !found) throw new Error("Customer not found.");
  const customer = found && !found.isGeneric ? found : null;

  // IVA for products without their own rate: always the setting, never the caller.
  const defaultTaxPercent = await numberSetting(ctx, "taxRatePercent");
  const tillPrice = await loadPromotions(ctx, Date.now());

  // Price overrides: lines sold at a price other than the till price (the selling price,
  // or the promotion price while one runs), and how much below it they went. Both count
  // as discounts for the authority check.
  let overriddenLines = 0;
  let priceCut = 0;
  const lines: PricedLine[] = [];

  for (const item of input.items) {
    assertWholeQuantity(item.quantity);
    if (item.unitPrice !== undefined && item.unitPrice < 0) {
      throw new Error("A price cannot be negative.");
    }
    const variant = await ctx.db.get(item.productVariantId);
    if (!variant || !variant.active) throw new Error("A selected product variant is unavailable.");
    const product = await ctx.db.get(variant.productId);
    if (!product) throw new Error("Parent product missing for a variant.");
    const category = await ctx.db.get(product.categoryId);
    const names = await variantNames(ctx, variant);
    const taxRate = product.taxRateId ? await ctx.db.get(product.taxRateId) : null;
    if (taxRate && !taxRate.active) {
      throw new Error(`The IVA rate on ${product.name} is inactive. Update the product before selling it.`);
    }

    const till = tillPrice(variant, product);
    const unitPrice = item.unitPrice ?? till.price;
    if (!input.agreedPrices && Math.abs(unitPrice - till.price) > 1e-6) {
      overriddenLines += 1;
      priceCut += Math.max(0, till.price - unitPrice) * item.quantity;
    }
    // The line carries its promotion when it sold at the promotion price.
    const onPromotion = till.promotion && Math.abs(unitPrice - till.price) <= 1e-6;
    const lineDiscount = item.discount ?? 0;
    if (lineDiscount < 0) throw new Error("A discount cannot be negative.");

    lines.push({
      productVariantId: item.productVariantId,
      variant,
      product,
      productName: product.name,
      label: formatVariantLabel(names, variant.sku),
      sku: variant.sku,
      quantity: item.quantity,
      unitPrice,
      discount: lineDiscount,
      total: Math.max(0, unitPrice * item.quantity - lineDiscount),
      costPriceAtSale: variant.costPrice,
      size: names.size,
      color: names.color,
      categoryName: category?.name ?? "Uncategorised",
      taxRateId: taxRate?._id,
      taxPercent: taxRate ? taxRate.percentage : defaultTaxPercent,
      net: 0,
      taxAmount: 0,
      promotionId: onPromotion ? till.promotion!.id : undefined,
      promotionName: onPromotion ? till.promotion!.name : undefined,
    });
  }

  const subtotal = round2(lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0));
  const lineDiscountTotal = lines.reduce((s, l) => s + l.discount, 0);
  const saleDiscount = Math.max(0, input.discount ?? 0);

  // Automatic tier discount — server-authoritative, and never a cashier choice.
  const tier = customer?.tier ?? "NOVO";
  const tierSettingKey =
    tier === "VIP" ? "tierDiscountPercentVIP" : tier === "REGULAR" ? "tierDiscountPercentREGULAR" : null;
  let tierDiscountPercent = 0;
  if (tierSettingKey && (await getSetting(ctx, tierSettingKey))?.isActive) {
    tierDiscountPercent = await numberSetting(ctx, tierSettingKey);
  }
  const manualDiscount = lineDiscountTotal + saleDiscount;
  const preTierBase = Math.max(0, subtotal - manualDiscount);
  const tierDiscountAmount =
    tierDiscountPercent > 0 ? round2(preTierBase * (tierDiscountPercent / 100)) : 0;
  const discount = round2(manualDiscount + tierDiscountAmount);

  // Sale-level discounts are spread across lines in proportion to their gross value, so
  // each line's IVA is computed on its own net amount. The last line takes the rounding
  // remainder, keeping the allocated total exact.
  const saleLevelDiscount = discount - lineDiscountTotal;
  const grossSum = lines.reduce((s, l) => s + l.total, 0);
  let allocated = 0;
  lines.forEach((l, i) => {
    const share =
      i === lines.length - 1
        ? round2(saleLevelDiscount - allocated)
        : grossSum > 0
          ? round2((saleLevelDiscount * l.total) / grossSum)
          : 0;
    allocated = round2(allocated + share);
    l.net = round2(Math.max(0, l.total - share));
    l.taxAmount = round2((l.net * l.taxPercent) / 100);
  });
  const taxableBase = round2(lines.reduce((s, l) => s + l.net, 0));
  const tax = round2(lines.reduce((s, l) => s + l.taxAmount, 0));

  let deliveryFeeAmount = 0;
  if (input.deliveryFeeId) {
    deliveryFeeAmount = (await ctx.db.get(input.deliveryFeeId))?.fee ?? 0;
  }
  const total = round2(Math.max(0, taxableBase + tax + deliveryFeeAmount));

  return {
    customer,
    lines,
    subtotal,
    manualDiscount,
    tierDiscountAmount,
    discount,
    taxableBase,
    tax,
    deliveryFeeAmount,
    total,
    overriddenLines,
    priceCut,
  };
}
