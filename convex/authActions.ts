"use node";

import { action } from "./_generated/server";
import { v, ConvexError } from "convex/values";
import bcrypt from "bcryptjs";
import { internal } from "./_generated/api";
import { Doc } from "./_generated/dataModel";

/**
 * Public login action — runs in Node.js runtime for bcrypt.
 * Validates credentials, creates session, returns token + user info.
 */
export const login = action({
  args: {
    username: v.string(),
    password: v.string(),
    userAgent: v.optional(v.string()),
    device: v.optional(v.string()),
    browser: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // 1. Fetch user by username (internal query can access db)
    const user = (await ctx.runQuery(internal.auth.getUserByUsername, {
      username: args.username.trim().toLowerCase(),
    })) as Doc<"users"> | null;

    if (!user) {
      throw new ConvexError("USER_NOT_FOUND");
    }

    if (user.status === "disabled") {
      throw new ConvexError("ACCOUNT_DISABLED");
    }

    // 2. Verify password
    const valid = await bcrypt.compare(args.password, user.passwordHash);
    if (!valid) {
      throw new ConvexError("INVALID_CREDENTIALS");
    }

    // 3. Create session
    const token = (await ctx.runMutation(internal.auth.createSession, {
      userId: user._id,
      userAgent: args.userAgent,
      device: args.device,
      browser: args.browser,
    })) as string;

    // 4. Update last login timestamp
    await ctx.runMutation(internal.auth.updateLastLogin, { userId: user._id });

    // 5. Audit log
    await ctx.runMutation(internal.auth.logAudit, {
      userId: user._id,
      username: user.username,
      action: "user_login",
      details: "User logged in successfully",
    });

    return {
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
      },
    };
  },
});
