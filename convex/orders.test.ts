/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { findOrCreateSize } from "./lib/catalog";

const modules = import.meta.glob("./**/*.ts");

/** A branch with an open register, two products in stock (tee 250, cap 100), a named and a walk-in customer. */
async function seed() {
  const t = convexTest(schema, modules);
  const token = "tok-admin";
  const ids = await t.run(async (ctx) => {
    const now = Date.now();
    const branchId = await ctx.db.insert("branches", { name: "Main", code: "MAIN", status: "ACTIVE", isDefault: true, createdAt: now });
    const categoryId = await ctx.db.insert("categories", { name: "Tops", active: true, createdAt: now, updatedAt: now });
    const variant = async (name: string, sku: string, sellingPrice: number) => {
      const productId = await ctx.db.insert("products", { name, categoryId, active: true, createdAt: now, updatedAt: now });
      return ctx.db.insert("productVariants", {
        productId,
        sku,
        sizeId: await findOrCreateSize(ctx, "M"),
        costPrice: sellingPrice / 2,
        sellingPrice,
        reorderLevel: 0,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
    };
    const teeId = await variant("Tee", "TEE-M", 250);
    const capId = await variant("Cap", "CAP-M", 100);
    const walkInId = await ctx.db.insert("customers", { name: "Walk-in", phone1: "0", isGeneric: true, status: "ACTIVE" });
    const janeId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      address: "Av. 24 de Julho 100",
      isGeneric: false,
      status: "ACTIVE",
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
    await ctx.db.insert("cashRegisterSessions", {
      userId,
      username: "admin",
      openingAmount: 0,
      openedAt: now,
      status: "OPEN",
      branchId,
    });
    return { branchId, teeId, capId, walkInId, janeId, userId };
  });
  for (const variantId of [ids.teeId, ids.capId]) {
    await t.mutation(internal.inventory.mutateStock, {
      productVariantId: variantId,
      branchId: ids.branchId,
      quantity: 20,
      movementType: "INITIAL_STOCK",
      userId: ids.userId,
      username: "admin",
    });
  }
  const order = (extra: { depositPercent?: number; reserve?: boolean } = {}) =>
    t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.janeId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.teeId, quantity: 2 }],
      ...extra,
    });
  const get = (id: Awaited<ReturnType<typeof order>>) => t.query(api.customerOrders.get, { token, id }).then((o) => o!);
  return { t, token, ids, order, get };
}

describe("order lifecycle", () => {
  test("with a deposit rule the order is confirmed only once the deposit is paid", async () => {
    const { t, token, order, get } = await seed();
    const id = await order({ depositPercent: 50 });

    let o = await get(id);
    expect(o).toMatchObject({ requiredDeposit: 250, confirmed: false });
    await expect(t.mutation(api.customerOrders.markReady, { token, orderId: id })).rejects.toThrow(/deposit of 250/);

    await t.mutation(api.customerOrders.addDeposit, { token, orderId: id, amount: 100, method: "CASH" });
    expect((await get(id)).confirmed).toBe(false);
    await t.mutation(api.customerOrders.addDeposit, { token, orderId: id, amount: 150, method: "CASH" });
    await t.mutation(api.customerOrders.markReady, { token, orderId: id });

    o = await get(id);
    expect(o.events.map((e) => e.kind)).toEqual(["CREATED", "CONFIRMED", "READY"]);
  });

  test("without a deposit rule it is confirmed at once", async () => {
    const { order, get } = await seed();
    const o = await get(await order());
    expect(o.confirmed).toBe(true);
    expect(o.events.map((e) => e.kind)).toEqual(["CREATED", "CONFIRMED"]);
  });

  test("a payment term's deposit % is the order's rule", async () => {
    const { t, token, ids, get } = await seed();
    const paymentTermId = await t.run((ctx) =>
      ctx.db.insert("paymentTerms", { name: "Sinal 30%", days: 0, depositPercent: 30, active: true })
    );
    const id = await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.janeId,
      branchId: ids.branchId,
      paymentTermId,
      items: [{ productVariantId: ids.teeId, quantity: 2 }],
    });
    expect(await get(id)).toMatchObject({ depositPercent: 30, requiredDeposit: 150, paymentTermName: "Sinal 30%" });
  });

  test("changing lines records each line before and after, keeps holds in step, and logs cancellation", async () => {
    const { t, token, ids, order, get } = await seed();
    const id = await order({ reserve: true });
    await expect(
      t.mutation(api.customerOrders.changeLines, { token, orderId: id, items: [{ productVariantId: ids.teeId, quantity: 3 }], reason: " " })
    ).rejects.toThrow(/Say why/);

    await t.mutation(api.customerOrders.changeLines, {
      token,
      orderId: id,
      reason: "Customer wants one more and a cap",
      items: [
        { productVariantId: ids.teeId, quantity: 3 },
        { productVariantId: ids.capId, quantity: 1 },
      ],
    });
    const o = await get(id);
    expect(o.totalAmount).toBe(850);
    const changed = o.events.find((e) => e.kind === "CHANGED")!;
    expect(changed).toMatchObject({ totalBefore: 500, totalAfter: 850, reason: "Customer wants one more and a cap" });
    expect(changed.lineChanges!.map((c) => [c.quantityBefore, c.quantityAfter])).toEqual([
      [2, 3],
      [0, 1],
    ]);
    const held = await t.run(async (ctx) =>
      (await ctx.db.query("stockHolds").collect()).filter((h) => h.status === "ACTIVE").map((h) => h.quantity).sort()
    );
    expect(held).toEqual([1, 3]);

    // Deposits cannot end up above the total.
    await t.mutation(api.customerOrders.addDeposit, { token, orderId: id, amount: 400, method: "CASH" });
    await expect(
      t.mutation(api.customerOrders.changeLines, { token, orderId: id, reason: "x", items: [{ productVariantId: ids.capId, quantity: 1 }] })
    ).rejects.toThrow(/exceed the new total/);

    await t.mutation(api.customerOrders.cancel, { token, orderId: id, reason: "Changed mind" });
    expect((await get(id)).events.at(-1)).toMatchObject({ kind: "CANCELLED", reason: "Changed mind" });
  });
});

describe("order lines from requests", () => {
  test("a line records the request it came from, and the request is converted", async () => {
    const { t, token, ids, get } = await seed();
    const demandId = await t.run((ctx) =>
      ctx.db.insert("demands", {
        customerId: ids.janeId,
        description: "Black tee size M",
        productVariantId: ids.teeId,
        stage: "OPEN",
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    const id = await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.janeId,
      branchId: ids.branchId,
      items: [
        { productVariantId: ids.teeId, quantity: 1, demandId },
        { productVariantId: ids.capId, quantity: 1 },
      ],
    });
    const o = await get(id);
    expect(o.items.find((i) => i.productVariantId === ids.teeId)!.origins).toEqual(["Black tee size M"]);
    expect(o.items.find((i) => i.productVariantId === ids.capId)!.origins).toEqual([]);
    const demand = await t.run((ctx) => ctx.db.get(demandId));
    expect(demand).toMatchObject({ stage: "CONVERTED", convertedOrderId: id });
  });

  test("a request from another customer is refused", async () => {
    const { t, token, ids } = await seed();
    const otherId = await t.run((ctx) => ctx.db.insert("customers", { name: "Other", phone1: "1", status: "ACTIVE" }));
    const demandId = await t.run((ctx) =>
      ctx.db.insert("demands", {
        customerId: otherId,
        description: "Tee",
        stage: "OPEN",
        createdBy: ids.userId,
        createdByUsername: "admin",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
    );
    await expect(
      t.mutation(api.customerOrders.create, {
        token,
        customerId: ids.janeId,
        branchId: ids.branchId,
        items: [{ productVariantId: ids.teeId, quantity: 1, demandId }],
      })
    ).rejects.toThrow(/different customer/);
  });
});

describe("deliveries", () => {
  test("an order collected for delivery is delivered line by line, tied to the order lines", async () => {
    const { t, token, ids, order } = await seed();
    const id = await order();
    const saleId = await t.mutation(api.customerOrders.collect, {
      token,
      orderId: id,
      payments: [{ method: "CASH", amount: 500 }],
      isDelivery: true,
    });
    expect((await t.run((ctx) => ctx.db.get(saleId)))!.isDelivery).toBe(true);

    const before = (await t.query(api.deliveries.forSale, { token, saleId }))!;
    expect(before.recipient).toMatchObject({ name: "Jane Doe", address: "Av. 24 de Julho 100" });
    const saleItemId = before.lines[0].saleItemId;

    const first = await t.mutation(api.deliveries.create, {
      token,
      saleId,
      recipientName: "Jane Doe",
      address: "Av. 24 de Julho 100",
      lines: [{ saleItemId, quantity: 1 }],
    });
    await expect(
      t.mutation(api.deliveries.create, {
        token,
        saleId,
        recipientName: "Jane Doe",
        address: "x",
        lines: [{ saleItemId, quantity: 2 }],
      })
    ).rejects.toThrow(/Only 1/);

    // A failed delivery frees its lines to go out again.
    await t.mutation(api.deliveries.markFailed, { token, id: first, reason: "Nobody home" });
    const second = await t.mutation(api.deliveries.create, { token, saleId, recipientName: "Jane Doe", address: "Av. 24 de Julho 100" });
    await t.mutation(api.deliveries.markDelivered, { token, id: second, receivedBy: "Neighbour" });

    const after = (await t.query(api.deliveries.forSale, { token, saleId }))!;
    expect(after.lines[0]).toMatchObject({ sold: 2, onDeliveries: 2, toDeliver: 0 });
    const delivered = after.deliveries.find((d) => d._id === second)!;
    expect(delivered).toMatchObject({ status: "DELIVERED", receivedBy: "Neighbour", customerOrderId: id });
    expect(delivered.items[0].customerOrderItemId).toBeDefined();
    expect(delivered.deliveryNumber).toMatch(/^GE-/);
  });
});

describe("review fixes", () => {
  test("one sale line listed twice in a delivery is added up before the check", async () => {
    const { t, token, order } = await seed();
    const saleId = await t.mutation(api.customerOrders.collect, {
      token,
      orderId: await order(),
      payments: [{ method: "CASH", amount: 500 }],
      isDelivery: true,
    });
    const saleItemId = (await t.query(api.deliveries.forSale, { token, saleId }))!.lines[0].saleItemId;
    await expect(
      t.mutation(api.deliveries.create, {
        token,
        saleId,
        recipientName: "Jane",
        address: "x",
        lines: [
          { saleItemId, quantity: 2 },
          { saleItemId, quantity: 2 },
        ],
      })
    ).rejects.toThrow(/Only 2/);
  });

  test("the same product twice on a new order becomes one line, and changing it keeps the total right", async () => {
    const { t, token, ids, get } = await seed();
    const id = await t.mutation(api.customerOrders.create, {
      token,
      customerId: ids.janeId,
      branchId: ids.branchId,
      items: [
        { productVariantId: ids.teeId, quantity: 2 },
        { productVariantId: ids.teeId, quantity: 3 },
      ],
    });
    let o = await get(id);
    expect(o.items).toHaveLength(1);
    expect(o.items[0].quantity).toBe(5);

    // An order saved before lines were merged: two lines for one product.
    await t.run(async (ctx) => {
      const line = (await ctx.db.query("customerOrderItems").first())!;
      await ctx.db.patch(line._id, { quantity: 2, lineTotal: 500 });
      await ctx.db.insert("customerOrderItems", { ...line, _id: undefined, _creationTime: undefined, quantity: 3, lineTotal: 750 } as never);
    });
    await t.mutation(api.customerOrders.changeLines, {
      token,
      orderId: id,
      reason: "One fewer",
      items: [{ productVariantId: ids.teeId, quantity: 4 }],
    });
    o = await get(id);
    expect(o.items).toHaveLength(1);
    expect(o.items[0].quantity).toBe(4);
    expect(o.totalAmount).toBe(1000);
    expect(o.events.at(-1)!.lineChanges).toEqual([expect.objectContaining({ quantityBefore: 5, quantityAfter: 4 })]);
  });

  test("changing an order whose reservation already lapsed does not create holds that are born expired", async () => {
    const { t, token, ids, order } = await seed();
    const id = await order({ reserve: true });
    await t.run(async (ctx) => {
      for (const h of await ctx.db.query("stockHolds").collect()) await ctx.db.patch(h._id, { expiresAt: Date.now() - 1000 });
    });
    await t.mutation(api.customerOrders.changeLines, {
      token,
      orderId: id,
      reason: "More",
      items: [{ productVariantId: ids.teeId, quantity: 3 }],
    });
    const holds = await t.run((ctx) => ctx.db.query("stockHolds").collect());
    expect(holds.every((h) => h.status !== "ACTIVE")).toBe(true);
    expect(holds.some((h) => h.status === "EXPIRED")).toBe(true);
  });
});

describe("walk-in sales", () => {
  test("a sale without a customer, or with the walk-in placeholder, stores no customer", async () => {
    const { t, token, ids } = await seed();
    const none = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.capId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 100 }],
    });
    const placeholder = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.walkInId,
      items: [{ productVariantId: ids.capId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 100 }],
    });
    for (const saleId of [none, placeholder]) {
      const sale = await t.run((ctx) => ctx.db.get(saleId));
      expect(sale!.customerId).toBeUndefined();
      expect(sale!.customerName).toBeUndefined();
    }
    // Nobody to spend store credit from.
    await expect(
      t.mutation(api.sales.create, {
        token,
        branchId: ids.branchId,
        items: [{ productVariantId: ids.capId, quantity: 1 }],
        payments: [{ method: "STORE_CREDIT", amount: 100 }],
      })
    ).rejects.toThrow(/named customer/);
    // The till can price a cart before any customer is chosen.
    const quote = await t.query(api.sales.quote, { token, items: [{ productVariantId: ids.capId, quantity: 2 }] });
    expect(quote?.total).toBe(200);
  });
});
