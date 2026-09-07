import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const generateUploadUrl = mutation({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "products.manage");
    return await ctx.storage.generateUploadUrl();
  },
});

export const listByProduct = query({
  args: { productId: v.id("products") },
  handler: async (ctx, args) => {
    const images = await ctx.db
      .query("productImages")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    return await Promise.all(
      images
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map(async (img) => ({ ...img, url: await ctx.storage.getUrl(img.storageId) }))
    );
  },
});

export const attach = mutation({
  args: {
    token: v.string(),
    productId: v.id("products"),
    storageId: v.id("_storage"),
    makePrimary: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("Product not found.");

    const existing = await ctx.db
      .query("productImages")
      .withIndex("by_product", (q) => q.eq("productId", args.productId))
      .collect();
    const id = await ctx.db.insert("productImages", {
      productId: args.productId,
      storageId: args.storageId,
      sortOrder: existing.length,
      createdAt: Date.now(),
    });
    if (args.makePrimary || !product.primaryImageId) {
      await ctx.db.patch(args.productId, {
        primaryImageId: args.storageId,
        updatedAt: Date.now(),
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "product.image_added",
      entityType: "product",
      entityId: args.productId,
      details: `Image added to "${product.name}"`,
    });
    return id;
  },
});

export const remove = mutation({
  args: { token: v.string(), id: v.id("productImages") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const img = await ctx.db.get(args.id);
    if (!img) return;
    const product = await ctx.db.get(img.productId);
    await ctx.storage.delete(img.storageId);
    await ctx.db.delete(args.id);
    if (product?.primaryImageId === img.storageId) {
      const next = await ctx.db
        .query("productImages")
        .withIndex("by_product", (q) => q.eq("productId", img.productId))
        .first();
      await ctx.db.patch(img.productId, {
        primaryImageId: next?.storageId ?? undefined,
        updatedAt: Date.now(),
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "product.image_removed",
      entityType: "product",
      entityId: img.productId,
      details: `Image removed from "${product?.name ?? "product"}"`,
    });
  },
});

export const reorder = mutation({
  args: {
    token: v.string(),
    productId: v.id("products"),
    orderedIds: v.array(v.id("productImages")),
  },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "products.manage");
    let i = 0;
    for (const id of args.orderedIds) {
      const img = await ctx.db.get(id);
      if (img && img.productId === args.productId) {
        await ctx.db.patch(id, { sortOrder: i });
        i += 1;
      }
    }
  },
});
