import { v } from "convex/values";
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

/** Completing a transfer emits paired TRANSFER_OUT (source) + TRANSFER_IN (destination) movements. */
export const receive = mutation({
  args: { token: v.string(), transferId: v.id("stockTransfers") },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "inventory.transfer");
    const { transfer, items } = await hydrate(ctx, args.transferId);
    if (transfer.status === "RECEIVED")
      throw new Error("Transfer already received.");
    if (transfer.status === "CANCELLED")
      throw new Error("Transfer was cancelled.");
    if (items.length === 0) throw new Error("Transfer has no items.");

    for (const it of items) {
      await ctx.runMutation(internal.inventory.mutateStock, {
        productVariantId: it.productVariantId,
        branchId: transfer.sourceBranchId,
        quantity: -it.quantity,
        movementType: "TRANSFER_OUT",
        referenceType: "stock_transfer",
        referenceId: args.transferId,
        notes: `Transfer ${transfer.transferNumber} → destination`,
        userId: actor._id,
        username: actor.username,
      });
      await ctx.runMutation(internal.inventory.mutateStock, {
        productVariantId: it.productVariantId,
        branchId: transfer.destinationBranchId,
        quantity: it.quantity,
        movementType: "TRANSFER_IN",
        referenceType: "stock_transfer",
        referenceId: args.transferId,
        notes: `Transfer ${transfer.transferNumber} ← source`,
        userId: actor._id,
        username: actor.username,
      });
    }

    await ctx.db.patch(args.transferId, {
      status: "RECEIVED",
      completedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "transfer.received",
      entityType: "stockTransfer",
      entityId: args.transferId,
      details: `${transfer.transferNumber}: ${items.length} line(s) moved`,
    });
  },
});

// ─────────────────────────────────────────────
// QUERIES
// ─────────────────────────────────────────────

export const list = query({
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
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    let rows = args.status
      ? await ctx.db
          .query("stockTransfers")
          .withIndex("by_status", (q) => q.eq("status", args.status!))
          .order("desc")
          .take((args.limit ?? 100) * 2)
      : await ctx.db.query("stockTransfers").order("desc").take((args.limit ?? 100) * 2);
    if (args.branchId)
      rows = rows.filter(
        (t) =>
          t.sourceBranchId === args.branchId ||
          t.destinationBranchId === args.branchId
      );
    return rows.slice(0, args.limit ?? 100);
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
