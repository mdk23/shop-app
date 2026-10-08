import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
    // convex-test keeps one global transaction per worker; parallel files collide.
    fileParallelism: false,
    // The first test in a file loads every Convex module (~5s on a busy machine).
    testTimeout: 20_000,
  },
});
