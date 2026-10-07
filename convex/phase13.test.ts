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
    const branchId = await ctx.db.insert("branches", { name: "Main", code: "MAIN", status: "ACTIVE", isDefault: true, createdAt: now });
    const customerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
      active: true,
      status: "ACTIVE",
    });
    const categoryId = await ctx.db.insert("categories", { name: "T-Shirts", active: true, createdAt: now, updatedAt: now });
    const productId = await ctx.db.insert("products", {
      name: "Tee",
      categoryId,
      defaultCostPrice: 40,
      defaultSellingPrice: 250,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const variantId = await ctx.db.insert("productVariants", {
      productId,
      sku: "TEE-M",
      size: "M",
      costPrice: 40,
      sellingPrice: 250,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const sizeA = await ctx.db.insert("sizes", { name: "M", active: true, createdAt: now, updatedAt: now });
    const sizeB = await ctx.db.insert("sizes", { name: "L", active: true, createdAt: now, updatedAt: now });
    const userId = await ctx.db.insert("users", {
      name: "admin",
      username: "admin",
      passwordHash: "",
      role: "admin",
      status: "ACTIVE",
      createdAt: now,
    });
    await ctx.db.insert("userSessions", { userId, token, expiresAt: now + 3_600_000, createdAt: now });
    return { branchId, customerId, productId, variantId, sizeA, sizeB, userId };
  });
  return { t, token, ids };
}

describe("size equivalences", () => {
  test("two different sizes can be linked, the same size cannot", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.followUps.createSizeEquivalence, {
      token,
      fromSizeId: ids.sizeA,
      toSizeId: ids.sizeB,
      certainty: "approximate",
    });
    await expect(
      t.mutation(api.followUps.createSizeEquivalence, {
        token,
        fromSizeId: ids.sizeA,
        toSizeId: ids.sizeA,
        certainty: "exact",
      })
    ).rejects.toThrow(/different sizes/);
    const rows = await t.query(api.followUps.listSizeEquivalences, { token });
    expect(rows[0].fromName).toBe("M");
    expect(rows[0].toName).toBe("L");
  });
});

describe("follow-ups and resolution succession", () => {
  test("a promise is tied to a relation and recorded as satisfied", async () => {
    const { t, token, ids } = await seed();
    const followUpId = await t.mutation(api.followUps.commitFollowUp, {
      token,
      customerId: ids.customerId,
      description: "Replace the seam within 7 days",
    });
    await t.mutation(api.followUps.recordSatisfaction, { token, followUpId });
    const rows = await t.query(api.followUps.listFollowUps, { token });
    expect(rows[0].customerName).toBe("Jane Doe");
    expect(rows[0].satisfied).toBe(true);
  });

  test("superseding a resolution links both and moves the complaint to the new one", async () => {
    const { t, token, ids } = await seed();
    const { complaintId, resolutionId } = await t.run(async (ctx) => {
      const resolutionId = await ctx.db.insert("resolutions", { resolutionType: "REEMBOLSO", decidedAt: Date.now() });
      const complaintId = await ctx.db.insert("complaints", {
        customerId: ids.customerId,
        description: "Broken zip",
        status: "RESOLVED",
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
        resolutionId,
      });
      return { complaintId, resolutionId };
    });
    const nextId = await t.mutation(api.followUps.supersedeResolution, {
      token,
      previousResolutionId: resolutionId,
      resolutionType: "CREDITO",
      complaintId,
    });
    const complaint = await t.run((ctx) => ctx.db.get(complaintId));
    expect(complaint?.resolutionId).toBe(nextId);
    const successions = await t.run((ctx) => ctx.db.query("resolutionSuccessions").collect());
    expect(successions).toHaveLength(1);
  });
});

describe("procurement planning and demand responses", () => {
  test("a decision can only cover a need for the same variant", async () => {
    const { t, token, ids } = await seed();
    const otherVariant = await t.run((ctx) =>
      ctx.db.insert("productVariants", {
        productId: ids.productId,
        sku: "TEE-L",
        size: "L",
        costPrice: 40,
        sellingPrice: 250,
        reorderLevel: 0,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await t.mutation(api.procurementPlanning.createNeed, {
      token,
      items: [{ variantId: ids.variantId, quantity: 3 }],
    });
    await t.mutation(api.procurementPlanning.createDecision, {
      token,
      decisionType: "BUY",
      items: [{ variantId: otherVariant, quantity: 3 }],
    });
    const overview = await t.query(api.procurementPlanning.overview, { token });
    const needItemId = overview.needs[0].items[0]._id;
    const decisionItemId = overview.decisions[0].items[0]._id;
    await expect(
      t.mutation(api.procurementPlanning.coverNeed, { token, decisionItemId, needItemId, quantity: 3 })
    ).rejects.toThrow(/same product variant/);
  });

  test("a response with items records and links to the request", async () => {
    const { t, token, ids } = await seed();
    const demandId = await t.run((ctx) =>
      ctx.db.insert("demands", {
        customerId: ids.customerId,
        description: "Black tee, size M",
        productId: ids.productId,
        stage: "OPEN",
        reason: "STOCK",
        quantity: 1,
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await t.mutation(api.demandResponses.record, {
      token,
      demandId,
      outcome: "ALTERNATIVA",
      items: [{ description: "Same tee in black", price: 240 }],
    });
    const responses = await t.query(api.demandResponses.listByDemand, { token, demandId });
    expect(responses).toHaveLength(1);
    expect(responses[0].items[0].presentedDescription).toBe("Same tee in black");
  });

  test("an offer needs at least one item unless nothing suitable was found", async () => {
    const { t, token, ids } = await seed();
    const demandId = await t.run((ctx) =>
      ctx.db.insert("demands", {
        customerId: ids.customerId,
        description: "Black tee, size M",
        productId: ids.productId,
        stage: "OPEN",
        reason: "STOCK",
        quantity: 1,
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await expect(
      t.mutation(api.demandResponses.record, { token, demandId, outcome: "DISPONIVEL", items: [] })
    ).rejects.toThrow(/Describe what was offered/);
    await t.mutation(api.demandResponses.record, { token, demandId, outcome: "SEM_SOLUCAO_ADEQUADA", items: [] });
  });
});

describe("landed costs", () => {
  test("components are summed into the total", async () => {
    const { t, token } = await seed();
    await t.mutation(api.landedCosts.create, {
      token,
      calculatedFor: Date.now(),
      components: [
        { componentType: "freight", value: 1200 },
        { componentType: "duty", value: 300 },
      ],
    });
    const rows = await t.query(api.landedCosts.list, { token });
    expect(rows[0].total).toBe(1500);
    await expect(
      t.mutation(api.landedCosts.create, { token, calculatedFor: Date.now(), components: [{ componentType: "x", value: -1 }] })
    ).rejects.toThrow(/negative/);
  });

  test("editing replaces the components, deleting removes the calculation", async () => {
    const { t, token } = await seed();
    const id = await t.mutation(api.landedCosts.create, {
      token,
      calculatedFor: Date.now(),
      components: [{ componentType: "freight", value: 1200 }],
    });
    await t.mutation(api.landedCosts.update, {
      token,
      id,
      calculatedFor: Date.now(),
      methodVersion: "v2",
      components: [
        { componentType: "insurance", value: 100 },
        { componentType: "handling", value: 50 },
      ],
    });
    let rows = await t.query(api.landedCosts.list, { token });
    expect(rows).toHaveLength(1);
    expect(rows[0].methodVersion).toBe("v2");
    expect(rows[0].components.map((c) => c.componentType)).toEqual(["insurance", "handling"]);
    expect(rows[0].total).toBe(150);

    await t.mutation(api.landedCosts.remove, { token, id });
    rows = await t.query(api.landedCosts.list, { token });
    expect(rows).toHaveLength(0);
    const orphans = await t.run((ctx) => ctx.db.query("landedCostComponents").collect());
    expect(orphans).toHaveLength(0);
  });
});
