/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const token = "tok-admin";
  const customerId = await t.run(async (ctx) => {
    const now = Date.now();
    const id = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
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
    return id;
  });
  return { t, token, customerId };
}

describe("demands (requests)", () => {
  test("records a request for a customer and closes it once", async () => {
    const { t, token, customerId } = await seed();
    const id = await t.mutation(api.demands.create, {
      token,
      customerId,
      description: "Black running shoes, size 42",
    });

    const mine = await t.query(api.demands.listByCustomer, { customerId });
    expect(mine).toHaveLength(1);
    expect(mine[0].stage).toBe("OPEN");

    await t.mutation(api.demands.setStage, { token, id, stage: "FULFILLED" });
    const after = await t.query(api.demands.listByCustomer, { customerId });
    expect(after[0].stage).toBe("FULFILLED");
    expect(after[0].closedAt).toBeDefined();

    await expect(
      t.mutation(api.demands.setStage, { token, id, stage: "LOST", reason: "PRICE" })
    ).rejects.toThrow(/already closed/);
  });

  test("the shop-wide open list only shows open requests", async () => {
    const { t, token, customerId } = await seed();
    const a = await t.mutation(api.demands.create, { token, customerId, description: "A" });
    await t.mutation(api.demands.create, { token, description: "Walk-in B" });
    await t.mutation(api.demands.setStage, { token, id: a, stage: "LOST", reason: "OTHER" });

    const open = await t.query(api.demands.list, { stage: "OPEN" });
    expect(open.map((r) => r.description)).toEqual(["Walk-in B"]);
  });

  test("losing a request uses the reason recorded with it", async () => {
    const { t, token } = await seed();
    const withReason = await t.mutation(api.demands.create, { token, description: "A", reason: "SIZE" });
    await t.mutation(api.demands.setStage, { token, id: withReason, stage: "LOST" });
    expect((await t.run((ctx) => ctx.db.get(withReason)))?.reason).toBe("SIZE");

    const without = await t.mutation(api.demands.create, { token, description: "B" });
    await expect(t.mutation(api.demands.setStage, { token, id: without, stage: "LOST" })).rejects.toThrow(
      /Say why/
    );
  });

  test("rejects an empty description", async () => {
    const { t, token, customerId } = await seed();
    await expect(
      t.mutation(api.demands.create, { token, customerId, description: "   " })
    ).rejects.toThrow(/Describe/);
  });
});

describe("demands: size, colour, budget and reason", () => {
  test("stores the structured request and counts lost sales by reason", async () => {
    const { t, token, customerId } = await seed();
    const sizeId = await t.run((ctx) =>
      ctx.db.insert("sizes", { name: "42", active: true, createdAt: 1, updatedAt: 1 })
    );
    const colorId = await t.run((ctx) =>
      ctx.db.insert("colors", { name: "Black", active: true, createdAt: 1, updatedAt: 1 })
    );
    const id = await t.mutation(api.demands.create, {
      token,
      customerId,
      description: "Running shoes",
      sizeId,
      colorId,
      maxPrice: 1500,
      reason: "PRICE",
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ sizeId, colorId, maxPrice: 1500, reason: "PRICE" });

    await t.mutation(api.demands.create, {
      token,
      description: "Any sock",
      reason: "STOCK",
    });
    const counts = await t.query(api.demands.countByReason, {});
    expect(counts).toEqual({ PRICE: 1, STOCK: 1 });
  });

  test("rejects a negative budget", async () => {
    const { t, token, customerId } = await seed();
    await expect(
      t.mutation(api.demands.create, { token, customerId, description: "X", maxPrice: -1 })
    ).rejects.toThrow(/negative/);
  });
});

describe("customer interactions", () => {
  test("logs contacts and lists the newest first", async () => {
    const { t, token, customerId } = await seed();
    await t.mutation(api.customerInteractions.create, {
      token,
      customerId,
      channel: "PHONE",
      summary: "Asked about restock",
      occurredAt: 1_000,
    });
    await t.mutation(api.customerInteractions.create, {
      token,
      customerId,
      channel: "WHATSAPP",
      summary: "Sent photos of the new collection",
      occurredAt: 2_000,
    });

    const rows = await t.query(api.customerInteractions.listByCustomer, { customerId });
    expect(rows.map((r) => r.channel)).toEqual(["WHATSAPP", "PHONE"]);
    expect(rows[0].createdByUsername).toBe("admin");
  });

  test("rejects an empty summary", async () => {
    const { t, token, customerId } = await seed();
    await expect(
      t.mutation(api.customerInteractions.create, {
        token,
        customerId,
        channel: "IN_STORE",
        summary: "  ",
      })
    ).rejects.toThrow(/summary/);
  });
});
