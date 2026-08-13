export { buildFixMapAnalysis, buildFixMapReport, resolveExclusions } from "./plan.js";
export { buildPathExcluder, NO_EXCLUSIONS } from "./exclude.js";
export type { PathExcluder } from "./exclude.js";
export { compareReports, renderComparisonMarkdown } from "./compare.js";
export { quoteCliValue } from "./cli-quote.js";
export type { CliShell } from "./cli-quote.js";
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
export { buildImpactMap } from "./impact.js";
export { detectPrimaryLanguage } from "./languages.js";
export type { LanguageDetection, PrimaryLanguage } from "./languages.js";
export { isBackupPath, isGeneratedPath, moduleStem } from "./paths.js";
export { rankContextFiles } from "./rank.js";
export { rankByBm25, retrievalQueryTerms, retrievalTokens, taskMentionsExpectedPath } from "./retrieval.js";
export { buildReportFromRepo, buildRiskNotes, buildSummary, buildTestRoutes, pathsForRiskArea, renderAgentReport, renderJsonReport, renderMarkdownReport } from "./report.js";
export { buildContextPack, estimateContextTokens, renderContextPackMarkdown, type ContextPack, type ContextSnippet } from "./context.js";
export { buildFixMapGraph, renderFixMapGraphMermaid, type FixMapGraph } from "./graph.js";
export { scanRepo } from "./repo-scan.js";
export { validateFixMapReport } from "./validate.js";
export type { ValidatedFixMapReport } from "./validate.js";
export { findGatedTestDiagnostics } from "./test-gates.js";
export { stripByteOrderMark } from "./text.js";
export type {
  FixMapInput,
  FixMapReport,
  HistoryCommit,
  ImpactEvidence,
  ImpactFile,
  ImpactMap,
  IdentifierGrounding,
  PackageScript,
  RankedFile,
  RepoFile,
  RepoMap,
  RepositoryHistory,
  RiskNote,
  ScanDiagnostic,
  TaskAnalysis,
  TestRoute,
  VerifyFinding,
  VerifyResult
} from "./types.js";
