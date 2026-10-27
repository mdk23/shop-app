import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { authorize, validateToken } from "./permissions";
import { writeAudit } from "./audit";

export const list = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    await validateToken(ctx, args.token);
    const rows = await ctx.db.query("collections").take(1000);
    return rows.filter((r) => r.active).sort((a, b) => a.name.localeCompare(b.name));
  },
});

export const create = mutation({
  args: {
    token: v.string(),
    name: v.string(),
    season: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const actor = await authorize(ctx, args.token, "products.manage");
    const name = args.name.trim();
    if (!name) throw new Error("Collection name is required.");
    const now = Date.now();
    const id = await ctx.db.insert("collections", {
      name,
      season: args.season?.trim() || undefined,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await writeAudit(ctx, {
      userId: actor._id,
      username: actor.username,
      action: "collection.created",
      entityType: "collection",
      entityId: id,
      details: `Created collection "${name}"`,
    });
    return id;
  },
});
