import { v } from "convex/values";
import {
  mutation,
  query,
  QueryCtx,
} from "./_generated/server";
import { paginationOptsValidator } from "convex/server";
import { Doc, Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { nextSequence } from "./metrics";
import { getSetting } from "./settings";
import { normalizePhone } from "./lib/phone";

// ─────────────────────────────────────────────
// FINANCIALS
// ─────────────────────────────────────────────

/**
 * Collects a customer's non-cancelled sales once and derives every
 * sales-based stat from that single array — shared by `getById` (via
 * `customerFinancials` below) and `getPosContext`, so neither has to
 * collect the `sales` table twice for the same customer.
 */
export async function customerSalesSummary(ctx: QueryCtx, customerId: Id<"customers">) {
  const sales = await ctx.db
    .query("sales")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .order("desc")
    .collect();
  const active = sales.filter((s) => s.status !== "CANCELLED");
  const totalPurchases = active.reduce((s, o) => s + o.total, 0);
  const totalPaid = active.reduce((s, o) => s + o.paidAmount, 0);
  const outstandingDebt = active.reduce((s, o) => s + o.balance, 0);
  const purchaseCount = active.length;
  const lastPurchase = active.reduce((max, o) => Math.max(max, o.createdAt), 0);
  const firstPurchase =
    active.length > 0
      ? active.reduce((min, o) => Math.min(min, o.createdAt), Infinity)
      : null;
  const avgTicket = purchaseCount > 0 ? totalPurchases / purchaseCount : 0;

  const credits = await ctx.db
    .query("customerCredits")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  const storeCredit = credits.reduce((s, c) => s + c.delta, 0);

  return {
    stats: {
      totalPurchases,
      totalPaid,
      outstandingDebt,
      purchaseCount,
      firstPurchase: firstPurchase === Infinity ? null : firstPurchase,
      lastPurchase: lastPurchase || null,
      avgTicket,
      storeCredit,
    },
    // Newest first, every status included — callers filter as needed
    // (e.g. `getPosContext` excludes CANCELLED for its "recent sales" list).
    sales,
  };
}

async function customerFinancials(ctx: QueryCtx, customerId: Id<"customers">) {
  const { stats } = await customerSalesSummary(ctx, customerId);
  return {
    totalPurchases: stats.totalPurchases,
    totalPaid: stats.totalPaid,
    outstandingDebt: stats.outstandingDebt,
    purchaseCount: stats.purchaseCount,
    lastPurchase: stats.lastPurchase,
    storeCredit: stats.storeCredit,
  };
}

function computeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] ?? "";
  const second = parts.length > 1 ? parts[1][0] ?? "" : "";
  return (first + second).toUpperCase() || "?";
}

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const list = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("customers").order("desc").collect(),
});

export const listPaginated = query({
  args: {
    paginationOpts: paginationOptsValidator,
    showArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    let q = ctx.db.query("customers").order("desc");
    if (!args.showArchived) {
      q = q.filter((qq) => qq.neq(qq.field("status"), "archived"));
    }
    return await q.paginate(args.paginationOpts);
  },
});

export const search = query({
  args: { query: v.string(), showArchived: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const term = args.query.trim().toLowerCase();
    if (!term) return [];
    const isPhone = /^[\d+\-\s()]+$/.test(args.query);
    const candidates = isPhone
      ? await ctx.db.query("customers").order("desc").take(200)
      : await ctx.db
          .query("customers")
          .withSearchIndex("search_name", (qb) => qb.search("name", args.query))
          .take(100);
    return candidates
      .filter(
        (c) =>
          (args.showArchived || c.status !== "archived") &&
          (c.name.toLowerCase().includes(term) ||
            c.phone1.includes(term) ||
            (c.phone2 ?? "").includes(term) ||
            (c.phone3 ?? "").includes(term) ||
            (c.email ?? "").toLowerCase().includes(term) ||
            (c.customerCode ?? "").toLowerCase().includes(term))
      )
      .slice(0, 15);
  },
});

/**
 * Exact-phone lookup for retroactive customer capture at checkout. Tries the
 * raw input against `by_phone1`, then the normalized input, then falls back
 * to the same bounded scan `search` already uses for phone-shaped queries.
 * Never matches the generic walk-in customer or archived rows.
 */
export const findByPhone = query({
  args: { phone: v.string() },
  handler: async (ctx, args) => {
    const raw = args.phone.trim();
    if (!raw) return null;
    const normalized = normalizePhone(raw);

    const tryExact = (value: string) =>
      value
        ? ctx.db
            .query("customers")
            .withIndex("by_phone1", (q) => q.eq("phone1", value))
            .first()
        : Promise.resolve(null);

    let match = await tryExact(raw);
    if (!match && normalized) match = await tryExact(normalized);
    if (!match && normalized) {
      const candidates = await ctx.db.query("customers").order("desc").take(200);
      match = candidates.find((c) => normalizePhone(c.phone1) === normalized) ?? null;
    }

    if (!match || match.isGeneric || match.status === "archived") return null;
    return {
      _id: match._id,
      name: match.name,
      phone1: match.phone1,
      tier: (match.tier ?? "NOVO") as "NOVO" | "REGULAR" | "VIP",
    };
  },
});

export const getById = query({
  args: { id: v.id("customers") },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.id);
    if (!customer) return null;
    if (customer.isGeneric) {
      return {
        ...customer,
        stats: {
          totalPurchases: 0,
          totalPaid: 0,
          outstandingDebt: 0,
          purchaseCount: 0,
          lastPurchase: null,
          storeCredit: 0,
        },
      };
    }
    return { ...customer, stats: await customerFinancials(ctx, args.id) };
  },
});

/**
 * Everything the POS customer rail (and the Ficha, via `branchId: undefined`)
 * needs in one round trip: identity, money, size profile, last 3 purchases
 * with resolvable line items, and the tier discount percent. See
 * `convex/lib/customers/derive.ts` for the tier/size logic this feeds off of.
 */
export const getPosContext = query({
  args: {
    customerId: v.id("customers"),
    branchId: v.optional(v.id("branches")),
  },
  handler: async (ctx, args) => {
    const customer = await ctx.db.get(args.customerId);

    const empty = {
      customer: null as null | ReturnType<typeof buildCustomerShape>,
      money: {
        storeCredit: 0,
        outstandingDebt: 0,
        lifetimeSpend: 0,
        saleCount: 0,
        avgTicket: 0,
        firstPurchase: null as number | null,
        lastPurchase: null as number | null,
        returnRatePercent: 0,
        purchaseFrequencyPerMonth: 0,
      },
      sizes: [] as {
        _id: Id<"customerSizeProfiles">;
        categoryId: Id<"categories">;
        categoryName: string;
        sizeId: Id<"sizes">;
        sizeName: string;
        confidence: "CONFIRMADO" | "INFERIDO";
        updatedAt: number;
      }[],
      recentSales: [] as Array<{
        saleId: Id<"sales">;
        saleNumber: string;
        createdAt: number;
        total: number;
        status: Doc<"sales">["status"];
        hasReturns: boolean;
        lines: Array<{
          saleItemId: Id<"saleItems">;
          productVariantId: Id<"productVariants">;
          productId: Id<"products"> | undefined;
          productName: string;
          variantLabel: string;
          sizeName?: string;
          colorName?: string;
          unitPrice: number;
          quantity: number;
          variantActive: boolean;
          stockAtBranch: number | null;
        }>;
      }>,
      tierDiscountPercent: 0,
    };

    if (!customer) return empty;

    function buildCustomerShape(preferredColorNames: string[], preferredCategoryNames: string[]) {
      return {
        _id: customer!._id,
        name: customer!.name,
        firstName: customer!.name.split(/\s+/)[0] || customer!.name,
        phone1: customer!.phone1,
        photoUrl: customer!.photoUrl,
        initials: computeInitials(customer!.name),
        tier: (customer!.tier ?? "NOVO") as "NOVO" | "REGULAR" | "VIP",
        isGeneric: !!customer!.isGeneric,
        customerCode: customer!.customerCode,
        email: customer!.email,
        notes: customer!.notes,
        whatsappOptIn: customer!.whatsappOptIn ?? false,
        preferredGender: customer!.preferredGender,
        preferredSports: customer!.preferredSports ?? [],
        preferredColorIds: customer!.preferredColorIds ?? [],
        preferredColorNames,
        preferredCategoryIds: customer!.preferredCategoryIds ?? [],
        preferredCategoryNames,
        preferredBrands: customer!.preferredBrands ?? [],
        // Tier 3 — derived-only, cached by refreshCustomerProfile. Never editable.
        topCategoryName: customer!.topCategoryName,
        topColorName: customer!.topColorName,
      };
    }

    if (customer.isGeneric) {
      return { ...empty, customer: buildCustomerShape([], []) };
    }

    const { stats, sales } = await customerSalesSummary(ctx, args.customerId);
    const recent = sales.filter((s) => s.status !== "CANCELLED").slice(0, 3);

    const lineArrays = await Promise.all(
      recent.map((s) =>
        ctx.db
          .query("saleItems")
          .withIndex("by_sale", (q) => q.eq("saleId", s._id))
          .collect()
      )
    );

    const variantIds = new Set<Id<"productVariants">>();
    for (const lines of lineArrays) for (const l of lines) variantIds.add(l.productVariantId);
    const variantMap = new Map(
      await Promise.all(
        [...variantIds].map(async (id) => [id, await ctx.db.get(id)] as const)
      )
    );

    const productIds = new Set<Id<"products">>();
    for (const variant of variantMap.values()) if (variant) productIds.add(variant.productId);
    const productMap = new Map(
      await Promise.all(
        [...productIds].map(async (id) => [id, await ctx.db.get(id)] as const)
      )
    );

    const stockMap = new Map<Id<"productVariants">, number>();
    if (args.branchId) {
      const branchId = args.branchId;
      const entries = await Promise.all(
        [...variantIds].map(async (id) => {
          const row = await ctx.db
            .query("variantStock")
            .withIndex("by_branch_and_variant", (q) =>
              q.eq("branchId", branchId).eq("productVariantId", id)
            )
            .unique();
          return [id, row?.quantity ?? 0] as const;
        })
      );
      for (const [id, qty] of entries) stockMap.set(id, qty);
    }

    const hasReturnsMap = new Map(
      await Promise.all(
        recent.map(async (s) => {
          const r = await ctx.db
            .query("salesReturns")
            .withIndex("by_sale", (q) => q.eq("saleId", s._id))
            .first();
          return [s._id, !!r] as const;
        })
      )
    );

    const recentSales = recent.map((s, i) => ({
      saleId: s._id,
      saleNumber: s.saleNumber,
      createdAt: s.createdAt,
      total: s.total,
      status: s.status,
      hasReturns: hasReturnsMap.get(s._id) ?? false,
      lines: lineArrays[i].map((l) => {
        const variant = variantMap.get(l.productVariantId);
        return {
          saleItemId: l._id,
          productVariantId: l.productVariantId,
          productId: variant?.productId,
          productName: l.productName,
          variantLabel: l.variantLabel,
          sizeName: variant?.size,
          colorName: variant?.color,
          unitPrice: l.unitPrice,
          quantity: l.quantity,
          variantActive: variant?.active ?? false,
          stockAtBranch: args.branchId ? stockMap.get(l.productVariantId) ?? 0 : null,
        };
      }),
    }));

    const sizeRows = await ctx.db
      .query("customerSizeProfiles")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
    const categoryMap = new Map(
      await Promise.all(
        [...new Set(sizeRows.map((r) => r.categoryId))].map(
          async (id) => [id, await ctx.db.get(id)] as const
        )
      )
    );
    const sizes = sizeRows.map((r) => ({
      _id: r._id,
      categoryId: r.categoryId,
      categoryName: categoryMap.get(r.categoryId)?.name ?? "—",
      sizeId: r.sizeId,
      sizeName: r.sizeName,
      confidence: r.confidence,
      updatedAt: r.updatedAt,
    }));

    const preferredColorIds = customer.preferredColorIds ?? [];
    let preferredColorNames: string[] = [];
    if (preferredColorIds.length > 0) {
      const colors = await Promise.all(preferredColorIds.map((id) => ctx.db.get(id)));
      preferredColorNames = colors
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => c.name);
    }

    const preferredCategoryIds = customer.preferredCategoryIds ?? [];
    let preferredCategoryNames: string[] = [];
    if (preferredCategoryIds.length > 0) {
      const cats = await Promise.all(preferredCategoryIds.map((id) => ctx.db.get(id)));
      preferredCategoryNames = cats
        .filter((c): c is NonNullable<typeof c> => !!c)
        .map((c) => c.name);
    }

    // Tier 3 — cheap live stats (no per-line scan needed): purchase
    // frequency and return rate. "Most bought category/color" is expensive
    // to compute live (needs a full sale-item history scan), so that's
    // cached on the customer doc by refreshCustomerProfile instead and just
    // read off `customer` above.
    const returnsCount = (
      await ctx.db
        .query("salesReturns")
        .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
        .collect()
    ).length;
    const returnRatePercent =
      stats.purchaseCount > 0 ? (returnsCount / stats.purchaseCount) * 100 : 0;
    const monthsSinceFirstPurchase = stats.firstPurchase
      ? Math.max(1, (Date.now() - stats.firstPurchase) / (1000 * 60 * 60 * 24 * 30.44))
      : 0;
    const purchaseFrequencyPerMonth =
      monthsSinceFirstPurchase > 0 ? stats.purchaseCount / monthsSinceFirstPurchase : 0;

    const tier = (customer.tier ?? "NOVO") as "NOVO" | "REGULAR" | "VIP";
    const tierSettingKey =
      tier === "VIP"
        ? "tierDiscountPercentVIP"
        : tier === "REGULAR"
          ? "tierDiscountPercentREGULAR"
          : null;
    let tierDiscountPercent = 0;
    if (tierSettingKey) {
      const setting = await getSetting(ctx, tierSettingKey);
      if (setting?.isActive) tierDiscountPercent = Number(setting.value ?? "0") || 0;
    }

    return {
      customer: buildCustomerShape(preferredColorNames, preferredCategoryNames),
      money: {
        storeCredit: stats.storeCredit,
        outstandingDebt: stats.outstandingDebt,
        lifetimeSpend: stats.totalPurchases,
        saleCount: stats.purchaseCount,
        avgTicket: stats.avgTicket,
        firstPurchase: stats.firstPurchase,
        lastPurchase: stats.lastPurchase,
        returnRatePercent,
        purchaseFrequencyPerMonth,
      },
      sizes,
      recentSales,
      tierDiscountPercent,
    };
  },
});

// ─────────────────────────────────────────────
// MUTATIONS
// ─────────────────────────────────────────────

const CUSTOMER_FIELDS = {
  name: v.string(),
  phone1: v.string(),
  phone2: v.optional(v.string()),
  phone3: v.optional(v.string()),
  email: v.optional(v.string()),
  address: v.optional(v.string()),
  notes: v.optional(v.string()),
};

export const create = mutation({
  args: { token: v.string(), ...CUSTOMER_FIELDS },
  handler: async (ctx, args) => {
    const { token, ...data } = args;
    const actor = await authorize(ctx, token, "customers.manage");
    const seq = await nextSequence(ctx, "customer_code_sequence");
    const id = await ctx.db.insert("customers", {
      ...data,
      customerCode: `C-${String(seq).padStart(5, "0")}`,
      isGeneric: false,
      active: true,
      status: "active",
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.created",
      entityType: "customer",
      entityId: id,
      details: `Created customer "${data.name}"`,
    });
    return id;
  },
});

export const getOrCreateGeneric = mutation({
  args: {},
  handler: async (ctx) => {
    const generic = await ctx.db
      .query("customers")
      .withIndex("by_isGeneric", (q) => q.eq("isGeneric", true))
      .first();
    if (generic) return generic._id;
    return await ctx.db.insert("customers", {
      name: "Walk-in Customer",
      phone1: "000000000",
      isGeneric: true,
      active: true,
      status: "active",
    });
  },
});

export const update = mutation({
  args: { token: v.string(), id: v.id("customers"), ...CUSTOMER_FIELDS },
  handler: async (ctx, args) => {
    const { token, id, ...data } = args;
    const actor = await authorize(ctx, token, "customers.manage");
    await ctx.db.patch(id, data);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.updated",
      entityType: "customer",
      entityId: id,
      details: `Updated customer "${data.name}"`,
    });
  },
});

export const archive = mutation({
  args: { token: v.string(), id: v.id("customers") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const customer = await ctx.db.get(args.id);
    if (!customer) throw new Error("Customer not found.");
    if (customer.isGeneric) throw new Error("Cannot archive the walk-in customer.");
    await ctx.db.patch(args.id, { status: "archived", active: false });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.archived",
      entityType: "customer",
      entityId: args.id,
    });
  },
});

export const unarchive = mutation({
  args: { token: v.string(), id: v.id("customers") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    await ctx.db.patch(args.id, { status: "active", active: true });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.unarchived",
      entityType: "customer",
      entityId: args.id,
    });
  },
});

// ─────────────────────────────────────────────
// RETROACTIVE CAPTURE (anonymous-sale phone attach)
// ─────────────────────────────────────────────

/** Minimal customer created from just a phone number at checkout. */
export const createMinimal = mutation({
  args: {
    token: v.string(),
    phone1: v.string(),
    name: v.optional(v.string()),
    whatsappOptIn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const normalized = normalizePhone(args.phone1) || args.phone1.trim();
    if (!normalized) throw new Error("A valid phone number is required.");
    const seq = await nextSequence(ctx, "customer_code_sequence");
    const id = await ctx.db.insert("customers", {
      name: args.name?.trim() || `Cliente ${normalized}`,
      phone1: normalized,
      customerCode: `C-${String(seq).padStart(5, "0")}`,
      isGeneric: false,
      active: true,
      status: "active",
      whatsappOptIn: args.whatsappOptIn ?? false,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.created",
      entityType: "customer",
      entityId: id,
      details: `Created via retroactive capture ("${normalized}")`,
    });
    return id;
  },
});

// ─────────────────────────────────────────────
// FICHA DO CLIENTE
// ─────────────────────────────────────────────

/**
 * Partial profile update for the Ficha's Resumo/Preferências tabs — kept
 * separate from `update` (whose `name`/`phone1` are required) since notes,
 * photo and preferences should be editable independently of identity fields.
 */
export const updateProfile = mutation({
  args: {
    token: v.string(),
    id: v.id("customers"),
    notes: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    preferredSports: v.optional(v.array(v.string())),
    preferredColorIds: v.optional(v.array(v.id("colors"))),
    preferredCategoryIds: v.optional(v.array(v.id("categories"))),
    preferredBrands: v.optional(v.array(v.string())),
    whatsappOptIn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { token, id, ...data } = args;
    const actor = await authorize(ctx, token, "customers.manage");
    const existing = await ctx.db.get(id);
    if (!existing) throw new Error("Customer not found.");

    const patch: Record<string, unknown> = {};
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.photoUrl !== undefined) patch.photoUrl = data.photoUrl;
    if (data.preferredSports !== undefined) patch.preferredSports = data.preferredSports;
    if (data.preferredColorIds !== undefined) patch.preferredColorIds = data.preferredColorIds;
    if (data.preferredCategoryIds !== undefined)
      patch.preferredCategoryIds = data.preferredCategoryIds;
    if (data.preferredBrands !== undefined) patch.preferredBrands = data.preferredBrands;
    if (data.whatsappOptIn !== undefined) patch.whatsappOptIn = data.whatsappOptIn;
    await ctx.db.patch(id, patch);

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.profile_updated",
      entityType: "customer",
      entityId: id,
      details: `Updated profile for "${existing.name}"`,
    });
  },
});

/** Manual size entry from the Ficha's Tamanhos tab — always confirmed, never inferred. */
export const setSizeProfile = mutation({
  args: {
    token: v.string(),
    customerId: v.id("customers"),
    categoryId: v.id("categories"),
    sizeId: v.id("sizes"),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const size = await ctx.db.get(args.sizeId);
    if (!size) throw new Error("Size not found.");

    const existing = await ctx.db
      .query("customerSizeProfiles")
      .withIndex("by_customer_category", (q) =>
        q.eq("customerId", args.customerId).eq("categoryId", args.categoryId)
      )
      .unique();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        sizeId: args.sizeId,
        sizeName: size.name,
        confidence: "CONFIRMADO",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("customerSizeProfiles", {
        customerId: args.customerId,
        categoryId: args.categoryId,
        sizeId: args.sizeId,
        sizeName: size.name,
        confidence: "CONFIRMADO",
        updatedAt: now,
      });
    }

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.size_confirmed",
      entityType: "customer",
      entityId: args.customerId,
      details: `Confirmed size ${size.name}`,
    });
  },
});

/** Promotes an INFERIDO chip to CONFIRMADO in place — the rail's chip-tap action. */
export const confirmSizeProfile = mutation({
  args: { token: v.string(), profileId: v.id("customerSizeProfiles") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const row = await ctx.db.get(args.profileId);
    if (!row) throw new Error("Size profile not found.");
    await ctx.db.patch(args.profileId, { confidence: "CONFIRMADO", updatedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.size_confirmed",
      entityType: "customer",
      entityId: row.customerId,
      details: `Confirmed size ${row.sizeName}`,
    });
  },
});

export const removeSizeProfile = mutation({
  args: { token: v.string(), profileId: v.id("customerSizeProfiles") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const row = await ctx.db.get(args.profileId);
    if (!row) throw new Error("Size profile not found.");
    await ctx.db.delete(args.profileId);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.size_removed",
      entityType: "customer",
      entityId: row.customerId,
      details: `Removed size profile (${row.sizeName})`,
    });
  },
});
