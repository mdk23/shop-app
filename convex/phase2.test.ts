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
    const branchId = await ctx.db.insert("branches", {
      name: "Main",
      code: "MAIN",
      status: "ACTIVE",
      isDefault: true,
      createdAt: now,
    });
    const categoryId = await ctx.db.insert("categories", {
      name: "T-Shirts",
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const productAId = await ctx.db.insert("products", {
      name: "Tee",
      categoryId,
      defaultCostPrice: 100,
      defaultSellingPrice: 250,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const productBId = await ctx.db.insert("products", {
      name: "Socks",
      categoryId,
      defaultCostPrice: 50,
      defaultSellingPrice: 100,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const variantM = await ctx.db.insert("productVariants", {
      productId: productAId,
      sku: "TEE-M",
      size: "M",
      costPrice: 100,
      sellingPrice: 250,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const variantL = await ctx.db.insert("productVariants", {
      productId: productAId,
      sku: "TEE-L",
      size: "L",
      costPrice: 100,
      sellingPrice: 250,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const variantSocks = await ctx.db.insert("productVariants", {
      productId: productBId,
      sku: "SOCK-M",
      size: "M",
      costPrice: 50,
      sellingPrice: 100,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    for (const productVariantId of [variantM, variantL, variantSocks]) {
      await ctx.db.insert("variantStock", {
        branchId,
        productVariantId,
        quantity: 100,
        updatedAt: now,
      });
    }
    const customerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
      isGeneric: false,
      active: true,
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
    await ctx.db.insert("userSessions", {
      userId,
      token,
      expiresAt: now + 3_600_000,
      createdAt: now,
    });
    return {
      branchId,
      productAId,
      productBId,
      variantM,
      variantL,
      variantSocks,
      customerId,
    };
  });
  return { t, ids, token };
}

async function makeRate(t: Awaited<ReturnType<typeof seed>>["t"], token: string, percentage: number, name: string, exemptionCode?: string) {
  return await t.mutation(api.taxRates.create, { token, name, percentage, exemptionCode });
}

describe("IVA per line", () => {
  test("applies the product's rate to each line and stores it on the sale item", async () => {
    const { t, ids, token } = await seed();
    const iva16 = await makeRate(t, token, 16, "IVA 16%");
    await t.mutation(api.products.update, { token, id: ids.productAId, taxRateId: iva16 });

    const saleId = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantM, quantity: 2 }],
      payments: [{ method: "Card", amount: 1000 }],
    });

    const sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale?.subtotal).toBe(500);
    expect(sale?.tax).toBe(80);
    expect(sale?.total).toBe(580);

    const items = await t.run((ctx) =>
      ctx.db.query("saleItems").withIndex("by_sale", (q) => q.eq("saleId", saleId)).collect()
    );
    expect(items[0].taxRatePercent).toBe(16);
    expect(items[0].taxAmount).toBe(80);
  });

  test("mixes rates across lines: an exempt product adds no IVA", async () => {
    const { t, ids, token } = await seed();
    const iva16 = await makeRate(t, token, 16, "IVA 16%");
    const exempt = await makeRate(t, token, 0, "Isento", "ISE-01");
    await t.mutation(api.products.update, { token, id: ids.productAId, taxRateId: iva16 });
    await t.mutation(api.products.update, { token, id: ids.productBId, taxRateId: exempt });

    const saleId = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [
        { productVariantId: ids.variantM, quantity: 2 },
        { productVariantId: ids.variantSocks, quantity: 1 },
      ],
      payments: [{ method: "Card", amount: 1000 }],
    });

    const sale = await t.run((ctx) => ctx.db.get(saleId));
    expect(sale?.tax).toBe(80);
    expect(sale?.total).toBe(680);
  });

  test("spreads a sale-level discount across lines before taxing them", async () => {
    const { t, ids, token } = await seed();
    const iva16 = await makeRate(t, token, 16, "IVA 16%");
    await t.mutation(api.products.update, { token, id: ids.productAId, taxRateId: iva16 });

    const saleId = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [
        { productVariantId: ids.variantM, quantity: 1 },
        { productVariantId: ids.variantL, quantity: 1 },
      ],
      discount: 100,
      payments: [{ method: "Card", amount: 1000 }],
    });

    const sale = await t.run((ctx) => ctx.db.get(saleId));
    // gross 500, discount 100 → net 400, IVA 16% = 64, total 464
    expect(sale?.tax).toBe(64);
    expect(sale?.total).toBe(464);
  });

  test("refuses to sell a product whose IVA rate is inactive", async () => {
    const { t, ids, token } = await seed();
    const iva16 = await makeRate(t, token, 16, "IVA 16%");
    await t.mutation(api.products.update, { token, id: ids.productAId, taxRateId: iva16 });
    await t.mutation(api.taxRates.deactivate, { token, id: iva16 });

    await expect(
      t.mutation(api.sales.create, {
        token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantM, quantity: 1 }],
        payments: [{ method: "Card", amount: 1000 }],
      })
    ).rejects.toThrow(/inactive/);
  });

  test("rejects a rate above 100%", async () => {
    const { t, token } = await seed();
    await expect(makeRate(t, token, 120, "Bad")).rejects.toThrow(/between 0 and 100/);
  });
});

describe("fiscal numbering", () => {
  test("numbers sales gaplessly within the fiscal year", async () => {
    const { t, ids, token } = await seed();
    const numbers: string[] = [];
    for (let i = 0; i < 3; i++) {
      const saleId = await t.mutation(api.sales.create, {
        token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantM, quantity: 1 }],
        payments: [{ method: "Card", amount: 1000 }],
      });
      const sale = await t.run((ctx) => ctx.db.get(saleId));
      numbers.push(sale!.fiscalNumber!);
    }
    const seqs = numbers.map((n) => Number(n.split("/")[1]));
    expect(seqs).toEqual([1, 2, 3]);
    expect(numbers[0]).toMatch(/^FT \d{4}\/000001$/);
  });

  test("a rolled-back sale consumes no fiscal number", async () => {
    const { t, ids, token } = await seed();
    const first = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantM, quantity: 1 }],
      payments: [{ method: "Card", amount: 1000 }],
    });
    await expect(
      t.mutation(api.sales.create, {
        token,
        branchId: ids.branchId,
        customerId: ids.customerId,
        items: [{ productVariantId: ids.variantM, quantity: 999 }],
        payments: [{ method: "Card", amount: 1000 }],
      })
    ).rejects.toThrow(/Insufficient stock/);
    const next = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantM, quantity: 1 }],
      payments: [{ method: "Card", amount: 1000 }],
    });

    const a = await t.run((ctx) => ctx.db.get(first));
    const b = await t.run((ctx) => ctx.db.get(next));
    expect(Number(b!.fiscalNumber!.split("/")[1])).toBe(
      Number(a!.fiscalNumber!.split("/")[1]) + 1
    );
  });

  test("copies the customer's NUIT onto the sale", async () => {
    const { t, ids, token } = await seed();
    await t.run((ctx) =>
      ctx.db.insert("fiscalIdentities", {
        customerId: ids.customerId,
        identificationType: "NUIT",
        number: "400123456",
        country: "MZ",
        validFrom: Date.now(),
      })
    );
    const saleId = await t.mutation(api.sales.create, {
      token,
      branchId: ids.branchId,
      customerId: ids.customerId,
      items: [{ productVariantId: ids.variantM, quantity: 1 }],
      payments: [{ method: "Card", amount: 1000 }],
    });
    const sale = await t.run((ctx) => ctx.db.get(saleId as Id<"sales">));
    expect(sale?.customerNuit).toBe("400123456");
  });
});
