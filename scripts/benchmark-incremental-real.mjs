// Local-only real-corpus experiment. Clones a supplied checkout without sharing
// object files, edits only that disposable clone, and never runs repository code.
// Usage: node scripts/benchmark-incremental-real.mjs <local-checkout> <tracked-file>
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, relative, isAbsolute } from "node:path";
import { promisify } from "node:util";
import { scanRepo } from "../packages/core/dist/index.js";

const [sourceArg, editPath] = process.argv.slice(2);
assert(sourceArg && editPath, "Provide a local checkout and a tracked text file");
assert(!isAbsolute(editPath) && !editPath.split(/[\\/]/).includes(".."), "Edit path must stay within the clone");
const source = await realpath(resolve(sourceArg));
const exec = promisify(execFile);
const git = async (cwd, ...args) => (await exec("git", args, { cwd, timeout: 120_000, maxBuffer: 20 * 1024 * 1024 })).stdout;
const sha = (await git(source, "rev-parse", "HEAD")).trim();
const root = await mkdtemp(join(tmpdir(), "fixmap-real-incremental-"));
const cache = await mkdtemp(join(tmpdir(), "fixmap-real-cache-"));
const previousCache = process.env.FIXMAP_CACHE_DIR;
try {
  await git(root, "clone", "--quiet", "--no-hardlinks", "--no-checkout", source, ".");
  await git(root, "config", "core.autocrlf", "false");
  await git(root, "config", "core.eol", "lf");
  await git(root, "config", "core.longpaths", "true");
  await git(root, "-c", `core.hooksPath=${join(root, "disabled-hooks")}`, "checkout", "--quiet", "--detach", sha);
  await git(root, "ls-files", "--error-unmatch", "--", editPath);
  const target = await realpath(join(root, editPath));
  const contained = relative(root, target);
  assert(contained && !contained.startsWith("..") && !isAbsolute(contained), "Edit target must not escape via a link");
  const original = await readFile(target, "utf8");
  assert(!original.includes("\0"), "Choose a text file");
  process.env.FIXMAP_CACHE_DIR = cache;
  await scanRepo({ repoRoot: root, useCache: true, includeHistory: false });
  const timings = { incremental: [], fresh: [] };
  let files = 0;
  for (let round = 0; round < 5; round++) {
    await writeFile(target, `${original}\n// incremental benchmark edit ${round}\n`);
    const scans = {};
    for (const mode of round % 2 ? ["fresh", "incremental"] : ["incremental", "fresh"]) {
      const start = performance.now();
      scans[mode] = await scanRepo({ repoRoot: root, useCache: mode === "incremental", includeHistory: false, workingTree: true });
      timings[mode].push(Math.round(performance.now() - start));
    }
    assert.deepEqual(scans.incremental.files, scans.fresh.files);
    assert.deepEqual(scans.incremental.changedFiles, scans.fresh.changedFiles);
    assert.deepEqual(scans.incremental.changedFiles, [editPath.replaceAll("\\", "/")]);
    assert.equal(scans.incremental.diffText, scans.fresh.diffText);
    assert(scans.incremental.diffText.includes(`incremental benchmark edit ${round}`));
    assert(scans.incremental.diagnostics.some((entry) => entry.code === "incremental-index-hit"));
    files = scans.fresh.files.length;
  }
  const median = (values) => [...values].sort((a, b) => a - b)[2];
  console.log(JSON.stringify({ source, sha, editPath, scanMode: "working-tree", files, rounds: 5, timings,
    medianIncrementalMs: median(timings.incremental), medianFreshMs: median(timings.fresh), exact: true }, null, 2));
} catch (error) {
  console.error("Real-corpus benchmark failed before cleanup:", error);
  throw error;
} finally {
  if (previousCache === undefined) delete process.env.FIXMAP_CACHE_DIR;
  else process.env.FIXMAP_CACHE_DIR = previousCache;
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  await rm(cache, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
