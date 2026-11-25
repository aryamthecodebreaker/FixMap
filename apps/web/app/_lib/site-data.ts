import heldout from "../../../../benchmarks/heldout/results.json";
import regression from "../../../../benchmarks/external/results.json";
import heldoutBaseline from "../../../../benchmarks/heldout/baseline-results.json";
import regressionBaseline from "../../../../benchmarks/external/baseline-results.json";
import savings from "../../../../benchmarks/external/savings-results.json";
import adversarial from "../../../../benchmarks/adversarial/results.json";
import polyglotBaseline from "../../../../benchmarks/polyglot-heldout-3/baseline-results.json";
import polyglotDataset from "../../../../benchmarks/polyglot-heldout-3/dataset.json";
import featureBench from "../../../../benchmarks/feature-bench/results.json";
import cli from "../../../../packages/cli/package.json";

type EvaluationCase = {
  top1Hit: boolean;
  top3Hit: boolean;
  top5Hit: boolean;
  top5Paths: string[];
};

const hits = (results: EvaluationCase[], key: keyof EvaluationCase) =>
  results.filter((result) => result[key]).length;

const heldoutResults = heldout.results as EvaluationCase[];
const regressionResults = regression.results as EvaluationCase[];
const confidenceCalibration = (["high", "medium", "low"] as const).map((confidence) => {
  const bands = [heldout, regression].flatMap((suite) => suite.calibration.filter((entry) => entry.confidence === confidence));
  const cases = bands.reduce((total, band) => total + band.cases, 0);
  const correct = bands.reduce((total, band) => total + band.top1Correct, 0);
  return { confidence, cases, correct, accuracy: cases === 0 ? null : correct / cases };
});

export const repoUrl = "https://github.com/aryamthecodebreaker/FixMap";
export const npmUrl = "https://www.npmjs.com/package/@aryam/fixmap";
export const marketplaceUrl = "https://github.com/marketplace/actions/fixmap";

// Some benchmark tasks name the fixing file outright — a "Location: lib/document.js:2339"
// line, or a GitHub permalink to the exact range. Those are answerable by reading the task
// rather than by searching the repository, so the site reports the cohort that had to be
// located separately from the pooled rate. Read straight from the recorded results so the
// page cannot drift from the suite.
const cohortOf = (suite: typeof heldout) => ({
  unmentioned: suite.cohorts.unmentioned,
  mentioned: suite.cohorts.mentioned
});

// The comparison a ranked list actually has to win: naive retrieval on the same corpus.
// Each baseline is reported at its STRONGEST candidate policy — pointing a baseline at every
// scanned file makes it rank READMEs and turns the comparison into a strawman.
// The renderer consumes policy and arm outcomes, not suite-specific diagnostics.
type BaselineSuite = Pick<typeof heldoutBaseline, "configuration" | "arms">;
type BaselineFamily = keyof BaselineSuite["configuration"]["bestPolicyPerFamily"];
type BaselineArm = keyof BaselineSuite["arms"];

const strongestBaseline = (suite: BaselineSuite, family: BaselineFamily) => {
  const policy = suite.configuration.bestPolicyPerFamily[family];
  const arm = suite.arms[`${family}:${policy}` as BaselineArm];
  if (!arm) {
    throw new Error(`Recorded baseline results do not contain ${family}:${policy}.`);
  }
  return arm.unmentioned;
};

const baselineOf = (suite: BaselineSuite) => ({
  cases: suite.arms.fixmap.unmentioned.cases,
  fixmap: suite.arms.fixmap.unmentioned,
  bm25: strongestBaseline(suite, "bm25"),
  lexical: strongestBaseline(suite, "lexical-literal"),
  pathExtraction: strongestBaseline(suite, "path-extraction")
});

const LANGUAGE_LABELS: Record<string, string> = { python: "Python", java: "Java", go: "Go", rust: "Rust", ruby: "Ruby", php: "PHP", dotnet: ".NET (C#)" };

/** The largest fresh held-out set in seven more languages (polyglot-heldout-3, 105 cases, measured once), read straight from the recorded run. */
const languages = (() => {
  type ArmResult = { top5Hit: boolean };
  const results = polyglotBaseline.results as Array<{ slug: string; arms: Record<string, ArmResult> }>;
  const cases = polyglotDataset.cases as Array<{ slug: string; language: string }>;
  const rows = new Map<string, { language: string; cases: number; fixmap: number; bm25: number }>();
  results.forEach((result, index) => {
    const language = cases[index]?.slug === result.slug ? cases[index]!.language : "unknown";
    const row = rows.get(language) ?? { language: LANGUAGE_LABELS[language] ?? language, cases: 0, fixmap: 0, bm25: 0 };
    row.cases += 1;
    if (result.arms.fixmap?.top5Hit) row.fixmap += 1;
    if (result.arms["bm25:code"]?.top5Hit) row.bm25 += 1;
    rows.set(language, row);
  });
  return {
    cases: polyglotBaseline.cases,
    fixmapTop5: polyglotBaseline.arms.fixmap.all.top5HitRate,
    bm25Top5: polyglotBaseline.arms["bm25:code"].all.top5HitRate,
    fixmapInterval: polyglotBaseline.arms.fixmap.all.intervals95.top5,
    top5PValue: polyglotBaseline.pairedVsFixmapMcnemarExact.all["bm25:code"].top5.pValue,
    fixmapTop1: polyglotBaseline.arms.fixmap.all.top1HitRate,
    bm25Top1: polyglotBaseline.arms["bm25:code"].all.top1HitRate,
    rows: [...rows.values()]
  };
})();

export const siteStats = {
  languages,
  /** Paired McNemar exact p-values, FixMap vs BM25 over code, held-out tasks that did not name the file. */
  heldoutMcnemar: {
    top1: heldoutBaseline.pairedVsFixmapMcnemarExact.unmentioned["bm25:code"].top1.pValue,
    top3: heldoutBaseline.pairedVsFixmapMcnemarExact.unmentioned["bm25:code"].top3.pValue,
    top5: heldoutBaseline.pairedVsFixmapMcnemarExact.unmentioned["bm25:code"].top5.pValue
  },
  /** Pre-registered real-world feature bench, read from its recorded results. */
  featureBench: featureBench.summary,
  version: cli.version,
  medianSeconds: (savings.performance.medianScanAndRankMs / 1000).toFixed(2),
  confidenceCalibration,
  heldout: {
    cases: heldout.cases,
    top1: hits(heldoutResults, "top1Hit"),
    top3: hits(heldoutResults, "top3Hit"),
    top5: hits(heldoutResults, "top5Hit"),
    intervals95: heldout.intervals95,
    cohorts: cohortOf(heldout),
    results: heldout.results
  },
  regression: {
    cases: regression.cases,
    top1: hits(regressionResults, "top1Hit"),
    top3: hits(regressionResults, "top3Hit"),
    top5: hits(regressionResults, "top5Hit"),
    intervals95: regression.intervals95,
    cohorts: cohortOf(regression),
    results: regression.results
  },
  baselines: {
    heldout: baselineOf(heldoutBaseline),
    regression: baselineOf(regressionBaseline)
  },
  adversarial: {
    cases: adversarial.cases,
    passed: adversarial.passed,
    falseConfidenceRate: adversarial.falseConfidenceRate,
    results: adversarial.results
  }
};

export const commands = {
  publicIssue:
    "fixmap plan --issue https://github.com/chalk/chalk/issues/624",
  localTask: "fixmap plan --issue \"password reset emails fail\"",
  context: "fixmap context --issue \"password reset emails fail\" --budget 10000",
  graph: "fixmap graph --issue \"password reset emails fail\" --format mermaid",
  diff: "fixmap plan --diff main...HEAD",
  verify: "fixmap verify --report plan.json --diff main...HEAD",
  validate: "fixmap validate plan.json",
  setup: "fixmap setup",
  features: "fixmap features",
  mcp: "fixmap mcp"
};
