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
export {
  BUILT_IN_LANGUAGE_ADAPTERS,
  extractLanguageDefinitions,
  extractLanguageImports,
  isLanguageTestPath,
  languageAdapterForFile
} from "./language-adapters.js";
export type {
  LanguageAdapter,
  LanguageAdapterId,
  LanguageDefinition,
  LanguageImport
} from "./language-adapters.js";
export { buildImpactMap } from "./impact.js";
export { collectEvidence } from "./evidence.js";
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
export { sensitiveDataFlowEvidenceProvider } from "./sensitive-data.js";
export type { SensitiveDataCategory, SensitiveSinkCategory } from "./sensitive-data.js";
export { createSupplyChainEvidenceProvider, validateSupplyChainEvidenceBundle } from "./supply-chain.js";
export type { SupplyChainEvidenceBundle, SupplyChainFindingKind, SupplyChainSeverity } from "./supply-chain.js";
export type {
  CollectedEvidence,
  CollectedEvidenceItem,
  CollectedEvidenceRelationship,
  EvidenceCollectionOptions,
  EvidenceConfidence,
  EvidenceItem,
  EvidenceKind,
  EvidenceProvider,
  EvidenceProviderCapabilities,
  EvidenceProviderContext,
  EvidenceProviderDiagnostic,
  EvidenceProviderResult,
  EvidenceRelationship,
  EvidenceSubject
} from "./evidence.js";
export { detectPrimaryLanguage } from "./languages.js";
export type { LanguageDetection, PrimaryLanguage } from "./languages.js";
export { isBackupPath, isGeneratedPath, moduleStem } from "./paths.js";
export { rankContextFiles } from "./rank.js";
export { rankByBm25, retrievalQueryTerms, retrievalTokens, taskMentionsExpectedPath } from "./retrieval.js";
export { rankContextFilesHybrid } from "./semantic.js";
export type {
  EmbeddingNormalization,
  EmbeddingProvider,
  EmbeddingProviderProvenance,
  HybridRankedFile,
  HybridRankingOptions,
  HybridRankingResult,
  HybridRetrievalDiagnostic,
  HybridRetrievalSignal,
  SemanticIndexProvenance
} from "./semantic.js";
export { createLocalTransformersEmbeddingProvider } from "./transformers-embedding.js";
export type { LocalTransformersEmbeddingOptions } from "./transformers-embedding.js";
export { withPersistentEmbeddingCache } from "./semantic-cache.js";
export type { PersistentEmbeddingCacheOptions } from "./semantic-cache.js";
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
export { buildHybridReportFromRepo, buildReportFromRepo, buildRiskNotes, buildSummary, buildTestRoutes, pathsForRiskArea, renderAgentReport, renderJsonReport, renderMarkdownReport } from "./report.js";
export { buildContextPack, estimateContextTokens, renderContextPackMarkdown, type ContextPack, type ContextSnippet } from "./context.js";
export { buildFixMapGraph, renderFixMapGraphMermaid, type FixMapGraph } from "./graph.js";
export { scanRepo } from "./repo-scan.js";
export { validateFixMapReport } from "./validate.js";
export type { ValidatedFixMapReport } from "./validate.js";
export { findGatedTestDiagnostics } from "./test-gates.js";
export { stripByteOrderMark } from "./text.js";
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
export { buildArchitectureSnapshotAtRef, compareArchitectureRefs, scanRepoAtRef } from "./architecture-history.js";
export type { HistoricalArchitectureSnapshot, HistoricalRepoMap } from "./architecture-history.js";
export { inventoryDecisionRecords, parseDecisionRecord, selectDecisionRecords } from "./decisions.js";
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
export {
  compareContractInventories,
  contractGraphNodes,
  contractSourcesFromRepo,
  inventoryContracts,
  renderContractComparisonMarkdown
} from "./contracts.js";
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
  ReportRetrieval,
  RepositoryHistory,
  RiskNote,
  ScanDiagnostic,
  TaskAnalysis,
  TestRoute,
  VerifyFinding,
  VerifyNarrativeEvidence,
  VerifyNarrativeStatement,
  VerifyResult
} from "./types.js";
