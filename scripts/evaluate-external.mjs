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
import { classifyExpectedPathMention, splitCohorts } from "./lib/expected-path-mention.mjs";
import { wilsonInterval } from "./lib/wilson.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
if (process.argv.includes("--help") || process.argv.includes("-h")) {
  process.stdout.write("Usage: node scripts/evaluate-external.mjs [--suite external|heldout|multilanguage-dev] [--gate] [--record] [--check-recorded]\n");
  process.exit(0);
}
const { scanRepo, rankContextFiles } = await import(pathToFileURL(join(repoRoot, "packages", "core", "dist", "index.js")).href);

const suiteIndex = process.argv.indexOf("--suite");
const suite = suiteIndex === -1 ? "external" : process.argv[suiteIndex + 1];
if (!["external", "heldout", "multilanguage-dev"].includes(suite)) {
  process.stderr.write(`Unknown suite "${suite}"; expected "external", "heldout", or "multilanguage-dev".\n`);
  process.exit(1);
}
// The gate that protects the held-out suite named the wrong suite in every failure it
// reported, which is a poor property for the check standing between a regression and a
// release.
const suiteLabel = suite === "heldout" ? "Held-out evaluation"
  : suite === "multilanguage-dev" ? "Multi-language development evaluation"
    : "External evaluation";
const suiteDir = join(repoRoot, "benchmarks", suite);
const dataset = JSON.parse(await readFile(join(suiteDir, "dataset.json"), "utf8"));

// Floors exist to catch ranking collapses in the scheduled run; they are
// deliberately below measured performance and must not be treated as targets.
const FLOORS = suite === "heldout"
  ? { all: { top1: 0.5, top3: 0.583, top5: 0.667 }, unmentioned: { top1: 0.333, top3: 0.444, top5: 0.556 } }
  : { all: { top1: 0.625, top3: 0.937, top5: 0.937 }, unmentioned: { top1: 0.615, top3: 0.923, top5: 0.923 } };

const results = [];
for (const [caseNumber, benchmark] of dataset.cases.entries()) {
  process.stderr.write(`[${caseNumber + 1}/${dataset.cases.length}] Evaluating ${benchmark.slug} at its frozen revision...\n`);
  const dir = await materializePinnedRepository(benchmark);
  const repo = await scanRepo({ repoRoot: dir, includeHistory: false });
  if (repo.files.length === 0) {
    throw new Error(`${suiteLabel} could not scan any files for ${benchmark.slug} at ${benchmark.sha}.`);
  }
  const ranked = rankContextFiles(repo, { issueText: benchmark.task }, 5);
  const paths = ranked.map((file) => file.path);
  const mention = classifyExpectedPathMention(benchmark);
  results.push({
    slug: benchmark.slug,
    issue: benchmark.issue,
    expected: benchmark.expected,
    top5Paths: paths,
    topConfidence: ranked[0]?.confidence ?? null,
    top1Hit: benchmark.expected.includes(paths[0]),
    top3Hit: benchmark.expected.some((path) => paths.slice(0, 3).includes(path)),
    top5Hit: benchmark.expected.some((path) => paths.includes(path)),
    // Derived every run from the same task text the ranker reads, never stored in the
    // dataset, so the cohort split cannot drift away from the case it describes.
    mentionsExpectedPath: mention.mentionsExpectedPath,
    mentionTier: mention.mentionTier,
    mentionEvidence: mention.evidence
  });
}

const rate = (key) => results.filter((result) => result[key]).length / results.length;

// A hit rate over a dozen cases reads far more precise than it is: one case flipping
// moves 9/12 by eight points. The Wilson score interval is reported next to every rate
// so a reader sees the real precision instead of inferring it from the decimals.

const band = (key) => {
  const successes = results.filter((result) => result[key]).length;
  return { successes, of: results.length, interval95: wilsonInterval(successes, results.length) };
};

// A top-3 hit still wastes an agent's first move when something wrong ranks above the
// answer. Counting those separately keeps the headline rates from hiding the case where
// FixMap had the right file and buried it.
const misleadingCases = results.filter((result) => result.top5Hit && !result.top1Hit);

// Calibration answers the question a confidence label is supposed to answer:
// when FixMap says it is confident about the leading file, is that file the one
// the fix actually changed? Without this the label is an unverified assertion,
// which is the failure the grounding work set out to remove. Sample counts are
// reported alongside each rate because a band holding three cases cannot carry
// a percentage on its own.
const calibration = ["high", "medium", "low"].map((confidence) => {
  const band = results.filter((result) => result.topConfidence === confidence);
  return {
    confidence,
    cases: band.length,
    top1Correct: band.filter((result) => result.top1Hit).length,
    top1Accuracy: band.length === 0
      ? null
      : Number((band.filter((result) => result.top1Hit).length / band.length).toFixed(3)),
    interval95: wilsonInterval(band.filter((result) => result.top1Hit).length, band.length)
  };
});

// Cases whose task text already names the fixing file are answerable by reading the task
// rather than by ranking the repository, so they measure the explicit-mention signal, not
// generalization. Scoring them in one pooled number lets a handful of them carry the
// headline rate. `unmentioned` is the number that estimates behaviour on a task that does
// not already contain its own answer, and it is the one to plan around.
function scoreCohort(cohort) {
  const hitRate = (key) =>
    cohort.length === 0 ? null : Number((cohort.filter((result) => result[key]).length / cohort.length).toFixed(3));
  const interval = (key) => wilsonInterval(cohort.filter((result) => result[key]).length, cohort.length);
  return {
    cases: cohort.length,
    top1HitRate: hitRate("top1Hit"),
    top3HitRate: hitRate("top3Hit"),
    top5HitRate: hitRate("top5Hit"),
    intervals95: { top1: interval("top1Hit"), top3: interval("top3Hit"), top5: interval("top5Hit") },
    slugs: cohort.map((result) => result.slug)
  };
}

const cohortGroups = splitCohorts(results);
const cohorts = {
  all: scoreCohort(cohortGroups.all),
  unmentioned: scoreCohort(cohortGroups.unmentioned),
  mentioned: scoreCohort(cohortGroups.mentioned)
};

const summary = {
  cases: results.length,
  top1HitRate: Number(rate("top1Hit").toFixed(3)),
  top3HitRate: Number(rate("top3Hit").toFixed(3)),
  top5HitRate: Number(rate("top5Hit").toFixed(3)),
  intervals95: {
    top1: band("top1Hit").interval95,
    top3: band("top3Hit").interval95,
    top5: band("top5Hit").interval95
  },
  misleadingTopResult: {
    cases: misleadingCases.length,
    of: results.length,
    rate: Number((misleadingCases.length / results.length).toFixed(3)),
    slugs: misleadingCases.map((result) => result.slug)
  },
  calibration,
  cohorts,
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
      `${suiteLabel} differs from benchmarks/${suite}/results.json; rerun with --record and review the change.\n`
    );
    failed = true;
  }
}

if (
  process.argv.includes("--gate") &&
  (summary.top1HitRate < FLOORS.all.top1 ||
    summary.top3HitRate < FLOORS.all.top3 ||
    summary.top5HitRate < FLOORS.all.top5 ||
    (summary.cohorts.unmentioned.top1HitRate ?? 0) < FLOORS.unmentioned.top1 ||
    (summary.cohorts.unmentioned.top3HitRate ?? 0) < FLOORS.unmentioned.top3 ||
    (summary.cohorts.unmentioned.top5HitRate ?? 0) < FLOORS.unmentioned.top5)
) {
  process.stderr.write(
    `${suiteLabel} fell below regression floors in the pooled or unmentioned cohort: ` +
    `pooled top-1=${summary.top1HitRate}, top-3=${summary.top3HitRate}, top-5=${summary.top5HitRate}; ` +
    `unmentioned top-1=${summary.cohorts.unmentioned.top1HitRate}, top-3=${summary.cohorts.unmentioned.top3HitRate}, top-5=${summary.cohorts.unmentioned.top5HitRate}.\n`
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}
