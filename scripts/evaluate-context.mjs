#!/usr/bin/env node
// Context Pack excerpt quality on development cases (never held-out ones).
//   node scripts/evaluate-context.mjs --out <file.json>   measure the current build
//   node scripts/evaluate-context.mjs --compare a.json b.json
// For each case: FixMap plans the task at the pinned commit, builds Context Packs at fixed
// budgets, and checks whether the excerpts include the lines the merged fix changed (old-side
// line numbers of the pull request diff). Needs `gh` and network on the first run.
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { materializePinnedRepository } from "./lib/external-cache.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const BUDGETS = [4_000, 10_000];

if (args[0] === "--compare") {
  const [before, after] = await Promise.all(args.slice(1, 3).map(async (path) => JSON.parse(await readFile(path, "utf8"))));
  for (const budget of BUDGETS) {
    const b = before.summary[budget], a = after.summary[budget];
    console.log(`budget ${budget}: fixed files covered ${b.covered}/${b.included} -> ${a.covered}/${a.included}; cases with any changed line ${b.casesWithChangedLine}/${b.cases} -> ${a.casesWithChangedLine}/${a.cases}; over budget ${b.overBudget} -> ${a.overBudget}`);
  }
  process.exit(0);
}

const outIndex = args.indexOf("--out");
if (outIndex === -1) throw new Error("Pass --out <file.json> or --compare <before.json> <after.json>.");
const core = await import(pathToFileURL(join(root, "packages", "core", "dist", "index.js")).href);
const cases = [];
for (const suite of ["external", "polyglot-dev"]) {
  for (const entry of JSON.parse(await readFile(join(root, "benchmarks", suite, "dataset.json"), "utf8")).cases) cases.push({ ...entry, suite });
}
const git = (cwd, argv) => execFileSync("git", argv, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 256 * 1024 * 1024, timeout: 20 * 60_000 }).trim();
const tryGit = (cwd, argv) => { try { return git(cwd, argv); } catch { return undefined; } };

const results = [];
for (const [index, benchmark] of cases.entries()) {
  process.stderr.write(`[${index + 1}/${cases.length}] ${benchmark.slug}\n`);
  try {
    const dir = await materializePinnedRepository(benchmark);
    const [owner, repository] = benchmark.slug.split("/");
    const head = execFileSync("gh", ["api", `repos/${owner}/${repository}/pulls/${benchmark.pullRequest}`, "--jq", ".head.sha"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    if (!tryGit(dir, ["cat-file", "-e", `${head}^{commit}`])) git(dir, ["fetch", "--quiet", "--filter=blob:none", "--depth", "50", "origin", `pull/${benchmark.pullRequest}/head`]);
    let mergeBase = tryGit(dir, ["merge-base", benchmark.sha, head]);
    for (let depth = 200; !mergeBase && depth <= 2_000; depth *= 2) {
      git(dir, ["fetch", "--quiet", "--filter=blob:none", `--deepen=${depth}`, "origin", `pull/${benchmark.pullRequest}/head`]);
      mergeBase = tryGit(dir, ["merge-base", benchmark.sha, head]);
    }
    if (!mergeBase) throw new Error("merge base unreachable");
    // Old-side changed line numbers per file, from the unified diff hunk headers.
    const changedLines = new Map();
    let current;
    for (const line of git(dir, ["diff", "--unified=0", "--no-renames", mergeBase, head]).split("\n")) {
      const file = /^--- a\/(.+)$/.exec(line);
      if (file) { current = file[1]; continue; }
      if (line.startsWith("--- /dev/null")) { current = undefined; continue; }
      const hunk = /^@@ -(\d+)(?:,(\d+))? /.exec(line);
      if (hunk && current) {
        const start = Number(hunk[1]);
        const count = hunk[2] === undefined ? 1 : Number(hunk[2]);
        // A pure insertion (count 0) sits after line `start`; count that line as the location.
        const lines = changedLines.get(current) ?? new Set();
        if (count === 0) lines.add(Math.max(1, start));
        for (let offset = 0; offset < count; offset += 1) lines.add(start + offset);
        changedLines.set(current, lines);
      }
    }
    const repo = await core.scanRepo({ repoRoot: dir, useCache: false, includeHistory: false });
    const report = await core.buildFixMapReport({ repoRoot: dir, issueText: benchmark.task, useCache: false });
    const perBudget = {};
    for (const budget of BUDGETS) {
      const pack = core.buildContextPack({ report, repo, task: benchmark.task, budgetTokens: budget });
      const included = pack.snippets.filter((snippet) => changedLines.has(snippet.path));
      const covered = included.filter((snippet) => [...changedLines.get(snippet.path)].some((line) => line >= snippet.startLine && line <= snippet.endLine));
      perBudget[budget] = { included: included.length, covered: covered.length, sourceTokens: pack.estimatedSourceTokens, overBudget: pack.estimatedSourceTokens > budget };
    }
    results.push({ slug: benchmark.slug, suite: benchmark.suite, status: "ok", fixedFiles: changedLines.size, perBudget });
  } catch (error) {
    results.push({ slug: benchmark.slug, suite: benchmark.suite, status: "unavailable", reason: String(error?.message ?? error).split("\n")[0].slice(0, 200) });
  }
}
const ok = results.filter((entry) => entry.status === "ok");
const summary = Object.fromEntries(BUDGETS.map((budget) => [budget, {
  cases: ok.length,
  included: ok.reduce((sum, entry) => sum + entry.perBudget[budget].included, 0),
  covered: ok.reduce((sum, entry) => sum + entry.perBudget[budget].covered, 0),
  casesWithChangedLine: ok.filter((entry) => entry.perBudget[budget].covered > 0).length,
  overBudget: ok.filter((entry) => entry.perBudget[budget].overBudget).length
}]));
await writeFile(args[outIndex + 1], `${JSON.stringify({ summary, cases: results }, null, 2)}\n`);
console.log(JSON.stringify(summary));
