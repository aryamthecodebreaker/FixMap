// Deterministic scanner benchmark: generates synthetic repositories at
// several file-count tiers and measures scanRepo wall time and peak RSS.
//
//   node scripts/benchmark-scan.mjs                 full run (all tiers), prints a Markdown table
//   node scripts/benchmark-scan.mjs --tier 1000 --check
//                                                   generate one tier and assert scan correctness
//                                                   (exact file count, ignored dirs skipped); no timing
//   node scripts/benchmark-scan.mjs --scan-only <dir> --expect <n>
//                                                   internal child mode so peak RSS reflects only the scan
//
// Timing is intentionally not asserted anywhere; --check asserts only
// deterministic facts so it can run in CI without flaking.

import { spawnSync } from "node:child_process";
import { mkdir, rm, stat, writeFile } from "node:fs/promises";
import { cpus, platform, release, tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const corePath = join(repoRoot, "packages", "core", "dist", "index.js");
const SCAN_LIMIT = 25_000;
const TIERS = [1_000, 5_000, 20_000, 40_000];
const IGNORED_FILES_PER_DIR = 50;

function readFlag(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

// --- fixture generation -----------------------------------------------------

function mulberry32(seed) {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = ["order", "invoice", "session", "token", "profile", "widget", "report", "queue", "cache", "worker"];

function fixtureDir(tier) {
  return join(tmpdir(), `fixmap-bench-${tier}`);
}

async function generateFixture(tier) {
  const root = fixtureDir(tier);
  const marker = `${root}.complete`;
  if (await exists(marker)) {
    return root;
  }
  await rm(marker, { force: true });
  await rm(root, { recursive: true, force: true });

  const random = mulberry32(tier);
  const pick = () => WORDS[Math.floor(random() * WORDS.length)];
  let written = 0;

  // Scannable source tree: modules of 10 files (8 code, 1 test, 1 doc).
  let moduleIndex = 0;
  while (written < tier) {
    const moduleDir = join(root, "src", `module-${String(moduleIndex).padStart(4, "0")}`);
    await mkdir(moduleDir, { recursive: true });
    for (let fileIndex = 0; fileIndex < 10 && written < tier; fileIndex += 1) {
      const name = `${pick()}-${fileIndex}`;
      if (fileIndex === 8) {
        await writeFile(join(moduleDir, `${name}.test.ts`), `import { ${pick()} } from "./${pick()}-0.js";\nit("${pick()}", () => {});\n`);
      } else if (fileIndex === 9) {
        await writeFile(join(moduleDir, `README.md`), `# module-${moduleIndex}\n\nHandles ${pick()} and ${pick()}.\n`);
      } else {
        await writeFile(
          join(moduleDir, `${name}.ts`),
          `import { helper } from "./${pick()}-${(fileIndex + 1) % 8}.js";\nexport function ${pick()}${fileIndex}() {\n  return helper("${pick()}");\n}\n`
        );
      }
      written += 1;
    }
    moduleIndex += 1;
  }

  // Ignored directories the scanner must skip entirely.
  for (const ignored of ["node_modules/dep-a", "node_modules/dep-b", "dist", ".vercel/output/functions", "coverage"]) {
    const dir = join(root, ...ignored.split("/"));
    await mkdir(dir, { recursive: true });
    for (let i = 0; i < IGNORED_FILES_PER_DIR; i += 1) {
      await writeFile(join(dir, `generated-${i}.js`), `module.exports = ${i};\n`);
    }
  }

  await writeFile(marker, "ok\n");
  return root;
}

function expectedScanned(tier) {
  return Math.min(tier, SCAN_LIMIT);
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

// --- child scan mode ---------------------------------------------------------

async function runScanChild(root, expected) {
  const { scanRepo } = await import(pathToFileURL(corePath).href);
  const started = process.hrtime.bigint();
  const repo = await scanRepo({ repoRoot: root });
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1_000_000;

  const ignoredLeaks = repo.files.filter(
    (file) => file.path.includes("node_modules/") || file.path.includes("dist/") || file.path.includes(".vercel/")
  );
  const result = {
    files: repo.files.length,
    elapsedMs: Math.round(elapsedMs),
    maxRSSMb: Math.round(process.resourceUsage().maxRSS / 1024),
    scanLimitHit: repo.diagnostics.some((diagnostic) => diagnostic.code === "scan-limit-reached"),
    ignoredLeaks: ignoredLeaks.length,
    ok: (expected === -1 || repo.files.length === expected) && ignoredLeaks.length === 0
  };
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) {
    process.exit(1);
  }
}

function scanInChild(root, expected) {
  const child = spawnSync(
    process.execPath,
    [fileURLToPath(import.meta.url), "--scan-only", root, "--expect", String(expected)],
    { encoding: "utf8" }
  );
  if (child.status !== 0) {
    throw new Error(`scan child failed for ${root}:\n${child.stdout}${child.stderr}`);
  }
  return JSON.parse(child.stdout);
}

// --- top-level modes ----------------------------------------------------------

async function runCheck(tier) {
  const root = await generateFixture(tier);
  const result = scanInChild(root, expectedScanned(tier));
  const limitExpectation = tier > SCAN_LIMIT;
  if (result.scanLimitHit !== limitExpectation) {
    console.error(`Benchmark check failed: scan-limit diagnostic expected=${limitExpectation} actual=${result.scanLimitHit}.`);
    process.exit(1);
  }
  console.log(
    `Benchmark check passed: tier ${tier} scanned ${result.files} files, ignored directories skipped, scan-limit diagnostic ${result.scanLimitHit ? "present" : "absent"}.`
  );
}

async function runBenchmark() {
  console.log(`Generating fixtures under ${tmpdir()} (reused if present; delete fixmap-bench-* to regenerate)...`);
  const rows = [];
  for (const tier of TIERS) {
    const root = await generateFixture(tier);
    const runs = [];
    for (let i = 0; i < 3; i += 1) {
      runs.push(scanInChild(root, expectedScanned(tier)));
    }
    const median = runs.map((run) => run.elapsedMs).sort((a, b) => a - b)[1];
    const rss = Math.max(...runs.map((run) => run.maxRSSMb));
    rows.push({ tier, files: runs[0].files, median, rss, limit: runs[0].scanLimitHit });
    console.log(`tier ${tier}: ${runs[0].files} files scanned, median ${median} ms, peak RSS ${rss} MB, scan-limit ${runs[0].scanLimitHit}`);
  }

  const node = process.version;
  const os = `${platform()} ${release()}`;
  const cpu = cpus()[0]?.model ?? "unknown CPU";
  console.log("\nMarkdown for docs/BENCHMARKS.md:\n");
  console.log(`Node ${node} · ${os} · ${cpu}\n`);
  console.log("| Generated files | Scanned files | Median scan time | Peak RSS | Scan-limit diagnostic |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const row of rows) {
    console.log(`| ${row.tier.toLocaleString("en-US")} | ${row.files.toLocaleString("en-US")} | ${row.median} ms | ${row.rss} MB | ${row.limit ? "yes" : "no"} |`);
  }
}

// --- entry point ---------------------------------------------------------------

const args = process.argv.slice(2);
const scanOnlyIndex = args.indexOf("--scan-only");

if (scanOnlyIndex !== -1) {
  await runScanChild(args[scanOnlyIndex + 1], Number(readFlag(args, "--expect") ?? "-1"));
} else if (args.includes("--check")) {
  await runCheck(Number(readFlag(args, "--tier") ?? "1000"));
} else {
  await runBenchmark();
}
