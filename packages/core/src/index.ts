export { buildFixMapReport, resolveExclusions } from "./plan.js";
export { buildPathExcluder, NO_EXCLUSIONS } from "./exclude.js";
export type { PathExcluder } from "./exclude.js";
export { compareReports, renderComparisonMarkdown } from "./compare.js";
export type { ReportComparison } from "./compare.js";
export { renderVerifyMarkdown, verifyPlan } from "./verify.js";
export { explainFile, renderExplanationMarkdown } from "./explain.js";
export type { FileExplanation } from "./explain.js";
export {
  analyzeTaskGrounding,
  buildGroundedTaskTokens,
  buildNextAction,
  buildRankingShape
} from "./grounding.js";
export { buildImportGraph, findImportProximity } from "./import-graph.js";
export { detectPrimaryLanguage } from "./languages.js";
export type { LanguageDetection, PrimaryLanguage } from "./languages.js";
export { rankContextFiles } from "./rank.js";
export { buildRiskNotes, buildSummary, buildTestRoutes, pathsForRiskArea, renderJsonReport, renderMarkdownReport } from "./report.js";
export { scanRepo } from "./repo-scan.js";
export { findGatedTestDiagnostics } from "./test-gates.js";
export type {
  FixMapInput,
  FixMapReport,
  IdentifierGrounding,
  PackageScript,
  RankedFile,
  RepoFile,
  RepoMap,
  RiskNote,
  ScanDiagnostic,
  TaskAnalysis,
  TestRoute,
  VerifyFinding,
  VerifyResult
} from "./types.js";
