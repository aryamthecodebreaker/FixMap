#!/usr/bin/env node
// Real-world feature bench. Bars and rules: benchmarks/feature-bench/PREREGISTRATION.md.
//
//   node scripts/evaluate-features.mjs                 run every case (network on first run) and record results
//   node scripts/evaluate-features.mjs --case <slug>   run one case, print it, record nothing
//   node scripts/evaluate-features.mjs --check-recorded recompute every verdict from the recorded per-case data
//   --bench feature-bench-2  use the second bench (PREREGISTRATION-2.md); --discard-checkouts deletes each clone after scoring
//
// Needs `gh` (authenticated) for pull request head SHAs and network for Git fetches, so it is a
// manual/scheduled evaluation like evaluate-external.mjs, not part of `npm run ci`.
import { execFileSync } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { materializePinnedRepository } from "./lib/external-cache.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
// Bench 1 (PREREGISTRATION.md) or bench 2 (PREREGISTRATION-2.md): same bars, different frozen cases.
const BENCHES = {
  "feature-bench": { results: "results.json", suites: ["heldout", "polyglot-heldout"] },
  "feature-bench-2": { results: "results-2.json", suites: ["polyglot-heldout-2", "polyglot-heldout-3"] }
};
const benchName = args.includes("--bench") ? args[args.indexOf("--bench") + 1] : "feature-bench";
const bench = BENCHES[benchName];
if (!bench) throw new Error(`Unknown --bench ${benchName}; expected one of ${Object.keys(BENCHES).join(", ")}.`);
const resultsPath = join(root, "benchmarks", "feature-bench", bench.results);
const discardCheckouts = args.includes("--discard-checkouts");
const MAX_SCOPE = 20;
const HISTORY_DEPTH = 400;
const MAX_MERGE_BASE_DEPTH = 2_000;

if (args.includes("--check-recorded")) {
  const recorded = JSON.parse(await readFile(resultsPath, "utf8"));
  const recomputed = summarize(recorded.cases);
  if (JSON.stringify(recomputed) !== JSON.stringify(recorded.summary)) {
    throw new Error("Recorded feature-bench summary does not match its per-case data; rerun the bench.");
  }
  console.log(renderSummary(recorded.summary));
  process.exit(0);
}

const core = await import(pathToFileURL(join(root, "packages", "core", "dist", "index.js")).href);
const cases = [];
for (const suite of bench.suites) {
  const dataset = JSON.parse(await readFile(join(root, "benchmarks", suite, "dataset.json"), "utf8"));
  cases.push(...dataset.cases.map((entry) => ({ ...entry, language: entry.language ?? "typescript/javascript", suite })));
}
const only = args.includes("--case") ? args[args.indexOf("--case") + 1] : undefined;
const selected = only ? cases.filter((entry) => entry.slug === only) : cases;
if (selected.length === 0) throw new Error(`No case ${only}.`);

const git = (cwd, argv, options = {}) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, timeout: 20 * 60_000, ...options }).trim();
const tryGit = (cwd, argv) => { try { return git(cwd, argv); } catch { return undefined; } };

const results = [];
const pendingDiscard = [];
for (const [index, benchmark] of selected.entries()) {
  process.stderr.write(`[${index + 1}/${selected.length}] ${benchmark.slug} #${benchmark.pullRequest}\n`);
  try {
    results.push(await runCase(benchmark));
  } catch (error) {
    results.push({ slug: benchmark.slug, language: benchmark.language, pullRequest: benchmark.pullRequest, status: "unavailable", reason: String(error?.message ?? error).split("\n")[0].slice(0, 300) });
  }
  process.stderr.write(`  -> ${JSON.stringify(results.at(-1)).slice(0, 400)}\n`);
  for (const dir of pendingDiscard.splice(0)) await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

if (only) {
  console.log(JSON.stringify(results, null, 2));
} else if (args.includes("--no-record")) {
  // Development measurement: print the verdicts without touching the recorded result.
  console.log(renderSummary(summarize(results)));
  console.log(JSON.stringify(results.map((entry) => ({ slug: entry.slug, changeScope: entry.changeScope, reviewers: entry.reviewers }))));
} else {
  const summary = summarize(results);
  await writeFile(resultsPath, `${JSON.stringify({ featureBenchVersion: 1, recordedAt: new Date().toISOString().slice(0, 10), summary, cases: results }, null, 2)}\n`);
  console.log(renderSummary(summary));
}

async function runCase(benchmark) {
  const dir = await materializePinnedRepository(benchmark);
  if (discardCheckouts) pendingDiscard.push(dir);
  const [owner, repository] = benchmark.slug.split("/");
  const head = execFileSync("gh", ["api", `repos/${owner}/${repository}/pulls/${benchmark.pullRequest}`, "--jq", ".head.sha"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error(`no head SHA for pull request ${benchmark.pullRequest}`);

  // History before sha (reviewers) and the pull request head, both without file contents.
  if (!tryGit(dir, ["cat-file", "-e", `${head}^{commit}`])) {
    git(dir, ["fetch", "--quiet", "--filter=blob:none", "--depth", "50", "origin", `pull/${benchmark.pullRequest}/head`]);
  }
  git(dir, ["fetch", "--quiet", "--filter=blob:none", `--depth=${HISTORY_DEPTH}`, "origin", benchmark.sha]);
  let mergeBase = tryGit(dir, ["merge-base", benchmark.sha, head]);
  for (let depth = 200; !mergeBase && depth <= MAX_MERGE_BASE_DEPTH; depth *= 2) {
    git(dir, ["fetch", "--quiet", "--filter=blob:none", `--deepen=${depth}`, "origin", `pull/${benchmark.pullRequest}/head`]);
    mergeBase = tryGit(dir, ["merge-base", benchmark.sha, head]);
  }
  if (!mergeBase) throw new Error(`merge base of ${benchmark.sha.slice(0, 12)} and ${head.slice(0, 12)} not reachable within ${MAX_MERGE_BASE_DEPTH} commits`);

  const range = `${mergeBase}...${head}`;
  const status = git(dir, ["diff", "--name-status", "--no-renames", mergeBase, head]).split("\n").filter(Boolean).map((line) => line.split("\t"));
  const existing = new Set(git(dir, ["ls-tree", "-r", "--name-only", benchmark.sha]).split("\n"));
  const changed = status.filter(([kind, path]) => kind !== "A" && existing.has(path)).map(([, path]) => path).sort();
  const created = status.filter(([kind]) => kind === "A").map(([, path]) => path).sort();
  const numstat = new Map(git(dir, ["diff", "--numstat", "--no-renames", mergeBase, head]).split("\n").filter(Boolean).map((line) => {
    const [added, removed, path] = line.split("\t");
    return [path, (Number(added) || 0) + (Number(removed) || 0)];
  }));
  const prAuthors = [...new Set(git(dir, ["log", "--format=%aN", `${mergeBase}..${head}`]).split("\n").map((name) => name.trim().toLowerCase()).filter(Boolean))];

  // 1. Verify and its narration.
  const plan = await core.buildFixMapReport({ repoRoot: dir, issueText: benchmark.task, useCache: false });
  const diffRepo = await core.scanRepo({ repoRoot: dir, diffSpec: range, useCache: false, includeHistory: true });
  if (diffRepo.diagnostics.some((diagnostic) => diagnostic.code === "diff-unavailable")) throw new Error("diff unavailable");
  const verification = core.verifyPlan(plan, diffRepo);
  const narrativeProblems = core.checkVerifyNarrative(verification.narrative ?? []);
  const missingFromVerify = changed.filter((path) => !verification.changedFiles.includes(path));
  const verify = { pass: missingFromVerify.length === 0 && narrativeProblems.length === 0, missingFromVerify, narrativeProblems, statements: (verification.narrative ?? []).length };

  // 2. Change scope.
  const repoAtSha = await core.scanRepo({ repoRoot: dir, useCache: false, includeHistory: true });
  const sourcePaths = new Set(repoAtSha.files.filter((file) => file.isSource && !file.isTest).map((file) => file.path));
  const changedSource = changed.filter((path) => sourcePaths.has(path));
  let changeScope = { eligible: false };
  if (changedSource.length >= 2) {
    const anchor = [...changedSource].sort((a, b) => (numstat.get(b) ?? 0) - (numstat.get(a) ?? 0) || a.localeCompare(b))[0];
    const others = changedSource.filter((path) => path !== anchor);
    const scope = core.buildChangeScope(repoAtSha, { workspace: "local", repository: "bench", anchors: [{ operation: "touch", path: anchor }], asOf: new Date().toISOString() });
    const affected = scope.affected.map((entry) => entry.path).slice(0, MAX_SCOPE);
    const k = affected.length;
    const folder = anchor.includes("/") ? anchor.slice(0, anchor.lastIndexOf("/") + 1) : "";
    const baseline = [...sourcePaths].filter((path) => path !== anchor && path.startsWith(folder) && !path.slice(folder.length).includes("/")).sort().slice(0, k);
    const recall = (set) => others.filter((path) => set.includes(path)).length / others.length;
    changeScope = { eligible: true, anchor, others: others.length, k, fixmapRecall: round(recall(affected)), baselineRecall: round(recall(baseline)) };
  }

  // 3. Reviewer suggestions.
  const commits = (repoAtSha.history?.commits ?? []).slice(0, HISTORY_DEPTH);
  const historyAuthors = new Set(commits.map((commit) => commit.author?.trim().toLowerCase()).filter(Boolean));
  let reviewers = { eligible: false, reason: "no pull request author appears in the history window" };
  if (prAuthors.some((author) => historyAuthors.has(author))) {
    const routing = core.routeReviewers(repoAtSha, { changedPaths: changed, now: new Date().toISOString() });
    const top = routing.suggestions.slice(0, 3).map((suggestion) => suggestion.reviewer.trim().toLowerCase());
    const counts = new Map();
    for (const commit of commits) if (commit.author) counts.set(commit.author.trim().toLowerCase(), (counts.get(commit.author.trim().toLowerCase()) ?? 0) + 1);
    const busiest = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([name]) => name);
    reviewers = { eligible: true, fixmapHit: top.some((name) => prAuthors.includes(name)), baselineHit: busiest.some((name) => prAuthors.includes(name)), suggestions: top.length };
  }

  // 4. Historical plans.
  const atRef = await core.buildFixMapReport({ repoRoot: dir, issueText: benchmark.task, useCache: false, atRef: benchmark.sha });
  const top5 = (report) => report.contextFiles.slice(0, 5).map((file) => file.path);
  const historical = { pass: JSON.stringify(top5(plan)) === JSON.stringify(top5(atRef)), workingTree: top5(plan), atRef: top5(atRef) };

  return {
    slug: benchmark.slug, language: benchmark.language, pullRequest: benchmark.pullRequest, status: "ok",
    head, mergeBase, changed: changed.length, created: created.length,
    verify, changeScope, reviewers, historical
  };
}

function summarize(entries) {
  const ok = entries.filter((entry) => entry.status === "ok");
  const scope = ok.filter((entry) => entry.changeScope.eligible);
  const reviewers = ok.filter((entry) => entry.reviewers.eligible);
  const mean = (values) => values.length === 0 ? 0 : round(values.reduce((sum, value) => sum + value, 0) / values.length);
  const rate = (values) => values.length === 0 ? 0 : round(values.filter(Boolean).length / values.length);
  const verifyPassed = ok.filter((entry) => entry.verify.pass).length;
  const historicalPassed = ok.filter((entry) => entry.historical.pass).length;
  const fixmapRecall = mean(scope.map((entry) => entry.changeScope.fixmapRecall));
  const baselineRecall = mean(scope.map((entry) => entry.changeScope.baselineRecall));
  const fixmapHit = rate(reviewers.map((entry) => entry.reviewers.fixmapHit));
  const baselineHit = rate(reviewers.map((entry) => entry.reviewers.baselineHit));
  return {
    cases: entries.length,
    available: ok.length,
    unavailable: entries.length - ok.length,
    bars: {
      verify: { passed: verifyPassed, of: ok.length, meetsBar: ok.length > 0 && verifyPassed === ok.length },
      changeScope: { cases: scope.length, fixmapRecall, baselineRecall, meetsBar: scope.length > 0 && fixmapRecall > baselineRecall },
      reviewers: { cases: reviewers.length, excluded: ok.length - reviewers.length, fixmapHitRate: fixmapHit, baselineHitRate: baselineHit, meetsBar: reviewers.length > 0 && fixmapHit > baselineHit },
      historicalPlans: { passed: historicalPassed, of: ok.length, meetsBar: ok.length > 0 && historicalPassed === ok.length }
    }
  };
}

function renderSummary(summary) {
  const { verify, changeScope, reviewers, historicalPlans } = summary.bars;
  const verdict = (value) => value ? "MEETS BAR" : "misses bar";
  return [
    `Feature bench: ${summary.available}/${summary.cases} cases available (${summary.unavailable} unavailable).`,
    `1. Verify + narration: ${verify.passed}/${verify.of} pass -> ${verdict(verify.meetsBar)}`,
    `2. Change scope: recall ${changeScope.fixmapRecall} vs same-folder baseline ${changeScope.baselineRecall} over ${changeScope.cases} cases -> ${verdict(changeScope.meetsBar)}`,
    `3. Reviewers: hit rate ${reviewers.fixmapHitRate} vs busiest-committer baseline ${reviewers.baselineHitRate} over ${reviewers.cases} cases (${reviewers.excluded} excluded) -> ${verdict(reviewers.meetsBar)}`,
    `4. Historical plans: ${historicalPlans.passed}/${historicalPlans.of} identical top 5 -> ${verdict(historicalPlans.meetsBar)}`
  ].join("\n");
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
