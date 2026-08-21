// Browser-safe entrypoint: these modules are deterministic and do not access
// the filesystem, child processes, or other Node-only APIs.
//
// The website demo imports this. It runs the same ranking, report assembly,
// explanation, and verification the CLI runs — only the scanner is missing,
// because a browser has no repository to scan.
export { explainFile } from "./explain.js";
export { buildPathExcluder, NO_EXCLUSIONS, parseIgnoreFile } from "./exclude.js";
export { compareReports, renderComparisonMarkdown } from "./compare.js";
export { quoteCliValue } from "./cli-quote.js";
export type { CliShell } from "./cli-quote.js";
export { rankContextFiles } from "./rank.js";
export { rankByBm25, retrievalQueryTerms, retrievalTokens, taskMentionsExpectedPath } from "./retrieval.js";
export { rankContextFilesHybrid } from "./semantic.js";
export type {
  EmbeddingProvider,
  EmbeddingProviderProvenance,
  HybridRankedFile,
  HybridRankingOptions,
  HybridRankingResult,
  SemanticIndexProvenance
} from "./semantic.js";
export { buildReportFromRepo, buildRiskNotes, buildTestRoutes, renderAgentReport, renderJsonReport, renderMarkdownReport } from "./report.js";
export { buildContextPack, estimateContextTokens, renderContextPackMarkdown, type ContextPack, type ContextSnippet } from "./context.js";
export { buildFixMapGraph, renderFixMapGraphMermaid, type FixMapGraph } from "./graph.js";
export { buildImpactMap } from "./impact.js";
export { tokenizePath, tokenizeText } from "./signals.js";
export { renderVerifyMarkdown, verifyPlan } from "./verify.js";
export { validateFixMapReport } from "./validate.js";
export type { ValidatedFixMapReport } from "./validate.js";
export type { FileExplanation } from "./explain.js";
export type { PathExcluder } from "./exclude.js";
export type { ReportComparison } from "./compare.js";
export type {
  FixMapReport,
  ImpactEvidence,
  ImpactFile,
  ImpactMap,
  RankedFile,
  RepoFile,
  RepoMap,
  RiskNote,
  TestRoute,
  VerifyFinding,
  VerifyResult
} from "./types.js";
