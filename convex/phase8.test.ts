/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import schema from "./schema";
import { governanceTables } from "./schemaTables/governance";
import { catalogTables } from "./schemaTables/catalog";
import { relationTables } from "./schemaTables/relations";
import { commitmentTables } from "./schemaTables/commitments";
import { procurementTables } from "./schemaTables/procurement";
import { stockTables } from "./schemaTables/stock";
import { afterSalesTables } from "./schemaTables/afterSales";

const modules = import.meta.glob("./**/*.ts");

const groups = {
  governance: governanceTables,
  catalog: catalogTables,
  relations: relationTables,
  commitments: commitmentTables,
  procurement: procurementTables,
  stock: stockTables,
  afterSales: afterSalesTables,
};

describe("SQL model tables", () => {
  test("every table in the new module files is registered in the schema", () => {
    const registered = Object.keys(schema.tables);
    for (const [, group] of Object.entries(groups)) {
      for (const name of Object.keys(group)) {
        expect(registered).toContain(name);
      }
    }
  });

  test("no module table name collides with an existing table", () => {
    const names = Object.values(groups).flatMap((g) => Object.keys(g));
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("module smoke tests", () => {
  test("relations: a business relation links participants", async () => {
    const t = convexTest(schema, modules);
    const count = await t.run(async (ctx) => {
      const customerId = await ctx.db.insert("customers", {
        name: "Jane",
        phone1: "841234567",
        isGeneric: false,
        active: true,
        status: "ACTIVE",
      });
      const relationId = await ctx.db.insert("businessRelations", {
        startedAt: Date.now(),
        registeredAt: Date.now(),
      });
      await ctx.db.insert("relationParticipants", {
        relationId,
        customerId,
        role: "CUSTOMER",
        validFrom: Date.now(),
      });
      return (
        await ctx.db
          .query("relationParticipants")
          .withIndex("by_relation", (q) => q.eq("relationId", relationId))
          .collect()
      ).length;
    });
    expect(count).toBe(1);
  });

  test("commitments: an adjustment is linked to its customer order", async () => {
    const t = convexTest(schema, modules);
    const origins = await t.run(async (ctx) => {
      const now = Date.now();
      const customerId = await ctx.db.insert("customers", {
        name: "Jane",
        phone1: "841234567",
        isGeneric: false,
        active: true,
        status: "ACTIVE",
      });
      const branchId = await ctx.db.insert("branches", {
        name: "Main",
        code: "MAIN",
        status: "ACTIVE",
        createdAt: now,
      });
      const userId = await ctx.db.insert("users", {
        name: "admin",
        username: "admin",
        passwordHash: "",
        role: "admin",
        status: "ACTIVE",
        createdAt: now,
      });
      const orderId = await ctx.db.insert("customerOrders", {
        orderNumber: "CE-00001",
        customerId,
        branchId,
        status: "OPEN",
        totalAmount: 500,
        createdBy: userId,
        createdByUsername: "admin",
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("commitmentAdjustments", {
        commitmentId: orderId,
        adjustmentType: "DISCOUNT",
        calculationMode: "VALOR",
        adjustmentValue: 50,
      });
      return ctx.db
        .query("commitmentAdjustments")
        .withIndex("by_commitment", (q) => q.eq("commitmentId", orderId))
        .collect();
    });
    expect(origins).toHaveLength(1);
  });

  test("procurement: a need holds its items", async () => {
    const t = convexTest(schema, modules);
    const items = await t.run(async (ctx) => {
      const needId = await ctx.db.insert("procurementNeeds", { recognizedAt: Date.now() });
      await ctx.db.insert("procurementNeedItems", { needId, quantityRecognized: 12 });
      return ctx.db
        .query("procurementNeedItems")
        .withIndex("by_need", (q) => q.eq("needId", needId))
        .collect();
    });
    expect(items[0].quantityRecognized).toBe(12);
  });

  test("stock: physical-unit tables are gone, an adjustment is a ledger movement with its reason", async () => {
    expect(Object.keys(schema.tables)).not.toContain("physicalStock");
    expect(Object.keys(schema.tables)).not.toContain("stockLineage");

    const t = convexTest(schema, modules);
    const linked = await t.run(async (ctx) => {
      const now = Date.now();
      const branchId = await ctx.db.insert("branches", {
        name: "Main",
        code: "MAIN",
        status: "ACTIVE",
        createdAt: now,
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
      await ctx.db.insert("inventoryMovements", {
        movementDate: now,
        productVariantId: variantId,
        branchId,
        movementType: "STOCK_ADJUSTMENT",
        quantity: -2,
        previousBalance: 10,
        newBalance: 8,
        referenceType: "stock_adjustment",
        adjustmentReason: "PHYSICAL_COUNT",
        createdAt: now,
      });
      return ctx.db
        .query("inventoryMovements")
        .withIndex("by_reference_type_and_date", (q) => q.eq("referenceType", "stock_adjustment"))
        .collect();
    });
    expect(linked).toHaveLength(1);
    expect(linked[0].adjustmentReason).toBe("PHYSICAL_COUNT");
    expect(Object.keys(schema.tables)).not.toContain("stockAdjustments");
    expect(Object.keys(schema.tables)).not.toContain("discrepancies");
    expect(Object.keys(schema.tables)).not.toContain("materialAdjustments");
  });

  test("after-sales: a follow-up commitment is linked to a relation", async () => {
    const t = convexTest(schema, modules);
    const row = await t.run(async (ctx) => {
      const relationId = await ctx.db.insert("businessRelations", {
        startedAt: Date.now(),
        registeredAt: Date.now(),
      });
      const id = await ctx.db.insert("followUpCommitments", {
        relationId,
        description: "Ligar para confirmar a troca",
        assumedAt: Date.now(),
      });
      return ctx.db.get(id);
    });
    expect(row?.description).toBe("Ligar para confirmar a troca");
  });
});
