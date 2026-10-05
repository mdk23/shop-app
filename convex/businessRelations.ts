import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize } from "./permissions";
import { writeAudit } from "./audit";

/** Business relations this customer takes part in, with everyone on each relation. */
export const listByPerson = query({
  args: { personId: v.id("customers") },
  handler: async (ctx, args) => {
    const mine = await ctx.db
      .query("relationParticipants")
      .withIndex("by_person", (q) => q.eq("personId", args.personId))
      .collect();
    return await Promise.all(
      mine.map(async (p) => {
        const relation = await ctx.db.get(p.relationId);
        const others = await ctx.db
          .query("relationParticipants")
          .withIndex("by_relation", (q) => q.eq("relationId", p.relationId))
          .collect();
        const people = await Promise.all(
          others.map(async (o) => ({
            _id: o._id,
            role: o.role,
            name: (await ctx.db.get(o.personId))?.name ?? "—",
            isThisCustomer: o.personId === args.personId,
          }))
        );
        return { relationId: p.relationId, role: p.role, startedAt: relation?.startedAt, endedAt: relation?.endedAt, people };
      })
    );
  },
});

/** Opens a new relation with this customer as its first participant. */
export const open = mutation({
  args: {
    token: v.string(),
    personId: v.id("customers"),
    role: v.string(),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "customers.manage");
    const role = args.role.trim();
    if (!role) throw new Error("Give the customer's role in the relation.");
    if (!(await ctx.db.get(args.personId))) throw new Error("Customer not found.");
    const now = Date.now();
    const relationId = await ctx.db.insert("businessRelations", {
      startedAt: now,
      registeredAt: now,
    });
    await ctx.db.insert("relationParticipants", {
      relationId,
      personId: args.personId,
      role,
      validFrom: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "relation.opened",
      entityType: "customer",
      entityId: args.personId,
      details: role,
    });
    return relationId;
  },
});
