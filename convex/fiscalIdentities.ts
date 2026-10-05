import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";
import { currentNuit } from "./lib/fiscal";

export const getNuit = query({
  args: { personId: v.id("customers") },
  handler: async (ctx, args) => currentNuit(ctx, args.personId),
});

/** Records a new NUIT for the customer and closes the previous one, keeping history. */
export const setNuit = mutation({
  args: { token: v.string(), personId: v.id("customers"), number: v.string() },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const number = args.number.trim();
    if (!/^\d{9}$/.test(number)) throw new Error("A NUIT has nine digits.");
    if (!(await ctx.db.get(args.personId))) throw new Error("Customer not found.");
    const now = Date.now();
    const rows = await ctx.db
      .query("fiscalIdentities")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    for (const row of rows) {
      if (row.identificationType === "NUIT" && row.validTo === undefined) {
        if (row.number === number) return row._id;
        await ctx.db.patch(row._id, { validTo: now });
      }
    }
    const id = await ctx.db.insert("fiscalIdentities", {
      personId: args.personId,
      identificationType: "NUIT",
      number,
      country: "MZ",
      validFrom: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "customer.nuit_set",
      entityType: "customer",
      entityId: args.personId,
    });
    return id;
  },
});
