/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { findOrCreateColor, findOrCreateSize } from "./lib/catalog";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "Main",
      code: "MAIN",
      status: "ACTIVE",
      isDefault: true,
      createdAt: Date.now(),
    });
    const branch2Id = await ctx.db.insert("branches", {
      name: "Second",
      code: "SEC",
      status: "ACTIVE",
      createdAt: Date.now(),
    });
    const categoryId = await ctx.db.insert("categories", {
      name: "T-Shirts",
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const productId = await ctx.db.insert("products", {
      name: "Basic Tee",
      categoryId,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const sizeId = await ctx.db.insert("sizes", {
      name: "M",
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const variantId = await ctx.db.insert("productVariants", {
      productId,
      sku: "BASIC-BLK-M",
      sizeId: await findOrCreateSize(ctx, "M"),
      colorId: await findOrCreateColor(ctx, "Black"),
      costPrice: 100,
      sellingPrice: 250,
      reorderLevel: 3,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const customerId = await ctx.db.insert("customers", {
      name: "Walk-in",
      phone1: "0",
      isGeneric: true,
      status: "ACTIVE",
    });
    const namedCustomerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
      status: "ACTIVE",
    });

    const mkUser = async (username: string, role: "admin" | "pos_seller") => {
      const userId = await ctx.db.insert("users", {
        name: username,
        username,
        passwordHash: "",
        role,
        status: "ACTIVE",
        createdAt: Date.now(),
      });
      const token = `tok-${username}`;
      await ctx.db.insert("userSessions", {
        userId,
        token,
        expiresAt: Date.now() + 3_600_000,
        createdAt: Date.now(),
      });
      return { userId, token };
    };
    const admin = await mkUser("admin", "admin");
    // Every payment needs an open register.
    await ctx.db.insert("cashRegisterSessions", {
      userId: admin.userId,
      username: "admin",
      openingAmount: 0,
      openedAt: Date.now(),
      status: "OPEN",
      branchId,
    });
    const seller = await mkUser("seller", "pos_seller");

    return {
      branchId,
      branch2Id,
      categoryId,
      productId,
      variantId,
      sizeId,
      customerId,
      namedCustomerId,
      admin,
      seller,
    };
  });

  const setStock = (qty: number, branchId = ids.branchId) =>
    t.mutation(internal.inventory.mutateStock, {
      productVariantId: ids.variantId,
      branchId,
      quantity: qty,
      movementType: "INITIAL_STOCK",
      referenceType: "test",
      userId: ids.admin.userId,
      username: "admin",
    });

  const setSetting = (key: string, isActive: boolean, value?: string) =>
    t.run(async (ctx) => {
      await ctx.db.insert("settings", {
        key,
        isActive,
        value,
        updatedAt: Date.now(),
      });
    });

  const stockAt = (branchId = ids.branchId) =>
    t.run(async (ctx) => {
      const row = await ctx.db
        .query("variantStock")
        .withIndex("by_branch_and_variant", (q) =>
          q.eq("branchId", branchId).eq("productVariantId", ids.variantId)
        )
        .unique();
      return row?.quantity ?? 0;
    });

  return { t, ids, setStock, setSetting, stockAt };
}

describe("sales", () => {
  test("deducts variant stock at sale time", async () => {
    const { t, ids, setStock, stockAt } = await seed();
    await setStock(10);

    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 3 }],
      payments: [{ method: "CARD", amount: 750 }],
    });

    expect(await stockAt()).toBe(7);
  });

  test("blocks oversell unless allowNegativeStock is on", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(2);

    await expect(
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 5 }],
        payments: [{ method: "CARD", amount: 1250 }],
      })
    ).rejects.toThrow(/[Ii]nsufficient stock/);

    await setSetting("allowNegativeStock", true);
    await expect(
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 5 }],
        payments: [{ method: "CARD", amount: 1250 }],
      })
    ).resolves.toBeDefined();
  });

  test("freezes costPriceAtSale even when the variant cost later changes", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);

    const saleId = await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    });

    await t.mutation(api.productVariants.update, {
      token: ids.admin.token,
      id: ids.variantId,
      costPrice: 175,
    });

    const line = await t.run(async (ctx) => {
      return await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId as Id<"sales">))
        .first();
    });
    expect(line?.costPriceAtSale).toBe(100);
  });

  test("large discount requires elevated permission", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(10);
    await setSetting("discountMaxPercentWithoutApproval", true, "10");

    // seller may not grant a 40% discount
    await expect(
      t.mutation(api.sales.create, {
        token: ids.seller.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        discount: 100, // 40% of 250
        payments: [{ method: "CARD", amount: 150 }],
      })
    ).rejects.toThrow(/[Aa]ccess denied|discount_large/);

    // admin can
    await expect(
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        discount: 100,
        payments: [{ method: "CARD", amount: 150 }],
      })
    ).resolves.toBeDefined();
  });

  test("pos_seller cannot cancel a sale", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    });
    await expect(
      t.mutation(api.sales.cancel, {
        token: ids.seller.token,
        saleId: saleId as Id<"sales">,
        reason: "nope",
      })
    ).rejects.toThrow(/[Aa]ccess denied/);
  });
});

describe("reorder level", () => {
  test("is the variant's: editing it updates stock status and the low-stock count", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(5); // seed variant has reorder level 3 → in stock, not low
    const lowCount = () =>
      t.run(async (ctx) =>
        (await ctx.db.query("stockTotals").first())?.lowCount ?? 0
      );
    expect(await lowCount()).toBe(0);

    await t.mutation(api.productVariants.update, { token: ids.admin.token, id: ids.variantId, reorderLevel: 6 });
    expect(await lowCount()).toBe(1);
    const stockRow = await t.run((ctx) => ctx.db.query("variantStock").first());
    expect(stockRow).not.toHaveProperty("reorderLevel");
    expect(stockRow?.status).toBe("LOW_STOCK");

    await t.mutation(api.productVariants.update, { token: ids.admin.token, id: ids.variantId, reorderLevel: 2 });
    expect(await lowCount()).toBe(0);
  });
});

describe("today's dashboard figures", () => {
  test("come from the day's metrics and follow a cancellation", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [{ method: "CARD", amount: 500 }],
    })) as Id<"sales">;
    let today = await t.query(api.analytics.todaySnapshot, { token: ids.admin.token });
    expect(today).toMatchObject({ revenue: 500, salesCount: 1, itemsSold: 2 });

    await t.mutation(api.sales.cancel, { token: ids.admin.token, saleId, reason: "test" });
    today = await t.query(api.analytics.todaySnapshot, { token: ids.admin.token });
    expect(today).toMatchObject({ revenue: 0, salesCount: 0, itemsSold: 0 });

    // No separate "today" counters are kept any more.
    const counters = await t.run((ctx) => ctx.db.query("counters").collect());
    expect(counters.filter((c) => c.key.startsWith("today_"))).toHaveLength(0);
  });
});

describe("customer status", () => {
  test("a disabled customer cannot buy; archived ones are hidden unless asked for", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const sell = () =>
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.namedCustomerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "CARD", amount: 250 }],
      });

    await t.mutation(api.customers.setStatus, { token: ids.admin.token, id: ids.namedCustomerId, status: "DISABLED" });
    await expect(sell()).rejects.toThrow(/disabled/);
    const audit = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).find((a) => a.action === "customer.status_changed")
    );
    expect(audit?.details).toContain('status "ACTIVE" → "DISABLED"');

    await t.mutation(api.customers.setStatus, { token: ids.admin.token, id: ids.namedCustomerId, status: "ARCHIVED" });
    const listed = async (showArchived: boolean) =>
      (
        await t.query(api.customers.listPaginated, {
          paginationOpts: { numItems: 50, cursor: null },
          showArchived,
        })
      ).page.map((c) => c._id);
    expect(await listed(false)).not.toContain(ids.namedCustomerId);
    expect(await listed(true)).toContain(ids.namedCustomerId);

    await t.mutation(api.customers.setStatus, { token: ids.admin.token, id: ids.namedCustomerId, status: "ACTIVE" });
    await sell();
  });

  test("the walk-in customer cannot be disabled", async () => {
    const { t, ids } = await seed();
    await expect(
      t.mutation(api.customers.setStatus, { token: ids.admin.token, id: ids.customerId, status: "DISABLED" })
    ).rejects.toThrow(/walk-in/);
  });
});

describe("sale status vs payment status", () => {
  test("a part-paid sale is COMPLETED and owes money through paymentStatus", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 100 }],
    })) as Id<"sales">;
    const sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale).toMatchObject({ status: "COMPLETED", paymentStatus: "PARTIALLY_PAID", balance: 150 });

    const debt = await t.query(api.analytics.customerDebt, { token: ids.admin.token });
    expect(JSON.stringify(debt)).toContain("150");
  });

  test("returning everything marks the goods RETURNED and the money REFUNDED", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [{ method: "CARD", amount: 500 }],
    })) as Id<"sales">;
    const saleItemId = await t.run(async (ctx) => {
      const it = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId))
        .first();
      return it!._id;
    });

    const returnOne = (quantity: number) =>
      t.mutation(api.salesReturns.create, {
        token: ids.admin.token,
        saleId,
        items: [{ saleItemId, quantity, reason: "WRONG_SIZE", restock: true }],
        refundMethod: "CARD",
        notes: "test",
      });

    await returnOne(1);
    let sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale).toMatchObject({ status: "PARTIALLY_RETURNED", paymentStatus: "PARTIALLY_REFUNDED" });

    await returnOne(1);
    sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale).toMatchObject({ status: "RETURNED", paymentStatus: "REFUNDED" });
  });
});

describe("returns", () => {
  test("caps quantity at sold minus already returned and restocks", async () => {
    const { t, ids, setStock, stockAt } = await seed();
    await setStock(10);

    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [{ method: "CARD", amount: 500 }],
    })) as Id<"sales">;
    expect(await stockAt()).toBe(8);

    const saleItemId = await t.run(async (ctx) => {
      const it = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId))
        .first();
      return it!._id;
    });

    await t.mutation(api.salesReturns.create, {
      token: ids.admin.token,
      saleId,
      items: [
        { saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true },
      ],
      refundMethod: "CARD",
      notes: "test",
    });
    expect(await stockAt()).toBe(9);

    // a SALE_RETURN ledger row exists
    const rows = await t.run(async (ctx) =>
      ctx.db
        .query("inventoryMovements")
        .withIndex("by_type", (q) => q.eq("movementType", "SALE_RETURN"))
        .collect()
    );
    expect(rows.length).toBe(1);

    // returning the remaining 2 (only 1 left) must fail
    await expect(
      t.mutation(api.salesReturns.create, {
        token: ids.admin.token,
        saleId,
        items: [
          { saleItemId, quantity: 2, reason: "WRONG_SIZE", restock: true },
        ],
        refundMethod: "CARD",
        notes: "test",
      })
    ).rejects.toThrow(/only 1 remain/);
  });

  test("store-credit refund writes a customerCredits row", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    // non-generic customer
    const customerId = await t.run(async (ctx) =>
      ctx.db.insert("customers", {
        name: "Jane",
        phone1: "123",
        isGeneric: false,
        status: "ACTIVE",
      })
    );
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    })) as Id<"sales">;
    const saleItemId = await t.run(async (ctx) => {
      const it = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId))
        .first();
      return it!._id;
    });
    // Store credit moves no money through the till, so it works with the register closed.
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query("cashRegisterSessions").collect()) {
        await ctx.db.patch(s._id, { status: "CLOSED" });
      }
    });
    const returnId = await t.mutation(api.salesReturns.create, {
      token: ids.admin.token,
      saleId,
      items: [{ saleItemId, quantity: 1, reason: "DEFECTIVE", restock: false }],
      refundMethod: "STORE_CREDIT",
      notes: "test",
    });
    const credits = await t.run(async (ctx) =>
      ctx.db
        .query("customerCredits")
        .withIndex("by_customer", (q) => q.eq("customerId", customerId))
        .collect()
    );
    expect(credits.length).toBe(1);
    expect(credits[0].delta).toBe(250);

    // The payment row is the refund's record; the return keeps only its lines.
    const ret = await t.query(api.salesReturns.get, { id: returnId });
    expect(ret).toMatchObject({ returnValue: 250, refunded: 250, refundMethods: ["STORE_CREDIT"] });
    expect(ret).not.toHaveProperty("refundMethod");
  });

  test("a card refund needs an open register and is listed with its method", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    })) as Id<"sales">;
    const saleItemId = await t.run(async (ctx) => {
      const it = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId))
        .first();
      return it!._id;
    });
    const refund = () =>
      t.mutation(api.salesReturns.create, {
        token: ids.admin.token,
        saleId,
        items: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
        refundMethod: "CARD",
        notes: "test",
      });

    const [session] = await t.run((ctx) => ctx.db.query("cashRegisterSessions").collect());
    await t.run((ctx) => ctx.db.patch(session._id, { status: "CLOSED" }));
    await expect(refund()).rejects.toThrow(/open cash register/i);

    await t.run((ctx) => ctx.db.patch(session._id, { status: "OPEN" }));
    await refund();
    const { page } = await t.query(api.salesReturns.listPaged, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page[0]).toMatchObject({ returnValue: 250, refunded: 250, refundMethods: ["CARD"] });
  });
});

describe("money on returns, cancellations and prices", () => {
  const firstLine = (t: Awaited<ReturnType<typeof seed>>["t"], saleId: Id<"sales">) =>
    t.run(async (ctx) => {
      const it = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId))
        .first();
      return it!._id;
    });
  const refundRows = (t: Awaited<ReturnType<typeof seed>>["t"], saleId: Id<"sales">) =>
    t.run(async (ctx) =>
      (
        await ctx.db
          .query("payments")
          .withIndex("by_sale", (q) => q.eq("saleId", saleId))
          .collect()
      ).filter((p) => p.kind === "refund")
    );

  test("returning goods from an unpaid sale clears the debt and gives no money back", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
    })) as Id<"sales">;
    const saleItemId = await firstLine(t, saleId);

    const preview = await t.query(api.salesReturns.previewReturn, {
      token: ids.admin.token,
      saleId,
      items: [{ saleItemId, quantity: 1 }],
    });
    expect(preview).toEqual({ returnValue: 250, debtCleared: 250, refund: 0 });

    await t.mutation(api.salesReturns.create, {
      token: ids.admin.token,
      saleId,
      items: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
      refundMethod: "CASH",
    });
    expect(await refundRows(t, saleId)).toHaveLength(0);
    const sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale).toMatchObject({
      status: "PARTIALLY_RETURNED",
      paymentStatus: "UNPAID",
      paidAmount: 0,
      balance: 250,
    });

    // The debt report and the customer's figures follow.
    const debt = await t.query(api.analytics.customerDebt, { token: ids.admin.token });
    expect(debt).toEqual([expect.objectContaining({ balance: 250 })]);
    const customer = await t.query(api.customers.getById, { id: ids.namedCustomerId });
    expect(customer?.stats).toMatchObject({ totalPurchases: 250, outstandingDebt: 250 });
  });

  test("on a part-paid sale only what goes beyond the debt is refunded", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [{ method: "CASH", amount: 300 }],
    })) as Id<"sales">;
    const saleItemId = await firstLine(t, saleId);

    // 500 owed, 300 paid (200 owed). Returning everything: 200 clears the debt, 300 back.
    await t.mutation(api.salesReturns.create, {
      token: ids.admin.token,
      saleId,
      items: [{ saleItemId, quantity: 2, reason: "WRONG_SIZE", restock: true }],
      refundMethod: "CASH",
    });
    const refunds = await refundRows(t, saleId);
    expect(refunds.map((r) => r.amount)).toEqual([-300]);
    const sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale).toMatchObject({ status: "RETURNED", paymentStatus: "REFUNDED", paidAmount: 0, balance: 0 });
  });

  test("a return refunds what was paid for the line, with its IVA and sale discount", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(10);
    await setSetting("taxRatePercent", true, "16");
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      discount: 50, // 450 net + 16% = 522
      payments: [{ method: "CARD", amount: 522 }],
    })) as Id<"sales">;
    const saleItemId = await firstLine(t, saleId);
    await t.mutation(api.salesReturns.create, {
      token: ids.admin.token,
      saleId,
      items: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
      refundMethod: "CARD",
    });
    expect((await refundRows(t, saleId)).map((r) => r.amount)).toEqual([-261]);
  });

  test("an exchange on a paid sale moves the credit to the replacement", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 250 }],
    })) as Id<"sales">;
    const saleItemId = await firstLine(t, saleId);
    const res = await t.mutation(api.salesReturns.exchange, {
      token: ids.admin.token,
      saleId,
      returnItems: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
      replacementItems: [{ productVariantId: ids.variantId, quantity: 1 }],
      refundMethod: "CASH",
    });
    expect(res.difference).toBe(0);
    const [original, replacement] = await t.run(async (ctx) => [
      await ctx.db.get(saleId),
      await ctx.db.get(res.replacementSaleId),
    ]);
    expect(original).toMatchObject({ status: "RETURNED", paidAmount: 0, balance: 0 });
    expect(replacement).toMatchObject({ discount: 0, total: 250, paidAmount: 250, paymentStatus: "PAID" });
    // The customer bought one item: lifetime spend counts it once.
    const customer = await t.query(api.customers.getById, { id: ids.namedCustomerId });
    expect(customer?.stats.totalPurchases).toBe(250);
  });

  test("an exchange on an unpaid sale gives no free credit", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
    })) as Id<"sales">;
    const saleItemId = await firstLine(t, saleId);
    const res = await t.mutation(api.salesReturns.exchange, {
      token: ids.admin.token,
      saleId,
      returnItems: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
      replacementItems: [{ productVariantId: ids.variantId, quantity: 1 }],
      refundMethod: "CASH",
    });
    const replacement = await t.run((ctx) => ctx.db.get(res.replacementSaleId));
    expect(replacement).toMatchObject({ total: 250, paidAmount: 0, balance: 250 });
    const customer = await t.query(api.customers.getById, { id: ids.namedCustomerId });
    expect(customer?.stats).toMatchObject({ totalPurchases: 250, outstandingDebt: 250 });
  });

  test("cancelling refunds every method it was paid with", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [
        { method: "CARD", amount: 200 },
        { method: "MPESA", amount: 100 },
        { method: "CASH", amount: 200 },
      ],
    })) as Id<"sales">;
    await t.mutation(api.sales.cancel, { token: ids.admin.token, saleId, reason: "test" });
    const refunds = await refundRows(t, saleId);
    expect(
      Object.fromEntries(refunds.map((r) => [r.method, r.amount]))
    ).toEqual({ CARD: -200, MPESA: -100, CASH: -200 });
    const sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale).toMatchObject({ status: "CANCELLED", paymentStatus: "REFUNDED", paidAmount: 0, balance: 0 });
  });

  test("cancelling does not hand back money already turned into store credit", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 300 }], // 50 over, kept as store credit
      keepChangeAsCredit: true,
    })) as Id<"sales">;
    await t.mutation(api.sales.cancel, { token: ids.admin.token, saleId, reason: "test" });
    expect((await refundRows(t, saleId)).map((r) => r.amount)).toEqual([-250]);
  });

  test("a changed price needs discount authority and is audited", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(10);
    await setSetting("discountMaxPercentWithoutApproval", true, "10");
    const sell = (token: string, unitPrice: number) =>
      t.mutation(api.sales.create, {
        token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1, unitPrice }],
        payments: [{ method: "CARD", amount: unitPrice }],
      });

    // The seller cannot sell the 250 item for 50 (an 80% cut) …
    await expect(sell(ids.seller.token, 50)).rejects.toThrow(/[Aa]ccess denied|discount/);
    // … but the list price is fine for anyone.
    await expect(sell(ids.seller.token, 250)).resolves.toBeDefined();
    // The admin can, and the audit log says so.
    const saleId = await sell(ids.admin.token, 50);
    const audit = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).find(
        (a) => a.action === "sale.created" && a.entityId === saleId
      )
    );
    expect(audit?.details).toMatch(/price changed on 1 line/);
  });
});

describe("stock transfers", () => {
  test("receive emits paired TRANSFER_OUT and TRANSFER_IN", async () => {
    const { t, ids, setStock, stockAt } = await seed();
    await setStock(10, ids.branchId);

    const transferId = (await t.mutation(api.stockTransfers.create, {
      token: ids.admin.token,
      sourceBranchId: ids.branchId,
      destinationBranchId: ids.branch2Id,
      items: [{ productVariantId: ids.variantId, quantity: 4 }],
      submit: true,
    })) as Id<"stockTransfers">;

    await t.mutation(api.stockTransfers.receive, {
      token: ids.admin.token,
      transferId,
    });

    expect(await stockAt(ids.branchId)).toBe(6);
    expect(await stockAt(ids.branch2Id)).toBe(4);

    const types = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("inventoryMovements")
        .withIndex("by_ref", (q) =>
          q.eq("referenceType", "stock_transfer").eq("referenceId", transferId)
        )
        .collect();
      return rows.map((r) => r.movementType).sort();
    });
    expect(types).toEqual(["TRANSFER_IN", "TRANSFER_OUT"]);
  });
});

describe("purchase orders", () => {
  test("partial receive moves to partially_received then completed, with landed cost", async () => {
    const { t, ids, stockAt } = await seed();
    const supplierId = await t.run(async (ctx) =>
      ctx.db.insert("suppliers", {
        name: "Acme",
        status: "ACTIVE",
        createdAt: Date.now(),
      })
    );

    const poId = (await t.mutation(api.purchaseOrders.create, {
      token: ids.admin.token,
      supplierId,
      branchId: ids.branchId,
      orderDate: Date.now(),
      items: [
        { productVariantId: ids.variantId, quantityOrdered: 100, unitCost: 90 },
      ],
    })) as Id<"purchaseOrders">;

    await t.mutation(api.purchaseOrders.updateStatus, {
      token: ids.admin.token,
      id: poId,
      status: "SENT",
    });

    await t.mutation(api.purchaseOrders.receiveItems, {
      token: ids.admin.token,
      id: poId,
      items: [{ productVariantId: ids.variantId, quantityReceived: 60 }],
    });
    let po = await t.run(async (ctx) => ctx.db.get(poId));
    expect(po?.status).toBe("PARTIALLY_RECEIVED");
    expect(await stockAt()).toBe(60);

    await t.mutation(api.purchaseOrders.receiveItems, {
      token: ids.admin.token,
      id: poId,
      items: [{ productVariantId: ids.variantId, quantityReceived: 40 }],
    });
    po = await t.run(async (ctx) => ctx.db.get(poId));
    expect(po?.status).toBe("COMPLETED");
    expect(await stockAt()).toBe(100);

    const movement = await t.run(async (ctx) => {
      const rows = await ctx.db
        .query("inventoryMovements")
        .withIndex("by_type", (q) => q.eq("movementType", "PURCHASE"))
        .collect();
      return rows[0];
    });
    expect(movement?.costPerUnit).toBe(90);
  });
});

describe("delivery fees", () => {
  test("pos_seller is denied", async () => {
    const { t, ids } = await seed();
    await expect(
      t.mutation(api.deliveryFees.create, {
        token: ids.seller.token,
        name: "Zone A",
        fee: 50,
        active: true,
      })
    ).rejects.toThrow(/[Aa]ccess denied/);
  });

  test("admin can create, and it writes a deliveryFee audit row", async () => {
    const { t, ids } = await seed();
    const feeId = (await t.mutation(api.deliveryFees.create, {
      token: ids.admin.token,
      name: "Zone A",
      fee: 50,
      active: true,
    })) as Id<"deliveryFees">;

    const auditRow = await t.run(async (ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "deliveryFee.created"))
        .first()
    );
    expect(auditRow?.entityType).toBe("deliveryFee");
    expect(auditRow?.entityId).toBe(feeId);
  });

  test("remove throws when a sale references the fee", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const feeId = (await t.mutation(api.deliveryFees.create, {
      token: ids.admin.token,
      name: "Zone A",
      fee: 50,
      active: true,
    })) as Id<"deliveryFees">;

    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 300 }],
      isDelivery: true,
      deliveryFeeId: feeId,
    });

    await expect(
      t.mutation(api.deliveryFees.remove, { token: ids.admin.token, id: feeId })
    ).rejects.toThrow(/used in sales/);
  });
});

describe("stock adjustments", () => {
  test("pos_seller is denied", async () => {
    const { t, ids } = await seed();
    await expect(
      t.mutation(api.stockAdjustments.create, {
        token: ids.seller.token,
        branchId: ids.branchId,
        productVariantId: ids.variantId,
        reason: "PHYSICAL_COUNT",
        newQuantity: 5,
        notes: "count",
      })
    ).rejects.toThrow(/[Aa]ccess denied/);
  });

  test("physical count sets absolute quantity and writes a ledger row", async () => {
    const { t, ids, setStock, stockAt } = await seed();
    await setStock(10);
    await t.mutation(api.stockAdjustments.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      productVariantId: ids.variantId,
      reason: "PHYSICAL_COUNT",
      newQuantity: 7,
      notes: "counted 7",
    });
    expect(await stockAt()).toBe(7);
    const { page } = await t.query(api.stockAdjustments.listPaged, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(page).toHaveLength(1);
    expect(page[0]).toMatchObject({
      reason: "PHYSICAL_COUNT",
      previousQuantity: 10,
      adjustmentQuantity: -3,
      newQuantity: 7,
      notes: "counted 7",
    });
    // The movement is the only record of the adjustment.
    expect(Object.keys(schema.tables)).not.toContain("stockAdjustments");
  });
});

describe("customer profile & tier", () => {
  test("a sale creates an INFERIDO size profile row", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("customerSizeProfiles")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.namedCustomerId))
        .collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].categoryId).toBe(ids.categoryId);
    expect(rows[0].sizeId).toBe(ids.sizeId);
    expect(rows[0].confidence).toBe("INFERIDO");
  });

  test("a second sale of a different size flips the INFERIDO row", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const { variantLId } = await t.run(async (ctx) => {
      await ctx.db.insert("sizes", {
        name: "L",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const variantLId = await ctx.db.insert("productVariants", {
        productId: ids.productId,
        sku: "BASIC-BLK-L",
        sizeId: await findOrCreateSize(ctx, "L"),
        colorId: await findOrCreateColor(ctx, "Black"),
        costPrice: 100,
        sellingPrice: 250,
        reorderLevel: 3,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { variantLId };
    });
    await t.mutation(internal.inventory.mutateStock, {
      productVariantId: variantLId,
      branchId: ids.branchId,
      quantity: 10,
      movementType: "INITIAL_STOCK",
      referenceType: "test",
      userId: ids.admin.userId,
      username: "admin",
    });

    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    });
    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: variantLId, quantity: 2 }],
      payments: [{ method: "CARD", amount: 500 }],
    });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("customerSizeProfiles")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.namedCustomerId))
        .collect()
    );
    expect(rows).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(rows[0].sizeId)))?.name).toBe("L");
  });

  test("a CONFIRMADO row survives a contradicting sale untouched", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    await t.run(async (ctx) => {
      await ctx.db.insert("customerSizeProfiles", {
        customerId: ids.namedCustomerId,
        categoryId: ids.categoryId,
        sizeId: ids.sizeId,
        confidence: "CONFIRMADO",
        updatedAt: Date.now(),
      });
    });

    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 3 }],
      payments: [{ method: "CARD", amount: 750 }],
    });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("customerSizeProfiles")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.namedCustomerId))
        .collect()
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].confidence).toBe("CONFIRMADO");
    expect((await t.run((ctx) => ctx.db.get(rows[0].sizeId)))?.name).toBe("M");
  });

  test("a full return removes that size's backing", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    })) as Id<"sales">;

    let rows = await t.run((ctx) =>
      ctx.db
        .query("customerSizeProfiles")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.namedCustomerId))
        .collect()
    );
    expect(rows).toHaveLength(1);

    const saleItemId = await t.run(async (ctx) => {
      const it = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId))
        .first();
      return it!._id;
    });
    await t.mutation(api.salesReturns.create, {
      token: ids.admin.token,
      saleId,
      items: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
      refundMethod: "CARD",
      notes: "test",
    });

    rows = await t.run((ctx) =>
      ctx.db
        .query("customerSizeProfiles")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.namedCustomerId))
        .collect()
    );
    expect(rows).toHaveLength(0);
  });

  test("an exchange recomputes the profile without an explicit hook call", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const { variantLId } = await t.run(async (ctx) => {
      await ctx.db.insert("sizes", {
        name: "L",
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      const variantLId = await ctx.db.insert("productVariants", {
        productId: ids.productId,
        sku: "BASIC-BLK-L",
        sizeId: await findOrCreateSize(ctx, "L"),
        colorId: await findOrCreateColor(ctx, "Black"),
        costPrice: 100,
        sellingPrice: 250,
        reorderLevel: 3,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      return { variantLId };
    });
    await t.mutation(internal.inventory.mutateStock, {
      productVariantId: variantLId,
      branchId: ids.branchId,
      quantity: 10,
      movementType: "INITIAL_STOCK",
      referenceType: "test",
      userId: ids.admin.userId,
      username: "admin",
    });

    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    })) as Id<"sales">;
    const saleItemId = await t.run(async (ctx) => {
      const it = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId))
        .first();
      return it!._id;
    });

    await t.mutation(api.salesReturns.exchange, {
      token: ids.admin.token,
      saleId,
      returnItems: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
      replacementItems: [{ productVariantId: variantLId, quantity: 1 }],
      refundMethod: "CARD",
      notes: "exchange",
    });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("customerSizeProfiles")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.namedCustomerId))
        .collect()
    );
    expect(rows).toHaveLength(1);
    expect((await t.run((ctx) => ctx.db.get(rows[0].sizeId)))?.name).toBe("L");
  });

  test("tier transitions NOVO -> REGULAR -> VIP as thresholds are met", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(10);
    await setSetting("tierNovoMaxSales", true, "1");
    await setSetting("tierVipMinSpend12m", true, "600");

    const sell = () =>
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.namedCustomerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "CARD", amount: 250 }],
      });

    await sell();
    let customer = await t.run((ctx) => ctx.db.get(ids.namedCustomerId));
    expect(customer?.tier ?? "NOVO").toBe("NOVO");

    await sell();
    customer = await t.run((ctx) => ctx.db.get(ids.namedCustomerId));
    expect(customer?.tier).toBe("REGULAR");

    await sell();
    customer = await t.run((ctx) => ctx.db.get(ids.namedCustomerId));
    expect(customer?.tier).toBe("VIP");
  });

  test("the generic customer never gets a profile row or a tier", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId, // generic walk-in
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query("customerSizeProfiles")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.customerId))
        .collect()
    );
    expect(rows).toHaveLength(0);
    const customer = await t.run((ctx) => ctx.db.get(ids.customerId));
    expect(customer?.tier).toBeUndefined();
  });

  test("re-running an unchanged sale twice is idempotent: no duplicate rows or audit entries", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);

    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    });
    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 250 }],
    });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("customerSizeProfiles")
        .withIndex("by_customer", (q) => q.eq("customerId", ids.namedCustomerId))
        .collect()
    );
    expect(rows).toHaveLength(1); // patched in place, never duplicated

    const tierChanges = await t.run((ctx) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", "customer.tier_changed"))
        .collect()
    );
    // exactly one real transition (NOVO -> REGULAR on the 2nd sale)
    expect(tierChanges).toHaveLength(1);
  });

  test("getPosContext returns exactly 3 recent sales with populated lines", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.namedCustomerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "CARD", amount: 250 }],
      });
    }
    const context = await t.query(api.customers.getPosContext, {
      customerId: ids.namedCustomerId,
    });
    expect(context.recentSales).toHaveLength(3);
    for (const sale of context.recentSales) {
      expect(sale.lines.length).toBeGreaterThan(0);
    }
  });

  test("Tier 3: topCategoryName/topColorName are derived from purchase history, never a form field", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [{ method: "CARD", amount: 500 }],
    });

    const customer = await t.run((ctx) => ctx.db.get(ids.namedCustomerId));
    expect(customer?.topCategoryName).toBe("T-Shirts");
    expect(customer?.topColorName).toBe("Black");

    const context = await t.query(api.customers.getPosContext, {
      customerId: ids.namedCustomerId,
    });
    expect(context.customer?.topCategoryName).toBe("T-Shirts");
    expect(context.customer?.topColorName).toBe("Black");
    // Derived stats present and sane — no returns/no tenure yet.
    expect(context.money.returnRatePercent).toBe(0);
    expect(context.money.purchaseFrequencyPerMonth).toBeGreaterThan(0);
  });

  test("Tier 2: preferredCategoryIds and preferredBrands round-trip through updateProfile", async () => {
    const { t, ids } = await seed();
    await t.mutation(api.customers.updateProfile, {
      token: ids.admin.token,
      id: ids.namedCustomerId,
      preferredCategoryIds: [ids.categoryId],
      preferredBrands: ["Nike", "Adidas"],
    });
    const context = await t.query(api.customers.getPosContext, {
      customerId: ids.namedCustomerId,
    });
    expect(context.customer?.preferredCategoryIds).toEqual([ids.categoryId]);
    expect(context.customer?.preferredCategoryNames).toEqual(["T-Shirts"]);
    expect(context.customer?.preferredBrands).toEqual(["Nike", "Adidas"]);
  });
});

describe("document numbers and customer pages", () => {
  test("a document made just after midnight on 1 January in Maputo gets the new year", async () => {
    const { t } = await seed();
    // 31 Dec 2026 22:30 UTC = 1 Jan 2027 00:30 in Maputo.
    const number = await t.run(async (ctx) => {
      const { nextDocumentNumber } = await import("./lib/numbering");
      return await nextDocumentNumber(ctx, "SALE", Date.UTC(2026, 11, 31, 22, 30));
    });
    expect(number).toBe("FT 2027/000001");
  });

  test("customer pages stay full when archived customers sit between them", async () => {
    const { t, ids } = await seed();
    await t.run(async (ctx) => {
      for (let i = 0; i < 20; i++) {
        await ctx.db.insert("customers", {
          name: `C${i}`,
          phone1: `84000${i}`,
          isGeneric: false,
          status: i % 2 === 0 ? "ARCHIVED" : i % 3 === 0 ? "DISABLED" : "ACTIVE",
        });
      }
    });
    // The 2 seeded customers + the 10 new ones not archived; archived are skipped.
    const all: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    for (;;) {
      const res: { page: { name: string; status: string }[]; isDone: boolean; continueCursor: string } =
        await t.query(api.customers.listPaginated, { paginationOpts: { numItems: 4, cursor } });
      pages++;
      if (!res.isDone) expect(res.page).toHaveLength(4);
      expect(res.page.every((c) => c.status !== "ARCHIVED")).toBe(true);
      all.push(...res.page.map((c) => c.name));
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    expect(new Set(all).size).toBe(all.length);
    expect(all.slice(0, 3)).toEqual(["C19", "C17", "C15"]); // newest first
    expect(all).toContain("C9"); // DISABLED is listed
    const withArchived = await t.query(api.customers.listPaginated, {
      paginationOpts: { numItems: 50, cursor: null },
      showArchived: true,
    });
    expect(withArchived.page.length).toBe(all.length + 10);
    void ids;
  });
});

describe("sales totals (daily and monthly)", () => {
  const firstLine = (t: Awaited<ReturnType<typeof seed>>["t"], saleId: Id<"sales">) =>
    t.run(async (ctx) => {
      const it = await ctx.db
        .query("saleItems")
        .withIndex("by_sale", (q) => q.eq("saleId", saleId))
        .first();
      return it!._id;
    });

  async function busyDay() {
    const s = await seed();
    const { t, ids, setStock } = s;
    await setStock(50);
    const sell = (quantity: number, payments: { method: "CASH" | "CARD"; amount: number }[], customerId = ids.namedCustomerId) =>
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId,
        items: [{ productVariantId: ids.variantId, quantity }],
        payments,
      }) as Promise<Id<"sales">>;
    const paidCash = await sell(2, [{ method: "CASH", amount: 500 }]);
    const unpaid = await sell(1, []);
    await t.mutation(api.payments.add, { token: ids.admin.token, saleId: unpaid, method: "CARD", amount: 100 });
    const toCancel = await sell(1, [{ method: "CARD", amount: 250 }], ids.customerId);
    await t.mutation(api.sales.cancel, { token: ids.admin.token, saleId: toCancel, reason: "test" });
    await t.mutation(api.salesReturns.create, {
      token: ids.admin.token,
      saleId: paidCash,
      items: [{ saleItemId: await firstLine(t, paidCash), quantity: 1, reason: "WRONG_SIZE", restock: true }],
      refundMethod: "CASH",
    });
    const exchanged = await sell(1, [{ method: "CASH", amount: 250 }]);
    await t.mutation(api.salesReturns.exchange, {
      token: ids.admin.token,
      saleId: exchanged,
      returnItems: [{ saleItemId: await firstLine(t, exchanged), quantity: 1, reason: "WRONG_SIZE", restock: true }],
      replacementItems: [{ productVariantId: ids.variantId, quantity: 1 }],
      refundMethod: "CASH",
    });
    return s;
  }

  const dayRange = () => {
    const now = Date.now();
    return { start: now - 60 * 60 * 1000, end: now + 60 * 60 * 1000 };
  };

  test("follow every change to a sale", async () => {
    const { t, ids } = await busyDay();
    const m = await t.query(api.analytics.getDashboardMetrics, { token: ids.admin.token, ...dayRange() });
    // Sales kept: 500 (cash) + 250 (unpaid, 100 paid) + 250 (exchanged) + 250 (replacement).
    expect(m).toMatchObject({
      salesCount: 4,
      grossRevenue: 1250,
      itemsSold: 5,
      returnsCount: 2,
      refundAmount: 500,
      activeCustomersCount: 1,
      outstandingDebt: 150,
      partiallyPaidCount: 1,
    });
    expect(m.paymentMethodsBreakdown.CARD).toEqual({ amount: 100, count: 1 }); // the cancelled card sale is gone
    expect(m.topProducts).toEqual([{ name: "Basic Tee", qty: 5 }]);
    const today = await t.query(api.analytics.todaySnapshot, { token: ids.admin.token });
    expect(today).toMatchObject({ revenue: 1250, salesCount: 4, returnsCount: 2 });
  });

  test("match a rebuild from the sales, day and month alike", async () => {
    const { t, ids } = await busyDay();
    const read = () =>
      t.run(async (ctx) => {
        const strip = <T extends { _id: unknown; _creationTime: unknown; updatedAt: unknown }>(rows: T[]) =>
          rows.map(({ _id, _creationTime, updatedAt, ...rest }) => rest);
        return {
          daily: strip(await ctx.db.query("dailyMetrics").collect()),
          monthly: strip(await ctx.db.query("monthlyMetrics").collect()),
        };
      });
    const live = await read();
    expect(live.daily).toHaveLength(1);
    // The month row holds the same totals as its only day.
    const { dateString, ...dayTotals } = live.daily[0];
    const { month, ...monthTotals } = live.monthly[0];
    expect(month).toBe(dateString.slice(0, 7));
    expect(monthTotals).toEqual(dayTotals);

    for (const phase of ["clearDaily", "clearMonthly", "sales", "returns"] as const) {
      let cursor: string | null = null;
      for (;;) {
        const r: { cursor: string; isDone: boolean } = await t.mutation(internal.metrics.rebuildSalesMetrics, { phase, cursor });
        if (r.isDone) break;
        cursor = r.cursor;
      }
    }
    expect(await read()).toEqual(live);
    void ids;
  });

  test("a whole month is read from its month row, a branch from its own rows", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    await setStock(10, ids.branch2Id);
    for (const branchId of [ids.branchId, ids.branch2Id]) {
      await t.run(async (ctx) => {
        await ctx.db.insert("cashRegisterSessions", {
          userId: ids.admin.userId,
          username: "admin",
          openingAmount: 0,
          openedAt: Date.now(),
          status: "OPEN",
          branchId,
        });
      });
      await t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: branchId === ids.branchId ? 1 : 2 }],
        payments: [{ method: "CARD", amount: branchId === ids.branchId ? 250 : 500 }],
      });
    }
    // Drop the day rows: a full-month range must still add up, from the month rows.
    await t.run(async (ctx) => {
      for (const r of await ctx.db.query("dailyMetrics").collect()) await ctx.db.delete(r._id);
    });
    const now = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 2 * 60 * 60 * 1000;
    const monthEnd = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1) - 2 * 60 * 60 * 1000 - 1;
    const all = await t.query(api.analytics.getDashboardMetrics, {
      token: ids.admin.token,
      start: monthStart,
      end: monthEnd,
    });
    expect(all).toMatchObject({ grossRevenue: 750, salesCount: 2 });
    expect(all.branchLeaderboard.map((b) => b.revenue)).toEqual([500, 250]);
    const second = await t.query(api.analytics.getDashboardMetrics, {
      token: ids.admin.token,
      start: monthStart,
      end: monthEnd,
      branchId: ids.branch2Id,
    });
    expect(second).toMatchObject({ grossRevenue: 500, salesCount: 1, branchLeaderboard: [] });
  });
});

describe("stock totals", () => {
  test("follow stock moves, price changes, deactivation and deletion, and match a rebuild", async () => {
    const { t, ids, setStock } = await seed();
    const totals = () =>
      t.query(api.analytics.inventoryValuation, { token: ids.admin.token, branchId: ids.branchId });
    await setStock(10); // cost 100, price 250
    expect(await totals()).toMatchObject({ units: 10, costValue: 1000, retailValue: 2500, lowStockCount: 0 });

    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 8 }],
      payments: [{ method: "CARD", amount: 2000 }],
    });
    expect(await totals()).toMatchObject({ units: 2, costValue: 200, lowStockCount: 1 });
    const low = await t.query(api.stock.lowStockSummary, { token: ids.admin.token, branchId: ids.branchId });
    expect(low).toMatchObject({ lowStockCount: 1, outOfStockCount: 0 });
    expect(low.items).toHaveLength(1);

    await t.mutation(api.productVariants.update, { token: ids.admin.token, id: ids.variantId, sellingPrice: 300 });
    expect(await totals()).toMatchObject({ retailValue: 600 });

    const live = await t.run((ctx) => ctx.db.query("stockTotals").collect());
    for (const phase of ["clear", "rows"] as const) {
      let cursor: string | null = null;
      for (;;) {
        const r: { cursor: string; isDone: boolean } = await t.mutation(internal.metrics.rebuildStockTotals, { phase, cursor });
        if (r.isDone) break;
        cursor = r.cursor;
      }
    }
    const rebuilt = await t.run((ctx) => ctx.db.query("stockTotals").collect());
    const strip = (rows: typeof live) => rows.map(({ _id, _creationTime, updatedAt, ...r }) => r);
    expect(strip(rebuilt)).toEqual(strip(live));

    await t.mutation(api.productVariants.update, { token: ids.admin.token, id: ids.variantId, active: false });
    expect(await totals()).toMatchObject({ units: 0, costValue: 0, retailValue: 0, lowStockCount: 0 });
  });
});

describe("lost sales by reason", () => {
  test("are running counts that follow new and lost demands", async () => {
    const { t, ids } = await seed();
    const a = await t.mutation(api.demands.create, { token: ids.admin.token, description: "Red dress M", reason: "SIZE" });
    const b = await t.mutation(api.demands.create, { token: ids.admin.token, description: "Cheaper jeans" });
    await t.mutation(api.demands.create, { token: ids.admin.token, description: "Blue", reason: "COLOR" });
    expect(await t.query(api.demands.countByReason, {})).toEqual({ SIZE: 1, COLOR: 1 });
    await t.mutation(api.demands.setStage, { token: ids.admin.token, id: b, stage: "LOST", reason: "PRICE" });
    await t.mutation(api.demands.setStage, { token: ids.admin.token, id: a, stage: "LOST", reason: "STOCK" });
    expect(await t.query(api.demands.countByReason, {})).toEqual({ STOCK: 1, COLOR: 1, PRICE: 1 });
  });
});

describe("sales list", () => {
  test("pages on the server, filters and finds by number or customer", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(50);
    for (let i = 0; i < 5; i++) {
      await t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: i % 2 ? ids.namedCustomerId : ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: i === 4 ? [] : [{ method: "CARD", amount: 250 }],
      });
    }
    const range = { start: Date.now() - 3_600_000, end: Date.now() + 3_600_000 };
    const first = await t.query(api.sales.listPaged, { ...range, paginationOpts: { numItems: 2, cursor: null } });
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    const unpaid = await t.query(api.sales.listPaged, {
      ...range,
      paymentStatus: "UNPAID",
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(unpaid.page).toHaveLength(1);
    const byName = await t.query(api.sales.listPaged, { ...range, search: "Jane", paginationOpts: { numItems: 10, cursor: null } });
    expect(byName.page).toHaveLength(2);
    const year = new Date(Date.now() + 2 * 3_600_000).getUTCFullYear();
    const byNumber = await t.query(api.sales.listPaged, { ...range, search: "3", paginationOpts: { numItems: 10, cursor: null } });
    expect(byNumber.page.map((s) => s.saleNumber)).toEqual([`FT ${year}/000003`]);
    expect(await t.query(api.sales.rangeTotals, range)).toMatchObject({ count: 5, revenue: 1250, outstanding: 250 });
    expect(await t.query(api.sales.listForExport, range)).toHaveLength(5);
  });
});

describe("change at the till", () => {
  const cashIn = (t: Awaited<ReturnType<typeof seed>>["t"], saleId: Id<"sales">) =>
    t.run(async (ctx) =>
      (await ctx.db.query("payments").withIndex("by_sale", (q) => q.eq("saleId", saleId)).collect()).map(
        (p) => [p.method, p.amount]
      )
    );
  const credits = (t: Awaited<ReturnType<typeof seed>>["t"], customerId: Id<"customers">) =>
    t.run(async (ctx) =>
      (await ctx.db.query("customerCredits").withIndex("by_customer", (q) => q.eq("customerId", customerId)).collect())
        .reduce((s, c) => s + c.delta, 0)
    );

  test("cash over the amount due is change: only the amount due is recorded", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    for (const customerId of [ids.customerId, ids.namedCustomerId]) {
      const saleId = (await t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "CASH", amount: 300 }],
      })) as Id<"sales">;
      expect(await cashIn(t, saleId)).toEqual([["CASH", 250]]);
      const sale = await t.run((ctx) => ctx.db.get(saleId));
      expect(sale).toMatchObject({ paidAmount: 250, balance: 0, paymentStatus: "PAID" });
    }
    expect(await credits(t, ids.namedCustomerId)).toBe(0);
  });

  test("a split payment takes the change off the cash part", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [
        { method: "CARD", amount: 300 },
        { method: "CASH", amount: 500 },
      ],
    })) as Id<"sales">;
    expect(await cashIn(t, saleId)).toEqual([
      ["CARD", 300],
      ["CASH", 200],
    ]);
  });

  test("card and mobile payments cannot go over the amount due", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    await expect(
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "MPESA", amount: 300 }],
      })
    ).rejects.toThrow(/only cash can give change/);
  });

  test("change kept on purpose becomes store credit, for named customers only", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const sell = (customerId: Id<"customers">) =>
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "CASH", amount: 300 }],
        keepChangeAsCredit: true,
      }) as Promise<Id<"sales">>;
    const saleId = await sell(ids.namedCustomerId);
    expect(await cashIn(t, saleId)).toEqual([["CASH", 300]]);
    expect(await credits(t, ids.namedCustomerId)).toBe(50);
    await expect(sell(ids.customerId)).rejects.toThrow(/named customer/);
  });

  test("a later payment takes only what is owed and reports the change", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.namedCustomerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CASH", amount: 100 }],
    })) as Id<"sales">;
    const res = await t.mutation(api.payments.add, { token: ids.admin.token, saleId, method: "CASH", amount: 200 });
    expect(res).toEqual({ recorded: 150, change: 50 });
    await expect(
      t.mutation(api.payments.add, { token: ids.admin.token, saleId, method: "CARD", amount: 10 })
    ).rejects.toThrow(/Nothing is owed/);
    // The drawer holds what was kept: 100 + 150.
    const [session] = await t.run((ctx) => ctx.db.query("cashRegisterSessions").collect());
    const closed = await t.mutation(api.cashRegister.closeSession, {
      token: ids.admin.token,
      sessionId: session._id,
      actualCash: 250,
    });
    expect(closed.difference).toBe(0);
  });
});

describe("stock counts, transfers and closed registers", () => {
  test("a sale after a shelf is counted survives the count closing", async () => {
    const { t, ids, setStock, stockAt } = await seed();
    await setStock(10);
    const countId = await t.mutation(api.stockCounts.start, { token: ids.admin.token, branchId: ids.branchId });
    // Counted 9 (one missing) while the system said 10 …
    await t.mutation(api.stockCounts.recordCounts, {
      token: ids.admin.token,
      countId,
      counts: [{ productVariantId: ids.variantId, countedQuantity: 9 }],
    });
    // … then two sold before closing.
    await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [{ method: "CARD", amount: 500 }],
    });
    await t.mutation(api.stockCounts.close, { token: ids.admin.token, countId });
    expect(await stockAt()).toBe(7); // 9 counted − 2 sold, not 9
  });

  test("sent goods leave the source at once; cancelling brings them back", async () => {
    const { t, ids, setStock, stockAt } = await seed();
    await setStock(10);
    const make = () =>
      t.mutation(api.stockTransfers.create, {
        token: ids.admin.token,
        sourceBranchId: ids.branchId,
        destinationBranchId: ids.branch2Id,
        items: [{ productVariantId: ids.variantId, quantity: 4 }],
        submit: true,
      });
    const sent = await make();
    await t.mutation(api.stockTransfers.setStatus, { token: ids.admin.token, transferId: sent, status: "IN_TRANSIT" });
    expect(await stockAt()).toBe(6);
    await expect(
      t.mutation(api.stockTransfers.setStatus, { token: ids.admin.token, transferId: sent, status: "PENDING" })
    ).rejects.toThrow(/Cancel it/);
    await t.mutation(api.stockTransfers.receive, { token: ids.admin.token, transferId: sent });
    expect(await stockAt()).toBe(6); // not taken out twice
    expect(await stockAt(ids.branch2Id)).toBe(4);

    const cancelled = await make();
    await t.mutation(api.stockTransfers.setStatus, { token: ids.admin.token, transferId: cancelled, status: "IN_TRANSIT" });
    expect(await stockAt()).toBe(2);
    await t.mutation(api.stockTransfers.setStatus, { token: ids.admin.token, transferId: cancelled, status: "CANCELLED" });
    expect(await stockAt()).toBe(6);
  });

  test("goods in transit cannot be sold at the source", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(5);
    const transferId = await t.mutation(api.stockTransfers.create, {
      token: ids.admin.token,
      sourceBranchId: ids.branchId,
      destinationBranchId: ids.branch2Id,
      items: [{ productVariantId: ids.variantId, quantity: 5 }],
      submit: true,
    });
    await t.mutation(api.stockTransfers.setStatus, { token: ids.admin.token, transferId, status: "IN_TRANSIT" });
    await expect(
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "CARD", amount: 250 }],
      })
    ).rejects.toThrow(/Insufficient stock/);
  });

  test("a payment can be removed only while its register is open", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const sell = () =>
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.namedCustomerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "CARD", amount: 250 }],
      }) as Promise<Id<"sales">>;
    const paymentOf = (saleId: Id<"sales">) =>
      t.run(async (ctx) => (await ctx.db.query("payments").withIndex("by_sale", (q) => q.eq("saleId", saleId)).first())!._id);

    const open = await sell();
    await t.mutation(api.payments.remove, { token: ids.admin.token, paymentId: await paymentOf(open) });
    expect(await t.run((ctx) => ctx.db.get(open))).toMatchObject({ paidAmount: 0, balance: 250 });

    const later = await sell();
    const [session] = await t.run((ctx) => ctx.db.query("cashRegisterSessions").collect());
    await t.mutation(api.cashRegister.closeSession, { token: ids.admin.token, sessionId: session._id, actualCash: 0 });
    await expect(
      t.mutation(api.payments.remove, { token: ids.admin.token, paymentId: await paymentOf(later) })
    ).rejects.toThrow(/closed register/);
  });
});

describe("IVA, number settings and promotions", () => {
  const lineOf = (t: Awaited<ReturnType<typeof seed>>["t"], saleId: Id<"sales">) =>
    t.run(async (ctx) => (await ctx.db.query("saleItems").withIndex("by_sale", (q) => q.eq("saleId", saleId)).first())!);

  test("the IVA rate comes from settings only, never from the caller", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(10);
    await setSetting("taxRatePercent", true, "16");
    await expect(
      t.mutation(api.sales.create, {
        token: ids.seller.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        // @ts-expect-error — no longer an argument
        taxRate: 0,
      })
    ).rejects.toThrow();
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.seller.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
    })) as Id<"sales">;
    expect(await t.run((ctx) => ctx.db.get(saleId))).toMatchObject({ tax: 40, total: 290 });
  });

  test("a number setting refuses text and a bad stored value falls back safely", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(10);
    await expect(
      t.mutation(api.settings.upsert, { token: ids.admin.token, key: "taxRatePercent", isActive: true, value: "16%" })
    ).rejects.toThrow(/must be a number/);
    await t.mutation(api.settings.upsert, { token: ids.admin.token, key: "taxRatePercent", isActive: true, value: " 16,0 " });
    expect((await t.query(api.settings.getByKey, { key: "taxRatePercent" }))?.value).toBe("16");

    // A bad value already stored (e.g. from before this check): never NaN, and the discount
    // limit falls back to the strictest rule.
    await t.run(async (ctx) => {
      for (const key of ["taxRatePercent"]) {
        const row = await ctx.db.query("settings").withIndex("by_key", (q) => q.eq("key", key)).unique();
        await ctx.db.patch(row!._id, { value: "abc" });
      }
    });
    await setSetting("discountMaxPercentWithoutApproval", true, "lots");
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
    })) as Id<"sales">;
    expect(await t.run((ctx) => ctx.db.get(saleId))).toMatchObject({ tax: 0, total: 250 });
    await expect(
      t.mutation(api.sales.create, {
        token: ids.seller.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        discount: 10,
      })
    ).rejects.toThrow(/discount_large|[Aa]ccess denied/);
  });

  test("a running promotion sets the till price; the best one wins; expired ones don't count", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    const now = Date.now();
    const promo = (name: string, kind: "PERCENT_OFF" | "AMOUNT_OFF" | "FIXED_PRICE", value: number, target: object, validFrom = now - 1000, validTo?: number) =>
      t.mutation(api.promotions.create, { token: ids.admin.token, name, kind, value, validFrom, validTo, targets: [target] });
    await promo("Tees 20%", "PERCENT_OFF", 20, { categoryId: ids.categoryId }); // 200
    await promo("Basic −30", "AMOUNT_OFF", 30, { productId: ids.productId }); // 220
    await promo("Old deal", "FIXED_PRICE", 50, { productVariantId: ids.variantId }, now - 10_000, now - 5_000); // expired

    const pos = await t.query(api.products.listForPos, { branchId: ids.branchId });
    expect(pos[0]).toMatchObject({ minPrice: 200, promotionName: "Tees 20%" });

    // A seller sells at the promotion price without any discount permission.
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.seller.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "CARD", amount: 200 }],
    })) as Id<"sales">;
    const line = await lineOf(t, saleId);
    expect(line).toMatchObject({ unitPrice: 200, discount: 0 });
    expect(line.promotionId).toBeDefined();
    expect(await t.run((ctx) => ctx.db.get(saleId))).toMatchObject({ total: 200, paymentStatus: "PAID" });

    // A customer order made during the promotion keeps the promotion price.
    const orderId = await t.mutation(api.customerOrders.create, {
      token: ids.admin.token,
      customerId: ids.namedCustomerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
    });
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.totalAmount).toBe(200);
  });
});

describe("purchase order lines and customer records", () => {
  test("purchase order lines are checked, and the same item twice becomes one line", async () => {
    const { t, ids } = await seed();
    const supplierId = await t.run((ctx) =>
      ctx.db.insert("suppliers", { name: "Supplier Co", status: "ACTIVE", createdAt: Date.now() })
    );
    const create = (items: { productVariantId: Id<"productVariants">; quantityOrdered: number; unitCost: number }[]) =>
      t.mutation(api.purchaseOrders.create, {
        token: ids.admin.token,
        supplierId,
        branchId: ids.branchId,
        orderDate: Date.now(),
        items,
      });
    const v = ids.variantId;
    await expect(create([{ productVariantId: v, quantityOrdered: 0, unitCost: 100 }])).rejects.toThrow(/whole quantity/);
    await expect(create([{ productVariantId: v, quantityOrdered: 1.5, unitCost: 100 }])).rejects.toThrow(/whole quantity/);
    await expect(create([{ productVariantId: v, quantityOrdered: 2, unitCost: -1 }])).rejects.toThrow(/negative/);
    await expect(
      create([
        { productVariantId: v, quantityOrdered: 2, unitCost: 100 },
        { productVariantId: v, quantityOrdered: 3, unitCost: 90 },
      ])
    ).rejects.toThrow(/different costs/);

    const poId = await create([
      { productVariantId: v, quantityOrdered: 2, unitCost: 100 },
      { productVariantId: v, quantityOrdered: 3, unitCost: 100 },
    ]);
    const po = await t.query(api.purchaseOrders.get, { id: poId });
    expect(po?.items).toHaveLength(1);
    expect(po?.items[0]).toMatchObject({ quantityOrdered: 5 });
    expect(po?.totalAmount).toBe(500);

    await t.mutation(api.purchaseOrders.updateStatus, { token: ids.admin.token, id: poId, status: "SENT" });
    await t.mutation(api.purchaseOrders.receiveItems, {
      token: ids.admin.token,
      id: poId,
      items: [{ productVariantId: v, quantityReceived: 5 }],
    });
    expect((await t.run((ctx) => ctx.db.get(poId)))?.status).toBe("COMPLETED");
  });

  test("customers: one phone form, no duplicates, a name required, edits audited, walk-in locked", async () => {
    const { t, ids } = await seed();
    const id = await t.mutation(api.customers.create, {
      token: ids.admin.token,
      name: "  Ana Silva ",
      phone1: "+258 84 999 8877",
    });
    expect(await t.run((ctx) => ctx.db.get(id))).toMatchObject({ name: "Ana Silva", phone1: "849998877" });

    await expect(
      t.mutation(api.customers.create, { token: ids.admin.token, name: "Other", phone1: "84 999 8877" })
    ).rejects.toThrow(/Ana Silva already has/);
    await expect(
      t.mutation(api.customers.createMinimal, { token: ids.admin.token, phone1: "849998877" })
    ).rejects.toThrow(/already has/);
    await expect(
      t.mutation(api.customers.create, { token: ids.admin.token, name: "   ", phone1: "841111111" })
    ).rejects.toThrow(/needs a name/);
    await expect(
      t.mutation(api.customers.create, { token: ids.admin.token, name: "Short", phone1: "123" })
    ).rejects.toThrow(/at least 7 digits/);

    await t.mutation(api.customers.update, { token: ids.admin.token, id, name: "Ana S. Silva", phone1: "849998877" });
    const audit = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).find((a) => a.action === "customer.updated")
    );
    expect(audit?.details).toContain('name "Ana Silva" → "Ana S. Silva"');

    await expect(
      t.mutation(api.customers.update, { token: ids.admin.token, id: ids.customerId, name: "Renamed", phone1: "841234567" })
    ).rejects.toThrow(/walk-in customer cannot be edited/);
  });
});

describe("till total, store credit, order IVA, whole quantities and reservations", () => {
  test("the till's quote is exactly what the sale saves, with the product's own IVA rate", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(10);
    await setSetting("taxRatePercent", true, "0");
    await t.run(async (ctx) => {
      const rateId = await ctx.db.insert("taxRates", {
        name: "IVA 16%",
        percentage: 16,
        active: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      await ctx.db.patch(ids.productId, { taxRateId: rateId });
    });
    const items = [{ productVariantId: ids.variantId, quantity: 2 }];
    const quote = await t.query(api.sales.quote, { token: ids.seller.token, items, discount: 50 });
    expect(quote).toMatchObject({ subtotal: 500, tax: 72, total: 522 });
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items,
      discount: 50,
      payments: [{ method: "CARD", amount: quote!.total! }],
    })) as Id<"sales">;
    expect(await t.run((ctx) => ctx.db.get(saleId))).toMatchObject({ total: 522, balance: 0, paymentStatus: "PAID" });
  });

  test("store credit pays at the till, from the balance, without the register", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    await t.mutation(api.customerCredits.grant, {
      token: ids.admin.token,
      customerId: ids.namedCustomerId,
      amount: 300,
      notes: "goodwill",
    });
    await t.run(async (ctx) => {
      for (const s of await ctx.db.query("cashRegisterSessions").collect()) await ctx.db.patch(s._id, { status: "CLOSED" });
    });
    const sell = (customerId: Id<"customers">, amount: number) =>
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "STORE_CREDIT", amount }],
      }) as Promise<Id<"sales">>;
    const saleId = await sell(ids.namedCustomerId, 250);
    expect(await t.run((ctx) => ctx.db.get(saleId))).toMatchObject({ paidAmount: 250, paymentStatus: "PAID" });
    expect(await t.query(api.customerCredits.getBalance, { customerId: ids.namedCustomerId })).toBe(50);
    await expect(sell(ids.namedCustomerId, 250)).rejects.toThrow(/cannot go negative/);
    await expect(sell(ids.customerId, 250)).rejects.toThrow(/named customer/);
  });

  test("a customer order's total includes IVA, and collecting needs it paid", async () => {
    const { t, ids, setStock, setSetting } = await seed();
    await setStock(10);
    await setSetting("taxRatePercent", true, "16");
    const orderId = await t.mutation(api.customerOrders.create, {
      token: ids.admin.token,
      customerId: ids.namedCustomerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
    });
    expect((await t.run((ctx) => ctx.db.get(orderId)))?.totalAmount).toBe(290);
    await expect(
      t.mutation(api.customerOrders.collect, { token: ids.admin.token, orderId, payments: [{ method: "CARD", amount: 250 }] })
    ).rejects.toThrow(/still due/);
    const saleId = await t.mutation(api.customerOrders.collect, {
      token: ids.admin.token,
      orderId,
      payments: [{ method: "CARD", amount: 290 }],
    });
    expect(await t.run((ctx) => ctx.db.get(saleId))).toMatchObject({ total: 290, balance: 0 });
  });

  test("half quantities are refused", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10);
    await expect(
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 0.5 }],
      })
    ).rejects.toThrow(/whole numbers/);
    await expect(
      t.mutation(api.stockTransfers.create, {
        token: ids.admin.token,
        sourceBranchId: ids.branchId,
        destinationBranchId: ids.branch2Id,
        items: [{ productVariantId: ids.variantId, quantity: 1.5 }],
      })
    ).rejects.toThrow(/whole numbers/);
  });

  test("an expired reservation stops holding stock and is marked expired", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(2);
    const orderId = await t.mutation(api.customerOrders.create, {
      token: ids.admin.token,
      customerId: ids.namedCustomerId,
      branchId: ids.branchId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      reserve: true,
    });
    const sellOne = () =>
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 1 }],
        payments: [{ method: "CARD", amount: 250 }],
      });
    await expect(sellOne()).rejects.toThrow(/held for customer orders/);

    // Default reservation: 14 days.
    const [hold] = await t.run((ctx) => ctx.db.query("stockHolds").collect());
    expect(Math.round((hold.expiresAt - hold.createdAt) / 86_400_000)).toBe(14);
    await t.run((ctx) => ctx.db.patch(hold._id, { expiresAt: Date.now() - 1 }));
    await expect(sellOne()).resolves.toBeDefined(); // no longer held
    expect(await t.mutation(internal.stockHolds.expireHolds, {})).toBe(1);
    expect((await t.run((ctx) => ctx.db.get(hold._id)))?.status).toBe("EXPIRED");
    const audit = await t.run(async (ctx) =>
      (await ctx.db.query("auditLogs").collect()).find((a) => a.action === "customer_order.reservation_expired")
    );
    expect(audit?.entityId).toBe(orderId);
  });
});

describe("refunds go back the way the money came in", () => {
  async function paidSale(s: Awaited<ReturnType<typeof seed>>, customerId: Id<"customers">, payments: { method: "CASH" | "CARD" | "STORE_CREDIT"; amount: number }[]) {
    const saleId = (await s.t.mutation(api.sales.create, {
      token: s.ids.admin.token,
      branchId: s.ids.branchId,
      customerId,
      items: [{ productVariantId: s.ids.variantId, quantity: 1 }],
      payments,
    })) as Id<"sales">;
    const saleItemId = await s.t.run(async (ctx) =>
      (await ctx.db.query("saleItems").withIndex("by_sale", (q) => q.eq("saleId", saleId)).first())!._id
    );
    return { saleId, saleItemId };
  }
  const returnAs = (s: Awaited<ReturnType<typeof seed>>, token: string, saleId: Id<"sales">, saleItemId: Id<"saleItems">, refundMethod: "CASH" | "CARD" | "STORE_CREDIT") =>
    s.t.mutation(api.salesReturns.create, {
      token,
      saleId,
      items: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
      refundMethod,
    });

  test("goods bought with store credit go back as store credit, not cash", async () => {
    const s = await seed();
    await s.setStock(10);
    await s.t.mutation(api.customerCredits.grant, { token: s.ids.admin.token, customerId: s.ids.namedCustomerId, amount: 250, notes: "goodwill" });
    const { saleId, saleItemId } = await paidSale(s, s.ids.namedCustomerId, [{ method: "STORE_CREDIT", amount: 250 }]);
    await expect(returnAs(s, s.ids.seller.token, saleId, saleItemId, "CASH")).rejects.toThrow(/needs a manager/);
    await returnAs(s, s.ids.seller.token, saleId, saleItemId, "STORE_CREDIT");
    expect(await s.t.query(api.customerCredits.getBalance, { customerId: s.ids.namedCustomerId })).toBe(250);
  });

  test("a card sale is not paid out in cash, unless a manager says so", async () => {
    const s = await seed();
    await s.setStock(10);
    const one = await paidSale(s, s.ids.customerId, [{ method: "CARD", amount: 250 }]);
    await expect(returnAs(s, s.ids.seller.token, one.saleId, one.saleItemId, "CASH")).rejects.toThrow(/paid with CARD 250.00/);
    await returnAs(s, s.ids.seller.token, one.saleId, one.saleItemId, "CARD");
    const two = await paidSale(s, s.ids.customerId, [{ method: "CARD", amount: 250 }]);
    await expect(returnAs(s, s.ids.admin.token, two.saleId, two.saleItemId, "CASH")).resolves.toBeDefined();
  });

  test("the walk-in customer cannot be refunded in store credit", async () => {
    const s = await seed();
    await s.setStock(10);
    const { saleId, saleItemId } = await paidSale(s, s.ids.customerId, [{ method: "CASH", amount: 250 }]);
    await expect(returnAs(s, s.ids.admin.token, saleId, saleItemId, "STORE_CREDIT")).rejects.toThrow(/walk-in customer cannot be given store credit/);
  });

  test("store credit spent is not counted as money collected", async () => {
    const s = await seed();
    await s.setStock(10);
    await s.t.mutation(api.customerCredits.grant, { token: s.ids.admin.token, customerId: s.ids.namedCustomerId, amount: 100, notes: "goodwill" });
    await paidSale(s, s.ids.namedCustomerId, [
      { method: "STORE_CREDIT", amount: 100 },
      { method: "CARD", amount: 150 },
    ]);
    const now = Date.now();
    const m = await s.t.query(api.analytics.getDashboardMetrics, { token: s.ids.admin.token, start: now - 3_600_000, end: now + 3_600_000 });
    expect(m).toMatchObject({ grossRevenue: 250, cashCollected: 150 });
    expect(m.paymentMethodsBreakdown.STORE_CREDIT).toEqual({ amount: 100, count: 1 });
  });
});

describe("large catalogues", () => {
  test("the stock list reaches every item, by page, search and status", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(10); // the seeded tee: in stock
    // 40 more products, one variant each, created after the seeded one.
    await t.run(async (ctx) => {
      for (let i = 0; i < 40; i++) {
        const productId = await ctx.db.insert("products", {
          name: `Item ${i}`,
          categoryId: ids.categoryId,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        await ctx.db.insert("productVariants", {
          productId,
          sku: `SKU-${i}`,
          costPrice: 10,
          sellingPrice: 20,
          reorderLevel: 1,
          active: true,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }
    });
    const base = { token: ids.admin.token, branchId: ids.branchId };
    const seen = new Set<string>();
    let cursor: string | null = null;
    for (;;) {
      const res: { page: { sku: string }[]; isDone: boolean; continueCursor: string } = await t.query(
        api.stock.listInventory,
        { ...base, paginationOpts: { numItems: 15, cursor } }
      );
      res.page.forEach((r) => seen.add(r.sku));
      if (res.isDone) break;
      cursor = res.continueCursor;
    }
    expect(seen.size).toBe(41);
    expect(seen.has("BASIC-BLK-M")).toBe(true); // the oldest is not cut off

    const bySku = await t.query(api.stock.listInventory, { ...base, search: "SKU-39", paginationOpts: { numItems: 15, cursor: null } });
    expect(bySku.page.map((r) => r.sku)).toEqual(["SKU-39"]);
    const byName = await t.query(api.stock.listInventory, { ...base, search: "Basic", paginationOpts: { numItems: 15, cursor: null } });
    expect(byName.page.map((r) => r.sku)).toEqual(["BASIC-BLK-M"]);
    const inStock = await t.query(api.stock.listInventory, { ...base, status: "IN_STOCK", paginationOpts: { numItems: 15, cursor: null } });
    expect(inStock.page.map((r) => r.sku)).toEqual(["BASIC-BLK-M"]);
  });

  test("a stock count names its own lines", async () => {
    const { t, ids, setStock } = await seed();
    await setStock(5);
    const countId = await t.mutation(api.stockCounts.start, { token: ids.admin.token, branchId: ids.branchId });
    const count = await t.query(api.stockCounts.get, { id: countId });
    expect(count?.lines[0]).toMatchObject({ sku: "BASIC-BLK-M" });
    expect(count?.lines[0].name).toContain("Basic Tee");
  });
});

describe("purchase costs and supplier payments", () => {
  async function sentOrder(s: Awaited<ReturnType<typeof seed>>, quantityOrdered: number, unitCost: number) {
    const supplierId = await s.t.run((ctx) =>
      ctx.db.insert("suppliers", { name: "Supplier Co", status: "ACTIVE", createdAt: Date.now() })
    );
    const poId = await s.t.mutation(api.purchaseOrders.create, {
      token: s.ids.admin.token,
      supplierId,
      branchId: s.ids.branchId,
      orderDate: Date.now(),
      items: [{ productVariantId: s.ids.variantId, quantityOrdered, unitCost }],
    });
    await s.t.mutation(api.purchaseOrders.updateStatus, { token: s.ids.admin.token, id: poId, status: "SENT" });
    return { poId, supplierId };
  }
  const receive = (s: Awaited<ReturnType<typeof seed>>, poId: Id<"purchaseOrders">, quantityReceived: number) =>
    s.t.mutation(api.purchaseOrders.receiveItems, {
      token: s.ids.admin.token,
      id: poId,
      items: [{ productVariantId: s.ids.variantId, quantityReceived }],
    });
  const cost = (s: Awaited<ReturnType<typeof seed>>) => s.t.run(async (ctx) => (await ctx.db.get(s.ids.variantId))!.costPrice);

  test("weighted average (the default): stock on hand and new goods averaged", async () => {
    const s = await seed();
    await s.setStock(10); // 10 on hand at cost 100
    const { poId } = await sentOrder(s, 10, 160);
    await receive(s, poId, 10);
    expect(await cost(s)).toBe(130); // (10×100 + 10×160) / 20
    const value = await s.t.query(api.analytics.inventoryValuation, { token: s.ids.admin.token, branchId: s.ids.branchId });
    expect(value).toMatchObject({ units: 20, costValue: 2600 });
  });

  test("latest cost, or left alone when set by hand", async () => {
    const s = await seed();
    await s.setStock(10);
    await s.t.mutation(api.settings.upsert, { token: s.ids.admin.token, key: "costMethod", isActive: true, value: "LATEST" });
    const { poId } = await sentOrder(s, 10, 160);
    await receive(s, poId, 5);
    expect(await cost(s)).toBe(160);
    await s.t.mutation(api.settings.upsert, { token: s.ids.admin.token, key: "costMethod", isActive: true, value: "MANUAL" });
    const second = await sentOrder(s, 5, 90);
    await receive(s, second.poId, 5);
    expect(await cost(s)).toBe(160);
    await expect(
      s.t.mutation(api.settings.upsert, { token: s.ids.admin.token, key: "costMethod", isActive: true, value: "FIFO" })
    ).rejects.toThrow(/must be one of/);
  });

  test("supplier payments set the order's paid status and what is owed", async () => {
    const s = await seed();
    const { poId, supplierId } = await sentOrder(s, 10, 100); // 1000
    const pay = (amount: number, method: "BANK_TRANSFER" | "CASH") =>
      s.t.mutation(api.supplierPayments.add, { token: s.ids.admin.token, purchaseOrderId: poId, amount, method });

    expect(await s.t.query(api.supplierPayments.payables, { token: s.ids.admin.token })).toEqual([
      { supplierId, name: "Supplier Co", owed: 1000, orders: 1 },
    ]);
    await pay(400, "BANK_TRANSFER");
    expect((await s.t.run((ctx) => ctx.db.get(poId)))?.paymentStatus).toBe("PARTIALLY_PAID");
    await expect(pay(700, "BANK_TRANSFER")).rejects.toThrow(/Only 600.00 is still owed/);
    // Cash comes out of the drawer, and only what is in it.
    await expect(pay(600, "CASH")).rejects.toThrow(/in the drawer/);
    await expect(
      s.t.mutation(api.purchaseOrders.updateStatus, { token: s.ids.admin.token, id: poId, status: "CANCELLED" })
    ).rejects.toThrow(/Payments were made/);
    await pay(600, "BANK_TRANSFER");
    expect((await s.t.run((ctx) => ctx.db.get(poId)))?.paymentStatus).toBe("PAID");
    expect(await s.t.query(api.supplierPayments.payables, { token: s.ids.admin.token })).toEqual([]);
  });

  test("a cash supplier payment is a cash-out in the drawer", async () => {
    const s = await seed();
    await s.setStock(10);
    await s.t.mutation(api.sales.create, {
      token: s.ids.admin.token,
      branchId: s.ids.branchId,
      customerId: s.ids.customerId,
      items: [{ productVariantId: s.ids.variantId, quantity: 2 }],
      payments: [{ method: "CASH", amount: 500 }],
    });
    const { poId } = await sentOrder(s, 1, 300);
    await s.t.mutation(api.supplierPayments.add, { token: s.ids.admin.token, purchaseOrderId: poId, amount: 300, method: "CASH" });
    const [session] = await s.t.run((ctx) => ctx.db.query("cashRegisterSessions").collect());
    const closed = await s.t.mutation(api.cashRegister.closeSession, {
      token: s.ids.admin.token,
      sessionId: session._id,
      actualCash: 200,
    });
    expect(closed).toMatchObject({ expectedCash: 200, difference: 0 });
  });
});
