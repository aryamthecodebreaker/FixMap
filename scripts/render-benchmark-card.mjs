// Renders docs/assets/fixmap-benchmark.svg from recorded measurements only.
//
//   npm run render:benchmark-card
//
// The card leads with the held-out tasks that did not name their fixing file and
// places the strongest naive retrieval baseline beside FixMap. A pooled score or a
// FixMap score without that baseline would repeat the benchmark mistake this card
// now exists to disclose.
//
// Deliberately absent: any "tokens saved" or "minutes saved" headline. Both would
// need a controlled with/without-agent experiment that has not been run, and a
// number nobody can defend costs more credibility than it buys.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (...segments) =>
  JSON.parse(await readFile(join(repoRoot, ...segments), "utf8"));

const heldout = await readJson("benchmarks", "heldout", "results.json");
const baseline = await readJson("benchmarks", "heldout", "baseline-results.json");
const savings = await readJson("benchmarks", "external", "savings-results.json");
const output = join(repoRoot, "docs", "assets", "fixmap-benchmark.svg");

const runtime = savings.performance.medianScanAndRankMs;
const runtimeLabel = runtime >= 1000
  ? `${(runtime / 1000).toFixed(2)}s`
  : `${Math.round(runtime)}ms`;

const unmentioned = heldout.results.filter((result) => !result.mentionsExpectedPath);
const fixmapTop1 = unmentioned.filter((result) => result.top1Hit).length;
const fixmapTop3 = unmentioned.filter((result) => result.top3Hit).length;
const fixmapTop5 = unmentioned.filter((result) => result.top5Hit).length;
const bm25Policy = baseline.configuration.bestPolicyPerFamily.bm25;
const bm25Arm = `bm25:${bm25Policy}`;
const baselineUnmentioned = baseline.results.filter((result) => !result.mentionsExpectedPath);
const bm25Top1 = baselineUnmentioned.filter((result) => result.arms[bm25Arm].top1Hit).length;
const bm25Top3 = baselineUnmentioned.filter((result) => result.arms[bm25Arm].top3Hit).length;
const bm25Top5 = baselineUnmentioned.filter((result) => result.arms[bm25Arm].top5Hit).length;
const cohortSize = unmentioned.length;
const namedCases = heldout.results.length - cohortSize;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">FixMap benchmark</title>
  <desc id="description">On ${cohortSize} held-out tasks that did not name the fixing file, FixMap and BM25 both ranked it in the top three for ${fixmapTop3} cases. BM25 ranked it in the top five for ${bm25Top5}, compared with ${fixmapTop5} for FixMap.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#07120f"/>
      <stop offset="1" stop-color="#0d1b17"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#72f0b8"/>
      <stop offset="1" stop-color="#75bdf0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="44" y="42" width="1112" height="546" rx="30" fill="#0f211b" stroke="#285044"/>
  <text x="82" y="102" fill="#72f0b8" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">FIXMAP · EVIDENCE AUDIT</text>
  <text x="82" y="154" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="38" font-weight="750">The baseline erased the published advantage.</text>

  <rect x="82" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#72f0b8" stroke-width="2"/>
  <text x="108" y="232" fill="#72f0b8" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">FIXMAP · UNMENTIONED</text>
  <text x="108" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${fixmapTop3}/${cohortSize}</text>
  <text x="108" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">top-3 on held-out tasks</text>
  <text x="108" y="349" fill="#72f0b8" font-family="Segoe UI, Arial, sans-serif" font-size="15">Top-1 ${fixmapTop1}/${cohortSize} · Top-5 ${fixmapTop5}/${cohortSize}</text>

  <rect x="422" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#2d574a"/>
  <text x="448" y="232" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="16">BM25 · SAME CORPUS</text>
  <text x="448" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${bm25Top3}/${cohortSize}</text>
  <text x="448" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">top-3 on held-out tasks</text>
  <text x="448" y="349" fill="#75bdf0" font-family="Segoe UI, Arial, sans-serif" font-size="15">Top-1 ${bm25Top1}/${cohortSize} · Top-5 ${bm25Top5}/${cohortSize}</text>

  <rect x="762" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#2d574a"/>
  <text x="788" y="232" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="16">MEASURED RUNTIME</text>
  <text x="788" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${runtimeLabel}</text>
  <text x="788" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">median scan + rank</text>
  <text x="788" y="349" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="15">${savings.environment.runsPerRepository} warm runs per pinned repository</text>

  <rect x="82" y="394" width="996" height="104" rx="20" fill="#0b1915" stroke="#29483e"/>
  <text x="108" y="429" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">WHAT THE AUDIT FOUND</text>
  <text x="108" y="460" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="20">FixMap does not beat BM25 over code files on unseen repositories.</text>
  <text x="108" y="486" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="16">${namedCases} of ${heldout.cases} tasks named their answer; those cases are now reported separately.</text>

  <rect x="82" y="526" width="996" height="2" fill="url(#accent)"/>
  <text x="82" y="557" fill="#8fa89f" font-family="Segoe UI, Arial, sans-serif" font-size="14">Pinned commits · real merged fixes · expected files taken from the fixing PR · every case and ranking checked into the repository</text>
</svg>
`;

await writeFile(output, svg, "utf8");
console.log(output);
