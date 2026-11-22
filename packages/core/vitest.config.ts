import { defineConfig } from "vitest/config";

// Core integration tests create real Git histories, large file trees, links, and concurrent
// caches. Unbounded file-level workers overload Windows filesystem/process resources and turn
// normal Git operations into false five-second timeouts. Four workers preserve parallel
// coverage; fifteen seconds still fails real hangs quickly, while individual deliberately
// heavier cases retain explicit longer bounds.
export default defineConfig({
  test: {
    maxWorkers: 4,
    testTimeout: 15_000,
    hookTimeout: 15_000,
    // Exercise the persistent incremental index on small fixtures; production only uses it
    // from INCREMENTAL_INDEX_MIN_FILES tracked paths. One test covers that default explicitly.
    env: { FIXMAP_INCREMENTAL_INDEX_MIN_FILES: "0" }
  }
});
