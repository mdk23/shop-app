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
    const productId = await ctx.db.insert("products", {
      name: "Tee",
      categoryId,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    const variantId = await ctx.db.insert("productVariants", {
      productId,
      sku: "TEE-M",
      sizeId: await findOrCreateSize(ctx, "M"),
      costPrice: 100,
      sellingPrice: 250,
      reorderLevel: 0,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("variantStock", {
      branchId,
      productVariantId: variantId,
      quantity: 10,
      status: "IN_STOCK",
      updatedAt: now,
    });
    const customerId = await ctx.db.insert("customers", {
      name: "Jane Doe",
      phone1: "841234567",
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
    await ctx.db.insert("userSessions", {
      userId,
      token: "tok-admin",
      expiresAt: now + 3_600_000,
      createdAt: now,
    });
    // Every payment needs an open register.
    await ctx.db.insert("cashRegisterSessions", {
      userId,
      username: "admin",
      openingAmount: 0,
      openedAt: now,
      status: "OPEN",
      branchId,
    });
    return { branchId, variantId, customerId };
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

async function saleWith(
  t: Awaited<ReturnType<typeof seed>>["t"],
  token: string,
  ids: Awaited<ReturnType<typeof seed>>["ids"],
  quantity: number
) {
  const saleId = await t.mutation(api.sales.create, {
    token,
    branchId: ids.branchId,
    customerId: ids.customerId,
    items: [{ productVariantId: ids.variantId, quantity }],
    payments: [{ method: "CARD", amount: 5000 }],
  });
  const lines = await t.run((ctx) =>
    ctx.db
      .query("saleItems")
      .withIndex("by_sale", (q) => q.eq("saleId", saleId))
      .collect()
  );
  return { saleId, saleItemId: lines[0]._id };
}

describe("complaints", () => {
  test("a complaint is resolved once, with its resolution recorded", async () => {
    const { t, token, ids } = await seed();
    const { saleId } = await saleWith(t, token, ids, 1);
    const complaintId = await t.mutation(api.complaints.create, {
      token,
      saleId,
      description: "Seam split after one wash",
    });
    const open = await t.query(api.complaints.listOpen, {});
    expect(open.map((c) => c._id)).toEqual([complaintId]);

    await t.mutation(api.complaints.resolve, {
      token,
      id: complaintId,
      resolutionType: "TROCA",
      notes: "Swapped for same size",
    });
    const row = await t.run((ctx) => ctx.db.get(complaintId));
    expect(row).toMatchObject({ status: "RESOLVED" });
    const resolution = await t.run((ctx) => ctx.db.get(row!.resolutionId!));
    expect(resolution?.resolutionType).toBe("TROCA");

    await expect(
      t.mutation(api.complaints.resolve, { token, id: complaintId, resolutionType: "RECUSA" })
    ).rejects.toThrow(/already closed/);
  });

  test("rejecting a complaint closes it as rejected", async () => {
    const { t, token, ids } = await seed();
    const complaintId = await t.mutation(api.complaints.create, {
      token,
      customerId: ids.customerId,
      description: "Colour faded",
    });
    await t.mutation(api.complaints.resolve, {
      token,
      id: complaintId,
      resolutionType: "RECUSA",
    });
    const row = await t.run((ctx) => ctx.db.get(complaintId));
    expect(row?.status).toBe("REJECTED");
  });
});

describe("returns: condition and resolution", () => {
  test("damaged goods are never put back on sale, sellable ones are", async () => {
    const { t, token, ids } = await seed();
    const { saleId, saleItemId } = await saleWith(t, token, ids, 3);
    expect(await stockOf(t, ids.branchId, ids.variantId)).toBe(7);

    const damagedReturnId = await t.mutation(api.salesReturns.create, {
      token,
      saleId,
      items: [
        {
          saleItemId,
          quantity: 2,
          reason: "DEFECTIVE",
          restock: true,
          condition: "DAMAGED",
        },
      ],
      refundMethod: "CARD",
    });
    expect(await stockOf(t, ids.branchId, ids.variantId)).toBe(7);

    const damagedItems = await t.run((ctx) =>
      ctx.db
        .query("salesReturnItems")
        .withIndex("by_return", (q) => q.eq("returnId", damagedReturnId))
        .collect()
    );
    expect(damagedItems[0]).toMatchObject({ condition: "DAMAGED", restock: false });

    await t.mutation(api.salesReturns.create, {
      token,
      saleId,
      items: [
        {
          saleItemId,
          quantity: 1,
          reason: "WRONG_SIZE",
          restock: true,
          condition: "SELLABLE",
        },
      ],
      refundMethod: "CARD",
    });
    expect(await stockOf(t, ids.branchId, ids.variantId)).toBe(8);
  });

  test("a return can be tied to a complaint about the same sale", async () => {
    const { t, token, ids } = await seed();
    const { saleId, saleItemId } = await saleWith(t, token, ids, 1);
    const complaintId = await t.mutation(api.complaints.create, {
      token,
      saleId,
      description: "Wrong size",
    });
    const returnId = await t.mutation(api.salesReturns.create, {
      token,
      saleId,
      items: [{ saleItemId, quantity: 1, reason: "WRONG_SIZE", restock: true }],
      refundMethod: "CARD",
      resolutionType: "TROCA",
      complaintId,
    });
    const row = await t.run((ctx) => ctx.db.get(returnId));
    expect(row).toMatchObject({ complaintId });
    const resolution = await t.run((ctx) => ctx.db.get(row!.resolutionId!));
    expect(resolution?.resolutionType).toBe("TROCA");
  });

  test("a complaint about another sale cannot be attached to a return", async () => {
    const { t, token, ids } = await seed();
    const first = await saleWith(t, token, ids, 1);
    const second = await saleWith(t, token, ids, 1);
    const complaintId = await t.mutation(api.complaints.create, {
      token,
      saleId: first.saleId,
      description: "Stain",
    });
    await expect(
      t.mutation(api.salesReturns.create, {
        token,
        saleId: second.saleId,
        items: [{ saleItemId: second.saleItemId, quantity: 1, reason: "DEFECTIVE", restock: true }],
        refundMethod: "CARD",
        complaintId,
      })
    ).rejects.toThrow(/different sale/);
  });
});
