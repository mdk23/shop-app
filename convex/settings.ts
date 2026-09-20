import { v } from "convex/values";
import { mutation, query, MutationCtx, QueryCtx } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

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
  { key: "businessPhone", isActive: true, value: "", label: "Business phone" },
  { key: "businessAddress", isActive: true, value: "", label: "Business address" },
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
    label: "Gasto mínimo (12 meses) para VIP (MZN)",
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
    if (existing) {
      await ctx.db.patch(existing._id, {
        isActive: args.isActive,
        value: args.value ?? existing.value,
        label: args.label ?? existing.label,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("settings", {
        key: args.key,
        isActive: args.isActive,
        value: args.value,
        label: args.label,
        updatedAt: Date.now(),
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "settings.updated",
      entityType: "settings",
      entityId: args.key,
      details: `${args.key} → active=${args.isActive}${args.value !== undefined ? `, value=${args.value}` : ""}`,
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
