import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

const targetValidator = v.object({
  productVariantId: v.optional(v.id("productVariants")),
  productId: v.optional(v.id("products")),
  categoryId: v.optional(v.id("categories")),
  collectionId: v.optional(v.id("collections")),
});

const kindValidator = v.union(
  v.literal("PERCENT_OFF"),
  v.literal("AMOUNT_OFF"),
  v.literal("FIXED_PRICE")
);

type Target = {
  productVariantId?: Id<"productVariants">;
  productId?: Id<"products">;
  categoryId?: Id<"categories">;
  collectionId?: Id<"collections">;
};

async function assertTargetExists(ctx: MutationCtx, target: Target): Promise<void> {
  const keys = Object.entries(target).filter(([, id]) => id !== undefined);
  if (keys.length !== 1) {
    throw new Error("Each promotion target must point to exactly one product variant, product, category or collection.");
  }
  const [, id] = keys[0];
  if (!(await ctx.db.get(id as Id<"productVariants" | "products" | "categories" | "collections">))) {
    throw new Error("Promotion target not found.");
  }
}

export const list = query({
  args: {},
  handler: async (ctx) => {
    const promotions = await ctx.db.query("promotions").collect();
    return await Promise.all(
      promotions.map(async (p) => ({
        ...p,
        targets: await ctx.db
          .query("promotionTargets")
          .withIndex("by_promotion", (q) => q.eq("promotionId", p._id))
          .collect(),
      }))
    );
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    kind: kindValidator,
    value: v.number(),
    validFrom: v.number(),
    validTo: v.optional(v.number()),
    targets: v.array(targetValidator),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Promotion name is required.");
    if (args.value < 0) throw new Error("Promotion value cannot be negative.");
    if (args.kind === "PERCENT_OFF" && (args.value <= 0 || args.value > 100)) {
      throw new Error("Percentage discount must be greater than 0 and at most 100.");
    }
    if (args.kind === "AMOUNT_OFF" && args.value <= 0) {
      throw new Error("Amount discount must be greater than 0.");
    }
    if (args.validTo !== undefined && args.validTo <= args.validFrom) {
      throw new Error("Promotion end must be after its start.");
    }
    if (args.targets.length === 0) throw new Error("A promotion needs at least one target.");
    for (const target of args.targets) await assertTargetExists(ctx, target);

    const now = Date.now();
    const promotionId = await ctx.db.insert("promotions", {
      name,
      kind: args.kind,
      value: args.value,
      validFrom: args.validFrom,
      validTo: args.validTo,
      active: true,
      createdByUsername: actor.username,
      createdAt: now,
      updatedAt: now,
    });
    for (const target of args.targets) {
      await ctx.db.insert("promotionTargets", { promotionId, ...target });
    }

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "promotion.created",
      entityType: "promotion",
      entityId: promotionId,
      details: `Created promotion "${name}" with ${args.targets.length} target(s)`,
    });
    return promotionId;
  },
});

export const deactivate = mutation({
  args: { token: v.string(), id: v.id("promotions") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const promotion = await ctx.db.get(args.id);
    if (!promotion) throw new Error("Promotion not found.");
    await ctx.db.patch(args.id, { active: false, updatedAt: Date.now() });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "promotion.deactivated",
      entityType: "promotion",
      entityId: args.id,
      details: `Deactivated promotion "${promotion.name}"`,
    });
  },
});
