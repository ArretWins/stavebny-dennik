import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    globals: true,
    testTimeout: 15_000,
    // PGlite starts a WASM PostgreSQL instance in migration suites. Running
    // several instances concurrently causes avoidable CPU contention on CI
    // and can turn deterministic database checks into timeout failures.
    fileParallelism: false,
  },
});
