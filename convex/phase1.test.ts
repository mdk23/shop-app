/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const branchId = await ctx.db.insert("branches", {
      name: "Main",
      code: "MAIN",
      status: "ACTIVE",
      isDefault: true,
      createdAt: now,
    });
    const categoryId = await ctx.db.insert("categories", {
      name: "T-Shirts",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const productId = await ctx.db.insert("products", {
      name: "Basic Tee",
      categoryId,
      defaultCostPrice: 100,
      defaultSellingPrice: 250,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const sizeId = await ctx.db.insert("sizes", {
      name: "M",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const colorId = await ctx.db.insert("colors", {
      name: "Black",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const userId = await ctx.db.insert("users", {
      name: "admin",
      username: "admin",
      passwordHash: "",
      role: "admin",
      status: "ACTIVE",
      createdAt: now,
    });
    await ctx.db.insert("userSessions", {
      userId,
      token: "tok-admin",
      expiresAt: now + 3_600_000,
      createdAt: now,
    });
    return { branchId, categoryId, productId, sizeId, colorId };
  });
  return { t, ids, token: "tok-admin" };
}

describe("variant price history", () => {
  test("opens a row on create and closes it on a real price change only", async () => {
    const { t, ids, token } = await seed();
    const variantId = await t.mutation(api.productVariants.create, {
      token,
      productId: ids.productId,
      size: "M",
      color: "Black",
      sellingPrice: 250,
    });

    let history = await t.query(api.productVariants.priceHistory, {
      productVariantId: variantId,
    });
    expect(history).toHaveLength(1);
    expect(history[0].validTo).toBeUndefined();

    await t.mutation(api.productVariants.update, {
      token,
      id: variantId,
      sellingPrice: 300,
    });
    history = await t.query(api.productVariants.priceHistory, {
      productVariantId: variantId,
    });
    expect(history).toHaveLength(2);
    expect(history[0].price).toBe(300);
    expect(history[0].validTo).toBeUndefined();
    expect(history[1].price).toBe(250);
    expect(history[1].validTo).toBeDefined();

    await t.mutation(api.productVariants.update, {
      token,
      id: variantId,
      sellingPrice: 300,
    });
    history = await t.query(api.productVariants.priceHistory, {
      productVariantId: variantId,
    });
    expect(history).toHaveLength(2);
  });

  test("resolves sizeId and colorId from the size/colour names", async () => {
    const { t, ids, token } = await seed();
    const variantId = await t.mutation(api.productVariants.create, {
      token,
      productId: ids.productId,
      size: "m",
      color: "black",
    });
    const variant = await t.run((ctx) => ctx.db.get(variantId));
    expect(variant?.sizeId).toBe(ids.sizeId);
    expect(variant?.colorId).toBe(ids.colorId);
  });
});

describe("audit trail records what changed", () => {
  const lastAudit = (t: Awaited<ReturnType<typeof seed>>["t"], action: string) =>
    t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).filter((a) => a.action === action).pop()
    );

  test("a price change logs the old and new price", async () => {
    const { t, ids, token } = await seed();
    const variantId = await t.mutation(api.productVariants.create, {
      token,
      productId: ids.productId,
      size: "M",
      color: "Black",
      sellingPrice: 250,
    });
    await t.mutation(api.productVariants.update, { token, id: variantId, sellingPrice: 300, color: "" });
    const entry = await lastAudit(t, "variant.price_changed");
    expect(entry?.details).toContain("sellingPrice 250 → 300");
    expect(entry?.details).toContain('color "Black" → —');
  });

  test("a setting change logs the old and new value", async () => {
    const { t, token } = await seed();
    await t.mutation(api.settings.upsert, { token, key: "taxRatePercent", isActive: true, value: "16" });
    await t.mutation(api.settings.upsert, { token, key: "taxRatePercent", isActive: true, value: "17" });
    expect((await lastAudit(t, "settings.created"))?.details).toContain('value — → "16"');
    expect((await lastAudit(t, "settings.updated"))?.details).toBe('taxRatePercent: value "16" → "17"');
  });
});

describe("phase 1 backfill", () => {
  test("is idempotent and fills price history and the size scale", async () => {
    const { t, ids } = await seed();
    const legacyVariantId = await t.run((ctx) =>
      ctx.db.insert("productVariants", {
        productId: ids.productId,
        sku: "LEGACY-BLK-M",
        sizeId: ids.sizeId,
        colorId: ids.colorId,
        costPrice: 100,
        sellingPrice: 250,
        reorderLevel: 0,
        active: true,
        createdAt: 1_000,
        updatedAt: 1_000,
      })
    );

    const first = await t.mutation(internal.phase1Backfill.run, {});
    expect(first.variantsChecked).toBe(1);
    expect(first.sizesScoped).toBe(1);

    const second = await t.mutation(internal.phase1Backfill.run, {});
    expect(second.sizesScoped).toBe(0);

    const size = await t.run((ctx) => ctx.db.get(ids.sizeId));
    expect(size?.scaleId).toBeDefined();

    const historyRows = await t.query(api.productVariants.priceHistory, {
      productVariantId: legacyVariantId,
    });
    expect(historyRows).toHaveLength(1);
    expect(historyRows[0].price).toBe(250);
    expect(historyRows[0].validFrom).toBe(1_000);
  });
});

describe("promotions", () => {
  test("rejects targets that name more than one level", async () => {
    const { t, ids, token } = await seed();
    await expect(
      t.mutation(api.promotions.create, {
        token,
        name: "Bad",
        kind: "PERCENT_OFF",
        value: 10,
        validFrom: Date.now(),
        targets: [{ productId: ids.productId, categoryId: ids.categoryId }],
      })
    ).rejects.toThrow(/exactly one/);
  });

  test("rejects a percentage above 100", async () => {
    const { t, ids, token } = await seed();
    await expect(
      t.mutation(api.promotions.create, {
        token,
        name: "Too much",
        kind: "PERCENT_OFF",
        value: 150,
        validFrom: Date.now(),
        targets: [{ categoryId: ids.categoryId }],
      })
    ).rejects.toThrow(/at most 100/);
  });

  test("creates a promotion with a category target and lists it with its targets", async () => {
    const { t, ids, token } = await seed();
    const promotionId = await t.mutation(api.promotions.create, {
      token,
      name: "Verão",
      kind: "PERCENT_OFF",
      value: 20,
      validFrom: Date.now(),
      targets: [{ categoryId: ids.categoryId }],
    });
    const rows = await t.query(api.promotions.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0]._id).toBe(promotionId);
    expect(rows[0].targets).toHaveLength(1);
    expect(rows[0].targets[0].categoryId).toBe(ids.categoryId);
  });
});

describe("catalogue extensions", () => {
  test("creates collections and size scales", async () => {
    const { t, token } = await seed();
    await t.mutation(api.collections.create, { token, name: "Verão 2026", season: "SS26" });
    const collections = await t.query(api.collections.list, {});
    expect(collections.map((c) => c.name)).toEqual(["Verão 2026"]);

    await t.mutation(api.sizeScales.create, {
      token,
      name: "EU calçado",
      scaleType: "SHOE",
      region: "EU",
    });
    const scales = await t.query(api.sizeScales.list, {});
    expect(scales.map((s) => s.name)).toEqual(["EU calçado"]);
  });
});
