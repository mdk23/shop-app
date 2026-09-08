/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, test } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");

async function seed() {
  const t = convexTest(schema, modules);

  const ids = await t.run(async (ctx) => {
    const branchId = await ctx.db.insert("branches", {
      name: "Main",
      code: "MAIN",
      status: "active",
      isDefault: true,
      createdAt: Date.now(),
    });
    const branch2Id = await ctx.db.insert("branches", {
      name: "Second",
      code: "SEC",
      status: "active",
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
      defaultCostPrice: 100,
      defaultSellingPrice: 250,
      active: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    const variantId = await ctx.db.insert("productVariants", {
      productId,
      sku: "BASIC-BLK-M",
      size: "M",
      color: "Black",
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
      active: true,
      status: "active",
    });

    const mkUser = async (username: string, role: "admin" | "pos_seller") => {
      const userId = await ctx.db.insert("users", {
        name: username,
        username,
        passwordHash: "",
        role,
        status: "active",
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
    const seller = await mkUser("seller", "pos_seller");

    return {
      branchId,
      branch2Id,
      categoryId,
      productId,
      variantId,
      customerId,
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
      payments: [{ method: "Card", amount: 750 }],
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
        payments: [{ method: "Card", amount: 1250 }],
      })
    ).rejects.toThrow(/[Ii]nsufficient stock/);

    await setSetting("allowNegativeStock", true);
    await expect(
      t.mutation(api.sales.create, {
        token: ids.admin.token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantId, quantity: 5 }],
        payments: [{ method: "Card", amount: 1250 }],
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
      payments: [{ method: "Card", amount: 250 }],
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
        payments: [{ method: "Card", amount: 150 }],
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
        payments: [{ method: "Card", amount: 150 }],
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
      payments: [{ method: "Card", amount: 250 }],
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

describe("returns", () => {
  test("caps quantity at sold minus already returned and restocks", async () => {
    const { t, ids, setStock, stockAt } = await seed();
    await setStock(10);

    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantId, quantity: 2 }],
      payments: [{ method: "Card", amount: 500 }],
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
        active: true,
        status: "active",
      })
    );
    const saleId = (await t.mutation(api.sales.create, {
      token: ids.admin.token,
      branchId: ids.branchId,
      customerId,
      items: [{ productVariantId: ids.variantId, quantity: 1 }],
      payments: [{ method: "Card", amount: 250 }],
    })) as Id<"sales">;
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
        status: "active",
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
      status: "sent",
    });

    await t.mutation(api.purchaseOrders.receiveItems, {
      token: ids.admin.token,
      id: poId,
      items: [{ productVariantId: ids.variantId, quantityReceived: 60 }],
    });
    let po = await t.run(async (ctx) => ctx.db.get(poId));
    expect(po?.status).toBe("partially_received");
    expect(await stockAt()).toBe(60);

    await t.mutation(api.purchaseOrders.receiveItems, {
      token: ids.admin.token,
      id: poId,
      items: [{ productVariantId: ids.variantId, quantityReceived: 40 }],
    });
    po = await t.run(async (ctx) => ctx.db.get(poId));
    expect(po?.status).toBe("completed");
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
    const adj = await t.run(async (ctx) =>
      ctx.db.query("stockAdjustments").first()
    );
    expect(adj?.adjustmentQuantity).toBe(-3);
    expect(adj?.previousQuantity).toBe(10);
    expect(adj?.newQuantity).toBe(7);
  });
});
