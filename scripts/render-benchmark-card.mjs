import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const benchmark = JSON.parse(
  await readFile(
    join(repoRoot, "benchmarks", "external", "savings-results.json"),
    "utf8"
  )
);
const output = join(repoRoot, "docs", "assets", "fixmap-benchmark-v0.7.1.svg");
const hitCount = (rate) => Math.round(rate * benchmark.cases);
const runtime = benchmark.performance.medianScanAndRankMs;
const runtimeLabel = runtime >= 1000
  ? `${(runtime / 1000).toFixed(2)}s`
  : `${Math.round(runtime)}ms`;
const tokenReduction =
  `${(benchmark.contextProxy.estimatedTokenReduction * 100).toFixed(1)}%`;
const impliedMinutes = benchmark.timeComparison.impliedMinutesSaved.toFixed(2);

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-labelledby="title description">
  <title id="title">FixMap v0.7.1 benchmark</title>
  <desc id="description">Measured accuracy and runtime across ${benchmark.cases} pinned repositories, plus explicitly labeled assumed context-token and manual-time comparisons.</desc>
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
  <text x="82" y="102" fill="#72f0b8" font-family="Segoe UI, Arial, sans-serif" font-size="22" font-weight="700" letter-spacing="2">FIXMAP v0.7.1 · REPRODUCIBLE BENCHMARK</text>
  <text x="82" y="154" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="38" font-weight="750">Find the right code before the first edit.</text>

  <rect x="82" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#2d574a"/>
  <text x="108" y="232" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="16">MEASURED ACCURACY</text>
  <text x="108" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${hitCount(benchmark.accuracy.top3HitRate)}/${benchmark.cases}</text>
  <text x="108" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">top-3 fixing-file hit rate</text>
  <text x="108" y="349" fill="#72f0b8" font-family="Segoe UI, Arial, sans-serif" font-size="15">Top-1 ${hitCount(benchmark.accuracy.top1HitRate)}/${benchmark.cases} · Top-5 ${hitCount(benchmark.accuracy.top5HitRate)}/${benchmark.cases}</text>

  <rect x="422" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#2d574a"/>
  <text x="448" y="232" fill="#9db9af" font-family="Segoe UI, Arial, sans-serif" font-size="16">MEASURED RUNTIME</text>
  <text x="448" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${runtimeLabel}</text>
  <text x="448" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">median scan + rank</text>
  <text x="448" y="349" fill="#75bdf0" font-family="Segoe UI, Arial, sans-serif" font-size="15">${benchmark.environment.runsPerRepository} warm runs per pinned repository</text>

  <rect x="762" y="194" width="316" height="176" rx="22" fill="#132a23" stroke="#2d574a"/>
  <text x="788" y="232" fill="#f0c775" font-family="Segoe UI, Arial, sans-serif" font-size="16">ESTIMATED CONTEXT PROXY</text>
  <text x="788" y="287" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="48" font-weight="750">${tokenReduction}</text>
  <text x="788" y="319" fill="#b8cdc5" font-family="Segoe UI, Arial, sans-serif" font-size="17">fewer estimated tokens</text>
  <text x="788" y="349" fill="#f0c775" font-family="Segoe UI, Arial, sans-serif" font-size="15">Assumption: all supported text → top five files</text>

  <rect x="82" y="394" width="996" height="104" rx="20" fill="#0b1915" stroke="#29483e"/>
  <text x="108" y="429" fill="#f0c775" font-family="Segoe UI, Arial, sans-serif" font-size="16" font-weight="700">ASSUMED TIME COMPARISON — NOT A CONTROLLED AGENT EXPERIMENT</text>
  <text x="108" y="466" fill="#f2f7f5" font-family="Segoe UI, Arial, sans-serif" font-size="26" font-weight="650">${impliedMinutes} min implied difference vs a ${benchmark.timeComparison.assumedManualMinutes}-minute manual-triage assumption</text>

  <rect x="82" y="526" width="996" height="2" fill="url(#accent)"/>
  <text x="82" y="557" fill="#8fa89f" font-family="Segoe UI, Arial, sans-serif" font-size="14">Pinned commits · real merged fixes · expected files frozen before ranking · proxy = supported-text bytes ÷ 4</text>
</svg>
`;

await writeFile(output, svg, "utf8");
console.log(output);
