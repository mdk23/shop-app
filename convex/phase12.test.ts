/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const token = "tok-admin";
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const customerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
      active: true,
      status: "ACTIVE",
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
      defaultCostPrice: 40,
      defaultSellingPrice: 250,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const userId = await ctx.db.insert("users", {
      name: "admin",
      username: "admin",
      passwordHash: "",
      role: "admin",
      status: "ACTIVE",
      createdAt: now,
    });
    await ctx.db.insert("userSessions", { userId, token, expiresAt: now + 3_600_000, createdAt: now });
    return { customerId, productId };
  });
  return { t, token, ids };
}

describe("customer tabs", () => {
  test("an extra contact can be retired once and is kept", async () => {
    const { t, token, ids } = await seed();
    const id = await t.mutation(api.contactMeans.add, {
      token,
      customerId: ids.customerId,
      contactType: "WHATSAPP",
      contactValue: "845555555",
    });
    await t.mutation(api.contactMeans.retire, { token, id });
    await expect(t.mutation(api.contactMeans.retire, { token, id })).rejects.toThrow(/already retired/);
    const rows = await t.query(api.contactMeans.listByCustomer, { customerId: ids.customerId });
    expect(rows).toHaveLength(1);
    expect(rows[0].validTo).toBeDefined();
  });

  test("a business relation lists everyone on it", async () => {
    const { t, token, ids } = await seed();
    const other = await t.run((ctx) =>
      ctx.db.insert("customers", { name: "Coach", phone1: "1", isGeneric: false, active: true, status: "ACTIVE" })
    );
    await t.mutation(api.businessRelations.open, { token, customerId: ids.customerId, role: "Buyer for the school team" });
    const relationId = (await t.query(api.businessRelations.listByCustomer, { customerId: ids.customerId }))[0].relationId;
    await t.run((ctx) =>
      ctx.db.insert("relationParticipants", { relationId, customerId: other, role: "Coach", validFrom: Date.now() })
    );
    const rows = await t.query(api.businessRelations.listByCustomer, { customerId: ids.customerId });
    expect(rows[0].people.map((p) => p.name).sort()).toEqual(["Coach", "Jane Doe"]);
    expect(rows[0].people.find((p) => p.isThisCustomer)?.name).toBe("Jane Doe");
  });

  test("a new NUIT closes the previous one and must have nine digits", async () => {
    const { t, token, ids } = await seed();
    await expect(
      t.mutation(api.fiscalIdentities.setNuit, { token, customerId: ids.customerId, number: "123" })
    ).rejects.toThrow(/nine digits/);
    await t.mutation(api.fiscalIdentities.setNuit, { token, customerId: ids.customerId, number: "400000001" });
    await t.mutation(api.fiscalIdentities.setNuit, { token, customerId: ids.customerId, number: "400000002" });
    expect(await t.query(api.fiscalIdentities.getNuit, { customerId: ids.customerId })).toBe("400000002");
    const rows = await t.run((ctx) =>
      ctx.db
        .query("fiscalIdentities")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.customerId))
        .collect()
    );
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.validTo === undefined)).toHaveLength(1);
  });
});

describe("commercial settings", () => {
  test("payment terms validate the deposit and can be switched off", async () => {
    const { t, token } = await seed();
    await expect(
      t.mutation(api.commercialSettings.createPaymentTerm, { token, name: "Sinal", days: 0, depositPercent: 120 })
    ).rejects.toThrow(/between 0 and 100/);
    const id = await t.mutation(api.commercialSettings.createPaymentTerm, {
      token,
      name: "30 dias",
      days: 30,
      depositPercent: 50,
    });
    await t.mutation(api.commercialSettings.setPaymentTermActive, { token, id, active: false });
    const [term] = await t.query(api.commercialSettings.listPaymentTerms, {});
    expect(term.active).toBe(false);
  });

  test("a new pricing policy replaces the current one and keeps the old in history", async () => {
    const { t, token } = await seed();
    await t.mutation(api.commercialSettings.createPricingPolicy, { token, name: "Standard", marginPercent: 40 });
    await t.mutation(api.commercialSettings.createPricingPolicy, { token, name: "Promo", marginPercent: 30 });
    const policies = await t.query(api.commercialSettings.listPricingPolicies, {});
    expect(policies).toHaveLength(2);
    expect(policies.filter((p) => p.validTo === undefined).map((p) => p.name)).toEqual(["Promo"]);
  });

  test("setting the same positioning twice changes nothing; a new one closes the old", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.commercialSettings.setPositioning, { token, productId: ids.productId, positioning: "CORE" });
    await t.mutation(api.commercialSettings.setPositioning, { token, productId: ids.productId, positioning: "CORE" });
    let rows = await t.run((ctx) =>
      ctx.db
        .query("productPositioning")
        .withIndex("by_product", (q) => q.eq("productId", ids.productId))
        .collect()
    );
    expect(rows).toHaveLength(1);

    await t.mutation(api.commercialSettings.setPositioning, { token, productId: ids.productId, positioning: "PREMIUM" });
    const current = await t.query(api.commercialSettings.currentPositioning, { productId: ids.productId });
    expect(current?.positioning).toBe("PREMIUM");
    rows = await t.run((ctx) =>
      ctx.db
        .query("productPositioning")
        .withIndex("by_product", (q) => q.eq("productId", ids.productId))
        .collect()
    );
    expect(rows).toHaveLength(2);
  });
});

describe("supplier scorecard", () => {
  test("averages evaluations and counts open non-conformities per supplier", async () => {
    const { t, token, ids } = await seed();
    const supplierId: Id<"suppliers"> = await t.run((ctx) =>
      ctx.db.insert("suppliers", { name: "Supplier Co", status: "ACTIVE", createdAt: Date.now() })
    );
    await t.mutation(api.supplierEvaluations.create, {
      token,
      supplierId,
      qualityScore: 4,
      punctualityPercent: 80,
    });
    await t.mutation(api.supplierEvaluations.create, {
      token,
      supplierId,
      qualityScore: 2,
      punctualityPercent: 100,
    });
    const variantId = await t.run((ctx) =>
      ctx.db.insert("productVariants", {
        productId: ids.productId,
        sku: "TEE-S",
        costPrice: 40,
        sellingPrice: 250,
        reorderLevel: 0,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await t.mutation(api.qualityIssues.create, {
      token,
      source: "RECEIPT",
      supplierId,
      description: "Mancha",
      items: [{ productVariantId: variantId, affectedQuantity: 1 }],
    });
    const card = (await t.query(api.supplierEvaluations.scorecard, {})).find((s) => s.supplierId === supplierId);
    expect(card).toMatchObject({ evaluations: 2, avgQuality: 3, avgPunctuality: 90, openQualityIssues: 1 });
  });
});
