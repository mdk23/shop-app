/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { findOrCreateColor, findOrCreateSize } from "./lib/catalog";
import type { Id } from "./_generated/dataModel";

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
    const supplierId = await ctx.db.insert("suppliers", {
      name: "Supplier Co",
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
      defaultCostPrice: 40,
      defaultSellingPrice: 250,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const variantId = await ctx.db.insert("productVariants", {
      productId,
      sku: "TEE-M",
      sizeId: await findOrCreateSize(ctx, "M"),
      costPrice: 40,
      sellingPrice: 250,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const supplyRelationId = await ctx.db.insert("supplyRelations", { supplierId, startedAt: now });
    const poId = await ctx.db.insert("purchaseOrders", {
      supplyRelationId,
      supplierId,
      branchId,
      orderCode: "PO-00001",
      orderDate: now,
      status: "SENT",
      paymentStatus: "UNPAID",
      totalAmount: 400,
      createdAt: now,
    });
    await ctx.db.insert("purchaseOrderItems", {
      purchaseOrderId: poId,
      productVariantId: variantId,
      quantityOrdered: 10,
      quantityReceived: 4,
      unitCost: 40,
      totalCost: 400,
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
    return { branchId, supplierId, variantId, poId, userId };
  });
  return { t, token, ids };
}

describe("supplier terms and tax number", () => {
  test("a supplier points at a payment term, and its NUIT is kept with history", async () => {
    const { t, token } = await seed();
    const termId = await t.run((ctx) =>
      ctx.db.insert("paymentTerms", { name: "30 dias", days: 30, active: true })
    );
    const supplierId = await t.mutation(api.suppliers.create, {
      token,
      name: "Tecidos Lda",
      status: "ACTIVE",
      paymentTermId: termId,
      nuit: "400000001",
    });
    await t.mutation(api.suppliers.update, {
      token,
      id: supplierId,
      name: "Tecidos Lda",
      status: "ACTIVE",
      paymentTermId: termId,
      nuit: "400000002",
    });
    const row = (await t.query(api.suppliers.list, {})).find((s) => s._id === supplierId);
    expect(row).toMatchObject({ paymentTermName: "30 dias", nuit: "400000002" });

    const identities = await t.run((ctx) =>
      ctx.db
        .query("fiscalIdentities")
        .withIndex("by_supplier", (q) => q.eq("supplierId", supplierId))
        .collect()
    );
    expect(identities).toHaveLength(2);
    expect(identities.filter((i) => i.validTo === undefined).map((i) => i.number)).toEqual(["400000002"]);

    await expect(
      t.mutation(api.suppliers.update, { token, id: supplierId, name: "Tecidos Lda", status: "ACTIVE", nuit: "123" })
    ).rejects.toThrow(/nine digits/);
  });
});

describe("supplier evaluation and relations", () => {
  test("scores must be between 1 and 5", async () => {
    const { t, token, ids } = await seed();
    await expect(
      t.mutation(api.supplierEvaluations.create, {
        token,
        supplierId: ids.supplierId,
        qualityScore: 6,
        punctualityPercent: 90,
      })
    ).rejects.toThrow(/between 1 and 5/);
    await t.mutation(api.supplierEvaluations.create, {
      token,
      supplierId: ids.supplierId,
      qualityScore: 4,
      punctualityPercent: 90,
    });
    expect(await t.query(api.supplierEvaluations.listBySupplier, { supplierId: ids.supplierId })).toHaveLength(1);
  });

  test("a supplier has one open relation, and a new term closes the previous one", async () => {
    const { t, token } = await seed();
    // A supplier with no orders yet, so it has no relation.
    const supplierId = await t.run((ctx) =>
      ctx.db.insert("suppliers", { name: "New supplier", status: "ACTIVE", createdAt: Date.now() })
    );
    const relationId = await t.mutation(api.supplyRelations.createRelation, { token, supplierId });
    await expect(
      t.mutation(api.supplyRelations.createRelation, { token, supplierId })
    ).rejects.toThrow(/open relation/);

    await t.mutation(api.supplyRelations.addTerm, {
      token,
      supplyRelationId: relationId,
      termType: "DEADLINES",
      content: "15 dias",
    });
    await t.mutation(api.supplyRelations.addTerm, {
      token,
      supplyRelationId: relationId,
      termType: "DEADLINES",
      content: "10 dias",
    });
    const [rel] = await t.query(api.supplyRelations.listBySupplier, { supplierId });
    const deadlines = rel.terms.filter((term) => term.termType === "DEADLINES");
    expect(deadlines.filter((term) => term.validTo === undefined).map((term) => term.content)).toEqual(["10 dias"]);
  });
});

describe("quality issues, inspections and shipments", () => {
  test("a quality issue gets one treatment and is then closed", async () => {
    const { t, token, ids } = await seed();
    const issueId = await t.mutation(api.qualityIssues.create, {
      token,
      source: "RECEIPT",
      supplierId: ids.supplierId,
      description: "Costura solta",
      items: [{ productVariantId: ids.variantId, affectedQuantity: 2 }],
    });
    let rows = await t.query(api.qualityIssues.list, { token, supplierId: ids.supplierId });
    expect(rows[0]).toMatchObject({ open: true, affectedQuantity: 2 });

    await t.mutation(api.qualityIssues.treat, { token, id: issueId, treatment: "RETURN_TO_SUPPLIER" });
    await expect(
      t.mutation(api.qualityIssues.treat, { token, id: issueId, treatment: "DESTROY" })
    ).rejects.toThrow(/already has a treatment/);
    rows = await t.query(api.qualityIssues.list, { token });
    expect(rows[0].open).toBe(false);
  });

  test("a customer-found issue can be linked to a complaint", async () => {
    const { t, token, ids } = await seed();
    const complaintId = await t.run((ctx) =>
      ctx.db.insert("complaints", {
        description: "Fecho partido",
        status: "OPEN",
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
      })
    );
    await t.mutation(api.qualityIssues.create, {
      token,
      source: "CUSTOMER",
      complaintId,
      description: "Fecho partido",
      items: [{ productVariantId: ids.variantId, affectedQuantity: 1 }],
    });
    const rows = await t.query(api.qualityIssues.list, { token, source: "CUSTOMER" });
    expect(rows[0].complaintIds).toEqual([complaintId]);
    expect(await t.query(api.qualityIssues.list, { token, source: "RECEIPT" })).toHaveLength(0);
  });

  test("a discrepancy inspection needs a note", async () => {
    const { t, token, ids } = await seed();
    const receiptId: Id<"purchaseReceipts"> = await t.run((ctx) =>
      ctx.db.insert("purchaseReceipts", {
        receiptNumber: "RC-00001",
        branchId: ids.branchId,
        unitsTotal: 3,
        receivedBy: ids.userId,
        receivedByUsername: "admin",
        receivedAt: Date.now(),
        createdAt: Date.now(),
      })
    );
    await expect(
      t.mutation(api.receiptInspections.create, { token, receiptId, result: "DISCREPANCY" })
    ).rejects.toThrow(/Describe the discrepancy/);
    await t.mutation(api.receiptInspections.create, { token, receiptId, result: "OK" });
    expect(await t.query(api.receiptInspections.listByReceipt, { receiptId })).toHaveLength(1);
  });

  test("a shipment arrives once and keeps its customs documents", async () => {
    const { t, token, ids } = await seed();
    const shipmentId = await t.mutation(api.shipments.create, {
      token,
      purchaseOrderId: ids.poId,
      carrier: "DHL",
      trackingReference: "TRK-1",
    });
    await t.mutation(api.shipments.addCustomsDocument, {
      token,
      shipmentId,
      documentType: "DECLARACAO",
      reference: "DA-9",
    });
    await t.mutation(api.shipments.markArrived, { token, id: shipmentId });
    await expect(t.mutation(api.shipments.markArrived, { token, id: shipmentId })).rejects.toThrow(
      /already arrived/
    );
    const rows = await t.query(api.shipments.list, { supplierId: ids.supplierId });
    expect(rows[0]).toMatchObject({ status: "ARRIVED", supplierName: "Supplier Co", orderCode: "PO-00001" });
    expect(rows[0].customs).toHaveLength(1);
  });
});

describe("receiving lists and holds", () => {
  test("open orders show only what is still outstanding", async () => {
    const { t } = await seed();
    const orders = await t.query(api.purchaseReceipts.openOrders, {});
    expect(orders).toHaveLength(1);
    expect(orders[0].lines[0].outstanding).toBe(6);
  });

  test("holds add up per variant", async () => {
    const { t, token, ids } = await seed();
    await t.run(async (ctx) => {
      const orderId = await ctx.db.insert("customerOrders", {
        orderNumber: "CE-1",
        customerId: await ctx.db.insert("customers", {
          name: "Jane",
          phone1: "1",
          isGeneric: false,
          active: true,
          status: "ACTIVE",
        }),
        branchId: ids.branchId,
        status: "OPEN",
        totalAmount: 0,
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      for (const quantity of [2, 3]) {
        await ctx.db.insert("stockHolds", {
          orderId,
          branchId: ids.branchId,
          productVariantId: ids.variantId,
          quantity,
          status: "ACTIVE",
          createdAt: Date.now(),
        });
      }
    });
    const held = await t.query(api.stockHolds.activeByBranch, { token, branchId: ids.branchId });
    expect(held[ids.variantId]).toBe(5);
  });
});
