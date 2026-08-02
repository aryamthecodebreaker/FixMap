// Adversarial evaluation: does FixMap stay quiet when it has nothing to say?
//
//   node scripts/evaluate-adversarial.mjs            report the false-confidence rate
//   node scripts/evaluate-adversarial.mjs --record   refresh results.json
//   node scripts/evaluate-adversarial.mjs --gate     fail if any case overclaims
//
// The accuracy suites measure whether the right file is found. This one measures
// the opposite failure, which the stress test found to be the more damaging of
// the two: a confident, specific-sounding ranking for a task that has no answer
// in the repository. An agent that follows a wrong high-confidence map wastes
// far more time than one handed an honest "I don't know".
//
// Cases run against the same pinned checkouts as the accuracy suites, so this
// adds no clones. Unit tests cover the same behavior, but they cannot catch a
// regression that only appears at real repository scale — and FixMap's own test
// fixtures contain the fabricated identifiers, so running these against this
// repository would resolve them and silently pass.

import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { materializePinnedRepository } from "./lib/external-cache.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { buildFixMapReport } = await import(
  pathToFileURL(join(repoRoot, "packages", "core", "dist", "index.js")).href
);
const suiteDir = join(repoRoot, "benchmarks", "adversarial");
const dataset = JSON.parse(await readFile(join(suiteDir, "dataset.json"), "utf8"));

const CONFIDENCE_RANK = { low: 0, medium: 1, high: 2 };

// These describe the checkout on disk, not the analysis, and the same pinned SHA produces
// them differently on different machines: Windows git cannot create webpack's long test
// fixture paths or its non-ASCII filenames, so `tracked-paths-absent` fires there and not on
// Linux CI. Recording them would make `--check-recorded` fail on whichever platform the
// results were not recorded on, turning a regression gate into a platform check. They stay
// on the report, where they are useful; they just are not benchmark evidence.
const CHECKOUT_ENVIRONMENT_CODES = new Set(["tracked-paths-absent", "duplicate-real-path"]);

const results = [];
for (const testCase of dataset.cases) {
  const fixtureDir = testCase.fixture ? await materializeFixture(testCase.fixture) : null;
  const dir = fixtureDir ?? await materializePinnedRepository(testCase);
  let report;
  try {
    report = await buildFixMapReport({ repoRoot: dir, issueText: testCase.task });
  } finally {
    if (fixtureDir) {
      await rm(fixtureDir, { recursive: true, force: true });
    }
  }

  const topConfidence = report.contextFiles[0]?.confidence ?? null;
  const grounding = report.analysis?.grounding?.specificity ?? null;
  const diagnosticCodes = report.diagnostics
    .map((diagnostic) => diagnostic.code)
    .filter((code) => !CHECKOUT_ENVIRONMENT_CODES.has(code));

  // An empty report cannot overclaim, so a missing top result passes.
  const overconfident =
    topConfidence !== null &&
    CONFIDENCE_RANK[topConfidence] > CONFIDENCE_RANK[testCase.maxConfidence];

  const groundingOk =
    !testCase.requiresGrounding || testCase.requiresGrounding.includes(grounding);

  const diagnosticOk =
    !testCase.requiresDiagnostic ||
    testCase.requiresDiagnostic.some((code) => diagnosticCodes.includes(code));

  results.push({
    id: testCase.id,
    kind: testCase.kind,
    slug: testCase.slug,
    maxConfidence: testCase.maxConfidence,
    topConfidence,
    grounding,
    diagnostics: diagnosticCodes,
    contextFileCount: report.contextFiles.length,
    overconfident,
    groundingOk,
    diagnosticOk,
    passed: !overconfident && groundingOk && diagnosticOk
  });
}

const failures = results.filter((result) => !result.passed);
const summary = {
  cases: results.length,
  passed: results.length - failures.length,
  falseConfidenceRate: Number(
    (results.filter((result) => result.overconfident).length / results.length).toFixed(3)
  ),
  results
};
const renderedSummary = `${JSON.stringify(summary, null, 2)}\n`;
const recordedResultsPath = join(suiteDir, "results.json");
process.stdout.write(renderedSummary);

if (process.argv.includes("--record")) {
  await writeFile(recordedResultsPath, renderedSummary, "utf8");
}

let failed = false;
if (process.argv.includes("--check-recorded")) {
  let recorded = "";
  try {
    recorded = await readFile(recordedResultsPath, "utf8");
  } catch {
    // The mismatch message below covers a missing or unreadable artifact.
  }
  if (recorded !== renderedSummary) {
    process.stderr.write(
      "Adversarial evaluation differs from benchmarks/adversarial/results.json; rerun with --record and review the change.\n"
    );
    failed = true;
  }
}

if (process.argv.includes("--gate") && failures.length > 0) {
  for (const failure of failures) {
    const reasons = [
      failure.overconfident
        ? `reported ${failure.topConfidence} confidence where ${failure.maxConfidence} is the ceiling`
        : null,
      failure.groundingOk ? null : `task grounding was "${failure.grounding}"`,
      failure.diagnosticOk ? null : "no unresolved or unverified identifier diagnostic"
    ].filter(Boolean);
    process.stderr.write(`${failure.id} (${failure.slug}): ${reasons.join("; ")}\n`);
  }
  process.stderr.write(
    `Adversarial evaluation failed ${failures.length} of ${results.length} cases.\n`
  );
  failed = true;
}

if (failed) {
  process.exit(1);
}

async function materializeFixture(name) {
  if (name !== "pretty-printed-vendored-bundle") {
    throw new Error(`Unknown adversarial fixture: ${name}`);
  }

  const root = await mkdtemp(join(tmpdir(), "fixmap-adversarial-bundle-"));
  try {
    const compiledDir = join(root, "compiled", "react-dom", "cjs");
    const sourceDir = join(root, "src", "router");
    await mkdir(compiledDir, { recursive: true });
    await mkdir(sourceDir, { recursive: true });

    const bundle = [
      ...Array.from(
        { length: 150 },
        (_, index) => `function transitionState${index}() { return "experimental transition state"; }`
      ),
      "//# sourceMappingURL=react-dom.development.js.map"
    ].join("\n");
    await writeFile(join(compiledDir, "react-dom.development.js"), bundle, "utf8");
    await writeFile(
      join(sourceDir, "render.ts"),
      "export function renderRoute() { return renderPage(); }\n",
      "utf8"
    );
    return root;
  } catch (error) {
    await rm(root, { recursive: true, force: true });
    throw error;
  }
}
