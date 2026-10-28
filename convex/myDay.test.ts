/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { findOrCreateSize } from "./lib/catalog";

const modules = import.meta.glob("./**/*.ts");
const DAY = 24 * 60 * 60 * 1000;

async function seed() {
  const t = convexTest(schema, modules);
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
    const adminId = await ctx.db.insert("users", { name: "Ana", username: "admin", passwordHash: "", role: "admin", status: "ACTIVE", createdAt: now });
    const sellerId = await ctx.db.insert("users", { name: "Sam", username: "seller", passwordHash: "", role: "pos_seller", status: "ACTIVE", createdAt: now });
    await ctx.db.insert("userSessions", { userId: adminId, token: "tok-admin", expiresAt: now + 3_600_000, createdAt: now });
    await ctx.db.insert("userSessions", { userId: sellerId, token: "tok-seller", expiresAt: now + 3_600_000, createdAt: now });
    await ctx.db.insert("cashRegisterSessions", { userId: adminId, username: "admin", openingAmount: 0, openedAt: now, status: "OPEN", branchId });
    await ctx.db.insert("qualityIssues", {
      source: "STOCK",
      description: "Torn seam",
      recognizedAt: now,
      createdBy: adminId,
      createdByUsername: "admin",
    });
    return { branchId, productId, variantId, janeId, adminId };
  });
  await t.mutation(internal.inventory.mutateStock, {
    productVariantId: ids.variantId,
    branchId: ids.branchId,
    quantity: 8,
    movementType: "INITIAL_STOCK",
    userId: ids.adminId,
    username: "admin",
  });
  return { t, ids };
}

const dayStart = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

describe("my day", () => {
  test("puts each record in its zone: paid orders, dated orders, low stock", async () => {
    const { t, ids } = await seed();
    // Paid in full and not collected: needs attention.
    const paidId = await t.mutation(api.customerOrders.create, {
      token: "tok-admin",
      customerId: ids.janeId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
    });
    const paid = await t.query(api.customerOrders.get, { token: "tok-admin", id: paidId });
    await t.mutation(api.customerOrders.addDeposit, { token: "tok-admin", orderId: paidId, amount: paid!.totalAmount, method: "CASH" });
    // Promised for three days from now: the next days.
    await t.mutation(api.customerOrders.create, {
      token: "tok-admin",
      customerId: ids.janeId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      expectedDate: dayStart() + 3 * DAY + 60_000,
    });
    // 8 − 4 sold = 4, under the reorder level of 5.
    await t.mutation(api.sales.create, {
      token: "tok-admin",
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 4 }],
      payments: [{ method: "CASH", amount: 1000 }],
    });

    const data = await t.query(api.myDay.today, { token: "tok-admin", dayStart: dayStart(), now: Date.now() });
    expect(data.userName).toBe("Ana");
    expect(data.attention.items.map((i) => i.kind)).toEqual(expect.arrayContaining(["ORDER_PAID", "QUALITY"]));
    expect(data.attention.items.find((i) => i.kind === "ORDER_PAID")?.href).toBe(`/orders/${paidId}`);
    expect(data.upcoming.items.map((i) => i.kind)).toContain("ORDER_DUE");
    // 4 sold in 30 days with 4 left: about 30 days of sales.
    expect(data.knowledge.items[0]).toMatchObject({ kind: "STOCK", title: { params: { qty: 4, days: 30 } } });
  });

  test("a seller sees customer work but not purchasing, quality or stock decisions", async () => {
    const { t } = await seed();
    const data = await t.query(api.myDay.today, { token: "tok-seller", dayStart: dayStart(), now: Date.now() });
    expect(data.attention.items.find((i) => i.kind === "QUALITY")).toBeUndefined();
    expect(data.knowledge.count).toBe(0);
    await expect(t.query(api.myDay.today, { token: "nope", dayStart: dayStart(), now: Date.now() })).rejects.toThrow();
  });
});
