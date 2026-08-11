import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { rankContextFiles, scanRepo } from "../packages/core/dist/index.js";
import { wilsonInterval } from "./lib/wilson.mjs";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const cases = JSON.parse(await readFile(join(repoRoot, "benchmarks", "cases.json"), "utf8"));
// Reject the empty array before computing rates: 0 / 0 is NaN, and every
// threshold comparison with NaN is false, which would turn the gate into a pass.
if (!Array.isArray(cases) || cases.length === 0) {
  throw new Error(
    `benchmarks/cases.json must contain at least one case; found ${Array.isArray(cases) ? 0 : typeof cases}.`
  );
}
const repo = await scanRepo({ repoRoot });
// Do not let the ranker read its answer sheet. Every task is stored verbatim in
// this file, so including it would reward benchmark leakage rather than ranking.
const evaluationRepo = {
  ...repo,
  files: repo.files.filter((file) => file.path !== "benchmarks/cases.json")
};
const results = cases.map((benchmark) => {
  const ranked = rankContextFiles(evaluationRepo, { issueText: benchmark.task }, 5);
  const paths = ranked.map((file) => file.path);
  return {
    issue: benchmark.issue ?? null,
    task: benchmark.task,
    expected: benchmark.expected,
    top5Paths: paths,
    top1Hit: benchmark.expected.includes(paths[0]),
    top3Hit: benchmark.expected.some((expected) => paths.slice(0, 3).includes(expected)),
    top5Hit: benchmark.expected.some((expected) => paths.includes(expected))
  };
});

function scoreCohort(cohort, floors) {
  if (cohort.length === 0) {
    throw new Error("Every evaluation cohort must contain at least one case.");
  }
  const score = (key) => {
    const hits = cohort.filter((result) => result[key]).length;
    return {
      hits,
      of: cohort.length,
      rate: Number((hits / cohort.length).toFixed(3)),
      interval95: wilsonInterval(hits, cohort.length)
    };
  };
  return {
    cases: cohort.length,
    top1: score("top1Hit"),
    top3: score("top3Hit"),
    top5: score("top5Hit"),
    floors
  };
}

const legacyFloors = { top1: 0.625, top3: 0.875, top5: 0.875 };
// These 23 title-only, path-unmentioned cases are a distinct single-repository
// regression cohort. Their v0.8.7 measurement was much harder than the original
// eight cases, so report and gate them separately instead of pooling the rates.
const fixMapIssueFloors = { top1: 0.34, top3: 0.75, top5: 0.86 };
const baseline = scoreCohort(results.filter((result) => result.issue === null), legacyFloors);
const fixMapIssues = scoreCohort(results.filter((result) => result.issue !== null), fixMapIssueFloors);
const summary = {
  cases: results.length,
  cohorts: { baseline, fixMapIssues },
  results
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
const failedCohorts = Object.entries(summary.cohorts).filter(([, cohort]) =>
  cohort.top1.hits / cohort.top1.of < cohort.floors.top1 ||
  cohort.top3.hits / cohort.top3.of < cohort.floors.top3 ||
  cohort.top5.hits / cohort.top5.of < cohort.floors.top5
);
if (failedCohorts.length > 0) {
  process.stderr.write(
    `FixMap evaluation failed: ${failedCohorts.map(([name, cohort]) =>
      `${name} top-1=${cohort.top1.rate}, top-3=${cohort.top3.rate}, top-5=${cohort.top5.rate}`
    ).join("; ")}.\n`
  );
  process.exit(1);
}
