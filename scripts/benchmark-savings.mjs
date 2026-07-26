// Cross-repository efficiency benchmark.
//
// Measured:
// - FixMap scan + rank wall-clock time on pinned repositories
// - top-1/3/5 hit rate against frozen fixing-PR source files
// - repository and top-five bytes for text-bearing files in FixMap's
//   supported extension set
//
// Estimated/assumed:
// - token proxy = UTF-8 source bytes / 4
// - baseline context = every scanned text-bearing file in FixMap's supported
//   extension set
// - manual triage baseline = 15 minutes per task by default
//
// The proxy and manual baseline are deliberately labeled as assumptions; this
// is not an instrumented with/without coding-agent experiment.

import { readFile, writeFile } from "node:fs/promises";
import { cpus, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { materializePinnedRepository } from "./lib/external-cache.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dataset = JSON.parse(
  await readFile(join(repoRoot, "benchmarks", "external", "dataset.json"), "utf8")
);
const { rankContextFiles, scanRepo } = await import(
  pathToFileURL(join(repoRoot, "packages", "core", "dist", "index.js")).href
);

const readFlag = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const runs = Number(readFlag("--runs", "3"));
const assumedManualMinutes = Number(readFlag("--assumed-manual-minutes", "15"));

if (!Number.isInteger(runs) || runs < 1 || runs > 9) {
  throw new Error("--runs must be an integer from 1 through 9.");
}
if (!Number.isFinite(assumedManualMinutes) || assumedManualMinutes <= 0) {
  throw new Error("--assumed-manual-minutes must be a positive number.");
}
if (dataset.cases.length !== 15) {
  throw new Error(`Expected the frozen 15-case dataset, found ${dataset.cases.length}.`);
}

const results = [];
for (const benchmark of dataset.cases) {
  const directory = await materializePinnedRepository(benchmark);
  const timings = [];
  let repo;
  let ranked;

  for (let run = 0; run < runs; run += 1) {
    const started = process.hrtime.bigint();
    repo = await scanRepo({ repoRoot: directory });
    ranked = rankContextFiles(repo, { issueText: benchmark.task }, 5);
    timings.push(Number(process.hrtime.bigint() - started) / 1_000_000);
  }

  const paths = ranked.map((file) => file.path);
  const sourceBytes = repo.files
    .filter((file) => file.isSource)
    .reduce((total, file) => total + file.sizeBytes, 0);
  const rankedBytes = paths.reduce(
    (total, path) =>
      total + (repo.files.find((file) => file.path === path)?.sizeBytes ?? 0),
    0
  );

  results.push({
    slug: benchmark.slug,
    issue: benchmark.issue,
    scannedFiles: repo.files.length,
    medianRuntimeMs: round(median(timings)),
    expected: benchmark.expected,
    top5: paths,
    top1: benchmark.expected.includes(paths[0]),
    top3: benchmark.expected.some((path) => paths.slice(0, 3).includes(path)),
    top5Hit: benchmark.expected.some((path) => paths.includes(path)),
    sourceBytes,
    rankedBytes,
    assumedAllSourceTokens: Math.ceil(sourceBytes / 4),
    estimatedTop5Tokens: Math.ceil(rankedBytes / 4)
  });
}

const totalSourceBytes = sum(results.map((result) => result.sourceBytes));
const totalRankedBytes = sum(results.map((result) => result.rankedBytes));
const medianRuntimeMs = round(median(results.map((result) => result.medianRuntimeMs)));
const assumedManualMs = assumedManualMinutes * 60_000;
const hitRate = (key) =>
  round(results.filter((result) => result[key]).length / results.length, 3);
const summary = {
  measuredAt: new Date().toISOString(),
  environment: {
    node: process.version,
    platform: `${platform()} ${release()}`,
    cpu: cpus()[0]?.model ?? "unknown CPU",
    runsPerRepository: runs,
    repositoryCache: "warm after pinned checkout materialization"
  },
  cases: results.length,
  accuracy: {
    top1HitRate: hitRate("top1"),
    top3HitRate: hitRate("top3"),
    top5HitRate: hitRate("top5Hit")
  },
  performance: {
    medianScanAndRankMs: medianRuntimeMs
  },
  contextProxy: {
    baseline: "Assumed: every scanned text-bearing file in FixMap's supported extension set is sent as context.",
    comparison: "Estimated: only FixMap's top-five ranked files are sent as context.",
    tokenEstimator: "UTF-8 file bytes divided by 4; this is not tokenizer output.",
    assumedAllSourceTokens: Math.ceil(totalSourceBytes / 4),
    estimatedTop5Tokens: Math.ceil(totalRankedBytes / 4),
    estimatedTokenReduction: round(1 - totalRankedBytes / totalSourceBytes, 4)
  },
  timeComparison: {
    baseline: `Assumed manual repository triage: ${assumedManualMinutes} minutes per task.`,
    warning: "The manual baseline was not measured in a controlled with/without agent experiment.",
    assumedManualMinutes,
    measuredFixMapMinutes: round(medianRuntimeMs / 60_000, 4),
    impliedMinutesSaved: round((assumedManualMs - medianRuntimeMs) / 60_000, 2),
    impliedTimeReduction: round(1 - medianRuntimeMs / assumedManualMs, 4)
  },
  results
};

const rendered = `${JSON.stringify(summary, null, 2)}\n`;
process.stdout.write(rendered);

if (process.argv.includes("--record")) {
  await writeFile(
    join(repoRoot, "benchmarks", "external", "savings-results.json"),
    rendered,
    "utf8"
  );
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function sum(values) {
  return values.reduce((total, value) => total + value, 0);
}

function round(value, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
