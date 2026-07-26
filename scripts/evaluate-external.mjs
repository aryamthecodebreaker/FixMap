// Cross-repository ranking evaluation against real fixed issues.
//
//   node scripts/evaluate-external.mjs                   report top-1/3/5 hit rates
//   node scripts/evaluate-external.mjs --gate            additionally fail below regression floors
//   node scripts/evaluate-external.mjs --suite heldout   evaluate the held-out suite instead
//
// Cases live in benchmarks/<suite>/dataset.json with pinned commit SHAs;
// repositories are cloned shallowly from upstream into the OS temp dir the
// first time and reused afterwards. Needs network access on the first run,
// so this is a scheduled/manual workflow rather than part of `npm run ci`.
//
// Two suites exist and they answer different questions. `external` has informed
// ranking changes, so it measures regression rather than generalization. `heldout`
// was selected by the same frozen rule after the ranker was finished and must not
// be used to tune anything — it is the only suite whose number estimates how
// FixMap behaves on a repository it has never been shaped by.

import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { materializePinnedRepository } from "./lib/external-cache.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { scanRepo, rankContextFiles } = await import(pathToFileURL(join(repoRoot, "packages", "core", "dist", "index.js")).href);

const suiteIndex = process.argv.indexOf("--suite");
const suite = suiteIndex === -1 ? "external" : process.argv[suiteIndex + 1];
if (!["external", "heldout"].includes(suite)) {
  process.stderr.write(`Unknown suite "${suite}"; expected "external" or "heldout".\n`);
  process.exit(1);
}
const suiteDir = join(repoRoot, "benchmarks", suite);
const dataset = JSON.parse(await readFile(join(suiteDir, "dataset.json"), "utf8"));

// Floors exist to catch ranking collapses in the scheduled run; they are
// deliberately below measured performance and must not be treated as targets.
const FLOORS = { top1: 0.3, top3: 0.5, top5: 0.5 };

const results = [];
for (const benchmark of dataset.cases) {
  const dir = await materializePinnedRepository(benchmark);
  const repo = await scanRepo({ repoRoot: dir });
  if (repo.files.length === 0) {
    throw new Error(`External evaluation could not scan any files for ${benchmark.slug} at ${benchmark.sha}.`);
  }
  const ranked = rankContextFiles(repo, { issueText: benchmark.task }, 5);
  const paths = ranked.map((file) => file.path);
  results.push({
    slug: benchmark.slug,
    issue: benchmark.issue,
    expected: benchmark.expected,
    top5: paths,
    top1: benchmark.expected.includes(paths[0]),
    top3: benchmark.expected.some((path) => paths.slice(0, 3).includes(path)),
    top5Hit: benchmark.expected.some((path) => paths.includes(path))
  });
}

const rate = (key) => results.filter((result) => result[key]).length / results.length;
const summary = {
  cases: results.length,
  top1HitRate: Number(rate("top1").toFixed(3)),
  top3HitRate: Number(rate("top3").toFixed(3)),
  top5HitRate: Number(rate("top5Hit").toFixed(3)),
  floors: FLOORS,
  results
};
const renderedSummary = `${JSON.stringify(summary, null, 2)}\n`;
const recordedResultsPath = join(suiteDir, "results.json");
process.stdout.write(renderedSummary);

if (process.argv.includes("--record")) {
  await writeFile(recordedResultsPath, renderedSummary, "utf8");
}

let failed = false;
if (process.argv.includes("--check-recorded")) {
  let recordedResults = "";
  try {
    recordedResults = await readFile(recordedResultsPath, "utf8");
  } catch {
    // The mismatch message below covers a missing or unreadable artifact.
  }
  if (recordedResults !== renderedSummary) {
    process.stderr.write(
      `External evaluation differs from benchmarks/${suite}/results.json; rerun with --record and review the change.\n`
    );
    failed = true;
  }
}

if (
  process.argv.includes("--gate") &&
  (summary.top1HitRate < FLOORS.top1 ||
    summary.top3HitRate < FLOORS.top3 ||
    summary.top5HitRate < FLOORS.top5)
) {
  process.stderr.write(
    `External evaluation fell below regression floors: measured top-1=${summary.top1HitRate}, top-3=${summary.top3HitRate}, top-5=${summary.top5HitRate}; required top-1>=${FLOORS.top1}, top-3>=${FLOORS.top3}, top-5>=${FLOORS.top5}.\n`
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}
