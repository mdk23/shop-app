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
    const branchId = await ctx.db.insert("branches", { name: "Main", code: "MAIN", status: "active", isDefault: true, createdAt: now });
    const customerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
      active: true,
      status: "active",
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
      status: "active",
      createdAt: now,
    });
    await ctx.db.insert("userSessions", { userId, token, expiresAt: now + 3_600_000, createdAt: now });
    return { branchId, customerId, productId, variantId, sizeA, sizeB };
  });
  return { t, token, ids };
}

async function stockOf(
  t: Awaited<ReturnType<typeof seed>>["t"],
  ids: { branchId: Id<"branches">; variantId: Id<"productVariants"> },
  quantity: number
) {
  await t.run((ctx) =>
    ctx.db.insert("variantStock", {
      branchId: ids.branchId,
      productVariantId: ids.variantId,
      quantity,
      updatedAt: Date.now(),
    })
  );
}

describe("material incidents", () => {
  test("damage takes stock out through the ledger and keeps the link", async () => {
    const { t, token, ids } = await seed();
    await stockOf(t, ids, 5);
    await t.mutation(api.materialIncidents.create, {
      token,
      branchId: ids.branchId,
      incidentType: "DAMAGE",
      occurredAt: Date.now(),
      items: [{ variantId: ids.variantId, quantity: 2 }],
    });
    const rows = await t.query(api.materialIncidents.list, {});
    expect(rows).toHaveLength(1);
    expect(rows[0].items[0].movementId).toBeDefined();
    const movements = await t.run((ctx) => ctx.db.query("inventoryMovements").collect());
    expect(movements.some((m) => m.movementType === "DAMAGE" && m.quantity === -2)).toBe(true);
    const stock = await t.run((ctx) => ctx.db.query("variantStock").first());
    expect(stock?.quantity).toBe(3);
  });

  test("a loss larger than the stock on hand is refused", async () => {
    const { t, token, ids } = await seed();
    await stockOf(t, ids, 1);
    await expect(
      t.mutation(api.materialIncidents.create, {
        token,
        branchId: ids.branchId,
        incidentType: "LOSS",
        occurredAt: Date.now(),
        items: [{ variantId: ids.variantId, quantity: 2 }],
      })
    ).rejects.toThrow(/Insufficient stock/);
  });

  test("other incidents only record, with no stock movement", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.materialIncidents.create, {
      token,
      branchId: ids.branchId,
      incidentType: "OTHER",
      occurredAt: Date.now(),
      items: [{ variantId: ids.variantId, quantity: 1 }],
    });
    const rows = await t.query(api.materialIncidents.list, {});
    expect(rows[0].items[0].movementId).toBeUndefined();
  });

  test("quantities must be positive", async () => {
    const { t, token, ids } = await seed();
    await expect(
      t.mutation(api.materialIncidents.create, {
        token,
        branchId: ids.branchId,
        incidentType: "LOSS",
        occurredAt: Date.now(),
        items: [{ variantId: ids.variantId, quantity: 0 }],
      })
    ).rejects.toThrow(/positive/);
  });
});

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
    const rows = await t.query(api.followUps.listSizeEquivalences, {});
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
    const rows = await t.query(api.followUps.listFollowUps, {});
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
    const overview = await t.query(api.procurementPlanning.overview, {});
    const needItemId = overview.needs[0].items[0]._id;
    const decisionItemId = overview.decisions[0].items[0]._id;
    await expect(
      t.mutation(api.procurementPlanning.coverNeed, { token, decisionItemId, needItemId, quantity: 3 })
    ).rejects.toThrow(/same product variant/);
  });

  test("a response with items records and links to the request", async () => {
    const { t, token, ids } = await seed();
    const demandId = await t.run((ctx) =>
      ctx.db.insert("wantList", {
        customerId: ids.customerId,
        description: "Black tee, size M",
        productId: ids.productId,
        status: "OPEN",
        reason: "NOT_IN_STOCK",
        quantity: 1,
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
    const responses = await t.query(api.demandResponses.listByDemand, { demandId });
    expect(responses).toHaveLength(1);
    expect(responses[0].items[0].presentedDescription).toBe("Same tee in black");
  });

  test("an offer needs at least one item unless nothing suitable was found", async () => {
    const { t, token, ids } = await seed();
    const demandId = await t.run((ctx) =>
      ctx.db.insert("wantList", {
        customerId: ids.customerId,
        description: "Black tee, size M",
        productId: ids.productId,
        status: "OPEN",
        reason: "NOT_IN_STOCK",
        quantity: 1,
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
    const rows = await t.query(api.landedCosts.list, {});
    expect(rows[0].total).toBe(1500);
    await expect(
      t.mutation(api.landedCosts.create, { token, calculatedFor: Date.now(), components: [{ componentType: "x", value: -1 }] })
    ).rejects.toThrow(/negative/);
  });
});
