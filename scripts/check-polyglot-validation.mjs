import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const suiteDir = join(root, "benchmarks", "polyglot-validation");
const datasetText = await readFile(join(suiteDir, "dataset.json"), "utf8");
const dataset = JSON.parse(datasetText);
const development = JSON.parse(await readFile(join(root, "benchmarks", "polyglot-dev", "dataset.json"), "utf8"));
const results = JSON.parse(await readFile(join(suiteDir, "baseline-results.json"), "utf8"));
const candidate = {
  name: "candidate-rrf-bm25-heavy",
  weights: { structural: 1, lexical: 4, symbol: 1, constant: 60 }
};

assert(dataset.status === "validation-frozen", "dataset status must be validation-frozen");
assert(Array.isArray(dataset.cases) && dataset.cases.length >= 5, "dataset must retain at least five frozen cases");
assert(Array.isArray(dataset.skipped), "dataset must retain explicit skipped repositories");

const keys = dataset.cases.map(caseKey);
assert(new Set(keys).size === keys.length, "dataset contains duplicate repository/pull-request cases");
const developmentKeys = new Set(development.cases.map(caseKey));
assert(keys.every((key) => !developmentKeys.has(key)), "validation dataset overlaps the development cohort");

assert(results.suite === "polyglot-validation", "results belong to the wrong suite");
assert(results.cases === dataset.cases.length, "results case count differs from the frozen dataset");
assert(
  results.configuration?.datasetSha256 === createHash("sha256").update(datasetText).digest("hex"),
  "results were not produced from the current frozen dataset bytes"
);
assert(
  JSON.stringify(results.configuration?.preRegisteredValidationCandidate) === JSON.stringify(candidate),
  "pre-registered validation candidate changed"
);

const requiredArms = ["fixmap", "bm25:code", candidate.name];
for (const arm of requiredArms) {
  assert(results.arms?.[arm]?.all?.cases === dataset.cases.length, `${arm} aggregate is missing cases`);
}

assert(Array.isArray(results.results) && results.results.length === dataset.cases.length, "per-case results are incomplete");
for (let index = 0; index < dataset.cases.length; index += 1) {
  const frozen = dataset.cases[index];
  const measured = results.results[index];
  assert(measured?.slug === frozen.slug, `result ${index + 1} is not aligned to the frozen dataset`);
  assert(JSON.stringify(measured.expected) === JSON.stringify(frozen.expected), `${frozen.slug} expected paths changed`);
  for (const arm of requiredArms) {
    const row = measured.arms?.[arm];
    assert(Array.isArray(row?.top5Paths), `${frozen.slug} is missing ${arm} paths`);
    assert(typeof row.top1Hit === "boolean" && typeof row.top3Hit === "boolean" && typeof row.top5Hit === "boolean", `${frozen.slug} has malformed ${arm} outcomes`);
  }
}

for (const arm of requiredArms) {
  const rows = results.results.map((entry) => entry.arms[arm]);
  for (const [metric, field] of [["top1Hit", "top1HitRate"], ["top3Hit", "top3HitRate"], ["top5Hit", "top5HitRate"]]) {
    const rate = Number((rows.filter((row) => row[metric]).length / rows.length).toFixed(3));
    assert(results.arms[arm].all[field] === rate, `${arm} ${field} does not match its per-case outcomes`);
  }
}

process.stdout.write(
  `Polyglot validation integrity passed: ${dataset.cases.length} frozen cases, ` +
  `${dataset.skipped.length} explicit skips, zero development overlap.\n`
);

function caseKey(entry) {
  assert(typeof entry?.slug === "string" && Number.isSafeInteger(entry.pullRequest), "cohort case identity is malformed");
  return `${entry.slug}#${entry.pullRequest}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Polyglot validation integrity failed: ${message}.`);
}
