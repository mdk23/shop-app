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
      status: "ACTIVE",
      createdAt: now,
    });
    const customerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
      active: true,
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
      token,
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
    return { branchId, customerId, userId };
  });
  return { t, token, ids };
}

describe("opportunities (demands that proceeded)", () => {
  test("a lost opportunity needs a reason and stays on the board", async () => {
    const { t, token, ids } = await seed();
    const id = await t.mutation(api.demands.create, {
      token,
      description: "Sapatilhas pretas",
      customerId: ids.customerId,
      proceeding: true,
    });
    await expect(t.mutation(api.demands.setStage, { token, id, stage: "LOST" })).rejects.toThrow(/Say why/);

    await t.mutation(api.demands.setStage, { token, id, stage: "LOST", reason: "PRICE" });
    const board = await t.query(api.demands.listOpportunities, {});
    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ stage: "LOST", reason: "PRICE", customerName: "Jane Doe" });
  });

  test("a request joins the board once it proceeds", async () => {
    const { t, token } = await seed();
    const id = await t.mutation(api.demands.create, { token, description: "Casaco" });
    expect(await t.query(api.demands.listOpportunities, {})).toHaveLength(0);
    await t.mutation(api.demands.setStage, { token, id, stage: "PROCEEDING" });
    const board = await t.query(api.demands.listOpportunities, {});
    expect(board.map((d) => d._id)).toEqual([id]);
    expect(await t.query(api.demands.list, {})).toHaveLength(1);
  });

  test("a proceeding opportunity converts into an order of the same customer", async () => {
    const { t, token, ids } = await seed();
    const id = await t.mutation(api.demands.create, {
      token,
      description: "Ténis",
      customerId: ids.customerId,
      proceeding: true,
    });
    const orderId = await t.run((ctx) =>
      ctx.db.insert("customerOrders", {
        orderNumber: "CE-00001",
        customerId: ids.customerId,
        branchId: ids.branchId,
        status: "OPEN",
        totalAmount: 500,
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await t.mutation(api.demands.markConverted, { token, id, orderId });

    const converted = await t.query(api.demands.list, { stage: "CONVERTED" });
    expect(converted[0].convertedOrderId).toBe(orderId);
    await expect(
      t.mutation(api.demands.setStage, { token, id, stage: "LOST", reason: "OTHER" })
    ).rejects.toThrow(/already closed/);
  });

  test("an order from another customer cannot convert the opportunity", async () => {
    const { t, token, ids } = await seed();
    const id = await t.mutation(api.demands.create, {
      token,
      description: "Casaco",
      customerId: ids.customerId,
      proceeding: true,
    });
    const otherCustomer = await t.run((ctx) =>
      ctx.db.insert("customers", { name: "Other", phone1: "1", isGeneric: false, active: true, status: "ACTIVE" })
    );
    const orderId = await t.run((ctx) =>
      ctx.db.insert("customerOrders", {
        orderNumber: "CE-00002",
        customerId: otherCustomer,
        branchId: ids.branchId,
        status: "OPEN",
        totalAmount: 100,
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await expect(t.mutation(api.demands.markConverted, { token, id, orderId })).rejects.toThrow(
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
        createdBy: ids.userId,
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
    await t.mutation(api.demands.create, {
      token,
      customerId: ids.customerId,
      description: "Preto M",
      reason: "COLOR",
    });
    await t.mutation(api.demands.create, { token, description: "Azul L", reason: "STOCK" });
    const byReason = await t.query(api.demands.list, { reason: "COLOR" });
    expect(byReason.map((r) => r.description)).toEqual(["Preto M"]);
    expect(byReason[0].customerName).toBe("Jane Doe");
    const open = await t.query(api.demands.list, { stage: "OPEN" });
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
