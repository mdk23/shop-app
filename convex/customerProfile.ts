import { MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { writeAudit } from "./audit";
import { getSetting } from "./settings";
import {
  inferSizeProfile,
  inferGender,
  computeTier,
  topLabel,
  subMonths,
  type SizeObservation,
  type ExistingProfileRow,
  type Tier,
} from "./lib/customers/derive";

/**
 * Hard cap on how many of a customer's past sales get re-scanned per
 * checkout — protects a long-tenured customer's Nth sale from re-reading
 * hundreds of historical sales every time. 60 is comfortably more than
 * enough to establish a reliable size/tier signal.
 */
const MAX_PROFILE_SALES = 60;

/**
 * Recomputes a customer's size profile (`customerSizeProfiles`) and `tier`
 * from their sale/return history, and persists only what changed. Called
 * from `performSale` (after the sale write, same transaction) and from
 * `salesReturns.create` / `sales.cancel` (since both change the underlying
 * observations). A no-op for missing/generic customers — anonymous sales
 * never get a profile.
 *
 * KNOWN GAP: `salesReturns.create` doesn't reduce `sale.total`/`balance` on
 * refund (see the comment at that patch site), so this function's own
 * trailing-12-month spend figure nets out returns locally for the tier
 * calculation, but does not attempt to fix `customers.ts`'s lifetime-spend
 * aggregate, which intentionally stays consistent with what `getById`
 * already shows everywhere else in the app.
 */
export async function refreshCustomerProfile(
  ctx: MutationCtx,
  customerId: Id<"customers">,
  actor: { _id: Id<"users">; username: string }
): Promise<{ tier: Tier; changed: boolean } | null> {
  const customer = await ctx.db.get(customerId);
  if (!customer || customer.isGeneric) return null;

  const now = Date.now();
  const windowMonths =
    Number((await getSetting(ctx, "sizeInferenceMonths"))?.value ?? "24") || 24;
  const novoMaxSales =
    Number((await getSetting(ctx, "tierNovoMaxSales"))?.value ?? "1") || 1;
  const vipMinSpend12m =
    Number((await getSetting(ctx, "tierVipMinSpend12m"))?.value ?? "50000") || 50000;

  const sales = (
    await ctx.db
      .query("sales")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .order("desc")
      .take(MAX_PROFILE_SALES)
  ).filter((s) => s.status !== "CANCELLED");

  // Returns: build a per-line "how many units came back" map (used to net
  // out returned units from size inference, regardless of when the return
  // happened) and a trailing-12-month refund total (used only for tier).
  const returns = await ctx.db
    .query("salesReturns")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  const returnItemArrays = await Promise.all(
    returns.map((r) =>
      ctx.db
        .query("salesReturnItems")
        .withIndex("by_return", (q) => q.eq("returnId", r._id))
        .collect()
    )
  );
  const returnedQtyBySaleItem = new Map<Id<"saleItems">, number>();
  for (const items of returnItemArrays) {
    for (const it of items) {
      returnedQtyBySaleItem.set(
        it.saleItemId,
        (returnedQtyBySaleItem.get(it.saleItemId) ?? 0) + it.quantity
      );
    }
  }
  const twelveMonthsAgo = subMonths(now, 12);
  const refundsTrailing12m = returns
    .filter((r) => r.createdAt >= twelveMonthsAgo)
    .reduce((s, r) => s + r.refundAmount, 0);

  // Resolve variant → product → category, and variant.size → sizeId, with
  // memoized lookups so repeat products/sizes across many sales cost nothing.
  const sizesByName = new Map(
    (await ctx.db.query("sizes").collect()).map((s) => [s.name, s])
  );
  const categoryNameById = new Map(
    (await ctx.db.query("categories").collect()).map((c) => [c._id, c.name])
  );
  const variantCache = new Map<Id<"productVariants">, Awaited<ReturnType<typeof ctx.db.get>>>();
  const productCache = new Map<Id<"products">, Awaited<ReturnType<typeof ctx.db.get>>>();

  const observations: SizeObservation[] = [];
  for (const sale of sales) {
    const items = await ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", sale._id))
      .collect();
    for (const item of items) {
      if (!variantCache.has(item.productVariantId)) {
        variantCache.set(item.productVariantId, await ctx.db.get(item.productVariantId));
      }
      const variant = variantCache.get(item.productVariantId) as
        | { productId: Id<"products">; size?: string; color?: string }
        | null
        | undefined;
      if (!variant || !variant.size) continue; // no size on this line — nothing to observe

      const size = sizesByName.get(variant.size);
      if (!size) continue; // free-text size doesn't map to the sizes taxonomy — skip

      if (!productCache.has(variant.productId)) {
        productCache.set(variant.productId, await ctx.db.get(variant.productId));
      }
      const product = productCache.get(variant.productId) as
        | { categoryId: Id<"categories">; gender?: "women" | "men" | "unisex" }
        | null
        | undefined;
      if (!product) continue;

      observations.push({
        saleId: sale._id,
        saleItemId: item._id,
        createdAt: sale.createdAt,
        saleStatus: sale.status,
        categoryId: product.categoryId,
        categoryName: categoryNameById.get(product.categoryId) ?? "—",
        sizeId: size._id,
        sizeName: size.name,
        gender: product.gender,
        colorName: variant.color,
        quantity: item.quantity,
        returnedQuantity: returnedQtyBySaleItem.get(item._id) ?? 0,
      });
    }
  }

  const existingRows = await ctx.db
    .query("customerSizeProfiles")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  const existing: ExistingProfileRow[] = existingRows.map((r) => ({
    categoryId: r.categoryId,
    sizeId: r.sizeId,
    confidence: r.confidence,
  }));

  const inferred = inferSizeProfile(observations, existing, { now, windowMonths });

  for (const profile of inferred) {
    const current = existingRows.find((r) => r.categoryId === profile.categoryId);
    if (!current) {
      await ctx.db.insert("customerSizeProfiles", {
        customerId,
        categoryId: profile.categoryId as Id<"categories">,
        sizeId: profile.sizeId as Id<"sizes">,
        sizeName: profile.sizeName,
        confidence: "INFERIDO",
        updatedAt: now,
      });
    } else if (current.confidence === "INFERIDO" && current.sizeId !== profile.sizeId) {
      await ctx.db.patch(current._id, {
        sizeId: profile.sizeId as Id<"sizes">,
        sizeName: profile.sizeName,
        updatedAt: now,
      });
    }
    // CONFIRMADO rows are never touched — inferSizeProfile already excludes
    // their categories from `inferred`, this branch is just defensive.
  }

  // Retract a stale INFERIDO row only when this scan actually saw fresh
  // activity in that category (e.g. the customer's one purchase there was
  // since fully returned) — never just because the category aged out of the
  // window or the 60-sale cap, which says nothing about whether the old
  // inference is still right.
  const observedCategories = new Set(observations.map((o) => o.categoryId));
  const inferredCategories = new Set(inferred.map((p) => p.categoryId));
  for (const row of existingRows) {
    if (row.confidence !== "INFERIDO") continue;
    if (inferredCategories.has(row.categoryId)) continue; // handled above
    if (observedCategories.has(row.categoryId)) {
      await ctx.db.delete(row._id);
    }
  }

  const preferredGender = inferGender(observations);
  if (preferredGender !== customer.preferredGender) {
    await ctx.db.patch(customerId, { preferredGender });
  }

  // Tier 3 — derived only, never a form field. "Most bought" over the whole
  // scanned history (no window), net of returns, same rule as size inference.
  const netUnits = (o: SizeObservation) => o.quantity - o.returnedQuantity;
  const nonCancelled = observations.filter((o) => o.saleStatus !== "CANCELLED");
  const topCategoryName = topLabel(
    nonCancelled.map((o) => ({ label: o.categoryName, net: netUnits(o) }))
  );
  const topColorName = topLabel(
    nonCancelled.map((o) => ({ label: o.colorName, net: netUnits(o) }))
  );
  if (topCategoryName !== customer.topCategoryName || topColorName !== customer.topColorName) {
    await ctx.db.patch(customerId, { topCategoryName, topColorName });
  }

  const spendTrailing12m =
    sales
      .filter((s) => s.createdAt >= twelveMonthsAgo)
      .reduce((s, sale) => s + sale.total, 0) - refundsTrailing12m;
  const nextTier = computeTier(
    { saleCount: sales.length, spendTrailing12m },
    { novoMaxSales, vipMinSpend12m }
  );
  const prevTier = customer.tier ?? "NOVO";
  const changed = nextTier !== prevTier;
  if (changed) {
    await ctx.db.patch(customerId, { tier: nextTier, tierUpdatedAt: now });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.tier_changed",
      entityType: "customer",
      entityId: customerId,
      details: `${prevTier} → ${nextTier}`,
    });
  }

  return { tier: nextTier, changed };
}
