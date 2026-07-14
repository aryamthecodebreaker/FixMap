// Cross-repository ranking evaluation against real fixed issues.
//
//   node scripts/evaluate-external.mjs           report top-1/3/5 hit rates
//   node scripts/evaluate-external.mjs --gate    additionally fail below regression floors
//
// Cases live in benchmarks/external/dataset.json with pinned commit SHAs;
// repositories are cloned shallowly from upstream into the OS temp dir the
// first time and reused afterwards. Needs network access on the first run,
// so this is a scheduled/manual workflow rather than part of `npm run ci`.

import { spawnSync } from "node:child_process";
import { readFile, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { scanRepo, rankContextFiles } = await import(pathToFileURL(join(repoRoot, "packages", "core", "dist", "index.js")).href);
const dataset = JSON.parse(await readFile(join(repoRoot, "benchmarks", "external", "dataset.json"), "utf8"));

// Floors exist to catch ranking collapses in the scheduled run; they are
// deliberately below measured performance and must not be treated as targets.
const FLOORS = { top1: 0.3, top3: 0.5, top5: 0.5 };

function git(args, cwd) {
  const out = spawnSync("git", args, { cwd, encoding: "utf8" });
  if (out.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${out.stderr.slice(0, 300)}`);
  }
}

async function materialize(benchmark) {
  const dir = join(tmpdir(), "fixmap-external", `${benchmark.slug.replace("/", "__")}-${benchmark.sha.slice(0, 12)}`);
  if (await exists(join(dir, ".git"))) {
    return dir;
  }
  await mkdir(dir, { recursive: true });
  git(["init", "--quiet"], dir);
  git(["remote", "add", "origin", benchmark.repo], dir);
  git(["fetch", "--quiet", "--depth", "1", "origin", benchmark.sha], dir);
  git(["checkout", "--quiet", "--detach", "FETCH_HEAD"], dir);
  return dir;
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

const results = [];
for (const benchmark of dataset.cases) {
  const dir = await materialize(benchmark);
  const repo = await scanRepo({ repoRoot: dir });
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
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

if (process.argv.includes("--gate")) {
  if (summary.top1HitRate < FLOORS.top1 || summary.top3HitRate < FLOORS.top3 || summary.top5HitRate < FLOORS.top5) {
    process.stderr.write("External evaluation fell below regression floors.\n");
    process.exit(1);
  }
}
