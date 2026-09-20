import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scanRepo } from "../packages/core/dist/index.js";

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const previousCache = process.env.FIXMAP_CACHE_DIR;
const results = [];
const exec = promisify(execFile);
for (const count of [100, 1000, 10_000]) {
  const root = await mkdtemp(join(tmpdir(), "fixmap-incremental-benchmark-"));
  const cache = await mkdtemp(join(tmpdir(), "fixmap-incremental-cache-"));
  try {
    process.env.FIXMAP_CACHE_DIR = cache;
    await mkdir(join(root, "src"));
    for (let index = 0; index < count; index++) {
      await writeFile(join(root, "src", `${index}.ts`), `export const item${index} = ${index};\n${"// representative source text\n".repeat(100)}`);
    }
    // Fixture population is outside measured scan time. Large Windows indexes
    // need more setup time; keep local line endings independent of user config.
    const git = (...args) => exec("git", args, { cwd: root, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 });
    await git("init", "--quiet");
    await git("config", "core.autocrlf", "false");
    await git("add", ".");
    await git("-c", "user.name=Benchmark", "-c", "user.email=benchmark@example.invalid", "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "fixture");
    await scanRepo({ repoRoot: root, useCache: true, includeHistory: false });
    const timings = { incremental: [], fresh: [], cacheKeyGitProbe: [] };
    for (let round = 0; round < 5; round++) {
      await writeFile(join(root, "src", "0.ts"), `export const changed = ${round};\n`);
      const scans = {};
      for (const mode of round % 2 === 0 ? ["incremental", "fresh"] : ["fresh", "incremental"]) {
        const start = performance.now();
        scans[mode] = await scanRepo({ repoRoot: root, useCache: mode === "incremental", includeHistory: false });
        timings[mode].push(Math.round(performance.now() - start));
      }
      assert.deepEqual(scans.incremental.files, scans.fresh.files);
      assert.equal(scans.incremental.diffText, scans.fresh.diffText);
      assert(scans.incremental.diagnostics.some((entry) => entry.code === "incremental-index-hit"), "Expected real incremental reuse, not exact-state reuse");
      // Separate calibration of the same Git calls used by buildScanCacheLocation.
      // Not an internal span and not subtracted from measured scan times.
      const probeStart = performance.now();
      await exec("git", ["status", "--porcelain=v2", "--branch", "--no-ahead-behind", "-z", "--untracked-files=all", "--", "."], { cwd: root });
      await exec("git", ["diff", "--binary", "--no-ext-diff", "HEAD", "--", "."], { cwd: root });
      timings.cacheKeyGitProbe.push(Math.round(performance.now() - probeStart));
    }
    const result = { count, rounds: 5, timings, medianIncrementalMs: median(timings.incremental), medianFreshMs: median(timings.fresh), medianCacheKeyGitProbeMs: median(timings.cacheKeyGitProbe), exact: true };
    results.push(result);
    // Preserve completed measurements even if Windows temporarily locks cleanup.
    console.log(JSON.stringify({ kind: "completed-incremental-tier", ...result }));
  } catch (error) {
    // Cleanup failure must not conceal the actual benchmark/setup failure.
    console.error("Incremental benchmark failed before cleanup:", error);
    throw error;
  } finally {
    if (previousCache === undefined) delete process.env.FIXMAP_CACHE_DIR;
    else process.env.FIXMAP_CACHE_DIR = previousCache;
    await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    await rm(cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
console.log(JSON.stringify({ kind: "local-alternating-order-incremental-measurement", results }, null, 2));
