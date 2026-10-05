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
    return id;
  });
  return { t, token, customerId };
}

describe("want list (unmet demand)", () => {
  test("records a request for a customer and closes it once", async () => {
    const { t, token, customerId } = await seed();
    const id = await t.mutation(api.wantList.create, {
      token,
      customerId,
      description: "Black running shoes, size 42",
    });

    const open = await t.query(api.wantList.listOpen, { customerId });
    expect(open).toHaveLength(1);
    expect(open[0].status).toBe("OPEN");

    await t.mutation(api.wantList.resolve, { token, id, outcome: "FULFILLED" });
    const after = await t.query(api.wantList.listOpen, { customerId });
    expect(after[0].status).toBe("FULFILLED");
    expect(after[0].resolvedAt).toBeDefined();

    await expect(
      t.mutation(api.wantList.resolve, { token, id, outcome: "CANCELLED" })
    ).rejects.toThrow(/already closed/);
  });

  test("the shop-wide open list only shows open requests", async () => {
    const { t, token, customerId } = await seed();
    const a = await t.mutation(api.wantList.create, { token, customerId, description: "A" });
    await t.mutation(api.wantList.create, { token, description: "Walk-in B" });
    await t.mutation(api.wantList.resolve, { token, id: a, outcome: "CANCELLED" });

    const open = await t.query(api.wantList.listOpen, {});
    expect(open.map((r) => r.description)).toEqual(["Walk-in B"]);
  });

  test("rejects an empty description", async () => {
    const { t, token, customerId } = await seed();
    await expect(
      t.mutation(api.wantList.create, { token, customerId, description: "   " })
    ).rejects.toThrow(/Describe/);
  });
});

describe("want list: size, colour, budget and reason", () => {
  test("stores the structured request and counts lost sales by reason", async () => {
    const { t, token, customerId } = await seed();
    const sizeId = await t.run((ctx) =>
      ctx.db.insert("sizes", { name: "42", active: true, createdAt: 1, updatedAt: 1 })
    );
    const colorId = await t.run((ctx) =>
      ctx.db.insert("colors", { name: "Black", active: true, createdAt: 1, updatedAt: 1 })
    );
    const id = await t.mutation(api.wantList.create, {
      token,
      customerId,
      description: "Running shoes",
      sizeId,
      colorId,
      maxPrice: 1500,
      reason: "PRICE_TOO_HIGH",
    });
    const row = await t.run((ctx) => ctx.db.get(id));
    expect(row).toMatchObject({ sizeId, colorId, maxPrice: 1500, reason: "PRICE_TOO_HIGH" });

    await t.mutation(api.wantList.create, {
      token,
      description: "Any sock",
      reason: "NOT_IN_STOCK",
    });
    const counts = await t.query(api.wantList.countByReason, {});
    expect(counts).toEqual({ PRICE_TOO_HIGH: 1, NOT_IN_STOCK: 1 });
  });

  test("rejects a negative budget", async () => {
    const { t, token, customerId } = await seed();
    await expect(
      t.mutation(api.wantList.create, { token, customerId, description: "X", maxPrice: -1 })
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
