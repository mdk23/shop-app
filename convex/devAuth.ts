import { mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// ─────────────────────────────────────────────
// DEV AUTH BYPASS — "remove auth for now"
//
// Idempotently provisions a permanent admin user + a fixed-token session
// so the whole app (including every Convex mutation that calls
// `validateToken`) works without a login flow.
//
// To restore real authentication:
//   1. set DEV_BYPASS_AUTH = false in src/contexts/AuthContext.tsx
//   2. delete this file
// ─────────────────────────────────────────────

export const DEV_TOKEN = "dev-bypass-session-token";

const TEN_YEARS_MS = 1000 * 60 * 60 * 24 * 365 * 10;

export const ensureDevSession = mutation({
  args: {},
  handler: async (ctx): Promise<{ token: string }> => {
    // 1. Find or create the dev admin user.
    const existingUser = await ctx.db
      .query("users")
      .withIndex("by_username", (q) => q.eq("username", "dev"))
      .unique();

    let userId: Id<"users">;
    if (existingUser) {
      userId = existingUser._id;
      if (existingUser.status !== "active" || existingUser.role !== "admin") {
        await ctx.db.patch(userId, { status: "active", role: "admin" });
      }
    } else {
      userId = await ctx.db.insert("users", {
        name: "Dev Admin",
        username: "dev",
        passwordHash: "dev-bypass-no-password",
        role: "admin",
        status: "active",
        createdAt: Date.now(),
      });
    }

    // 2. Find or create a long-lived session pinned to a fixed token.
    const farFuture = Date.now() + TEN_YEARS_MS;
    const existingSession = await ctx.db
      .query("userSessions")
      .withIndex("by_token", (q) => q.eq("token", DEV_TOKEN))
      .unique();

    if (existingSession) {
      if (existingSession.userId !== userId || existingSession.expiresAt < Date.now() + TEN_YEARS_MS / 2) {
        await ctx.db.patch(existingSession._id, {
          userId,
          expiresAt: farFuture,
          lastActivity: Date.now(),
        });
      }
    } else {
      await ctx.db.insert("userSessions", {
        userId,
        token: DEV_TOKEN,
        expiresAt: farFuture,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        device: "Desktop",
        browser: "Dev",
      });
    }

    return { token: DEV_TOKEN };
  },
});
