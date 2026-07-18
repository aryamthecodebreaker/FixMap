import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { rankContextFiles, scanRepo } from "../packages/core/dist/index.js";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..");
const cases = JSON.parse(await readFile(join(repoRoot, "benchmarks", "cases.json"), "utf8"));
const repo = await scanRepo({ repoRoot });
const results = cases.map((benchmark) => {
  const ranked = rankContextFiles(repo, { issueText: benchmark.task }, 3);
  const paths = ranked.map((file) => file.path);
  const hit = benchmark.expected.some((expected) => paths.includes(expected));
  return { task: benchmark.task, expected: benchmark.expected, top3: paths, hit };
});

const hits = results.filter((result) => result.hit).length;
const top1Hits = results.filter((result) => result.expected.includes(result.top3[0])).length;
const top3HitRate = hits / results.length;
const top1HitRate = top1Hits / results.length;
const summary = {
  cases: results.length,
  hits,
  top1Hits,
  top1HitRate: Number(top1HitRate.toFixed(3)),
  top3HitRate: Number(top3HitRate.toFixed(3)),
  thresholds: { top1: 0.5, top3: 0.8 },
  results
};

process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
if (top1HitRate < summary.thresholds.top1 || top3HitRate < summary.thresholds.top3) {
  process.stderr.write(
    `FixMap evaluation failed: top-1 ${(top1HitRate * 100).toFixed(1)}%, top-3 ${(top3HitRate * 100).toFixed(1)}%.\n`
  );
  process.exit(1);
}
