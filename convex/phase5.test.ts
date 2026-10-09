/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { findOrCreateSize } from "./lib/catalog";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);
  const token = "tok-admin";
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const main = await ctx.db.insert("branches", {
      name: "Main",
      code: "MAIN",
      status: "ACTIVE",
      isDefault: true,
      createdAt: now,
    });
    const second = await ctx.db.insert("branches", {
      name: "Second",
      code: "SEC",
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
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const variantA = await ctx.db.insert("productVariants", {
      productId,
      sku: "TEE-A",
      sizeId: await findOrCreateSize(ctx, "M"),
      costPrice: 40,
      sellingPrice: 250,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const variantB = await ctx.db.insert("productVariants", {
      productId,
      sku: "TEE-B",
      sizeId: await findOrCreateSize(ctx, "L"),
      costPrice: 40,
      sellingPrice: 250,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("variantStock", {
      branchId: main,
      productVariantId: variantB,
      quantity: 100,
      status: "IN_STOCK",
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
    await ctx.db.insert("userSessions", {
      userId,
      token,
      expiresAt: now + 3_600_000,
      createdAt: now,
    });
    return { main, second, supplierId, variantA, variantB };
  });
  return { t, token, ids };
}

async function stockOf(
  t: Awaited<ReturnType<typeof seed>>["t"],
  branchId: Id<"branches">,
  productVariantId: Id<"productVariants">
) {
  const row = await t.run((ctx) =>
    ctx.db
      .query("variantStock")
      .withIndex("by_branch_and_variant", (q) =>
        q.eq("branchId", branchId).eq("productVariantId", productVariantId)
      )
      .unique()
  );
  return row?.quantity ?? 0;
}

async function sentPurchaseOrder(
  t: Awaited<ReturnType<typeof seed>>["t"],
  token: string,
  ids: Awaited<ReturnType<typeof seed>>["ids"],
  quantity: number
) {
  const poId = await t.mutation(api.purchaseOrders.create, {
    token,
    supplierId: ids.supplierId,
    branchId: ids.main,
    orderDate: Date.now(),
    items: [{ productVariantId: ids.variantA, quantityOrdered: quantity, unitCost: 40 }],
  });
  await t.mutation(api.purchaseOrders.updateStatus, { token, id: poId, status: "SENT" });
  return poId;
}

describe("one source for a receipt's supplier and a variant's product", () => {
  test("a receipt for an order has the order's supplier; a quality issue takes the receipt's", async () => {
    const { t, token, ids } = await seed();
    const poId = await sentPurchaseOrder(t, token, ids, 5);
    const otherSupplier = await t.run((ctx) =>
      ctx.db.insert("suppliers", { name: "Other", status: "ACTIVE", createdAt: Date.now() })
    );
    const lines = [{ productVariantId: ids.variantA, quantityReceived: 2 }];
    await expect(
      t.mutation(api.purchaseReceipts.create, { token, purchaseOrderId: poId, supplierId: otherSupplier, lines })
    ).rejects.toThrow(/different supplier/);

    const receiptId = await t.mutation(api.purchaseReceipts.create, { token, purchaseOrderId: poId, lines });
    const stored = await t.run((ctx) => ctx.db.get(receiptId));
    expect(stored?.supplierId).toBeUndefined(); // read through the order
    const receipt = await t.query(api.purchaseReceipts.get, { id: receiptId });
    expect(receipt?.supplierId).toBe(ids.supplierId);

    const receiptItemId = receipt!.items[0]._id;
    const issue = (source: { supplierId?: typeof otherSupplier }) =>
      t.mutation(api.qualityIssues.create, {
        token,
        source: "RECEIPT",
        receiptItemId,
        description: "Torn seam",
        items: [{ productVariantId: ids.variantA, affectedQuantity: 1 }],
        ...source,
      });
    await expect(issue({ supplierId: otherSupplier })).rejects.toThrow(/different supplier/);
    const issueId = await issue({});
    expect((await t.run((ctx) => ctx.db.get(issueId)))?.supplierId).toBe(ids.supplierId);
  });

  test("a demand's variant decides its product", async () => {
    const { t, token, ids } = await seed();
    const variantA = await t.run((ctx) => ctx.db.get(ids.variantA));
    // A second product, so a variant can be paired with the wrong one.
    const otherProductId = await t.run(async (ctx) =>
      ctx.db.insert("products", {
        ...(await ctx.db.get(variantA!.productId))!,
        _id: undefined,
        _creationTime: undefined,
        name: "Other product",
      } as never)
    );
    const demandId = await t.mutation(api.demands.create, {
      token,
      description: "Same tee in L",
      productVariantId: ids.variantA,
    });
    expect((await t.run((ctx) => ctx.db.get(demandId)))?.productId).toBe(variantA!.productId);
    await expect(
      t.mutation(api.demands.create, {
        token,
        description: "Mismatch",
        productId: otherProductId,
        productVariantId: ids.variantA,
      })
    ).rejects.toThrow(/different product/);
  });
});

describe("purchase orders and supply relations", () => {
  test("orders are placed under the supplier's open relation, opened on first order", async () => {
    const { t, token, ids } = await seed();
    const first = await sentPurchaseOrder(t, token, ids, 5);
    const second = await sentPurchaseOrder(t, token, ids, 3);

    const relations = await t.query(api.supplyRelations.listBySupplier, { supplierId: ids.supplierId });
    expect(relations).toHaveLength(1);
    expect(relations[0].endedAt).toBeUndefined();
    expect(relations[0].orders.map((o) => o._id).sort()).toEqual([first, second].sort());

    const [a, b] = await t.run(async (ctx) => [await ctx.db.get(first), await ctx.db.get(second)]);
    expect(a?.supplyRelationId).toBe(relations[0]._id);
    expect(b?.supplyRelationId).toBe(relations[0]._id);
  });

  test("moving a draft to another supplier moves it to that supplier's relation", async () => {
    const { t, token, ids } = await seed();
    const otherSupplier = await t.run((ctx) =>
      ctx.db.insert("suppliers", { name: "Other", status: "ACTIVE", createdAt: Date.now() })
    );
    const items = [{ productVariantId: ids.variantA, quantityOrdered: 2, unitCost: 40 }];
    const poId = await t.mutation(api.purchaseOrders.create, {
      token,
      supplierId: ids.supplierId,
      branchId: ids.main,
      orderDate: Date.now(),
      items,
    });
    await t.mutation(api.purchaseOrders.update, {
      token,
      id: poId,
      supplierId: otherSupplier,
      branchId: ids.main,
      orderDate: Date.now(),
      items,
    });
    const po = await t.run((ctx) => ctx.db.get(poId));
    const relation = await t.run((ctx) => ctx.db.get(po!.supplyRelationId));
    expect(po?.supplierId).toBe(otherSupplier);
    expect(relation?.supplierId).toBe(otherSupplier);
  });
});

describe("purchase receipts", () => {
  test("partial then over-receipt: stock follows the lines, the order completes, the over line is flagged", async () => {
    const { t, token, ids } = await seed();
    const poId = await sentPurchaseOrder(t, token, ids, 10);

    const r1 = await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: poId,
      lines: [{ productVariantId: ids.variantA, quantityReceived: 4 }],
    });
    const first = await t.query(api.purchaseReceipts.get, { id: r1 });
    expect(first?.receiptNumber).toMatch(/^RC \d{4}\/000001$/);
    expect(first?.items[0].discrepancy).toBeUndefined();
    expect(await stockOf(t, ids.main, ids.variantA)).toBe(4);

    const r2 = await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: poId,
      lines: [{ productVariantId: ids.variantA, quantityReceived: 8 }],
    });
    const second = await t.query(api.purchaseReceipts.get, { id: r2 });
    expect(second?.items[0].discrepancy).toBe("OVER");
    expect(await stockOf(t, ids.main, ids.variantA)).toBe(12);

    const po = await t.run((ctx) => ctx.db.get(poId));
    expect(po?.status).toBe("COMPLETED");
  });

  test("goods without an order are recorded as unannounced and need a unit cost", async () => {
    const { t, token, ids } = await seed();
    const rid = await t.mutation(api.purchaseReceipts.create, {
      token,
      supplierId: ids.supplierId,
      branchId: ids.main,
      deliveryNoteRef: "GT-7781",
      lines: [{ productVariantId: ids.variantA, quantityReceived: 3, unitCost: 35 }],
    });
    const receipt = await t.query(api.purchaseReceipts.get, { id: rid });
    expect(receipt?.items[0].discrepancy).toBe("UNANNOUNCED");
    expect(receipt?.deliveryNoteRef).toBe("GT-7781");
    expect(await stockOf(t, ids.main, ids.variantA)).toBe(3);

    await expect(
      t.mutation(api.purchaseReceipts.create, {
        token,
        supplierId: ids.supplierId,
        branchId: ids.main,
        lines: [{ productVariantId: ids.variantA, quantityReceived: 1 }],
      })
    ).rejects.toThrow(/unit cost/);
  });

  test("the strict PO receive action still refuses over-receipt", async () => {
    const { t, token, ids } = await seed();
    const poId = await sentPurchaseOrder(t, token, ids, 5);
    await expect(
      t.mutation(api.purchaseOrders.receiveItems, {
        token,
        id: poId,
        items: [{ productVariantId: ids.variantA, quantityReceived: 9 }],
      })
    ).rejects.toThrow(/exceeds/);
  });
});

describe("transfer receipts", () => {
  test("a short delivery moves only what arrived and keeps the shortage on the receipt", async () => {
    const { t, token, ids } = await seed();
    const transferId = await t.mutation(api.stockTransfers.create, {
      token,
      sourceBranchId: ids.main,
      destinationBranchId: ids.second,
      items: [{ productVariantId: ids.variantB, quantity: 5 }],
      submit: true,
    });
    await t.mutation(api.stockTransfers.receive, {
      token,
      transferId,
      observed: [{ productVariantId: ids.variantB, quantityObserved: 4 }],
    });

    expect(await stockOf(t, ids.main, ids.variantB)).toBe(95);
    expect(await stockOf(t, ids.second, ids.variantB)).toBe(4);

    const receipt = await t.query(api.stockTransfers.getReceipt, { transferId });
    expect(receipt?.lines[0]).toMatchObject({ quantitySent: 5, quantityObserved: 4 });
  });

  test("rejects observing more than was sent", async () => {
    const { t, token, ids } = await seed();
    const transferId = await t.mutation(api.stockTransfers.create, {
      token,
      sourceBranchId: ids.main,
      destinationBranchId: ids.second,
      items: [{ productVariantId: ids.variantB, quantity: 5 }],
      submit: true,
    });
    await expect(
      t.mutation(api.stockTransfers.receive, {
        token,
        transferId,
        observed: [{ productVariantId: ids.variantB, quantityObserved: 6 }],
      })
    ).rejects.toThrow(/between 0 and 5/);
  });
});

describe("stock counts", () => {
  test("applies the difference between the count and stock on hand at close", async () => {
    const { t, token, ids } = await seed();
    const countId = await t.mutation(api.stockCounts.start, { token, branchId: ids.main });
    await t.mutation(api.stockCounts.recordCounts, {
      token,
      countId,
      counts: [{ productVariantId: ids.variantB, countedQuantity: 90 }],
    });

    const result = await t.mutation(api.stockCounts.close, { token, countId });
    expect(result).toEqual({ applied: 1, uncounted: 0 });
    expect(await stockOf(t, ids.main, ids.variantB)).toBe(90);

    const { page: adjustments } = await t.query(api.stockAdjustments.listPaged, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      reason: "PHYSICAL_COUNT",
      previousQuantity: 100,
      adjustmentQuantity: -10,
      newQuantity: 90,
    });

    const closed = await t.query(api.stockCounts.get, { id: countId });
    expect(closed?.status).toBe("CLOSED");
  });

  test("a closed count cannot be changed or closed again", async () => {
    const { t, token, ids } = await seed();
    const countId = await t.mutation(api.stockCounts.start, { token, branchId: ids.main });
    await t.mutation(api.stockCounts.close, { token, countId });
    await expect(
      t.mutation(api.stockCounts.recordCounts, {
        token,
        countId,
        counts: [{ productVariantId: ids.variantB, countedQuantity: 1 }],
      })
    ).rejects.toThrow(/closed/);
    await expect(t.mutation(api.stockCounts.close, { token, countId })).rejects.toThrow(
      /already closed/
    );
  });

  test("only one count can be open per branch", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.stockCounts.start, { token, branchId: ids.main });
    await expect(t.mutation(api.stockCounts.start, { token, branchId: ids.main })).rejects.toThrow(
      /already open/
    );
  });
});
