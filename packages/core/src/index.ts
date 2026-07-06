export { rankContextFiles } from "./rank.js";
export { buildRiskNotes, buildSummary, buildTestRoutes, renderJsonReport, renderMarkdownReport } from "./report.js";
export { scanRepo } from "./repo-scan.js";
export type {
  FixMapInput,
  FixMapReport,
  PackageScript,
  RankedFile,
  RepoFile,
  RepoMap,
  RiskNote,
  TestRoute
} from "./types.js";
