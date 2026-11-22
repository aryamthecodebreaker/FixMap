// Measure local semantic retrieval cost at candidate scale.
//
//   node scripts/benchmark-semantic.mjs --model <model-dir> --runtime <dir-with-node_modules> [--repo <path>] [--rounds 3]
//
// The model and the @huggingface/transformers runtime are supplied by the caller; FixMap never
// downloads either. Each round measures one structural-only plan, one plan with a cold
// persistent embedding cache, and one with that cache warm, on the same repository and task.
// Rankings are compared, so a cache can never silently change results.

import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { performance } from "node:perf_hooks";

const root = resolve(import.meta.dirname, "..");
const arg = (name, fallback) => {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
};
const modelPath = arg("--model");
const runtimeDir = arg("--runtime");
const repoRoot = resolve(arg("--repo", root));
const rounds = Number(arg("--rounds", "3"));
const task = arg("--task", "Keep signed-in users active when their session token is refreshed");
if (!modelPath || !runtimeDir || !Number.isSafeInteger(rounds) || rounds < 1) {
  process.stderr.write("Usage: node scripts/benchmark-semantic.mjs --model <dir> --runtime <dir> [--repo <path>] [--rounds 3]\n");
  process.exit(2);
}

const core = await import(pathToFileURL(join(root, "packages", "core", "dist", "index.js")).href);
const runtimeEntry = createRequire(join(resolve(runtimeDir), "package.json")).resolve("@huggingface/transformers");
// require.resolve finds the CommonJS build, which an ESM import exposes under `default`.
const runtimeLoader = async () => {
  const loaded = await import(pathToFileURL(runtimeEntry).href);
  return loaded.pipeline ? loaded : loaded.default;
};

const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const paths = (report) => report.contextFiles.map((file) => file.path);

async function timed(run) {
  const started = performance.now();
  const result = await run();
  return { ms: Math.round(performance.now() - started), result };
}

const structural = [];
const cold = [];
const warm = [];
let candidates;
let identical = true;
let provenance;
for (let round = 0; round < rounds; round += 1) {
  const cacheRoot = await mkdtemp(join(tmpdir(), "fixmap-semantic-bench-"));
  try {
    const plan = (embeddingProvider) => core.buildFixMapAnalysis({
      repoRoot, issueText: task, useCache: true, includeHistory: true, ...(embeddingProvider ? { embeddingProvider } : {})
    });
    const provider = async () => core.withPersistentEmbeddingCache(
      await core.createLocalTransformersEmbeddingProvider({ modelPath, runtimeLoader }),
      { repositoryRoot: repoRoot, cacheRoot }
    );
    const base = await timed(() => plan());
    const first = await timed(async () => plan(await provider()));
    const second = await timed(async () => plan(await provider()));
    structural.push(base.ms);
    cold.push(first.ms);
    warm.push(second.ms);
    const retrieval = first.result.report.retrieval;
    provenance ??= retrieval?.semantic;
    candidates ??= retrieval?.semantic?.indexedFiles;
    if (JSON.stringify(paths(first.result.report)) !== JSON.stringify(paths(second.result.report))) identical = false;
    const failures = first.result.report.diagnostics.filter((entry) => entry.code.startsWith("semantic-") && entry.severity !== "info");
    if (failures.length > 0) throw new Error(`Semantic retrieval did not run: ${failures.map((entry) => entry.code).join(", ")}`);
    process.stderr.write(`round ${round + 1}: structural ${base.ms} ms, cold cache ${first.ms} ms, warm cache ${second.ms} ms\n`);
  } finally {
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

const scanned = (await core.buildFixMapAnalysis({ repoRoot, issueText: task, useCache: true })).repo.files.length;
process.stdout.write(`${JSON.stringify({
  repository: repoRoot,
  scannedFiles: scanned,
  embeddedFiles: candidates,
  rounds,
  model: provenance?.model,
  runtime: provenance?.runtime,
  dimensions: provenance?.dimensions,
  medianMs: { structuralOnly: median(structural), coldCache: median(cold), warmCache: median(warm) },
  roundsMs: { structuralOnly: structural, coldCache: cold, warmCache: warm },
  warmRankingMatchesCold: identical
}, null, 2)}\n`);
