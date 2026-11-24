#!/usr/bin/env node
// Labelled re-check of feature-bench bar 4 (historical plans) after the 0.9.10 scanner fix.
// Same 40 cases and comparison as scripts/evaluate-features.mjs; the original recorded result in
// benchmarks/feature-bench/results.json is not changed. Writes recheck-historical-<version>.json.
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { materializePinnedRepository } from "./lib/external-cache.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const core = await import(pathToFileURL(join(root, "packages", "core", "dist", "index.js")).href);
const version = JSON.parse(await readFile(join(root, "packages", "core", "package.json"), "utf8")).version;
const cases = [
  ...JSON.parse(await readFile(join(root, "benchmarks", "heldout", "dataset.json"), "utf8")).cases,
  ...JSON.parse(await readFile(join(root, "benchmarks", "polyglot-heldout", "dataset.json"), "utf8")).cases
];
const top5 = (report) => report.contextFiles.slice(0, 5).map((file) => file.path);
const results = [];
for (const [index, benchmark] of cases.entries()) {
  process.stderr.write(`[${index + 1}/${cases.length}] ${benchmark.slug}\n`);
  try {
    const dir = await materializePinnedRepository(benchmark);
    const plan = await core.buildFixMapReport({ repoRoot: dir, issueText: benchmark.task, useCache: false });
    const atRef = await core.buildFixMapReport({ repoRoot: dir, issueText: benchmark.task, useCache: false, atRef: benchmark.sha });
    results.push({ slug: benchmark.slug, status: "ok", pass: JSON.stringify(top5(plan)) === JSON.stringify(top5(atRef)), workingTree: top5(plan), atRef: top5(atRef) });
  } catch (error) {
    results.push({ slug: benchmark.slug, status: "unavailable", reason: String(error?.message ?? error).split("\n")[0].slice(0, 200) });
  }
}
const ok = results.filter((entry) => entry.status === "ok");
const summary = { label: `re-check after fix, FixMap ${version}; not the pre-registered run`, cases: results.length, available: ok.length, passed: ok.filter((entry) => entry.pass).length };
await writeFile(join(root, "benchmarks", "feature-bench", `recheck-historical-${version}.json`), `${JSON.stringify({ summary, cases: results }, null, 2)}\n`);
console.log(JSON.stringify(summary));
