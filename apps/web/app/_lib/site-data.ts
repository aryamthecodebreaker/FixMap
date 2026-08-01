import heldout from "../../../../benchmarks/heldout/results.json";
import regression from "../../../../benchmarks/external/results.json";
import savings from "../../../../benchmarks/external/savings-results.json";
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

export const siteStats = {
  version: cli.version,
  medianSeconds: (savings.performance.medianScanAndRankMs / 1000).toFixed(2),
  heldout: {
    cases: heldout.cases,
    top1: hits(heldoutResults, "top1"),
    top3: hits(heldoutResults, "top3"),
    top5: hits(heldoutResults, "top5Hit"),
    intervals95: heldout.intervals95,
    results: heldout.results
  },
  regression: {
    cases: regression.cases,
    top1: hits(regressionResults, "top1"),
    top3: hits(regressionResults, "top3"),
    top5: hits(regressionResults, "top5Hit"),
    intervals95: regression.intervals95,
    results: regression.results
  }
};

export const commands = {
  publicIssue:
    "npx -y @aryam/fixmap@latest aryamthecodebreaker/FixMap#152",
  localTask: "npx -y @aryam/fixmap@latest plan --issue \"password reset emails fail\"",
  diff: "npx -y @aryam/fixmap@latest plan --diff main...HEAD",
  verify: "npx -y @aryam/fixmap@latest verify --report fixmap-report.json --diff main...HEAD",
  mcp: "npx -y @aryam/fixmap@latest mcp"
};
