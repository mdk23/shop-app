import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { currentNuit, recordNuit } from "./lib/fiscal";

export const getNuit = query({
  args: { customerId: v.id("customers") },
  handler: async (ctx, args) => currentNuit(ctx, args.customerId),
});

/** Records a new NUIT for the customer and closes the previous one, keeping history. */
export const setNuit = mutation({
  args: { token: v.string(), customerId: v.id("customers"), number: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    if (!(await ctx.db.get(args.customerId))) throw new Error("Customer not found.");
    const id = await recordNuit(ctx, { customerId: args.customerId }, args.number);
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.nuit_set",
      entityType: "customer",
      entityId: args.customerId,
    });
    return id;
  },
});
