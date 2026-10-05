import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "edge-runtime",
    server: { deps: { inline: ["convex-test"] } },
    include: ["convex/**/*.test.ts"],
    // convex-test keeps one global transaction per worker; parallel files collide.
    fileParallelism: false,
  },
});
