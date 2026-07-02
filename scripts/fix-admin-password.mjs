// Script to fix the admin user's password hash via Convex HTTP API
// Run: node scripts/fix-admin-password.mjs

import bcrypt from "bcryptjs";
import { readFileSync } from "fs";
import { ConvexHttpClient } from "convex/browser";

// Read the Convex URL from .env.local
const envContent = readFileSync(".env.local", "utf8");
const convexUrl = envContent
  .split("\n")
  .find((l) => l.startsWith("NEXT_PUBLIC_CONVEX_URL="))
  ?.split("=")[1]
  ?.trim();

if (!convexUrl) {
  console.error("Could not find NEXT_PUBLIC_CONVEX_URL in .env.local");
  process.exit(1);
}

console.log(`Connecting to Convex: ${convexUrl}`);

const client = new ConvexHttpClient(convexUrl);

// User ID from the database
const USER_ID = "kx71sdxe209cy70yh21cna5dpn87rgyd";
const NEW_PASSWORD = "admin123";

const hash = await bcrypt.hash(NEW_PASSWORD, 10);
console.log("Generated hash:", hash.slice(0, 20) + "...");

// Call the internal mutation via a public wrapper
// We'll use seedAdmin's internal.users.updatePasswordHash

// Actually we need to call the public action — let's do it via the HTTP client
// We need to create a temp public mutation for this. Instead, let's use the CLI JSON trick.

console.log("\nHash generated. Now patching via Convex dashboard API...");
console.log("\nRun this in the Convex dashboard Functions tab:");
console.log(`\nusers:updatePasswordHash\n{ "id": "${USER_ID}", "passwordHash": "${hash}" }`);
console.log("\nOr paste this at: https://dashboard.convex.dev -> Your Project -> Data -> users table -> Edit the mdk record -> set passwordHash field");
