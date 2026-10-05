/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { planningTables } from "./schemaTables/planning";
import { supplyChainTables } from "./schemaTables/supplyChain";

const modules = import.meta.glob("./**/*.ts");

async function seedVariant(ctx: Parameters<Parameters<ReturnType<typeof convexTest>["run"]>[0]>[0]) {
  const now = Date.now();
  const categoryId = await ctx.db.insert("categories", {
    name: "T-Shirts",
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  const productId = await ctx.db.insert("products", {
    name: "Tee",
    categoryId,
    defaultCostPrice: 100,
    defaultSellingPrice: 250,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  const variantId = await ctx.db.insert("productVariants", {
    productId,
    sku: "TEE-M",
    costPrice: 100,
    sellingPrice: 250,
    reorderLevel: 0,
    active: true,
    createdAt: now,
    updatedAt: now,
  });
  return { productId, variantId };
}

describe("diagram tables are registered", () => {
  test("every new planning and supply-chain table is in the schema", () => {
    const registered = Object.keys(schema.tables);
    for (const name of [
      ...Object.keys(planningTables),
      ...Object.keys(supplyChainTables),
      "locations",
    ]) {
      expect(registered).toContain(name);
    }
  });
});

describe("planning", () => {
  test("an opportunity records interest, stage and why it did not proceed", async () => {
    const t = convexTest(schema, modules);
    const rows = await t.run(async (ctx) => {
      await ctx.db.insert("opportunities", {
        description: "Black running shoes",
        stage: "NOT_PROCEEDING",
        reasonNotProceeding: "PRICE",
        conditions: "Only with a discount",
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return ctx.db
        .query("opportunities")
        .withIndex("by_stage", (q) => q.eq("stage", "NOT_PROCEEDING"))
        .collect();
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].reasonNotProceeding).toBe("PRICE");
  });

  test("payment terms, pricing policy and positioning are stored", async () => {
    const t = convexTest(schema, modules);
    const counts = await t.run(async (ctx) => {
      const { productId } = await seedVariant(ctx);
      await ctx.db.insert("paymentTerms", { name: "30 dias", days: 30, active: true });
      await ctx.db.insert("pricingPolicies", { name: "Standard", marginPercent: 40, validFrom: 1 });
      await ctx.db.insert("productPositioning", { productId, positioning: "CORE", validFrom: 1 });
      return {
        terms: (await ctx.db.query("paymentTerms").collect()).length,
        policies: (await ctx.db.query("pricingPolicies").collect()).length,
        positions: (await ctx.db.query("productPositioning").collect()).length,
      };
    });
    expect(counts).toEqual({ terms: 1, policies: 1, positions: 1 });
  });
});

describe("supply chain", () => {
  test("a supplier is evaluated and linked to partnership terms", async () => {
    const t = convexTest(schema, modules);
    const result = await t.run(async (ctx) => {
      const now = Date.now();
      const supplierId = await ctx.db.insert("suppliers", {
        name: "Supplier Co",
        status: "active",
        createdAt: now,
      });
      await ctx.db.insert("supplierEvaluations", {
        supplierId,
        qualityScore: 4,
        punctualityPercent: 90,
        evaluatedByUsername: "admin",
        evaluatedAt: now,
      });
      const relationId = await ctx.db.insert("supplyRelations", { supplierId, startedAt: now });
      await ctx.db.insert("partnershipTerms", {
        supplyRelationId: relationId,
        termType: "DEADLINES",
        content: "Entrega em 15 dias",
        validFrom: now,
      });
      return {
        evaluations: (
          await ctx.db
            .query("supplierEvaluations")
            .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
            .collect()
        ).length,
        terms: (
          await ctx.db
            .query("partnershipTerms")
            .withIndex("by_relation", (q) => q.eq("supplyRelationId", relationId))
            .collect()
        ).length,
      };
    });
    expect(result).toEqual({ evaluations: 1, terms: 1 });
  });

  test("a non-conformity is recorded against a variant and treated", async () => {
    const t = convexTest(schema, modules);
    const treatments = await t.run(async (ctx) => {
      const { variantId } = await seedVariant(ctx);
      const ncId = await ctx.db.insert("nonConformities", {
        variantId,
        description: "Costura solta",
        affectedQuantity: 2,
        recognizedAt: Date.now(),
      });
      await ctx.db.insert("nonConformityTreatments", {
        nonConformityId: ncId,
        treatmentType: "RETURN_TO_SUPPLIER",
        decidedAt: Date.now(),
      });
      return ctx.db
        .query("nonConformityTreatments")
        .withIndex("by_non_conformity", (q) => q.eq("nonConformityId", ncId))
        .collect();
    });
    expect(treatments[0].treatmentType).toBe("RETURN_TO_SUPPLIER");
  });

  test("a shipment carries customs documents", async () => {
    const t = convexTest(schema, modules);
    const docs = await t.run(async (ctx) => {
      const shipmentId = await ctx.db.insert("shipments", {
        carrier: "Maersk",
        status: "IN_TRANSIT",
        departedAt: Date.now(),
      });
      await ctx.db.insert("customsDocuments", {
        shipmentId,
        documentType: "DECLARACAO_ALFANDEGA",
        reference: "DA-001",
      });
      return ctx.db
        .query("customsDocuments")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", shipmentId))
        .collect();
    });
    expect(docs[0].reference).toBe("DA-001");
  });
});

describe("locations and request fields", () => {
  test("a branch has a central warehouse and a store location", async () => {
    const t = convexTest(schema, modules);
    const locations = await t.run(async (ctx) => {
      const branchId = await ctx.db.insert("branches", {
        name: "Main",
        code: "MAIN",
        status: "active",
        createdAt: Date.now(),
      });
      await ctx.db.insert("locations", { branchId, name: "Armazém", locationType: "CENTRAL" });
      await ctx.db.insert("locations", { branchId, name: "Loja", locationType: "STORE" });
      return ctx.db
        .query("locations")
        .withIndex("by_branch", (q) => q.eq("branchId", branchId))
        .collect();
    });
    expect(locations.map((l) => l.locationType).sort()).toEqual(["CENTRAL", "STORE"]);
  });

  test("a request keeps its quantity, needed-by date and intended use", async () => {
    const t = convexTest(schema, modules);
    const row = await t.run(async (ctx) => {
      const id = await ctx.db.insert("wantList", {
        description: "Sapatilhas",
        quantity: 2,
        neededBy: 1_900_000_000_000,
        intendedUse: "Corrida na praia",
        status: "OPEN",
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return ctx.db.get(id);
    });
    expect(row).toMatchObject({ quantity: 2, intendedUse: "Corrida na praia" });
  });
});
