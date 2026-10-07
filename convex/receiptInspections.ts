import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export const listByReceipt = query({
  args: { receiptId: v.id("purchaseReceipts") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("receiptInspections")
      .withIndex("by_receipt", (q) => q.eq("receiptId", args.receiptId))
      .order("desc")
      .collect();
  },
});

/** The check of goods at the origin: OK, or a discrepancy with notes. */
export const create = mutation({
  args: {
    token: v.string(),
    receiptId: v.id("purchaseReceipts"),
    result: v.union(v.literal("OK"), v.literal("DISCREPANCY")),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "purchasing.receive");
    if (!(await ctx.db.get(args.receiptId))) throw new Error("Receipt not found.");
    if (args.result === "DISCREPANCY" && !args.notes?.trim()) {
      throw new Error("Describe the discrepancy.");
    }
    const id = await ctx.db.insert("receiptInspections", {
      receiptId: args.receiptId,
      result: args.result,
      notes: args.notes?.trim() || undefined,
      inspectedBy: actor._id,
      inspectedByUsername: actor.username,
      inspectedAt: Date.now(),
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "receipt.inspected",
      entityType: "purchaseReceipt",
      entityId: args.receiptId,
      details: args.result,
    });
    return id;
  },
});
