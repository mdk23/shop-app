import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { productOfPair } from "./lib/catalog";

/** Offers with the assortments they include, and each assortment's current items. */
export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "products.view");
    const offers = await ctx.db.query("offers").collect();
    return await Promise.all(
      offers.map(async (offer) => {
        const links = await ctx.db
          .query("offerAssortments")
          .withIndex("by_offer", (q) => q.eq("offerId", offer._id))
          .collect();
        const assortments = await Promise.all(
          links.map(async (link) => {
            const assortment = await ctx.db.get(link.assortmentId);
            const items = await ctx.db
              .query("assortmentItems")
              .withIndex("by_assortment", (q) => q.eq("assortmentId", link.assortmentId))
              .collect();
            const named = await Promise.all(
              items.map(async (item) => ({
                _id: item._id,
                productName: (await ctx.db.get(item.productId))?.name ?? "—",
                validTo: item.validTo,
              }))
            );
            return { _id: link.assortmentId, name: assortment?.name ?? "—", items: named };
          })
        );
        return { ...offer, assortments };
      })
    );
  },
});

export const listAssortments = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await authorize(ctx, args.token, "products.view");
    return await ctx.db.query("assortments").collect();
  },
});

export const createOffer = mutation({
  args: { token: v.string(), description: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const description = args.description.trim();
    if (!description) throw new Error("Describe the offer.");
    const id = await ctx.db.insert("offers", { description, constitutedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "offer.created",
      entityType: "offer",
      entityId: id,
      details: description,
    });
    return id;
  },
});

export const createAssortment = mutation({
  args: { token: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Name the assortment.");
    const id = await ctx.db.insert("assortments", { name, constitutedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "assortment.created",
      entityType: "assortment",
      entityId: id,
      details: name,
    });
    return id;
  },
});

/** Adds a product (optionally one variant) to an assortment, from now on. */
export const addAssortmentItem = mutation({
  args: {
    token: v.string(),
    assortmentId: v.id("assortments"),
    productId: v.id("products"),
    variantId: v.optional(v.id("productVariants")),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    if (!(await ctx.db.get(args.assortmentId))) throw new Error("Assortment not found.");
    // A variant must belong to the product it is listed under.
    const productId = (await productOfPair(ctx, args.productId, args.variantId))!;
    const now = Date.now();
    const id = await ctx.db.insert("assortmentItems", {
      assortmentId: args.assortmentId,
      productId,
      productVariantId: args.variantId,
      validFrom: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "assortment.item_added",
      entityType: "assortment",
      entityId: args.assortmentId,
    });
    return id;
  },
});

export const includeAssortment = mutation({
  args: { token: v.string(), offerId: v.id("offers"), assortmentId: v.id("assortments") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    if (!(await ctx.db.get(args.offerId))) throw new Error("Offer not found.");
    if (!(await ctx.db.get(args.assortmentId))) throw new Error("Assortment not found.");
    const existing = await ctx.db
      .query("offerAssortments")
      .withIndex("by_offer", (q) => q.eq("offerId", args.offerId))
      .collect();
    if (existing.some((e) => e.assortmentId === args.assortmentId && e.validTo === undefined)) {
      throw new Error("This assortment is already in the offer.");
    }
    const id = await ctx.db.insert("offerAssortments", {
      offerId: args.offerId,
      assortmentId: args.assortmentId,
      validFrom: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "offer.assortment_included",
      entityType: "offer",
      entityId: args.offerId,
    });
    return id;
  },
});
