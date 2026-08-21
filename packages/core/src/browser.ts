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
export { buildHybridReportFromRepo, buildReportFromRepo, buildRiskNotes, buildTestRoutes, renderAgentReport, renderJsonReport, renderMarkdownReport } from "./report.js";
export { buildContextPack, estimateContextTokens, renderContextPackMarkdown, type ContextPack, type ContextSnippet } from "./context.js";
export { buildFixMapGraph, renderFixMapGraphMermaid, type FixMapGraph } from "./graph.js";
export { buildImpactMap } from "./impact.js";
export { buildWorkspaceImpact, buildWorkspaceMap } from "./workspace.js";
export type {
  WorkspaceDependency,
  WorkspaceDependencyEvidence,
  WorkspaceDiagnostic,
  WorkspaceImpact,
  WorkspaceMap,
  WorkspaceMapOptions,
  WorkspacePackage,
  WorkspaceRepository,
  WorkspaceRepositoryInput
} from "./workspace.js";
export {
  buildGraphDependencyIndex,
  buildIdentityGraph,
  createGraphEdgeIdentity,
  createGraphEquivalence,
  createGraphIdentity,
  graphSourceFingerprint,
  invalidateIdentityGraph
} from "./identity-graph.js";
export type {
  GraphDependencyIndex,
  GraphDerivation,
  GraphElementDerivation,
  GraphEntityKind,
  GraphIdentityInput,
  GraphInvalidation,
  GraphRelationshipKind,
  GraphSourceChange,
  GraphSourceDerivation,
  IdentityGraph,
  IdentityGraphEdge,
  IdentityGraphNode,
  IdentityGraphVersion
} from "./identity-graph.js";
export { tokenizePath, tokenizeText } from "./signals.js";
export { detectChangeConflicts } from "./change-conflicts.js";
export type { ChangeConflict, ChangeConflictAnalysis, ChangeIntent, ChangeZone } from "./change-conflicts.js";
export { buildMigrationPlan } from "./migration.js";
export type { MigrationCompatibility, MigrationPhase, MigrationPlan, MigrationStep } from "./migration.js";
export { comparePlanAlternatives } from "./plan-alternatives.js";
export type { AlternativePlanComparison, PlanAlternative, PlanAlternativeAssessment } from "./plan-alternatives.js";
export { addOutcomeRecord, createOutcomeRecord, emptyOutcomeStore, removeOutcomeRecord, summarizeOutcomeCalibration, validateOutcomeStore } from "./outcomes.js";
export type { OutcomeCalibration, OutcomeRecord, OutcomeStore, TestOutcomeStatus } from "./outcomes.js";
export { buildChangeDossier, validateChangeDossier } from "./dossier.js";
export type { ChangeDossier, ChangeDossierInput, DossierAssumption } from "./dossier.js";
export { routeReviewers } from "./ownership.js";
export type { ReviewEvidence, ReviewRoutingResult, ReviewSuggestion } from "./ownership.js";
export { analyzeTestReliability, assessReliableCoverage, validateTestHistoryBundle } from "./test-reliability.js";
export type { ReliableCoverageResult, TestHistoryBundle, TestObservationStatus, TestReliabilityAssessment } from "./test-reliability.js";
export { selectCIMatrix } from "./ci-matrix.js";
export type { CIMatrixCandidate, CIMatrixDimension, CIMatrixEvidence, CIMatrixRequirement, CIMatrixSelection } from "./ci-matrix.js";
export { proposeCharacterizationTests, renderCharacterizationProposalMarkdown, validateCharacterizationObservations } from "./characterization.js";
export type { CharacterizationObservationBundle, CharacterizationTestProposal } from "./characterization.js";
export { mapRuntimeEvidence, validateRuntimeEvidenceBundle } from "./runtime-evidence.js";
export type { MappedRuntimeEvidence, RuntimeCodeLocation, RuntimeEvidenceBundle, RuntimeProfileFrameRecord, RuntimeRepositorySnapshot, RuntimeSpanRecord } from "./runtime-evidence.js";
export { sensitiveDataFlowEvidenceProvider } from "./sensitive-data.js";
export type { SensitiveDataCategory, SensitiveSinkCategory } from "./sensitive-data.js";
export { createSupplyChainEvidenceProvider, validateSupplyChainEvidenceBundle } from "./supply-chain.js";
export type { SupplyChainEvidenceBundle, SupplyChainFindingKind, SupplyChainSeverity } from "./supply-chain.js";
export { renderVerifyMarkdown, verifyPlan } from "./verify.js";
export { validateFixMapReport } from "./validate.js";
export {
  architecturePolicyFromRepo,
  buildArchitectureSnapshot,
  compareArchitectureSnapshots,
  evaluateArchitecturePolicy,
  parseArchitecturePolicy
} from "./architecture.js";
export type {
  ArchitectureDrift,
  ArchitecturePolicy,
  ArchitecturePolicyFinding,
  ArchitecturePolicyResult,
  ArchitectureSnapshot
} from "./architecture.js";
export { parseDecisionRecord, selectDecisionRecords } from "./decisions.js";
export type {
  DecisionDiagnostic,
  DecisionInventory,
  DecisionRecord,
  DecisionStatus,
  DecisionTarget
} from "./decisions.js";
export {
  addAnnotation,
  annotationsForPath,
  assessAnnotations,
  createAnnotation,
  emptyAnnotationStore,
  removeAnnotation,
  validateAnnotationStore
} from "./annotations.js";
export type {
  AnnotationAssessment,
  AnnotationRename,
  AnnotationScope,
  AnnotationStore,
  CreateAnnotationInput,
  FixMapAnnotation
} from "./annotations.js";
export { compareContractInventories, contractGraphNodes, inventoryContracts, renderContractComparisonMarkdown } from "./contracts.js";
export type {
  ContractChange,
  ContractComparison,
  ContractCompatibility,
  ContractDiagnostic,
  ContractEntry,
  ContractEntryRole,
  ContractGraphOptions,
  ContractInventory,
  ContractKind,
  ContractSource,
  ContractSurface
} from "./contracts.js";
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
  VerifyNarrativeEvidence,
  VerifyNarrativeStatement,
  VerifyResult
} from "./types.js";
