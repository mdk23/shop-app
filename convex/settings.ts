import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { authorize } from "./permissions";
import { describeChanges, writeAudit } from "./audit";

/**
 * Retail business configuration. `isActive` is the on/off flag; `value` carries a
 * scalar payload (number/string) for settings that need one.
 */
export const DEFAULT_SETTINGS: {
  key: string;
  isActive: boolean;
  value?: string;
  label: string;
}[] = [
  { key: "currency", isActive: true, value: "MZN", label: "Currency code" },
  { key: "currencySymbol", isActive: true, value: "MT", label: "Currency symbol" },
  { key: "taxRatePercent", isActive: false, value: "0", label: "Sales tax rate (%)" },
  { key: "allowNegativeStock", isActive: false, label: "Allow overselling (negative stock)" },
  { key: "customerCreditEnabled", isActive: true, label: "Enable customer credit / debt" },
  { key: "returnsEnabled", isActive: true, label: "Enable returns & exchanges" },
  { key: "multiBranchEnabled", isActive: true, label: "Multi-branch mode" },
  { key: "lowStockAlertsEnabled", isActive: true, label: "Low-stock alerts" },
  {
    key: "discountMaxPercentWithoutApproval",
    isActive: true,
    value: "15",
    label: "Max discount % without manager approval",
  },
  { key: "businessName", isActive: true, value: "My Clothing Store", label: "Business name" },
  {
    key: "receiptFooter",
    isActive: true,
    value: "Thank you for shopping with us!",
    label: "Receipt footer",
  },
  {
    key: "tierNovoMaxSales",
    isActive: true,
    value: "1",
    label: "Nº máximo de compras para o nível NOVO",
  },
  {
    key: "tierVipMinSpend12m",
    isActive: true,
    value: "50000",
    label: "Gasto mínimo (12 meses) para VIP (MT)",
  },
  {
    key: "sizeInferenceMonths",
    isActive: true,
    value: "24",
    label: "Janela de inferência de tamanhos (meses)",
  },
  {
    key: "tierDiscountPercentVIP",
    isActive: false,
    value: "0",
    label: "Desconto automático VIP (%)",
  },
  {
    key: "tierDiscountPercentREGULAR",
    isActive: false,
    value: "0",
    label: "Desconto automático REGULAR (%)",
  },
  {
    key: "costMethod",
    isActive: true,
    value: "WEIGHTED_AVERAGE",
    label: "Purchase cost method",
  },
  {
    key: "reservationDays",
    isActive: true,
    value: "14",
    label: "Dias de reserva de stock para encomendas",
  },
  {
    key: "language",
    isActive: true,
    value: "pt",
    label: "Idioma da aplicação / Application language",
  },
];

export async function ensureDefaultSettings(ctx: MutationCtx) {
  for (const s of DEFAULT_SETTINGS) {
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", s.key))
      .unique();
    if (!existing) {
      await ctx.db.insert("settings", {
        key: s.key,
        isActive: s.isActive,
        value: s.value,
        label: s.label,
        updatedAt: Date.now(),
      });
    }
  }
}

/**
 * Settings that hold a number, the range it must stay in, and the value used when it is
 * missing. Saving anything else is refused, and reading falls back to the default, so a
 * typo can never reach a price, a tax or a permission check.
 */
export const NUMBER_SETTINGS: Record<string, { min: number; max: number; fallback: number }> = {
  taxRatePercent: { min: 0, max: 100, fallback: 0 },
  discountMaxPercentWithoutApproval: { min: 0, max: 100, fallback: 0 },
  tierDiscountPercentVIP: { min: 0, max: 100, fallback: 0 },
  tierDiscountPercentREGULAR: { min: 0, max: 100, fallback: 0 },
  tierNovoMaxSales: { min: 0, max: 10000, fallback: 1 },
  tierVipMinSpend12m: { min: 0, max: 1e12, fallback: 50000 },
  sizeInferenceMonths: { min: 1, max: 240, fallback: 24 },
  reservationDays: { min: 1, max: 365, fallback: 14 },
};

function parseNumberSetting(key: string, value: string | undefined): number | null {
  const rule = NUMBER_SETTINGS[key];
  if (!rule || value === undefined || value.trim() === "") return null;
  const n = Number(value.trim().replace(",", "."));
  return Number.isFinite(n) && n >= rule.min && n <= rule.max ? n : null;
}

/**
 * Settings that hold one of a fixed set of values; the first is the default.
 * costMethod — how receiving goods updates a variant's cost price: WEIGHTED_AVERAGE (the
 * stock on hand and the new goods averaged by quantity), LATEST (the last purchase cost)
 * or MANUAL (receiving never changes it).
 */
export const CHOICE_SETTINGS: Record<string, readonly string[]> = {
  costMethod: ["WEIGHTED_AVERAGE", "LATEST", "MANUAL"],
};

export async function choiceSetting(ctx: QueryCtx | MutationCtx, key: string): Promise<string> {
  const choices = CHOICE_SETTINGS[key];
  const value = (await getSetting(ctx, key))?.value;
  return value && choices.includes(value) ? value : choices[0];
}

/** A number setting's value, or its fallback when missing or not a valid number. */
export async function numberSetting(ctx: QueryCtx | MutationCtx, key: string): Promise<number> {
  const row = await getSetting(ctx, key);
  return parseNumberSetting(key, row?.value) ?? NUMBER_SETTINGS[key]?.fallback ?? 0;
}

/** Read a single setting's value by key. New code should use this rather than re-inlining the `by_key` lookup. */
export async function getSetting(ctx: QueryCtx | MutationCtx, key: string) {
  return await ctx.db
    .query("settings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
}

export const getByKey = query({
  args: { key: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique(),
});

export const getAll = query({
  args: {},
  handler: async (ctx) => await ctx.db.query("settings").collect(),
});

export const upsert = mutation({
  args: {
    token: v.string(),
    key: v.string(),
    isActive: v.boolean(),
    value: v.optional(v.string()),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "settings.manage");
    const existing = await ctx.db
      .query("settings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .unique();
    const choices = CHOICE_SETTINGS[args.key];
    if (choices && args.value !== undefined && !choices.includes(args.value)) {
      throw new Error(`${args.key} must be one of: ${choices.join(", ")}.`);
    }
    const rule = NUMBER_SETTINGS[args.key];
    if (rule && args.value !== undefined && parseNumberSetting(args.key, args.value) === null) {
      throw new Error(`${args.label ?? existing?.label ?? args.key} must be a number from ${rule.min} to ${rule.max}.`);
    }
    // Number settings are stored in plain form ("16", not " 16,0").
    const value =
      rule && args.value !== undefined ? String(parseNumberSetting(args.key, args.value)) : args.value;
    const next = {
      isActive: args.isActive,
      value: value ?? existing?.value,
      label: args.label ?? existing?.label,
    };
    if (existing) {
      await ctx.db.patch(existing._id, { ...next, updatedAt: Date.now() });
    } else {
      await ctx.db.insert("settings", {
        key: args.key,
        isActive: args.isActive,
        value,
        label: args.label,
        updatedAt: Date.now(),
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: existing ? "settings.updated" : "settings.created",
      entityType: "settings",
      entityId: args.key,
      // Old → new for each field that changed; a new setting logs its starting values.
      details: `${args.key}: ${describeChanges(existing ?? {}, next) || "no changes"}`,
    });
  },
});

export const initializeDefaults = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "settings.manage");
    await ensureDefaultSettings(ctx);
  },
});
