import heldout from "../../../../benchmarks/heldout/results.json";
import regression from "../../../../benchmarks/external/results.json";
import heldoutBaseline from "../../../../benchmarks/heldout/baseline-results.json";
import regressionBaseline from "../../../../benchmarks/external/baseline-results.json";
import savings from "../../../../benchmarks/external/savings-results.json";
import adversarial from "../../../../benchmarks/adversarial/results.json";
import cli from "../../../../packages/cli/package.json";

type EvaluationCase = {
  top1: boolean;
  top3: boolean;
  top5Hit: boolean;
};

const hits = (results: EvaluationCase[], key: keyof EvaluationCase) =>
  results.filter((result) => result[key]).length;

const heldoutResults = heldout.results as EvaluationCase[];
const regressionResults = regression.results as EvaluationCase[];

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
type BaselineSuite = typeof heldoutBaseline;
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

export const siteStats = {
  version: cli.version,
  medianSeconds: (savings.performance.medianScanAndRankMs / 1000).toFixed(2),
  heldout: {
    cases: heldout.cases,
    top1: hits(heldoutResults, "top1"),
    top3: hits(heldoutResults, "top3"),
    top5: hits(heldoutResults, "top5Hit"),
    intervals95: heldout.intervals95,
    cohorts: cohortOf(heldout),
    results: heldout.results
  },
  regression: {
    cases: regression.cases,
    top1: hits(regressionResults, "top1"),
    top3: hits(regressionResults, "top3"),
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
  diff: "fixmap plan --diff main...HEAD",
  verify: "fixmap verify --report plan.json --diff main...HEAD",
  validate: "fixmap validate plan.json",
  setup: "fixmap setup",
  features: "fixmap features",
  mcp: "fixmap mcp"
};
