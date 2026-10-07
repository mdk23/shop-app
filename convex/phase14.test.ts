/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { afterEach, describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";

const modules = import.meta.glob("./**/*.ts");

// One session per role, so each test can show what a given role may and may not read.
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
    for (const role of ["admin", "manager", "pos_seller"] as const) {
      const userId = await ctx.db.insert("users", {
        name: role,
        username: role,
        passwordHash: "",
        role,
        status: "ACTIVE",
        createdAt: now,
      });
      await ctx.db.insert("userSessions", {
        userId,
        token: `tok-${role}`,
        expiresAt: now + 3_600_000,
        createdAt: now,
      });
    }
    return { branchId };
  });
  return { t, ids };
}

describe("read queries require a valid session", () => {
  test("an unknown token is refused for reports", async () => {
    const { t } = await seed();
    await expect(t.query(api.analytics.todaySnapshot, { token: "not-a-session" })).rejects.toThrow();
  });

  test("an unknown token is refused for stock holds", async () => {
    const { t, ids } = await seed();
    await expect(
      t.query(api.stockHolds.activeByBranch, { token: "not-a-session", branchId: ids.branchId })
    ).rejects.toThrow();
  });

  test("an unknown token is refused for the audit trail", async () => {
    const { t } = await seed();
    await expect(t.query(api.auth.getAuditLogs, { token: "not-a-session" })).rejects.toThrow();
  });
});

describe("read queries respect the role", () => {
  test("a POS seller cannot read reports", async () => {
    const { t } = await seed();
    await expect(t.query(api.analytics.todaySnapshot, { token: "tok-pos_seller" })).rejects.toThrow(/Access denied/);
  });

  test("a manager can read reports", async () => {
    const { t } = await seed();
    await expect(t.query(api.analytics.todaySnapshot, { token: "tok-manager" })).resolves.toBeDefined();
  });

  test("a POS seller can read stock holds, which the POS needs", async () => {
    const { t, ids } = await seed();
    const held = await t.query(api.stockHolds.activeByBranch, { token: "tok-pos_seller", branchId: ids.branchId });
    expect(held).toEqual({});
  });

  test("the audit trail is for managers and admins; the user list is for admins", async () => {
    const { t } = await seed();
    await expect(t.query(api.auth.getAuditLogs, { token: "tok-pos_seller" })).rejects.toThrow(/Access denied/);
    await expect(t.query(api.auth.getAuditLogs, { token: "tok-manager" })).resolves.toBeDefined();
    await expect(t.query(api.users.list, { token: "tok-manager" })).rejects.toThrow(/Access denied/);
    await expect(t.query(api.auth.getAuditLogs, { token: "tok-admin" })).resolves.toBeDefined();
    const users = await t.query(api.users.list, { token: "tok-admin" });
    expect(users.every((u) => !("passwordHash" in u))).toBe(true);
  });
});

describe("destructive seeding", () => {
  test("a manager cannot seed the catalogue", async () => {
    const { t } = await seed();
    await expect(t.mutation(api.seedClothing.seed, { token: "tok-manager", wipe: false })).rejects.toThrow(
      /Access denied/
    );
  });

  test("a POS seller cannot wipe the catalogue", async () => {
    const { t } = await seed();
    await expect(t.mutation(api.seedClothing.seed, { token: "tok-pos_seller", wipe: true })).rejects.toThrow();
  });
});

describe("dev login bypass", () => {
  const original = process.env.DEV_AUTH_BYPASS;
  afterEach(() => {
    if (original === undefined) delete process.env.DEV_AUTH_BYPASS;
    else process.env.DEV_AUTH_BYPASS = original;
  });

  test("refuses to create an admin session unless the deployment opts in", async () => {
    delete process.env.DEV_AUTH_BYPASS;
    const { t } = await seed();
    await expect(t.mutation(api.devAuth.ensureDevSession, {})).rejects.toThrow(/disabled/);
  });

  test("creates the dev session only when the deployment opts in", async () => {
    process.env.DEV_AUTH_BYPASS = "true";
    const { t } = await seed();
    const { token } = await t.mutation(api.devAuth.ensureDevSession, {});
    expect(token).toBe("dev-bypass-session-token");
  });
});
