import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

export const debugOpenSessions = internalQuery({
  args: {},
  handler: async (ctx) => {
    const sessions = await ctx.db
      .query("cashRegisterSessions")
      .withIndex("by_status", (q) => q.eq("status", "open"))
      .collect();
    return sessions;
  },
});

export const testIdentityResolve = internalQuery({
  args: {
    userId: v.optional(v.id("users")),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let userId = args.userId;
    let username = args.username;
    if (userId && !username) {
      const user = await ctx.db.get(userId);
      if (user) {
        username = user.username;
      }
    } else if (username && !userId) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_username", (q) => q.eq("username", username!))
        .unique();
      if (user) {
        userId = user._id;
      }
    }
    return { userId, username };
  },
});

