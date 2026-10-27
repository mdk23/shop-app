/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { findOrCreateSize } from "./lib/catalog";

const modules = import.meta.glob("./**/*.ts");

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
      reorderLevel: 5,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const janeId = await ctx.db.insert("customers", { name: "Jane", phone1: "841234567", status: "ACTIVE" });
    const userId = await ctx.db.insert("users", { name: "admin", username: "admin", passwordHash: "", role: "admin", status: "ACTIVE", createdAt: now });
    await ctx.db.insert("userSessions", { userId, token, expiresAt: now + 3_600_000, createdAt: now });
    await ctx.db.insert("cashRegisterSessions", { userId, username: "admin", openingAmount: 0, openedAt: now, status: "OPEN", branchId });
    return { branchId, categoryId, productId, variantId, janeId, userId };
  });
  await t.mutation(internal.inventory.mutateStock, {
    productVariantId: ids.variantId,
    branchId: ids.branchId,
    quantity: 8,
    movementType: "INITIAL_STOCK",
    userId: ids.userId,
    username: "admin",
  });
  return { t, token, ids };
}

describe("active knowledge", () => {
  test("reads the period from the sales totals, with customer spend net of returns", async () => {
    const { t, token, ids } = await seed();
    const saleId = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.janeId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [{ method: "CASH", amount: 500 }],
    });
    // A walk-in sale counts in sales but not among customers.
    await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 250 }],
    });
    const saleItemId = (await t.query(api.sales.get, { token, id: saleId }))!.items[0]._id;
    await t.mutation(api.salesReturns.create, {
      token,
      saleId,
      refundMethod: "CASH",
      items: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
    });

    const end = Date.now() + 60_000;
    const data = await t.query(api.knowledge.overview, { token, start: end - 30 * 86400000, end });
    expect(data.kpis.revenue.value).toBe(750);
    expect(data.kpis.revenue.change).toBeNull(); // nothing in the period before
    expect(data.kpis.activeCustomers.value).toBe(1);
    // Jane bought 500 and returned 250: she kept 250.
    expect(data.topCustomers).toEqual([expect.objectContaining({ name: "Jane", purchases: 1, value: 250 })]);
    expect(data.topProducts[0]).toMatchObject({ name: "Tee", qty: 3 });
    expect(data.days).toHaveLength(1);
    // 8 in stock − 3 sold + 1 back = 6, above the reorder level of 5: no stock alert.
    expect(data.alerts.find((a) => a.kind === "STOCK")).toBeUndefined();
    expect(data.forecast).toHaveLength(3);
    expect(data.scenarioBase[0]).toMatchObject({ name: "Tops", qty: 3 });
  });

  test("a stock alert once a product is low, and only managers can read it", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 4 }],
      payments: [{ method: "CASH", amount: 1000 }],
    });
    const end = Date.now() + 60_000;
    const data = await t.query(api.knowledge.overview, { token, start: end - 7 * 86400000, end });
    expect(data.alerts.find((a) => a.kind === "STOCK")).toMatchObject({ href: "/inventory" });
    await expect(t.query(api.knowledge.overview, { token: "nope", start: end - 7 * 86400000, end })).rejects.toThrow();
  });
});
