export { buildFixMapAnalysis, buildFixMapReport, contractBaselineOrError, resolveExclusions } from "./plan.js";
export { contractBaselineForDiff, diffRange } from "./contract-baseline.js";
export type { ContractBaselineInput } from "./contract-baseline.js";
export { fixMapArtifactKind, isFixMapArtifact } from "./artifacts.js";
export type { FixMapArtifactKind } from "./artifacts.js";
export { buildPathExcluder, NO_EXCLUSIONS } from "./exclude.js";
export type { PathExcluder } from "./exclude.js";
export { compareReports, renderComparisonMarkdown } from "./compare.js";
export { quoteCliValue } from "./cli-quote.js";
export type { CliShell } from "./cli-quote.js";
export type { ReportComparison } from "./compare.js";
export { checkVerifyNarrative, renderVerifyMarkdown, verifyPlan } from "./verify.js";
export { checkArtifactCompatibility, supportedArtifactVersions } from "./compatibility.js";
export type { ArtifactCompatibility, ArtifactKind } from "./compatibility.js";
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
export { FIXMAP_FEATURES } from "./feature-catalog.js";
export type { FixMapFeature } from "./feature-catalog.js";
export { attachReportEvidence, MAX_REPORT_EVIDENCE_ITEMS, reportPaths } from "./report-evidence.js";
export type { ReportEvidence, ReportEvidenceSource } from "./report-evidence.js";
export { buildReportSensitiveData, MAX_REPORT_SENSITIVE_DATA_FLOWS, renderSensitiveDataMarkdown } from "./report-sensitive-data.js";
export type { ReportSensitiveData, SensitiveDataFlow, SensitiveDataSignalLocation } from "./report-sensitive-data.js";
export { buildReportSupplyChain, MAX_REPORT_SUPPLY_CHAIN_FINDINGS, renderSupplyChainReportMarkdown } from "./report-supply-chain.js";
export type { ReportSupplyChain, ReportSupplyChainFinding } from "./report-supply-chain.js";
export { createLanguageRegistry } from "./language-registry.js";
export type { CustomLanguageAdapter, LanguageRegistry } from "./language-registry.js";
export { buildImpactMap } from "./impact.js";
export { collectEvidence } from "./evidence.js";
export { readAnnotationStore, updateAnnotationStore } from "./annotation-store.js";
export { parseEvidenceProviderBundle, readEvidenceProviderBundle, EVIDENCE_BUNDLE_MAX_BYTES } from "./evidence-bundle.js";
export { detectChangeConflicts } from "./change-conflicts.js";
export type { ChangeConflict, ChangeConflictAnalysis, ChangeIntent, ChangeZone } from "./change-conflicts.js";
export {
  agentIntentToChangeIntent,
  agentIntentsDirectory,
  listAgentIntents,
  pruneAgentIntents,
  recordAgentIntent,
  releaseAgentIntent,
  validateAgentIntent
} from "./intent-store.js";
export type { AgentIntent, AgentIntentEdit, AgentIntentListing, RecordAgentIntentInput } from "./intent-store.js";
export { buildMigrationPlan } from "./migration.js";
export type { MigrationCompatibility, MigrationPhase, MigrationPlan, MigrationStep } from "./migration.js";
export { comparePlanAlternatives } from "./plan-alternatives.js";
export type { AlternativePlanComparison, PlanAlternative, PlanAlternativeAssessment } from "./plan-alternatives.js";
export { addOutcomeRecord, createOutcomeRecord, emptyOutcomeStore, removeOutcomeRecord, summarizeOutcomeCalibration, validateOutcomeStore } from "./outcomes.js";
export type { OutcomeCalibration, OutcomeRecord, OutcomeStore, TestOutcomeStatus } from "./outcomes.js";
export { buildChangeDossier, validateChangeDossier } from "./dossier.js";
export type { ChangeDossier, ChangeDossierInput, DossierAssumption } from "./dossier.js";
export { renderReviewRoutingMarkdown, reviewRoutingWithoutMentions, routeReviewers, withoutMentions } from "./ownership.js";
export type { ReviewEvidence, ReviewRoutingInput, ReviewRoutingResult, ReviewSuggestion } from "./ownership.js";
export {
  deleteStoredDossier, deleteStoredOutcome, isStoredRecordId, pruneStoredOutcomes, readStoredDossier, readStoredDossiers,
  readStoredOutcome, readStoredOutcomes, saveStoredDossier, saveStoredOutcome
} from "./record-store.js";
export type { StoredRecordProblem, StoredRecords } from "./record-store.js";
export { buildSandboxInvocation, runSandbox } from "./sandbox.js";
export type { SandboxInvocation, SandboxLimits, SandboxProcessAdapter, SandboxRawResult, SandboxRequest, SandboxResult } from "./sandbox.js";
export { analyzeTestReliability, assessReliableCoverage, validateTestHistoryBundle } from "./test-reliability.js";
export type { ReliableCoverageResult, TestHistoryBundle, TestObservationStatus, TestReliabilityAssessment } from "./test-reliability.js";
export { selectCIMatrix } from "./ci-matrix.js";
export type { CIMatrixCandidate, CIMatrixDimension, CIMatrixEvidence, CIMatrixRequirement, CIMatrixSelection } from "./ci-matrix.js";
export { proposeCharacterizationTests, renderCharacterizationProposalMarkdown, validateCharacterizationObservations } from "./characterization.js";
export type { CharacterizationObservationBundle, CharacterizationTestProposal } from "./characterization.js";
export { mapRuntimeEvidence, validateRuntimeEvidenceBundle } from "./runtime-evidence.js";
export type { MappedRuntimeEvidence, RuntimeCodeLocation, RuntimeEvidenceBundle, RuntimeProfileFrameRecord, RuntimeRepositorySnapshot, RuntimeSpanRecord } from "./runtime-evidence.js";
export { rankIncidentSuspects } from "./incident.js";
export type { IncidentRegressionInput, IncidentRegressionResult } from "./incident.js";
export { createEditorProtocolSnapshot, handleEditorProtocolRequest } from "./editor-protocol.js";
export { serveEditorProtocol, runEditorStreams, EDITOR_REQUEST_MAX_BYTES, EDITOR_RESPONSE_MAX_BYTES } from "./editor-transport.js";
export type { EditorSnapshotSource } from "./editor-transport.js";
export { createEditorSession } from "./editor-session.js";
export { loadEditorSnapshot } from "./editor-loader.js";
export type { EditorSnapshotInput } from "./editor-session.js";
export type { EditorProtocolMethod, EditorProtocolRequest, EditorProtocolResponse, EditorProtocolSnapshot } from "./editor-protocol.js";
export { answerFixMapQuestion, buildAskEvidence, defuseMarkup, scanUntrustedEvidence } from "./ask.js";
export type { AskEvidence, AskModelProvider, FixMapAnswer, UntrustedEvidenceFlag } from "./ask.js";
export { draftReverseDocumentation, renderReverseDocumentationMarkdown } from "./reverse-docs.js";
export type { ReverseDocumentationDraft, ReverseDocumentationTarget } from "./reverse-docs.js";
export { assessEnterpriseRetention, authorizeEnterpriseAction, createEnterpriseAuditEvent, validateEnterprisePolicy, verifyEnterpriseAuditChain } from "./enterprise-policy.js";
export type { EnterpriseAction, EnterpriseAuditEvent, EnterpriseAuthorizationDecision, EnterpriseAuthorizationRequest, EnterprisePolicy, EnterpriseResourceKind } from "./enterprise-policy.js";
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
export { buildDotnetProjects, buildDotnetSolutions, dotnetProjectForPath, dotnetReferenceClosure, dotnetSolutionsContaining, referencingDotnetTestProjects } from "./dotnet-projects.js";
export type { DotnetProject, DotnetSolution } from "./dotnet-projects.js";
export { buildComposerProjects, composerDependencyClosure, composerProjectForPath, composerTestCommandForProject, resolveComposerSymbol } from "./composer-projects.js";
export type { ComposerProject } from "./composer-projects.js";
export { buildRubyProjects, rubyProjectForPath, rubyTestCommandForProject } from "./ruby-projects.js";
export type { RubyProject } from "./ruby-projects.js";
export { buildRustProjects, rustPathDependency, rustProjectForPath } from "./rust-projects.js";
export type { RustPathDependency, RustProject } from "./rust-projects.js";
export { buildGoModules, buildGoWorkspaces, goModuleForPath, goReplacementForImport, goWorkspaceForModules } from "./go-projects.js";
export type { GoModule, GoReplacement, GoWorkspace } from "./go-projects.js";
export { buildChangeScope, renderChangeScopeMarkdown } from "./change-scope.js";
export type {
  ChangeScopeAnchor,
  ChangeScopeDiagnostic,
  ChangeScopeDirection,
  ChangeScopeEvidence,
  ChangeScopeInput,
  ChangeScopePath,
  ChangeScopeResult,
  ChangeScopeTraversal,
  ResolvedChangeScopeAnchor
} from "./change-scope.js";
export { buildCapabilityMap, capabilityStoreFromRepo, renderCapabilityMapMarkdown, validateCapabilityStore } from "./capabilities.js";
export type { CapabilityDefinition, CapabilityMap, CapabilityStore, CapabilityStoreSource } from "./capabilities.js";
export { compareCapabilityRefs, renderCapabilityHistoryMarkdown } from "./capability-history.js";
export type { CapabilityEntityDiff, CapabilityHistoryDiff, CapabilityPathDiff, CapabilityRefSnapshot } from "./capability-history.js";
export { isBackupPath, isGeneratedPath, moduleStem } from "./paths.js";
export { rankContextFiles, rankContextFilesEvidenceDetailed } from "./rank.js";
export type {
  EvidenceRankingResult,
  RetrievalEvidenceProfile,
  RetrievalEvidenceTier,
  RetrievalIntent
} from "./rank.js";
export {
  buildRetrievalQuery,
  rankByBm25,
  rankByBm25Detailed,
  rankDocumentsByBm25,
  rankSymbolsByBm25Detailed,
  retrievalQueryTerms,
  retrievalTokens,
  taskMentionsExpectedPath
} from "./retrieval.js";
export type {
  Bm25RankedDocument,
  RetrievalQuery,
  RetrievalQueryExpansion,
  SymbolRetrievalHit
} from "./retrieval.js";
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
export { buildWorkspaceImpact, buildWorkspaceMap, buildWorkspaceVerifyNarrative } from "./workspace.js";
export {
  assertWorkspaceScan,
  findWorkspaceRepository,
  loadWorkspaceConfig,
  parseWorkspaceConfig,
  resolveWorkspaceRepositories
} from "./workspace-config.js";
export type { LoadedWorkspace, LoadWorkspaceOptions, WorkspaceConfig, WorkspaceConfigRepository } from "./workspace-config.js";
export type {
  WorkspaceAlias,
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
export type {
  ArchitectureRefComparison,
  DecisionDisagreement,
  HistoricalArchitectureSnapshot,
  HistoricalDecisionRule,
  HistoricalRepoMap
} from "./architecture-history.js";
export { inventoryDecisionRecords, parseDecisionRecord, selectDecisionRecords } from "./decisions.js";
export type {
  DecisionDependencyRule,
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
export { compareContractRefs, inventoryContractsAtRef, inventoryWorkingTreeContracts } from "./contracts-repository.js";
export type { ContractInventoryAtRef, ContractRefComparison } from "./contracts-repository.js";
export type {
  FixMapInput,
  FixMapReport,
  ReportLanguageAdapter,
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
