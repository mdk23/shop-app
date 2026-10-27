/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { findOrCreateSize } from "./lib/catalog";

const modules = import.meta.glob("./**/*.ts");

/**
 * Two sent orders from two suppliers, nothing received and nothing in stock:
 *  - PO-A: 10 × tee at 40
 *  - PO-B: 5 × jacket at 100
 */
async function seed() {
  const t = convexTest(schema, modules);
  const token = "tok-admin";
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const branchId = await ctx.db.insert("branches", { name: "Main", code: "MAIN", status: "ACTIVE", createdAt: now });
    const categoryId = await ctx.db.insert("categories", { name: "Tops", active: true, createdAt: now, updatedAt: now });
    const variant = async (name: string, sku: string, costPrice: number) => {
      const productId = await ctx.db.insert("products", { name, categoryId, active: true, createdAt: now, updatedAt: now });
      return ctx.db.insert("productVariants", {
        productId,
        sku,
        sizeId: await findOrCreateSize(ctx, "M"),
        costPrice,
        sellingPrice: costPrice * 3,
        reorderLevel: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    };
    const teeId = await variant("Tee", "TEE-M", 40);
    const jacketId = await variant("Jacket", "JKT-M", 100);
    const order = async (supplierName: string, code: string, variantId: typeof teeId, qty: number, unitCost: number) => {
      const supplierId = await ctx.db.insert("suppliers", { name: supplierName, status: "ACTIVE", createdAt: now });
      const supplyRelationId = await ctx.db.insert("supplyRelations", { supplierId, startedAt: now });
      const poId = await ctx.db.insert("purchaseOrders", {
        supplyRelationId,
        supplierId,
        branchId,
        orderCode: code,
        orderDate: now,
        status: "SENT",
        paymentStatus: "UNPAID",
        totalAmount: qty * unitCost,
        createdAt: now,
      });
      const lineId = await ctx.db.insert("purchaseOrderItems", {
        purchaseOrderId: poId,
        productVariantId: variantId,
        quantityOrdered: qty,
        quantityReceived: 0,
        unitCost,
        totalCost: qty * unitCost,
      });
      return { supplierId, poId, lineId };
    };
    const a = await order("Alpha", "PO-A", teeId, 10, 40);
    const b = await order("Beta", "PO-B", jacketId, 5, 100);
    const userId = await ctx.db.insert("users", {
      name: "admin",
      username: "admin",
      passwordHash: "",
      role: "admin",
      status: "ACTIVE",
      createdAt: now,
    });
    await ctx.db.insert("userSessions", { userId, token, expiresAt: now + 3_600_000, createdAt: now });
    return { branchId, teeId, jacketId, a, b };
  });

  /** One shipment carrying all of both orders. */
  const shipBoth = () =>
    t.mutation(api.shipments.create, {
      token,
      carrier: "Maersk",
      trackingReference: "CONT-1",
      items: [
        { purchaseOrderItemId: ids.a.lineId, quantity: 10 },
        { purchaseOrderItemId: ids.b.lineId, quantity: 5 },
      ],
    });
  const costOf = (variantId: typeof ids.teeId) => t.run(async (ctx) => (await ctx.db.get(variantId))!.costPrice);
  return { t, token, ids, shipBoth, costOf };
}

describe("shipments carrying several orders", () => {
  test("one shipment holds lines from two orders, and units on the way cannot be shipped again", async () => {
    const { t, token, ids, shipBoth } = await seed();
    await shipBoth();

    const [row] = await t.query(api.shipments.list, { token });
    expect(row.orders.map((o) => o.orderCode).sort()).toEqual(["PO-A", "PO-B"]);
    expect(row.supplierName).toContain("Alpha");
    expect(row.supplierName).toContain("Beta");
    expect(row.items).toHaveLength(2);

    await expect(
      t.mutation(api.shipments.create, {
        token,
        carrier: "DHL",
        items: [{ purchaseOrderItemId: ids.a.lineId, quantity: 1 }],
      })
    ).rejects.toThrow(/only 0 unit/);

    const open = await t.query(api.purchaseReceipts.openOrders, { token });
    expect(open.find((o) => o.orderCode === "PO-A")!.lines[0]).toMatchObject({ outstanding: 10, inTransit: 10 });
    // Filtering by supplier finds the shared shipment from either side.
    expect(await t.query(api.shipments.list, { token, supplierId: ids.b.supplierId })).toHaveLength(1);
  });
});

describe("receipt discrepancies", () => {
  test("receiving short against a shipment records SHORT and marks the shipment arrived", async () => {
    const { t, token, ids, shipBoth } = await seed();
    const shipmentId = await shipBoth();

    const receiptId = await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: ids.a.poId,
      shipmentId,
      discrepancyReason: "Two boxes missing",
      lines: [{ productVariantId: ids.teeId, quantityReceived: 8 }],
    });

    const receipt = (await t.query(api.purchaseReceipts.get, { token, id: receiptId }))!;
    expect(receipt.discrepancies).toHaveLength(1);
    expect(receipt.discrepancies[0]).toMatchObject({
      kind: "SHORT",
      expectedFrom: "SHIPMENT",
      expectedQuantity: 10,
      receivedQuantity: 8,
      reason: "Two boxes missing",
    });
    const [row] = await t.query(api.shipments.list, { token });
    expect(row.status).toBe("ARRIVED");

    // The same order cannot be received twice from one shipment.
    await expect(
      t.mutation(api.purchaseReceipts.create, {
        token,
        purchaseOrderId: ids.a.poId,
        shipmentId,
        lines: [{ productVariantId: ids.teeId, quantityReceived: 2 }],
      })
    ).rejects.toThrow(/already received/);

    const card = (await t.query(api.supplierEvaluations.scorecard, { token })).find((s) => s.supplierId === ids.a.supplierId)!;
    expect(card).toMatchObject({ discrepancies: 1, shortUnits: 2, overUnits: 0 });
  });

  test("an order not on the shipment is refused", async () => {
    const { t, token, ids } = await seed();
    const shipmentId = await t.mutation(api.shipments.create, { token, carrier: "DHL", purchaseOrderId: ids.b.poId });
    await expect(
      t.mutation(api.purchaseReceipts.create, {
        token,
        purchaseOrderId: ids.a.poId,
        shipmentId,
        lines: [{ productVariantId: ids.teeId, quantityReceived: 10 }],
      })
    ).rejects.toThrow(/not on that shipment/);
  });

  test("over the order is recorded with what the order expected", async () => {
    const { t, token, ids } = await seed();
    const receiptId = await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: ids.a.poId,
      lines: [{ productVariantId: ids.teeId, quantityReceived: 12 }],
    });
    const receipt = (await t.query(api.purchaseReceipts.get, { token, id: receiptId }))!;
    expect(receipt.discrepancies[0]).toMatchObject({ kind: "OVER", expectedFrom: "ORDER", expectedQuantity: 10, receivedQuantity: 12 });
  });

  test("closing an order short records each short line and completes it", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: ids.a.poId,
      lines: [{ productVariantId: ids.teeId, quantityReceived: 6 }],
    });
    await expect(t.mutation(api.purchaseOrders.closeShort, { token, id: ids.a.poId, reason: " " })).rejects.toThrow(
      /Say why/
    );
    await t.mutation(api.purchaseOrders.closeShort, { token, id: ids.a.poId, reason: "Supplier out of stock" });

    const rows = await t.run((ctx) => ctx.db.query("receiptDiscrepancies").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "SHORT", expectedFrom: "ORDER", expectedQuantity: 10, receivedQuantity: 6 });
    expect((await t.run((ctx) => ctx.db.get(ids.a.poId)))!.status).toBe("COMPLETED");
  });
});

describe("review fixes", () => {
  test("a shipment carrying two orders can be received for the second after the first", async () => {
    const { t, token, ids, shipBoth } = await seed();
    const shipmentId = await shipBoth();
    await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: ids.a.poId,
      shipmentId,
      lines: [{ productVariantId: ids.teeId, quantityReceived: 10 }],
    });
    // Arrived with the first order, but still open for the second.
    let [row] = await t.query(api.shipments.list, { token });
    expect(row.status).toBe("ARRIVED");
    expect(row.orders.find((o) => o.orderCode === "PO-B")!.received).toBe(false);
    await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: ids.b.poId,
      shipmentId,
      lines: [{ productVariantId: ids.jacketId, quantityReceived: 5 }],
    });
    [row] = await t.query(api.shipments.list, { token });
    expect(row.orders.every((o) => o.received)).toBe(true);
    expect(row.receipts).toHaveLength(2);
  });

  test("closing short after a short shipment does not count the missing units twice", async () => {
    const { t, token, ids, shipBoth } = await seed();
    const shipmentId = await shipBoth();
    await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: ids.a.poId,
      shipmentId,
      lines: [{ productVariantId: ids.teeId, quantityReceived: 8 }],
    });
    await t.mutation(api.purchaseOrders.closeShort, { token, id: ids.a.poId, reason: "Lost in transit" });
    const card = (await t.query(api.supplierEvaluations.scorecard, { token })).find((s) => s.supplierId === ids.a.supplierId)!;
    expect(card.shortUnits).toBe(2);
  });
});

describe("landed cost", () => {
  test("applying a shipment's landed cost spreads it by value and raises the average cost", async () => {
    const { t, token, ids, shipBoth, costOf } = await seed();
    const shipmentId = await shipBoth();
    for (const [poId, variantId, qty] of [
      [ids.a.poId, ids.teeId, 10],
      [ids.b.poId, ids.jacketId, 5],
    ] as const) {
      await t.mutation(api.purchaseReceipts.create, {
        token,
        purchaseOrderId: poId,
        shipmentId,
        lines: [{ productVariantId: variantId, quantityReceived: qty }],
      });
    }

    // The purchase movement records the cost the variant ends up at.
    const movement = await t.run((ctx) =>
      ctx.db
        .query("inventoryMovements")
        .withIndex("by_variant", (q) => q.eq("productVariantId", ids.teeId))
        .first()
    );
    expect(movement).toMatchObject({ costPerUnit: 40, variantCostAfter: 40 });

    const costId = await t.mutation(api.landedCosts.create, {
      token,
      calculatedFor: Date.now(),
      shipmentId,
      components: [
        { componentType: "Freight", value: 60 },
        { componentType: "Duty", value: 30 },
      ],
    });
    await t.mutation(api.landedCosts.apply, { token, id: costId });

    // Goods value 400 (tee) and 500 (jacket): 90 splits 40 / 50.
    const [row] = await t.query(api.landedCosts.list, { token });
    const share = Object.fromEntries(row.allocations.map((a) => [a.productVariantId, a.amount]));
    expect(share[ids.teeId]).toBe(40);
    expect(share[ids.jacketId]).toBe(50);
    expect(row.appliedAt).toBeDefined();
    expect(await costOf(ids.teeId)).toBe(44); // 40 + 40 / 10 on hand
    expect(await costOf(ids.jacketId)).toBe(110); // 100 + 50 / 5 on hand

    // Applied costs are locked.
    await expect(t.mutation(api.landedCosts.apply, { token, id: costId })).rejects.toThrow(/already in the cost prices/);
    await expect(t.mutation(api.landedCosts.remove, { token, id: costId })).rejects.toThrow(/already in the cost prices/);
  });

  test("by units, and only once something has been received", async () => {
    const { t, token, ids, costOf } = await seed();
    const shipmentId = await t.mutation(api.shipments.create, { token, carrier: "DHL", purchaseOrderId: ids.a.poId });
    const costId = await t.mutation(api.landedCosts.create, {
      token,
      calculatedFor: Date.now(),
      shipmentId,
      allocationMethod: "QUANTITY",
      components: [{ componentType: "Freight", value: 20 }],
    });
    await expect(t.mutation(api.landedCosts.apply, { token, id: costId })).rejects.toThrow(/No goods have been received/);

    await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: ids.a.poId,
      shipmentId,
      lines: [{ productVariantId: ids.teeId, quantityReceived: 10 }],
    });
    await t.mutation(api.landedCosts.apply, { token, id: costId });
    expect(await costOf(ids.teeId)).toBe(42);
  });

  test("a cost cannot be for a shipment and a receipt at once, and needs a link to apply", async () => {
    const { t, token, ids } = await seed();
    const shipmentId = await t.mutation(api.shipments.create, { token, carrier: "DHL", purchaseOrderId: ids.a.poId });
    const receiptId = await t.mutation(api.purchaseReceipts.create, {
      token,
      purchaseOrderId: ids.b.poId,
      lines: [{ productVariantId: ids.jacketId, quantityReceived: 5 }],
    });
    await expect(
      t.mutation(api.landedCosts.create, {
        token,
        calculatedFor: Date.now(),
        shipmentId,
        receiptId,
        components: [{ componentType: "Freight", value: 5 }],
      })
    ).rejects.toThrow(/not both/);
    const unlinked = await t.mutation(api.landedCosts.create, {
      token,
      calculatedFor: Date.now(),
      components: [{ componentType: "Freight", value: 5 }],
    });
    await expect(t.mutation(api.landedCosts.apply, { token, id: unlinked })).rejects.toThrow(/Link this cost/);
  });
});

describe("procurement to purchase orders", () => {
  test("a need has a branch, and a decision is ordered on a line within both quantities", async () => {
    const { t, token, ids } = await seed();
    await t.mutation(api.procurementPlanning.createNeed, {
      token,
      branchId: ids.branchId,
      items: [{ variantId: ids.teeId, quantity: 12 }],
    });
    await t.mutation(api.procurementPlanning.createDecision, {
      token,
      decisionType: "BUY",
      items: [{ variantId: ids.teeId, quantity: 12 }],
    });
    let overview = await t.query(api.procurementPlanning.overview, { token });
    expect(overview.needs[0].branchName).toBe("Main");
    const decisionItemId = overview.decisions[0].items[0]._id;

    const lines = await t.query(api.procurementPlanning.openOrderLines, { token, variantId: ids.teeId });
    expect(lines.map((l) => l.orderCode)).toEqual(["PO-A"]);

    await expect(
      t.mutation(api.procurementPlanning.linkToOrder, { token, decisionItemId, purchaseOrderItemId: ids.b.lineId, quantity: 1 })
    ).rejects.toThrow(/same product variant/);
    // The line orders 10, so 11 is more than it can account for.
    await expect(
      t.mutation(api.procurementPlanning.linkToOrder, { token, decisionItemId, purchaseOrderItemId: ids.a.lineId, quantity: 11 })
    ).rejects.toThrow(/orders 10/);
    await t.mutation(api.procurementPlanning.linkToOrder, { token, decisionItemId, purchaseOrderItemId: ids.a.lineId, quantity: 10 });

    overview = await t.query(api.procurementPlanning.overview, { token });
    expect(overview.decisions[0].items[0]).toMatchObject({ quantityOrdered: 10 });
    expect(overview.decisions[0].items[0].orders[0].orderCode).toBe("PO-A");
  });
});
