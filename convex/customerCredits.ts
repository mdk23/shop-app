import { v } from "convex/values";
import { mutation, query, MutationCtx } from "./_generated/server";
import { Id } from "./_generated/dataModel";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

export type CreditReason =
  | "RETURN_REFUND"
  | "OVERPAYMENT"
  | "MANUAL_GRANT"
  | "REDEEMED_ON_SALE";

/** Current store-credit balance for a customer (sum of the ledger). */
export async function creditBalance(
  ctx: MutationCtx,
  customerId: Id<"customers">
): Promise<number> {
  const rows = await ctx.db
    .query("customerCredits")
    .withIndex("by_customer", (q) => q.eq("customerId", customerId))
    .collect();
  return rows.reduce((s, r) => s + r.delta, 0);
}

/**
 * Append one traceable movement to the store-credit ledger. `delta` is signed
 * (+ grants credit, − redeems it). Never edit a customer balance directly.
 */
export async function adjustCustomerCredit(
  ctx: MutationCtx,
  args: {
    customerId: Id<"customers">;
    delta: number;
    reason: CreditReason;
    referenceType?: string;
    referenceId?: string;
    userId?: Id<"users">;
    username?: string;
    notes?: string;
  }
): Promise<{ balanceAfter: number; id: Id<"customerCredits"> }> {
  const current = await creditBalance(ctx, args.customerId);
  const balanceAfter = Math.round((current + args.delta) * 100) / 100;
  if (balanceAfter < -1e-6) {
    throw new Error("Store-credit balance cannot go negative.");
  }
  const id = await ctx.db.insert("customerCredits", {
    customerId: args.customerId,
    delta: args.delta,
    balanceAfter,
    reason: args.reason,
    referenceType: args.referenceType,
    referenceId: args.referenceId,
    userId: args.userId,
    username: args.username,
    notes: args.notes,
    createdAt: Date.now(),
  });
  return { balanceAfter, id };
}

// ─────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────

export const getBalance = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("customerCredits")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .collect();
    return rows.reduce((s, r) => s + r.delta, 0);
  },
});

export const listForCustomer = query({
  args: { customerId: v.id("customers"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("customerCredits")
      .withIndex("by_customer", (q) => q.eq("customerId", args.customerId))
      .order("desc")
      .take(args.limit ?? 100);
  },
});

export const grant = mutation({
  args: {
    token: v.string(),
    customerId: v.id("customers"),
    amount: v.number(),
    notes: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.credit_grant");
    if (args.amount === 0) throw new Error("Amount must be non-zero.");
    const customer = await ctx.db.get(args.customerId);
    if (!customer) throw new Error("Customer not found.");
    if (customer.isGeneric)
      throw new Error("Cannot assign store credit to the walk-in customer.");

    const { balanceAfter } = await adjustCustomerCredit(ctx, {
      customerId: args.customerId,
      delta: args.amount,
      reason: "MANUAL_GRANT",
      userId: actor._id,
      username: actor.username,
      notes: args.notes,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.credit_granted",
      entityType: "customer",
      entityId: args.customerId,
      details: `${args.amount >= 0 ? "+" : ""}${args.amount} (balance ${balanceAfter}) — ${args.notes}`,
    });
    return balanceAfter;
  },
});
