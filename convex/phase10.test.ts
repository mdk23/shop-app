/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const token = "tok-admin";
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const branchId = await ctx.db.insert("branches", {
      name: "Main",
      code: "MAIN",
      status: "active",
      createdAt: now,
    });
    const customerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
      active: true,
      status: "active",
    });
    const userId = await ctx.db.insert("users", {
      name: "admin",
      username: "admin",
      passwordHash: "",
      role: "admin",
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("userSessions", {
      userId,
      token,
      expiresAt: now + 3_600_000,
      createdAt: now,
    });
    return { branchId, customerId };
  });
  return { t, token, ids };
}

describe("opportunities", () => {
  test("a lost opportunity needs a reason and is listed under its stage", async () => {
    const { t, token, ids } = await seed();
    const id = await t.mutation(api.opportunities.create, {
      token,
      description: "Sapatilhas pretas",
      customerId: ids.customerId,
    });
    await expect(
      t.mutation(api.opportunities.setStage, { token, id, stage: "NOT_PROCEEDING" })
    ).rejects.toThrow(/Say why/);

    await t.mutation(api.opportunities.setStage, {
      token,
      id,
      stage: "NOT_PROCEEDING",
      reasonNotProceeding: "PRICE",
    });
    const lost = await t.query(api.opportunities.list, { stage: "NOT_PROCEEDING" });
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({ reasonNotProceeding: "PRICE", customerName: "Jane Doe" });
  });

  test("a proceeding opportunity converts into an order of the same customer", async () => {
    const { t, token, ids } = await seed();
    const id = await t.mutation(api.opportunities.create, {
      token,
      description: "Ténis",
      customerId: ids.customerId,
    });
    await t.mutation(api.opportunities.setStage, { token, id, stage: "PROCEEDING" });
    const orderId = await t.run((ctx) =>
      ctx.db.insert("customerOrders", {
        orderNumber: "CE-00001",
        customerId: ids.customerId,
        branchId: ids.branchId,
        status: "OPEN",
        totalAmount: 500,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await t.mutation(api.opportunities.markConverted, { token, id, orderId });

    const converted = await t.query(api.opportunities.list, { stage: "CONVERTED" });
    expect(converted[0].convertedOrderId).toBe(orderId);
    await expect(
      t.mutation(api.opportunities.setStage, { token, id, stage: "OPEN" })
    ).rejects.toThrow(/converted/);
  });

  test("an order from another customer cannot convert the opportunity", async () => {
    const { t, token, ids } = await seed();
    const id = await t.mutation(api.opportunities.create, {
      token,
      description: "Casaco",
      customerId: ids.customerId,
    });
    const otherCustomer = await t.run((ctx) =>
      ctx.db.insert("customers", { name: "Other", phone1: "1", isGeneric: false, active: true, status: "active" })
    );
    const orderId = await t.run((ctx) =>
      ctx.db.insert("customerOrders", {
        orderNumber: "CE-00002",
        customerId: otherCustomer,
        branchId: ids.branchId,
        status: "OPEN",
        totalAmount: 100,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await expect(t.mutation(api.opportunities.markConverted, { token, id, orderId })).rejects.toThrow(
      /different customer/
    );
  });
});

describe("list queries for the new pages", () => {
  test("orders are listed by status with the customer's name", async () => {
    const { t, ids } = await seed();
    await t.run((ctx) =>
      ctx.db.insert("customerOrders", {
        orderNumber: "CE-00003",
        customerId: ids.customerId,
        branchId: ids.branchId,
        status: "READY",
        totalAmount: 250,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const ready = await t.query(api.customerOrders.list, { status: "READY" });
    const collected = await t.query(api.customerOrders.list, { status: "COLLECTED" });
    expect(ready).toHaveLength(1);
    expect(ready[0].customerName).toBe("Jane Doe");
    expect(collected).toHaveLength(0);
  });

  test("requests are filtered by reason and status", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.wantList.create, {
      token,
      customerId: ids.customerId,
      description: "Preto M",
      reason: "WRONG_COLOR",
    });
    await t.mutation(api.wantList.create, { token, description: "Azul L", reason: "NOT_IN_STOCK" });
    const byReason = await t.query(api.wantList.list, { reason: "WRONG_COLOR" });
    expect(byReason.map((r) => r.description)).toEqual(["Preto M"]);
    expect(byReason[0].customerName).toBe("Jane Doe");
    const open = await t.query(api.wantList.list, { status: "OPEN" });
    expect(open).toHaveLength(2);
  });

  test("complaints can be filtered by status", async () => {
    const { t, token, ids } = await seed();
    const id = await t.mutation(api.complaints.create, {
      token,
      customerId: ids.customerId,
      description: "Costura solta",
    });
    await t.mutation(api.complaints.resolve, { token, id, resolutionType: "REPARACAO" });
    expect(await t.query(api.complaints.list, { status: "RESOLVED" })).toHaveLength(1);
    expect(await t.query(api.complaints.list, { status: "OPEN" })).toHaveLength(0);
  });
});
