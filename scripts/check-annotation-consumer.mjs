import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

// Run against an explicit disposable npm project containing the locally packed packages.
if (!process.argv[2]) throw new Error("Usage: node scripts/check-annotation-consumer.mjs <consumer-project>");
const consumer = resolve(process.argv[2]);
const core = await import(pathToFileURL(join(consumer, "node_modules/@aryam/fixmap-core/dist/index.js")).href);
const cli = join(consumer, "node_modules/@aryam/fixmap/dist/cli.js");
const root = await mkdtemp(join(tmpdir(), "fixmap-annotation-processes-"));
const run = (...args) => {
  const result = spawnSync(process.execPath, [cli, "annotate", ...args, "--repo", root], { encoding: "utf8", timeout: 30_000 });
  if (result.error) throw result.error;
  assert.equal(result.signal, null);
  return result;
};
try {
  const first = core.createAnnotation({ scope: { kind: "service", name: "auth" }, note: "first process", createdAt: "2026-01-01T00:00:00Z" });
  await core.updateAnnotationStore(root, (store) => core.addAnnotation(store, first));
  const path = join(root, ".fixmap", "annotations.json");
  const before = await readFile(path, "utf8");
  await core.updateAnnotationStore(root, async (store) => {
    const lock = join(root, ".fixmap", "annotations.lock");
    await utimes(lock, new Date(0), new Date(0));
    const lockBytes = await readFile(lock, "utf8");
    const rejected = run("--service", "auth", "--note", "second process");
    assert.equal(rejected.status, 1);
    assert.match(rejected.stderr, /annotation update is in progress/);
    assert.equal(await readFile(path, "utf8"), before);
    assert.equal(await readFile(lock, "utf8"), lockBytes);
    return store;
  });
  const retry = run("--service", "auth", "--note", "second process");
  assert.equal(retry.status, 0, retry.stderr);
  const listed = run("--list", "--format", "json");
  assert.equal(listed.status, 0, listed.stderr);
  assert.deepEqual(JSON.parse(listed.stdout).annotations.map((entry) => entry.note).sort(), ["first process", "second process"]);
  process.stdout.write("PASS: packed cross-process aged-lock rejection, unchanged store, release, retry, and both notes retained.\n");
} finally {
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
