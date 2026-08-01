// Browser-safe entrypoint: these modules are deterministic and do not access
// the filesystem, child processes, or other Node-only APIs.
//
// The website demo imports this. It runs the same ranking, report assembly,
// explanation, and verification the CLI runs — only the scanner is missing,
// because a browser has no repository to scan.
export { explainFile } from "./explain.js";
export { buildPathExcluder, NO_EXCLUSIONS, parseIgnoreFile } from "./exclude.js";
export { compareReports, renderComparisonMarkdown } from "./compare.js";
export { rankContextFiles } from "./rank.js";
export { buildReportFromRepo, buildRiskNotes, buildTestRoutes, renderMarkdownReport } from "./report.js";
export { tokenizePath, tokenizeText } from "./signals.js";
export { renderVerifyMarkdown, verifyPlan } from "./verify.js";
export type { FileExplanation } from "./explain.js";
export type { PathExcluder } from "./exclude.js";
export type { ReportComparison } from "./compare.js";
export type {
  FixMapReport,
  RankedFile,
  RepoFile,
  RepoMap,
  RiskNote,
  TestRoute,
  VerifyFinding,
  VerifyResult
} from "./types.js";
