import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { nextSequence } from "./metrics";

async function hydrate(ctx: MutationCtx, transferId: Id<"stockTransfers">) {
  const transfer = await ctx.db.get(transferId);
  if (!transfer) throw new Error("Transfer not found.");
  const items = await ctx.db
    .query("stockTransferItems")
    .withIndex("by_transfer", (q) => q.eq("transferId", transferId))
    .collect();
  return { transfer, items };
}

export const create = mutation({
  args: {
    token: v.string(),
    sourceBranchId: v.id("branches"),
    destinationBranchId: v.id("branches"),
    items: v.array(
      v.object({ productVariantId: v.id("productVariants"), quantity: v.number() })
    ),
    notes: v.optional(v.string()),
    submit: v.optional(v.boolean()), // true → PENDING, else DRAFT
  },
  handler: async (ctx, args): Promise<Id<"stockTransfers">> => {
    const actor = await authorize(ctx, args.token, "inventory.transfer");
    if (args.sourceBranchId === args.destinationBranchId)
      throw new Error("Source and destination must differ.");
    if (args.items.length === 0) throw new Error("Add at least one item.");
    for (const it of args.items)
      if (it.quantity <= 0) throw new Error("Quantities must be positive.");

    const seq = await nextSequence(ctx, "transfer_sequence");
    const now = Date.now();
    const transferId = await ctx.db.insert("stockTransfers", {
      transferNumber: `TR-${String(seq).padStart(5, "0")}`,
      sourceBranchId: args.sourceBranchId,
      destinationBranchId: args.destinationBranchId,
      status: args.submit ? "PENDING" : "DRAFT",
      createdBy: actor._id,
      createdByUsername: actor.username,
      notes: args.notes,
      createdAt: now,
    });
    for (const it of args.items) {
      await ctx.db.insert("stockTransferItems", {
        transferId,
        productVariantId: it.productVariantId,
        quantity: it.quantity,
      });
    }
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "transfer.created",
      entityType: "stockTransfer",
      entityId: transferId,
      details: `${args.items.length} line(s), ${args.submit ? "PENDING" : "DRAFT"}`,
    });
    return transferId;
  },
});

export const setStatus = mutation({
  args: {
    token: v.string(),
    transferId: v.id("stockTransfers"),
    status: v.union(
      v.literal("PENDING"),
      v.literal("IN_TRANSIT"),
      v.literal("CANCELLED")
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "inventory.transfer");
    const { transfer } = await hydrate(ctx, args.transferId);
    if (transfer.status === "RECEIVED")
      throw new Error("A received transfer cannot change status.");
    if (transfer.status === "CANCELLED")
      throw new Error("A cancelled transfer cannot change status.");
    await ctx.db.patch(args.transferId, { status: args.status });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "transfer.status_changed",
      entityType: "stockTransfer",
      entityId: args.transferId,
      details: `${transfer.status} → ${args.status}`,
    });
  },
});

/**
 * Completing a transfer emits TRANSFER_OUT for the full sent quantity at the source
 * and TRANSFER_IN for what the destination counted. Any difference is a shortage in
 * transit: it is recorded on the receipt, not put back into the destination.
 */
export const receive = mutation({
  args: {
    token: v.string(),
    transferId: v.id("stockTransfers"),
    observed: v.optional(
      v.array(
        v.object({
          productVariantId: v.id("productVariants"),
          quantityObserved: v.number(),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "inventory.transfer");
    const { transfer, items } = await hydrate(ctx, args.transferId);
    if (transfer.status === "RECEIVED")
      throw new Error("Transfer already received.");
    if (transfer.status === "CANCELLED")
      throw new Error("Transfer was cancelled.");
    if (items.length === 0) throw new Error("Transfer has no items.");

    const observedByVariant = new Map(
      (args.observed ?? []).map((o) => [o.productVariantId, o.quantityObserved])
    );
    for (const key of observedByVariant.keys()) {
      if (!items.some((i) => i.productVariantId === key))
        throw new Error("A counted line is not part of this transfer.");
    }
    const lines = items.map((it) => {
      const quantityObserved = observedByVariant.get(it.productVariantId) ?? it.quantity;
      if (quantityObserved < 0 || quantityObserved > it.quantity)
        throw new Error(`Observed quantity must be between 0 and ${it.quantity}.`);
      return {
        productVariantId: it.productVariantId,
        quantitySent: it.quantity,
        quantityObserved,
      };
    });

    for (const line of lines) {
      await ctx.runMutation(internal.inventory.mutateStock, {
        productVariantId: line.productVariantId,
        branchId: transfer.sourceBranchId,
        quantity: -line.quantitySent,
        movementType: "TRANSFER_OUT",
        referenceType: "stock_transfer",
        referenceId: args.transferId,
        notes: `Transfer ${transfer.transferNumber} → destination`,
        userId: actor._id,
        username: actor.username,
      });
      if (line.quantityObserved > 0) {
        await ctx.runMutation(internal.inventory.mutateStock, {
          productVariantId: line.productVariantId,
          branchId: transfer.destinationBranchId,
          quantity: line.quantityObserved,
          movementType: "TRANSFER_IN",
          referenceType: "stock_transfer",
          referenceId: args.transferId,
          notes: `Transfer ${transfer.transferNumber} ← source`,
          userId: actor._id,
          username: actor.username,
        });
      }
    }

    const now = Date.now();
    await ctx.db.insert("stockTransferReceipts", {
      transferId: args.transferId,
      receivedBy: actor._id,
      receivedByUsername: actor.username,
      receivedAt: now,
      lines,
    });
    await ctx.db.patch(args.transferId, {
      status: "RECEIVED",
      completedAt: now,
    });

    const short = lines.filter((l) => l.quantityObserved < l.quantitySent).length;
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "transfer.received",
      entityType: "stockTransfer",
      entityId: args.transferId,
      details: `${transfer.transferNumber}: ${lines.length} line(s) moved${short ? `, ${short} short` : ""}`,
    });
  },
});

export const getReceipt = query({
  args: { transferId: v.id("stockTransfers") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("stockTransferReceipts")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.transferId))
      .first();
  },
});

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

/**
 * Cursor-paginated by status when given, else by creation order. A branch
 * filter (source OR destination) is applied in-memory on the page, since a
 * transfer's branch role isn't a single indexed field — so that combination
 * can return fewer than a full page, same as the status-less default.
 */
export const listPaged = query({
  args: {
    status: v.optional(
      v.union(
        v.literal("DRAFT"),
        v.literal("PENDING"),
        v.literal("IN_TRANSIT"),
        v.literal("RECEIVED"),
        v.literal("CANCELLED")
      )
    ),
    branchId: v.optional(v.id("branches")),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const result = args.status
      ? await ctx.db
          .query("stockTransfers")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .paginate(args.paginationOpts)
      : await ctx.db.query("stockTransfers").order("desc").paginate(args.paginationOpts);

    const page = args.branchId
      ? result.page.filter(
          (t) =>
            t.sourceBranchId === args.branchId || t.destinationBranchId === args.branchId
        )
      : result.page;

    return { ...result, page };
  },
});

export const get = query({
  args: { id: v.id("stockTransfers") },
  handler: async (ctx, args) => {
    const transfer = await ctx.db.get(args.id);
    if (!transfer) return null;
    const items = await ctx.db
      .query("stockTransferItems")
      .withIndex("by_transfer", (q) => q.eq("transferId", args.id))
      .collect();
    const withNames = await Promise.all(
      items.map(async (it) => {
        const variant = await ctx.db.get(it.productVariantId);
        const product = variant ? await ctx.db.get(variant.productId) : null;
        return {
          ...it,
          sku: variant?.sku ?? "?",
          label: `${product?.name ?? "?"} — ${[variant?.color, variant?.size].filter(Boolean).join(" / ")}`,
        };
      })
    );
    const source = await ctx.db.get(transfer.sourceBranchId);
    const destination = await ctx.db.get(transfer.destinationBranchId);
    return { ...transfer, items: withNames, source, destination };
  },
});
