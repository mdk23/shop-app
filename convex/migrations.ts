import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { slugify } from "./productVariants";
import { getLocalDateString } from "./metrics";

/**
 * One-shot migration of the legacy restaurant data into the retail schema.
 *
 * PREREQUISITE — take a backup first:
 *   npx convex export --path ./restaurant-backup.zip
 *
 * Run order (each is admin-gated; the batched ones re-run until `done: true`):
 *   1. migrateCatalog     (dishes/drinks → products + one "Default" variant)
 *   2. migrateStock       (legacy ingredient stock → INITIAL_STOCK movements)
 *   3. migrateCustomers   (adds active + customerCode)
 *   4. migrateSales       (orders → sales, orderItems → saleItems)  [batched]
 *   5. migratePayments    (repoints payments.orderId → saleId)      [batched]
 *   6. rebuildAnalytics   (wipes + recomputes counters + dailyMetrics)
 *   7. dropLegacy         (deletes migrated legacy rows — needs confirm:true)
 *
 * Known lossy points: migrated products get a single "Default" variant (a dish
 * has no real size/colour), cost prices are unknown (0 → margins meaningless
 * until edited), and modifier/combo detail on order lines is dropped.
 */

const BATCH = 25;
const FALLBACK_KEY = "__unmapped__";

async function mapGet(
  ctx: MutationCtx,
  kind: string,
  legacyId: string
): Promise<string | null> {
  const row = await ctx.db
    .query("migrationMap")
    .withIndex("by_kind_and_legacy", (q) =>
      q.eq("kind", kind).eq("legacyId", legacyId)
    )
    .unique();
  return row?.newId ?? null;
}

async function mapSet(
  ctx: MutationCtx,
  kind: string,
  legacyId: string,
  newId: string
) {
  const existing = await ctx.db
    .query("migrationMap")
    .withIndex("by_kind_and_legacy", (q) =>
      q.eq("kind", kind).eq("legacyId", legacyId)
    )
    .unique();
  if (existing) await ctx.db.patch(existing._id, { newId });
  else await ctx.db.insert("migrationMap", { kind, legacyId, newId });
}

async function defaultBranchId(ctx: MutationCtx): Promise<Id<"branches">> {
  const def =
    (await ctx.db
      .query("branches")
      .filter((q) => q.eq(q.field("isDefault"), true))
      .first()) ?? (await ctx.db.query("branches").first());
  if (def) return def._id;
  return await ctx.db.insert("branches", {
    name: "Main Store",
    code: "MAIN",
    status: "active",
    isDefault: true,
    createdAt: Date.now(),
  });
}

// ─────────────────────────────────────────────
// 1. CATALOG
// ─────────────────────────────────────────────

export const migrateCatalog = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    const now = Date.now();

    // Category map (dedupe on the legacy category string).
    const categoryId = new Map<string, Id<"categories">>();
    const existingCats = await ctx.db.query("categories").collect();
    for (const c of existingCats) categoryId.set(c.name, c._id);
    const ensureCategory = async (name: string) => {
      const key = name || "Uncategorised";
      if (categoryId.has(key)) return categoryId.get(key)!;
      const id = await ctx.db.insert("categories", {
        name: key,
        active: true,
        sortOrder: categoryId.size,
        createdAt: now,
        updatedAt: now,
      });
      categoryId.set(key, id);
      return id;
    };

    let migratedProducts = 0;
    let migratedVariants = 0;

    // Fallback variant for order lines that cannot be mapped.
    if (!(await mapGet(ctx, "fallback", FALLBACK_KEY))) {
      const fbCat = await ensureCategory("Legacy");
      const fbProduct = await ctx.db.insert("products", {
        name: "Legacy / Unmapped Item",
        categoryId: fbCat,
        defaultCostPrice: 0,
        defaultSellingPrice: 0,
        active: false,
        createdAt: now,
        updatedAt: now,
      });
      const fbVariant = await ctx.db.insert("productVariants", {
        productId: fbProduct,
        sku: "LEGACY-UNMAPPED",
        costPrice: 0,
        sellingPrice: 0,
        reorderLevel: 0,
        active: false,
        createdAt: now,
        updatedAt: now,
      });
      await mapSet(ctx, "fallback", FALLBACK_KEY, fbVariant);
    }

    // Dishes → product + one Default variant.
    const dishes = await ctx.db.query("dishes").collect();
    for (const dish of dishes) {
      if (await mapGet(ctx, "dish", dish._id)) continue;
      const catId = await ensureCategory(dish.category);
      const productId = await ctx.db.insert("products", {
        name: dish.name,
        description: dish.description,
        categoryId: catId,
        defaultCostPrice: 0,
        defaultSellingPrice: dish.price,
        active: dish.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      });
      const variantId = await ctx.db.insert("productVariants", {
        productId,
        sku: `${slugify(dish.name) || "ITEM"}-DEF-${migratedVariants}`,
        costPrice: 0,
        sellingPrice: dish.price,
        reorderLevel: 0,
        active: dish.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      });
      await mapSet(ctx, "dishProduct", dish._id, productId);
      await mapSet(ctx, "dish", dish._id, variantId);
      migratedProducts += 1;
      migratedVariants += 1;
    }

    // Sellable ingredients (drinks) → product + variant.
    const ingredients = await ctx.db.query("ingredients").collect();
    for (const ing of ingredients) {
      if (ing.category !== "Drinks") continue;
      if (await mapGet(ctx, "ingredient", ing._id)) continue;
      const catId = await ensureCategory("Accessories");
      const productId = await ctx.db.insert("products", {
        name: ing.name,
        categoryId: catId,
        defaultCostPrice: 0,
        defaultSellingPrice: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      const variantId = await ctx.db.insert("productVariants", {
        productId,
        sku: `${slugify(ing.name) || "ITEM"}-DEF-${migratedVariants}`,
        costPrice: 0,
        sellingPrice: 0,
        reorderLevel: ing.lowStockThreshold ?? 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await mapSet(ctx, "ingredient", ing._id, variantId);
      migratedProducts += 1;
      migratedVariants += 1;
    }

    return { migratedProducts, migratedVariants };
  },
});

// ─────────────────────────────────────────────
// 2. STOCK
// ─────────────────────────────────────────────

export const migrateStock = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const branchId = await defaultBranchId(ctx);
    const ingredients = await ctx.db.query("ingredients").collect();
    let seeded = 0;
    for (const ing of ingredients) {
      const variantId = (await mapGet(ctx, "ingredient", ing._id)) as
        | Id<"productVariants">
        | null;
      if (!variantId || ing.stockQuantity <= 0) continue;
      if (await mapGet(ctx, "ingredientStock", ing._id)) continue;
      await ctx.runMutation(internal.inventory.mutateStock, {
        productVariantId: variantId,
        branchId,
        quantity: ing.stockQuantity,
        movementType: "INITIAL_STOCK",
        referenceType: "migration",
        notes: `Migrated opening stock for ${ing.name}`,
        userId: actor._id,
        username: actor.username,
      });
      await mapSet(ctx, "ingredientStock", ing._id, "done");
      seeded += 1;
    }
    return { seeded };
  },
});

// ─────────────────────────────────────────────
// 3. CUSTOMERS
// ─────────────────────────────────────────────

export const migrateCustomers = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    const customers = await ctx.db.query("customers").collect();
    let patched = 0;
    let seq = 0;
    for (const c of customers) {
      const update: Record<string, unknown> = {};
      if (c.active === undefined) update.active = c.status !== "archived";
      if (!c.customerCode && !c.isGeneric) {
        seq += 1;
        update.customerCode = `C-LEGACY-${String(seq).padStart(4, "0")}`;
      }
      if (Object.keys(update).length) {
        await ctx.db.patch(c._id, update);
        patched += 1;
      }
    }
    return { patched };
  },
});

// ─────────────────────────────────────────────
// 4. SALES  (batched)
// ─────────────────────────────────────────────

function saleStatus(legacy: string): {
  status:
    | "COMPLETED"
    | "PARTIALLY_PAID"
    | "PENDING"
    | "CANCELLED";
  paymentStatus: "PAID" | "PARTIALLY_PAID" | "UNPAID";
} {
  switch (legacy) {
    case "Paid":
      return { status: "COMPLETED", paymentStatus: "PAID" };
    case "Partially Paid":
      return { status: "PARTIALLY_PAID", paymentStatus: "PARTIALLY_PAID" };
    case "Cancelled":
      return { status: "CANCELLED", paymentStatus: "UNPAID" };
    default:
      return { status: "PENDING", paymentStatus: "UNPAID" };
  }
}

export const migrateSales = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    const branchFallback = await defaultBranchId(ctx);
    const fallbackVariant = (await mapGet(ctx, "fallback", FALLBACK_KEY)) as
      | Id<"productVariants">
      | null;
    if (!fallbackVariant)
      throw new Error("Run migrateCatalog before migrateSales.");

    const orders = await ctx.db.query("orders").order("asc").take(500);
    let processed = 0;
    let remaining = 0;

    for (const order of orders) {
      if (await mapGet(ctx, "order", order._id)) continue;
      if (processed >= BATCH) {
        remaining += 1;
        continue;
      }

      const { status, paymentStatus } = saleStatus(order.status);
      const total = order.total;
      const paid = order.amountPaid ?? 0;
      const balance = Math.max(0, total - paid);
      const branchId = order.branchId ?? branchFallback;

      const saleId = await ctx.db.insert("sales", {
        saleNumber: order.orderCode ?? `LEGACY-${order._id.slice(-6)}`,
        branchId,
        customerId: order.customerId,
        userId: order.userId,
        username: order.username,
        status,
        subtotal: total,
        discount: 0,
        tax: 0,
        total,
        paidAmount: Math.min(paid, total),
        balance,
        paymentStatus,
        customerName: order.customerName,
        splitPayments: order.splitPayments,
        createdAt: order.createdAt,
        updatedAt: order.createdAt,
      });

      const items = await ctx.db
        .query("orderItems")
        .withIndex("by_order", (q) => q.eq("orderId", order._id))
        .collect();
      for (const it of items) {
        const mappedVariant =
          ((await mapGet(ctx, "dish", it.dishId)) as Id<"productVariants"> | null) ??
          fallbackVariant;
        const variant = await ctx.db.get(mappedVariant);
        const product = variant ? await ctx.db.get(variant.productId) : null;
        await ctx.db.insert("saleItems", {
          saleId,
          productVariantId: mappedVariant,
          productName: product?.name ?? "(legacy item)",
          variantLabel: product?.name ?? "(legacy item)",
          sku: variant?.sku ?? "LEGACY",
          quantity: it.quantity,
          unitPrice: it.priceAtTime,
          discount: 0,
          total: it.priceAtTime * it.quantity,
          costPriceAtSale: variant?.costPrice ?? 0,
        });
      }

      await mapSet(ctx, "order", order._id, saleId);
      processed += 1;
    }

    return { processed, remaining, done: remaining === 0 };
  },
});

// ─────────────────────────────────────────────
// 5. PAYMENTS  (batched)
// ─────────────────────────────────────────────

export const migratePayments = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    const payments = await ctx.db.query("payments").take(1000);
    let processed = 0;
    let skipped = 0;
    for (const p of payments) {
      if (p.saleId || !p.orderId) continue;
      const saleId = (await mapGet(ctx, "order", p.orderId)) as
        | Id<"sales">
        | null;
      if (!saleId) {
        skipped += 1;
        continue;
      }
      await ctx.db.patch(p._id, { saleId, kind: p.kind ?? "payment" });
      processed += 1;
      if (processed >= BATCH * 4) break;
    }
    return { processed, skipped, done: skipped === 0 };
  },
});

// ─────────────────────────────────────────────
// 6. ANALYTICS REBUILD
// ─────────────────────────────────────────────

export const rebuildAnalytics = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");

    for (const row of await ctx.db.query("dailyMetrics").collect())
      await ctx.db.delete(row._id);
    for (const row of await ctx.db.query("counters").collect())
      await ctx.db.delete(row._id);

    const sales = await ctx.db.query("sales").collect();
    const byDate = new Map<
      string,
      {
        totalRevenue: number;
        totalSales: number;
        totalItemsSold: number;
        totalDiscount: number;
        totalTax: number;
        totalProfit: number;
        totalPending: number;
        cashCollected: number;
        outstandingDebt: number;
      }
    >();

    for (const s of sales) {
      if (s.status === "CANCELLED") continue;
      const d = getLocalDateString(s.createdAt);
      const acc =
        byDate.get(d) ??
        {
          totalRevenue: 0,
          totalSales: 0,
          totalItemsSold: 0,
          totalDiscount: 0,
          totalTax: 0,
          totalProfit: 0,
          totalPending: 0,
          cashCollected: 0,
          outstandingDebt: 0,
        };
      acc.totalRevenue += s.total;
      acc.totalSales += 1;
      acc.totalDiscount += s.discount;
      acc.totalTax += s.tax;
      acc.totalPending += s.balance;
      acc.cashCollected += s.paidAmount;
      acc.outstandingDebt += s.balance;
      const items = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", s._id))
        .collect();
      for (const it of items) {
        acc.totalItemsSold += it.quantity;
        acc.totalProfit += it.total - it.costPriceAtSale * it.quantity;
      }
      byDate.set(d, acc);
    }

    for (const [dateString, acc] of byDate) {
      await ctx.db.insert("dailyMetrics", { dateString, ...acc });
    }

    // Stock alert counters.
    let low = 0;
    let out = 0;
    for (const st of await ctx.db.query("variantStock").collect()) {
      const variant = await ctx.db.get(st.productVariantId);
      if (!variant || !variant.active) continue;
      const reorder = st.reorderLevel ?? variant.reorderLevel;
      if (st.quantity <= 0) out += 1;
      else if (st.quantity <= reorder) low += 1;
    }
    const now = Date.now();
    await ctx.db.insert("counters", { key: "low_stock_items", value: low, updatedAt: now });
    await ctx.db.insert("counters", { key: "out_of_stock_items", value: out, updatedAt: now });

    return { days: byDate.size, lowStock: low, outOfStock: out };
  },
});

// ─────────────────────────────────────────────
// 7. DROP LEGACY
// ─────────────────────────────────────────────

export const dropLegacy = mutation({
  args: { token: v.string(), confirm: v.literal(true) },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    const tables = [
      "orderItems",
      "orders",
      "dishIngredients",
      "dishes",
      "factoryRecipes",
      "productionLogs",
      "wasteLogs",
      "ingredients",
      "migrationMap",
    ] as const;
    const deleted: Record<string, number> = {};
    for (const table of tables) {
      let count = 0;
      for (const row of await ctx.db.query(table).collect()) {
        await ctx.db.delete(row._id);
        count += 1;
      }
      deleted[table] = count;
    }
    return deleted;
  },
});

// ─────────────────────────────────────────────
// STATUS
// ─────────────────────────────────────────────

export const status = query({
  args: {},
  handler: async (ctx) => {
    const len = <T,>(a: T[]) => a.length;
    return {
      legacy: {
        dishes: len(await ctx.db.query("dishes").collect()),
        ingredients: len(await ctx.db.query("ingredients").collect()),
        orders: len(await ctx.db.query("orders").collect()),
        orderItems: len(await ctx.db.query("orderItems").collect()),
      },
      retail: {
        products: len(await ctx.db.query("products").collect()),
        productVariants: len(await ctx.db.query("productVariants").collect()),
        sales: len(await ctx.db.query("sales").collect()),
        saleItems: len(await ctx.db.query("saleItems").collect()),
        payments: len(await ctx.db.query("payments").collect()),
      },
      migrationMapRows: len(await ctx.db.query("migrationMap").collect()),
    };
  },
});
