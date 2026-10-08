/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { findOrCreateColor, findOrCreateSize } from "./lib/catalog";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const token = "tok-admin";
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
      name: "Tee",
      categoryId,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
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
    await ctx.db.insert("variantStock", {
      branchId,
      productVariantId: variantId,
      quantity: 10,
      updatedAt: now,
    });
    const customerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
      status: "ACTIVE",
    });
    const walkInId = await ctx.db.insert("customers", {
      name: "Walk-in",
      phone1: "0",
      isGeneric: true,
      status: "ACTIVE",
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
    // Every payment needs an open register.
    await ctx.db.insert("cashRegisterSessions", {
      userId,
      username: "admin",
      openingAmount: 0,
      openedAt: now,
      status: "OPEN",
      branchId,
    });
    return { branchId, variantId, customerId, walkInId };
  });
  return { t, token, ids };
}

async function stockOf(
  t: Awaited<ReturnType<typeof seed>>["t"],
  branchId: Id<"branches">,
  productVariantId: Id<"productVariants">
) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("variantStock")
      .withIndex("by_branch_and_variant", (q) =>
        q.eq("branchId", branchId).eq("productVariantId", productVariantId)
      )
      .unique()
  );
  return row?.quantity ?? 0;
}

async function creditTotal(t: Awaited<ReturnType<typeof seed>>["t"], customerId: Id<"customers">) {
  const rows = await t.run((ctx) =>
    ctx.db
      .query("customerCredits")
      .withIndex("by_customer", (q) => q.eq("customerId", customerId))
      .collect()
  );
  return rows.reduce((s, r) => s + r.delta, 0);
}

describe("customer orders: reservations", () => {
  test("held stock cannot be sold at the POS until the order closes", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.customerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 4 }],
      reserve: true,
    });

    await expect(
      t.mutation(api.sales.create, {
        token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 7 }],
        payments: [{ method: "CARD", amount: 5000 }],
      })
    ).rejects.toThrow(/held for customer orders/);

    await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 6 }],
      payments: [{ method: "CARD", amount: 5000 }],
    });
    expect(await stockOf(t, ids.branchId, ids.variantId)).toBe(4);
  });

  test("refuses to reserve more than is available", async () => {
    const { t, token, ids } = await seed();
    await expect(
      t.mutation(api.customerOrders.create, {
        token,
        customerId: ids.customerId,
        branchId: ids.branchId,
        items: [{ productVariantId: ids.variantId, quantity: 11 }],
        reserve: true,
      })
    ).rejects.toThrow(/available to reserve/);
  });

  test("cancelling releases holds and credits the deposits", async () => {
    const { t, token, ids } = await seed();
    const orderId = await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.customerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 4 }],
      reserve: true,
    });
    await t.mutation(api.customerOrders.addDeposit, {
      token,
      orderId,
      amount: 100,
      method: "CARD",
    });
    await t.mutation(api.customerOrders.cancel, { token, orderId, reason: "Changed mind" });

    expect(await creditTotal(t, ids.customerId)).toBe(100);
    const order = await t.query(api.customerOrders.get, { id: orderId });
    expect(order?.status).toBe("CANCELLED");

    await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 10 }],
      payments: [{ method: "CARD", amount: 5000 }],
    });
  });
});

describe("customer orders: deposits and collection", () => {
  test("collects an order as a sale once the balance is covered", async () => {
    const { t, token, ids } = await seed();
    const orderId = await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.customerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
    });
    await t.mutation(api.customerOrders.addDeposit, {
      token,
      orderId,
      amount: 200,
      method: "CARD",
    });
    const saleId = await t.mutation(api.customerOrders.collect, {
      token,
      orderId,
      payments: [{ method: "CARD", amount: 300 }],
    });

    const sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale?.total).toBe(500);
    expect(sale?.status).toBe("COMPLETED");
    expect(await stockOf(t, ids.branchId, ids.variantId)).toBe(8);

    const order = await t.query(api.customerOrders.get, { id: orderId });
    expect(order?.status).toBe("COLLECTED");
    expect(order?.saleId).toBe(saleId);

    // The deposit is one payment row, linked to the sale, not copied onto it.
    const payments = await t.run((ctx) => ctx.db.query("payments").collect());
    expect(payments.map((p) => p.amount).sort()).toEqual([200, 300]);
    expect(payments.every((p) => p.saleId === saleId)).toBe(true);
    expect(payments.find((p) => p.amount === 200)?.customerOrderId).toBe(orderId);
    expect(sale?.paidAmount).toBe(500);
    expect(sale?.paymentStatus).toBe("PAID");
  });

  test("any deposit needs an open register; only cash counts in the drawer", async () => {
    const { t, token, ids } = await seed();
    const orderId = await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.customerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
    });
    // Close the register the seed opened: then no payment of any method is accepted.
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query("cashRegisterSessions").collect()) {
        await ctx.db.patch(s._id, { status: "CLOSED" });
      }
    });
    await expect(
      t.mutation(api.customerOrders.addDeposit, { token, orderId, amount: 100, method: "CARD" })
    ).rejects.toThrow(/open cash register/i);

    const sessionId = await t.mutation(api.cashRegister.openSession, {
      token,
      openingAmount: 50,
      branchId: ids.branchId,
    });
    await t.mutation(api.customerOrders.addDeposit, { token, orderId, amount: 100, method: "CASH" });
    await t.mutation(api.customerOrders.addDeposit, { token, orderId, amount: 30, method: "CARD" });

    const session = await t.query(api.cashRegister.getSessionWithMovements, { sessionId });
    expect(session?.expectedCash).toBe(150);
    // The opening float is kept once, on the session; no "opening" row is stored.
    expect(session?.openingAmount).toBe(50);
    const stored = await t.run((ctx) => ctx.db.query("cashRegisterMovements").collect());
    expect(stored.filter((m) => m.sessionId === sessionId)).toHaveLength(0);
    const payments = await t.run((ctx) => ctx.db.query("payments").collect());
    expect(payments.every((p) => p.cashRegisterSessionId === sessionId)).toBe(true);
    expect(session?.movements.map((m) => m.type).sort()).toEqual(["opening", "sale"]);
    expect(session?.movements.find((m) => m.type === "sale")?.description).toMatch(/^Cash deposit/);
  });

  test("refuses to collect before the balance is paid", async () => {
    const { t, token, ids } = await seed();
    const orderId = await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.customerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
    });
    await expect(
      t.mutation(api.customerOrders.collect, {
        token,
        orderId,
        payments: [{ method: "CARD", amount: 100 }],
      })
    ).rejects.toThrow(/Pay the balance/);
  });

  test("deposits cannot exceed the order total", async () => {
    const { t, token, ids } = await seed();
    const orderId = await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.customerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
    });
    await expect(
      t.mutation(api.customerOrders.addDeposit, { token, orderId, amount: 300, method: "CARD" })
    ).rejects.toThrow(/cannot exceed/);
  });

  test("orders need a named customer", async () => {
    const { t, token, ids } = await seed();
    await expect(
      t.mutation(api.customerOrders.create, {
        token,
        customerId: ids.walkInId,
        branchId: ids.branchId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
      })
    ).rejects.toThrow(/named customer/);
  });
});
