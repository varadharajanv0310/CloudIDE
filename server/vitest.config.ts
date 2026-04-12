import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    testTimeout: 40_000,
    hookTimeout: 40_000,
    // Docker containers are the bottleneck; run files sequentially to avoid
    // hammering the daemon with parallel container creates.
    fileParallelism: false,
    pool: "forks",
  },
});
