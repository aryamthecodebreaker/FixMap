import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import {
  buildReportFromRepo,
  rankByBm25,
  retrievalQueryTerms,
  scanRepo,
  taskMentionsExpectedPath
} from "@aryam/fixmap-core";

const exec = promisify(execFile);
const MAX_CHANGED_FILES = 30;
const MAX_BENCHMARK_CASES = 100;
const MAX_TASK_CHARS = 20_000;
const GIT_BUFFER = 24 * 1024 * 1024;

export type BenchmarkArm = "bm25" | "fixmap" | "impact";
export type BenchmarkCaseResult = {
  commit: string;
  task: string;
  expected: string[];
  mentionsExpectedPath: boolean;
  arms: Record<BenchmarkArm, {
    top5Paths: string[];
    top1Hit: boolean;
    top3Hit: boolean;
    top5Hit: boolean;
  }>;
  impactSecondary: { hits: number; of: number } | null;
};

export type RepositoryBenchmark = {
  benchmarkVersion: 1;
  generatedAt: string;
  repository: string;
  requestedCommits: number;
  eligibleCases: number;
  skipped: Record<string, number>;
  safeguards: {
    parentSnapshots: true;
    historyCutoff: "target-parent";
    maxChangedFiles: number;
    primaryTargets: "changed-non-test-code";
    sameScannedCorpus: true;
    checkoutFiltersDisabled: true;
    repositoryCodeExecuted: false;
  };
  cohorts: Record<"all" | "mentioned" | "unmentioned", Record<BenchmarkArm, BenchmarkScore>>;
  impactSecondary: { hits: number; of: number; recall: number | null };
  cases: BenchmarkCaseResult[];
};

export type BenchmarkScore = {
  cases: number;
  top1: Rate;
  top3: Rate;
  top5: Rate;
};

type Rate = { hits: number; of: number; rate: number | null; interval95: [number, number] | null };
type CandidateCommit = { hash: string; parent: string; task: string; changedFiles: string[] };

export async function benchmarkRepository(input: {
  repoRoot: string;
  last?: number;
  progress?: (message: string) => void;
}): Promise<RepositoryBenchmark> {
  const repoRoot = resolve(input.repoRoot);
  const requested = input.last ?? 20;
  if (!Number.isSafeInteger(requested) || requested < 1 || requested > MAX_BENCHMARK_CASES) {
    throw new Error(`--last must be a whole number from 1 to ${MAX_BENCHMARK_CASES}.`);
  }
  await assertGitRepository(repoRoot);
  const checkoutConfig = await safeCheckoutConfig(repoRoot);
  const candidates = await listCandidateCommits(repoRoot, Math.min(MAX_BENCHMARK_CASES * 5, requested * 5));
  const repository = await repositoryLabel(repoRoot);
  const skipped: Record<string, number> = {};
  const results: BenchmarkCaseResult[] = [];

  for (const candidate of candidates) {
    if (results.length >= requested) break;
    if (candidate.changedFiles.length === 0) { increment(skipped, "empty-change"); continue; }
    if (candidate.changedFiles.length > MAX_CHANGED_FILES) { increment(skipped, "oversized-change"); continue; }
    if (retrievalQueryTerms(candidate.task).length < 2) { increment(skipped, "insufficient-task-text"); continue; }

    input.progress?.(`Benchmarking ${results.length + 1}/${requested}: ${candidate.hash.slice(0, 8)}`);
    const row = await benchmarkCommit(repoRoot, candidate, checkoutConfig);
    if (!row) { increment(skipped, "no-preexisting-target"); continue; }
    results.push(row);
  }
  if (results.length === 0) {
    throw new Error("No eligible historical changes were found. Use a repository with descriptive commit messages and at least one prior revision.");
  }

  const all = results;
  const mentioned = results.filter((row) => row.mentionsExpectedPath);
  const unmentioned = results.filter((row) => !row.mentionsExpectedPath);
  const impactSecondaryRows = results.map((row) => row.impactSecondary).filter((row): row is { hits: number; of: number } => row !== null);
  const secondaryHits = impactSecondaryRows.reduce((sum, row) => sum + row.hits, 0);
  const secondaryOf = impactSecondaryRows.reduce((sum, row) => sum + row.of, 0);

  return {
    benchmarkVersion: 1,
    generatedAt: new Date().toISOString(),
    repository,
    requestedCommits: requested,
    eligibleCases: results.length,
    skipped,
    safeguards: {
      parentSnapshots: true,
      historyCutoff: "target-parent",
      maxChangedFiles: MAX_CHANGED_FILES,
      primaryTargets: "changed-non-test-code",
      sameScannedCorpus: true,
      checkoutFiltersDisabled: true,
      repositoryCodeExecuted: false
    },
    cohorts: {
      all: scoreArms(all),
      mentioned: scoreArms(mentioned),
      unmentioned: scoreArms(unmentioned)
    },
    impactSecondary: {
      hits: secondaryHits,
      of: secondaryOf,
      recall: secondaryOf === 0 ? null : round(secondaryHits / secondaryOf)
    },
    cases: results
  };
}

async function benchmarkCommit(
  repoRoot: string,
  candidate: CandidateCommit,
  checkoutConfig: string[]
): Promise<BenchmarkCaseResult | undefined> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "fixmap-benchmark-"));
  const snapshot = join(temporaryRoot, "snapshot");
  const emptyHooks = join(temporaryRoot, "hooks-disabled");
  await mkdir(emptyHooks);
  let worktreeAdded = false;
  try {
    await runGit(repoRoot, [
      "-c", `core.hooksPath=${emptyHooks}`,
      ...checkoutConfig,
      "worktree", "add", "--detach", snapshot, candidate.parent
    ]);
    worktreeAdded = true;
    const repo = await scanRepo({ repoRoot: snapshot, includeHistory: true, useCache: false });
    const fileByPath = new Map(repo.files.map((file) => [file.path, file]));
    const changedExisting = candidate.changedFiles.filter((path) => fileByPath.has(path));
    // Primary retrieval compares like with like: changed implementation code, excluding tests.
    // Config, docs, lockfiles, and tests cannot become free extra answers for one arm.
    const expected = changedExisting.filter((path) => {
      const file = fileByPath.get(path);
      return file?.kind === "code" && !file.isTest;
    });
    if (expected.length === 0) return undefined;

    const report = buildReportFromRepo(repo, { issueText: candidate.task, limit: 5 });
    const fixmap = report.contextFiles.map((file) => file.path).slice(0, 5);
    const bm25 = rankByBm25(repo.files, candidate.task, 5);
    const impact = uniquePaths([
      ...(fixmap[0] ? [fixmap[0]] : []),
      ...(report.impact?.files.map((file) => file.path) ?? []),
      ...fixmap.slice(1)
    ]).slice(0, 5);
    const primary = fixmap.find((path) => expected.includes(path));
    const secondaryExpected = primary
      ? changedExisting.filter((path) => path !== primary && fileByPath.get(path)?.kind === "code")
      : [];
    const impactSecondary = primary && secondaryExpected.length > 0
      ? { hits: secondaryExpected.filter((path) => report.impact?.files.some((file) => file.path === path)).length, of: secondaryExpected.length }
      : null;

    return {
      commit: candidate.hash,
      task: candidate.task,
      expected,
      mentionsExpectedPath: taskMentionsExpectedPath(candidate.task, expected),
      arms: {
        bm25: scoreCase(bm25, expected),
        fixmap: scoreCase(fixmap, expected),
        impact: scoreCase(impact, expected)
      },
      impactSecondary
    };
  } finally {
    if (worktreeAdded) {
      try {
        await runGit(repoRoot, ["-c", `core.hooksPath=${emptyHooks}`, ...checkoutConfig, "worktree", "remove", "--force", snapshot]);
      } catch (error) {
        throw new Error(`Could not remove temporary benchmark worktree "${snapshot}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

async function listCandidateCommits(repoRoot: string, limit: number): Promise<CandidateCommit[]> {
  const hashes = (await runGit(repoRoot, ["rev-list", "--no-merges", `--max-count=${limit}`, "HEAD"]))
    .split(/\r?\n/).filter(Boolean);
  const candidates: CandidateCommit[] = [];
  for (const hash of hashes) {
    const parents = (await runGit(repoRoot, ["show", "-s", "--format=%P", hash])).trim().split(/\s+/).filter(Boolean);
    if (parents.length !== 1) continue;
    const task = (await runGit(repoRoot, ["show", "-s", "--format=%B", hash])).slice(0, MAX_TASK_CHARS).trim();
    const changedFiles = (await runGit(repoRoot, [
      "-c", "core.quotepath=false", "diff-tree", "--no-ext-diff", "--no-commit-id", "--name-only", "-r", "-z", hash
    ])).split("\0").filter(Boolean).map((path) => path.replace(/\\/g, "/"));
    candidates.push({ hash, parent: parents[0]!, task, changedFiles: [...new Set(changedFiles)] });
  }
  return candidates;
}

async function safeCheckoutConfig(repoRoot: string): Promise<string[]> {
  let names: string[] = [];
  try {
    const output = await runGit(repoRoot, [
      "config", "--null", "--name-only", "--get-regexp", "^filter\\..*\\.(clean|smudge|process|required)$"
    ]);
    names = output.split("\0").filter(Boolean);
  } catch {
    // `git config --get-regexp` exits 1 when no matching filter is configured.
  }
  const drivers = [...new Set(names.flatMap((name) => {
    const match = name.match(/^filter\.(.+)\.(?:clean|smudge|process|required)$/i);
    return match?.[1] ? [match[1]] : [];
  }))].sort((left, right) => left.localeCompare(right));
  const options = [
    "-c", "core.fsmonitor=false",
    "-c", "core.symlinks=false"
  ];
  for (const driver of drivers) {
    options.push(
      "-c", `filter.${driver}.smudge=`,
      "-c", `filter.${driver}.process=`,
      "-c", `filter.${driver}.required=false`
    );
  }
  return options;
}

async function assertGitRepository(repoRoot: string): Promise<void> {
  try {
    if ((await runGit(repoRoot, ["rev-parse", "--is-inside-work-tree"])).trim() !== "true") throw new Error("not a worktree");
    await runGit(repoRoot, ["rev-parse", "--verify", "HEAD"]);
  } catch {
    throw new Error(`Benchmark needs a local Git repository with at least one commit: ${repoRoot}`);
  }
}

async function repositoryLabel(repoRoot: string): Promise<string> {
  try {
    const remote = (await runGit(repoRoot, ["remote", "get-url", "origin"])).trim();
    const match = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/i);
    if (match?.[1]) return match[1];
  } catch { /* Local-only repositories have no origin; basename is non-sensitive and stable. */ }
  return basename(repoRoot);
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, {
    cwd,
    maxBuffer: GIT_BUFFER,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1" }
  });
  return stdout;
}

function scoreCase(paths: string[], expected: string[]): BenchmarkCaseResult["arms"][BenchmarkArm] {
  return {
    top5Paths: paths,
    top1Hit: expected.includes(paths[0] ?? ""),
    top3Hit: expected.some((path) => paths.slice(0, 3).includes(path)),
    top5Hit: expected.some((path) => paths.slice(0, 5).includes(path))
  };
}

function scoreArms(rows: BenchmarkCaseResult[]): Record<BenchmarkArm, BenchmarkScore> {
  return {
    bm25: scoreRows(rows, "bm25"),
    fixmap: scoreRows(rows, "fixmap"),
    impact: scoreRows(rows, "impact")
  };
}

function scoreRows(rows: BenchmarkCaseResult[], arm: BenchmarkArm): BenchmarkScore {
  return {
    cases: rows.length,
    top1: rate(rows, arm, "top1Hit"),
    top3: rate(rows, arm, "top3Hit"),
    top5: rate(rows, arm, "top5Hit")
  };
}

function rate(rows: BenchmarkCaseResult[], arm: BenchmarkArm, key: "top1Hit" | "top3Hit" | "top5Hit"): Rate {
  const hits = rows.filter((row) => row.arms[arm][key]).length;
  return {
    hits,
    of: rows.length,
    rate: rows.length === 0 ? null : round(hits / rows.length),
    interval95: wilsonInterval(hits, rows.length)
  };
}

function wilsonInterval(hits: number, total: number): [number, number] | null {
  if (total === 0) return null;
  const z = 1.959963984540054;
  const proportion = hits / total;
  const denominator = 1 + (z * z) / total;
  const center = (proportion + (z * z) / (2 * total)) / denominator;
  const margin = (z / denominator) * Math.sqrt((proportion * (1 - proportion)) / total + (z * z) / (4 * total * total));
  return [round(Math.max(0, center - margin)), round(Math.min(1, center + margin))];
}

function round(value: number): number {
  return Number(value.toFixed(3));
}

function uniquePaths(paths: string[]): string[] {
  return [...new Set(paths)];
}

function increment(counts: Record<string, number>, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
}

export function renderRepositoryBenchmark(result: RepositoryBenchmark): string {
  const unmentioned = result.cohorts.unmentioned;
  const percent = (rate: number | null) => rate === null ? "n/a" : `${Math.round(rate * 100)}%`;
  const lines = [
    "# FixMap Repository Benchmark",
    "",
    `Evaluated ${result.eligibleCases} eligible historical changes from ${result.repository}.`,
    "Every case used the target commit's parent snapshot and history ending at that parent.",
    "",
    "## Unmentioned tasks",
    "",
    "| Arm | Top 1 | Top 3 | Top 5 |",
    "| --- | ---: | ---: | ---: |",
    `| BM25 over code | ${percent(unmentioned.bm25.top1.rate)} | ${percent(unmentioned.bm25.top3.rate)} | ${percent(unmentioned.bm25.top5.rate)} |`,
    `| FixMap context | ${percent(unmentioned.fixmap.top1.rate)} | ${percent(unmentioned.fixmap.top3.rate)} | ${percent(unmentioned.fixmap.top5.rate)} |`,
    `| FixMap + Impact Graph | ${percent(unmentioned.impact.top1.rate)} | ${percent(unmentioned.impact.top3.rate)} | ${percent(unmentioned.impact.top5.rate)} |`,
    "",
    `Impact secondary-file recall: ${result.impactSecondary.of === 0 ? "n/a" : `${result.impactSecondary.hits}/${result.impactSecondary.of} (${percent(result.impactSecondary.recall)})`}.`,
    "",
    "## Safeguards",
    "",
    "- Source was scanned from each target's parent revision.",
    "- Co-change history stopped at that parent revision.",
    `- Merges and commits touching more than ${result.safeguards.maxChangedFiles} files were excluded.`,
    "- BM25, FixMap, and Impact Graph saw the same scanned files.",
    "- Primary hits were scored only against changed non-test code; secondary impact recall may include changed tests.",
    "- Repository code, dependencies, scripts, and hooks were not executed.",
    "",
    "A historical commit message is not the same input as its original issue. Treat this as a repository-specific backtest, not proof of agent savings.",
    ""
  ];
  return lines.join("\n");
}
