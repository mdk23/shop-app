import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const get = query({
  args: { id: v.id("stockCounts") },
  handler: async (ctx, args) => {
    const count = await ctx.db.get(args.id);
    if (!count) return null;
    const lines = await ctx.db
      .query("stockCountLines")
      .withIndex("by_count", (q) => q.eq("countId", args.id))
      .collect();
    return { ...count, lines };
  },
});

export const listByBranch = query({
  args: { branchId: v.id("branches") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stockCounts")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .order("desc")
      .take(50);
  },
});

/** Opens a count for a branch and snapshots the book quantity of every stocked variant. */
export const start = mutation({
  args: { token: v.string(), branchId: v.id("branches"), notes: v.optional(v.string()) },
  handler: async (ctx, args): Promise<Id<"stockCounts">> => {
    const actor = await authorize(ctx, args.token, "inventory.adjust");
    if (!(await ctx.db.get(args.branchId))) throw new Error("Branch not found.");

    const open = await ctx.db
      .query("stockCounts")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();
    if (open.some((c) => c.status === "OPEN")) {
      throw new Error("A count is already open for this branch. Close it first.");
    }

    const now = Date.now();
    const countId = await ctx.db.insert("stockCounts", {
      branchId: args.branchId,
      status: "OPEN",
      notes: args.notes?.trim() || undefined,
      startedBy: actor._id,
      startedByUsername: actor.username,
      startedAt: now,
    });
    const stock = await ctx.db
      .query("variantStock")
      .withIndex("by_branch", (q) => q.eq("branchId", args.branchId))
      .collect();
    for (const row of stock) {
      await ctx.db.insert("stockCountLines", {
        countId,
        productVariantId: row.productVariantId,
        expectedQuantity: row.quantity,
      });
    }

    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "stock_count.started",
      entityType: "stockCount",
      entityId: countId,
      details: `Count started for branch ${args.branchId}: ${stock.length} line(s)`,
    });
    return countId;
  },
});

/** Records what was physically counted. A variant not in the snapshot is added as a line. */
export const recordCounts = mutation({
  args: {
    token: v.string(),
    countId: v.id("stockCounts"),
    counts: v.array(
      v.object({
        productVariantId: v.id("productVariants"),
        countedQuantity: v.number(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "inventory.adjust");
    const count = await ctx.db.get(args.countId);
    if (!count) throw new Error("Count not found.");
    if (count.status !== "OPEN") throw new Error("This count is closed.");

    const changed: string[] = [];
    for (const c of args.counts) {
      if (c.countedQuantity < 0) throw new Error("Counted quantities cannot be negative.");
      const existing = await ctx.db
        .query("stockCountLines")
        .withIndex("by_count_and_variant", (q) =>
          q.eq("countId", args.countId).eq("productVariantId", c.productVariantId)
        )
        .unique();
      if (existing?.countedQuantity === c.countedQuantity) continue;
      if (existing) {
        await ctx.db.patch(existing._id, { countedQuantity: c.countedQuantity });
      } else {
        await ctx.db.insert("stockCountLines", {
          countId: args.countId,
          productVariantId: c.productVariantId,
          expectedQuantity: 0,
          countedQuantity: c.countedQuantity,
        });
      }
      const variant = await ctx.db.get(c.productVariantId);
      changed.push(`${variant?.sku ?? "?"} ${existing?.countedQuantity ?? "—"} → ${c.countedQuantity}`);
    }
    if (changed.length > 0) {
      await writeAudit(ctx, {
        userId: actor._id,
        username: actor.username,
        action: "stock_count.counted",
        entityType: "stockCount",
        entityId: args.countId,
        details: changed.join("; "),
      });
    }
  },
});

/**
 * Applies every counted line whose quantity differs from stock on hand now (not the
 * snapshot), so sales made during the count are not reversed. Uncounted lines are
 * left alone and reported.
 */
export const close = mutation({
  args: { token: v.string(), countId: v.id("stockCounts") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "inventory.adjust");
    const count = await ctx.db.get(args.countId);
    if (!count) throw new Error("Count not found.");
    if (count.status !== "OPEN") throw new Error("This count is already closed.");

    const lines = await ctx.db
      .query("stockCountLines")
      .withIndex("by_count", (q) => q.eq("countId", args.countId))
      .collect();

    let applied = 0;
    let uncounted = 0;
    for (const line of lines) {
      if (line.countedQuantity === undefined) {
        uncounted += 1;
        continue;
      }
      const stock = await ctx.db
        .query("variantStock")
        .withIndex("by_branch_and_variant", (q) =>
          q.eq("branchId", count.branchId).eq("productVariantId", line.productVariantId)
        )
        .unique();
      const previousQuantity = stock?.quantity ?? 0;
      const delta = line.countedQuantity - previousQuantity;

      if (delta !== 0) {
        await ctx.runMutation(internal.inventory.mutateStock, {
          productVariantId: line.productVariantId,
          branchId: count.branchId,
          quantity: delta,
          movementType: "STOCK_ADJUSTMENT",
          // A count correction is a stock adjustment; the movement keeps the count's id.
          referenceType: "stock_adjustment",
          referenceId: args.countId,
          adjustmentReason: "PHYSICAL_COUNT",
          notes: "Physical count",
          userId: actor._id,
          username: actor.username,
          allowNegative: true,
        });
        applied += 1;
      }
      await ctx.db.patch(line._id, { appliedDelta: delta });
    }

    const now = Date.now();
    await ctx.db.patch(args.countId, { status: "CLOSED", closedAt: now });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "stock_count.closed",
      entityType: "stockCount",
      entityId: args.countId,
      details: `Count closed: ${applied} adjusted, ${uncounted} not counted`,
    });
    return { applied, uncounted };
  },
});
