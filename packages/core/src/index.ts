export { buildFixMapReport } from "./plan.js";
export { renderVerifyMarkdown, verifyPlan } from "./verify.js";
export { explainFile } from "./explain.js";
export type { FileExplanation } from "./explain.js";
export {
  analyzeTaskGrounding,
  buildGroundedTaskTokens,
  buildNextAction,
  buildRankingShape
} from "./grounding.js";
export { buildImportGraph, findImportProximity } from "./import-graph.js";
export { rankContextFiles } from "./rank.js";
export { buildRiskNotes, buildSummary, buildTestRoutes, renderJsonReport, renderMarkdownReport } from "./report.js";
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
