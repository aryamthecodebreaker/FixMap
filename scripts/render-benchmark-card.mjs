// Renders docs/assets/fixmap-benchmark.svg from recorded measurements only.
//
//   npm run render:benchmark-card
//
// The card leads with the held-out suite because that is the only number that
// estimates behavior on a repository FixMap was never shaped by. The regression
// suite is shown beside it and labeled as such, so a reader can see both the
// tuned figure and the honest one rather than only the flattering one.
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
const external = await readJson("benchmarks", "external", "results.json");
const savings = await readJson("benchmarks", "external", "savings-results.json");
const output = join(repoRoot, "docs", "assets", "fixmap-benchmark.svg");

const count = (suite, key) => suite.results.filter((result) => result[key]).length;
const runtime = savings.performance.medianScanAndRankMs;
const runtimeLabel = runtime >= 1000
  ? `${(runtime / 1000).toFixed(2)}s`
  : `${Math.round(runtime)}ms`;

const heldoutTop3 = count(heldout, "top3");
const heldoutTop1 = count(heldout, "top1");
const heldoutTop5 = count(heldout, "top5Hit");
const externalTop3 = count(external, "top3");
const externalTop1 = count(external, "top1");

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">FixMap benchmark</title>
  <desc id="description">FixMap ranked the fixing file in the top three for ${heldoutTop3} of ${heldout.cases} held-out repositories it was never tuned against, and ${externalTop3} of ${external.cases} in the regression suite, with a ${runtimeLabel} median scan and rank.</desc>
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
  <text x="82" y="102" fill="#72f0b8" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">FIXMAP · REPRODUCIBLE BENCHMARK</text>
  <text x="82" y="154" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="38" font-weight="750">Find the right code before the first edit.</text>

  <rect x="82" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#72f0b8" stroke-width="2"/>
  <text x="108" y="232" fill="#72f0b8" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">HELD-OUT ACCURACY</text>
  <text x="108" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${heldoutTop3}/${heldout.cases}</text>
  <text x="108" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">top-3 on repos never tuned against</text>
  <text x="108" y="349" fill="#72f0b8" font-family="Segoe UI, Arial, sans-serif" font-size="15">Top-1 ${heldoutTop1}/${heldout.cases} · Top-5 ${heldoutTop5}/${heldout.cases}</text>

  <rect x="422" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#2d574a"/>
  <text x="448" y="232" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="16">MEASURED RUNTIME</text>
  <text x="448" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${runtimeLabel}</text>
  <text x="448" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">median scan + rank</text>
  <text x="448" y="349" fill="#75bdf0" font-family="Segoe UI, Arial, sans-serif" font-size="15">${savings.environment.runsPerRepository} warm runs per pinned repository</text>

  <rect x="762" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#2d574a"/>
  <text x="788" y="232" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="16">REGRESSION SUITE</text>
  <text x="788" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${externalTop3}/${external.cases}</text>
  <text x="788" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">top-3 on cases that guided development</text>
  <text x="788" y="349" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="15">Top-1 ${externalTop1}/${external.cases} · not a generalization estimate</text>

  <rect x="82" y="394" width="996" height="104" rx="20" fill="#0b1915" stroke="#29483e"/>
  <text x="108" y="429" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">WHAT THIS DOES NOT CLAIM</text>
  <text x="108" y="466" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="20">No tokens-saved or minutes-saved figure: that needs a controlled with/without-agent run, which has not been done.</text>

  <rect x="82" y="526" width="996" height="2" fill="url(#accent)"/>
  <text x="82" y="557" fill="#8fa89f" font-family="Segoe UI, Arial, sans-serif" font-size="14">Pinned commits · real merged fixes · expected files taken from the fixing PR · every case and ranking checked into the repository</text>
</svg>
`;

await writeFile(output, svg, "utf8");
console.log(output);
