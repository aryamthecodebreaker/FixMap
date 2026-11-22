import { defineConfig } from "vitest/config";

// CLI integration tests create real Git repositories, MCP transports, file watchers, and
// atomic setup destinations. Running every file at once overwhelms Windows filesystem and
// process resources, producing false five-second timeouts and EBUSY cleanup failures. Two
// files still overlap while tests that deliberately exercise races retain their own internal
// concurrency and the existing timeout remains meaningful.
export default defineConfig({
  test: {
    maxWorkers: 2,
    testTimeout: 15_000,
    hookTimeout: 15_000
  }
});
