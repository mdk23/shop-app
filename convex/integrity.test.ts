/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { findOrCreateSize } from "./lib/catalog";

const modules = import.meta.glob("./**/*.ts");

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

async function seed() {
  const t = convexTest(schema, modules);
  const token = "tok-admin";
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const branchId = await ctx.db.insert("branches", { name: "Main", code: "MAIN", status: "ACTIVE", createdAt: now });
    const categoryId = await ctx.db.insert("categories", { name: "Tops", active: true, createdAt: now, updatedAt: now });
    const productId = await ctx.db.insert("products", { name: "Tee", categoryId, active: true, createdAt: now, updatedAt: now });
    const variantId = await ctx.db.insert("productVariants", {
      productId,
      sku: "TEE-M",
      sizeId: await findOrCreateSize(ctx, "M"),
      costPrice: 100,
      sellingPrice: 250,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const userId = await ctx.db.insert("users", { name: "admin", username: "admin", passwordHash: "", role: "admin", status: "ACTIVE", createdAt: now });
    await ctx.db.insert("userSessions", { userId, token, expiresAt: now + 3_600_000, createdAt: now });
    await ctx.db.insert("cashRegisterSessions", { userId, username: "admin", openingAmount: 0, openedAt: now, status: "OPEN", branchId });
    return { branchId, variantId, userId };
  });
  await t.mutation(internal.inventory.mutateStock, {
    productVariantId: ids.variantId,
    branchId: ids.branchId,
    quantity: 10,
    movementType: "INITIAL_STOCK",
    userId: ids.userId,
    username: "admin",
  });
  const saleId = await t.mutation(api.sales.create, {
    token,
    branchId: ids.branchId,
    items: [{ productVariantId: ids.variantId, quantity: 2 }],
    payments: [{ method: "CASH", amount: 200 }],
  });
  const check = async () => {
    await t.mutation(internal.integrity.start, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    return await t.query(api.integrity.latest, { token });
  };
  return { t, ids, saleId, check };
}

describe("data checks", () => {
  test("clean data has nothing to report", async () => {
    const { check } = await seed();
    const result = await check();
    expect(result.lastRunAt).not.toBeNull();
    expect(result.issues).toEqual([]);
  });

  test("a stored copy that drifted from its source is reported, and not corrected", async () => {
    const { t, saleId, check } = await seed();
    // A new sale's paid/balance come from its payments: 200 paid of 500, 300 owed.
    const sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale).toMatchObject({ paidAmount: 200, balance: 300, paymentStatus: "PARTIALLY_PAID" });

    await t.run(async (ctx) => {
      const stock = (await ctx.db.query("variantStock").first())!;
      await ctx.db.patch(stock._id, { quantity: 99 });
      await ctx.db.patch(saleId, { balance: 0 });
    });
    const result = await check();
    const byKind = Object.fromEntries(result.issues.map((i) => [i.kind, i]));
    expect(byKind.STOCK).toMatchObject({ stored: "99", expected: "8" });
    expect(byKind.SALE_MONEY).toMatchObject({ stored: "0", expected: "300" });
    // The check only reports.
    expect((await t.run((ctx) => ctx.db.query("variantStock").first()))!.quantity).toBe(99);
  });
});
