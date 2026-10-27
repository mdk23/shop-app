/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("branches", { name: "Main", code: "MAIN", status: "ACTIVE", createdAt: now });
    const customerId = await ctx.db.insert("customers", { name: "Jane", phone1: "841234567", status: "ACTIVE" });
    for (const [username, role] of [
      ["admin", "admin"],
      ["seller", "pos_seller"],
    ] as const) {
      const userId = await ctx.db.insert("users", { name: username, username, passwordHash: "", role, status: "ACTIVE", createdAt: now });
      await ctx.db.insert("userSessions", { userId, token: `tok-${username}`, expiresAt: now + 3_600_000, createdAt: now });
    }
    await ctx.db.insert("settings", { key: "taxRatePercent", isActive: true, value: "16", updatedAt: now });
    await ctx.db.insert("settings", { key: "language", isActive: true, value: "pt", updatedAt: now });
    return { customerId };
  });
  return { t, ids };
}

describe("who can read what", () => {
  test("customer data needs a valid login", async () => {
    const { t, ids } = await seed();
    await expect(t.query(api.customers.getById, { token: "nope", id: ids.customerId })).rejects.toThrow();
    await expect(t.query(api.customers.search, { token: "nope", query: "Jane" } as never)).rejects.toThrow();
    expect(await t.query(api.customers.getById, { token: "tok-seller", id: ids.customerId })).toMatchObject({ name: "Jane" });
  });

  test("a seller cannot read purchasing or suppliers", async () => {
    const { t } = await seed();
    await expect(t.query(api.purchaseReceipts.list, { token: "tok-seller" })).rejects.toThrow(/Access denied/);
    await expect(t.query(api.suppliers.list, { token: "tok-seller" } as never)).rejects.toThrow(/Access denied/);
    await t.query(api.purchaseReceipts.list, { token: "tok-admin" });
  });

  test("before login only the language-type settings and branch names are readable", async () => {
    const { t } = await seed();
    expect((await t.query(api.settings.getByKey, { key: "language" }))?.value).toBe("pt");
    await expect(t.query(api.settings.getByKey, { key: "taxRatePercent" })).rejects.toThrow(/Unauthorized/);
    await expect(t.query(api.settings.getAll, { token: "nope" })).rejects.toThrow();
    expect(await t.query(api.branches.listActive, {})).toHaveLength(1);
  });
});
