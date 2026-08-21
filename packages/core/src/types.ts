export type FixMapInput = {
  repoRoot: string;
  issueText?: string | undefined;
  diffText?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  diffSpec?: string | undefined;
  /** Map what is being edited right now: staged and unstaged changes against HEAD. */
  workingTree?: boolean | undefined;
  /** Untracked files are opt-in even in working-tree mode; agent metadata lives there. */
  includeUntracked?: boolean | undefined;
  /** Reuse an exact git-state scan from the OS cache. Non-git directories never cache. */
  useCache?: boolean | undefined;
  /** Read bounded Git history for impact evidence. Disable only when latency matters more than historical coverage. */
  includeHistory?: boolean | undefined;
};

export type TextSampleSkipReason = "too-large" | "not-text" | "unreadable";

export type RepoFile = {
  path: string;
  /** Exact blob/worktree identity used by the incremental index and derived graphs. */
  contentFingerprint?: string;
  extension: string;
  sizeBytes: number;
  isTest: boolean;
  isSource: boolean;
  kind: "code" | "config" | "documentation" | "other";
  textSample: string;
  textSampleComplete?: boolean;
  textSampleSkipReason?: TextSampleSkipReason;
};

export type PackageScript = {
  name: string;
  command: string;
  packageDir: string;
  /** The manifest's declared `name`, used to address a yarn workspace. */
  packageName?: string;
};

export type ScanDiagnostic = {
  code:
    | "diff-unavailable"
    | "package-json-invalid"
    | "scan-limit-reached"
    | "tracked-paths-absent"
    | "duplicate-real-path"
    | "submodules-skipped"
    | "repo-root-missing"
    | "gated-test-skipped"
    | "remote-issue-fetched"
    | "remote-pull-fetched"
    | "remote-repo-fetched"
    | "remote-checkout-cleanup-failed"
    | "no-task-terms"
    | "no-context-match"
    | "unresolved-identifier"
    | "partially-resolved-identifier"
    | "identifier-unverified"
    | "vague-task"
    | "flat-ranking"
    | "no-test-route"
    | "no-related-tests"
    | "content-not-utf8"
    | "content-unreadable"
    | "content-too-large"
    | "generated-paths-dominant"
    | "import-graph-truncated"
    | "paths-excluded"
    | "exclusion-no-match"
    | "working-tree-diff"
    | "diff-resolved"
    | "diff-text-truncated"
    | "cache-hit"
    | "incremental-index-hit"
    | "cache-bypass"
    | "cache-skip"
    | "task-checklist-filtered"
    | "package-manager-conflict"
    | "impact-history-unavailable"
    | "impact-history-shallow"
    | "impact-history-truncated"
    | "semantic-remote-disallowed"
    | "semantic-provider-invalid"
    | "semantic-provider-failed"
    | "semantic-candidates-truncated";
  message: string;
  severity: "info" | "warning" | "error";
  /**
   * The files this diagnostic is about, when it is about specific files. Optional so a
   * diagnostic concerning the task or the scan as a whole carries nothing misleading, and
   * so a `ScanDiagnostic` and a `VerifyFinding` share one entry shape: an agent consuming
   * both commands reads `{code, severity, message, paths?}` either way.
   */
  paths?: string[];
};

export type RepoMap = {
  root: string;
  files: RepoFile[];
  packageScripts: PackageScript[];
  changedFiles: string[];
  trackedFiles?: string[];
  diffText: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  diagnostics: ScanDiagnostic[];
  /** Bounded, pre-HEAD history used only as evidence. It never contains file contents. */
  history?: RepositoryHistory;
};

export type HistoryCommit = {
  hash: string;
  committedAt: number;
  files: string[];
};

export type RepositoryHistory = {
  commits: HistoryCommit[];
  inspectedCommits: number;
  skippedLargeCommits: number;
  shallow: boolean;
  truncated: boolean;
};

export type RankedFile = {
  /** Stable, one-based position so JSON consumers do not have to infer array order. */
  rank: number;
  path: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  /** Present only when hybrid retrieval is requested. Kept separate from structural score. */
  fusionScore?: number;
  retrieval?: {
    structuralRank?: number;
    structuralScore?: number;
    lexicalRank?: number;
    semanticRank?: number;
    semanticSimilarity?: number;
  };
};

export type TestRoute = {
  command: string;
  /**
   * `test` runs tests; `validation` is lint, typecheck or check. They were listed together
   * under one "Test Routes" heading, which invited running lint as the validation step for a
   * logic bug. It also decides how `relatedFiles` reads: tests for the first, the
   * implementation those commands would check for the second.
   */
  kind: "test" | "validation";
  reason: string;
  relatedFiles: string[];
};

export type RiskNote = {
  area: string;
  reason: string;
  severity: "low" | "medium" | "high";
};

export type ImpactEvidence = {
  kind: "imports" | "imported-by" | "co-change" | "test-route";
  seed: string;
  reason: string;
  occurrences?: number;
  seedChanges?: number;
};

export type ImpactFile = {
  path: string;
  score: number;
  confidence: "high" | "medium" | "low";
  evidence: ImpactEvidence[];
};

export type ImpactMap = {
  seeds: string[];
  files: ImpactFile[];
  inspectionOrder: string[];
  history: {
    available: boolean;
    eligibleCommits: number;
    shallow: boolean;
    truncated: boolean;
  };
};

export type IdentifierGrounding = {
  identifier: string;
  status:
    | "exact-definition"
    | "exact-text"
    | "partial-definition"
    | "not-found"
    | "unverified";
  matchedFiles: string[];
};

export type TaskAnalysis = {
  grounding: {
    specificity: "anchored" | "descriptive" | "vague";
    identifiers: IdentifierGrounding[];
    unresolvedIdentifiers: string[];
    partiallyResolvedIdentifiers: string[];
    unverifiedIdentifiers: string[];
    scanComplete: boolean;
  };
  ranking: {
    topScore: number | null;
    runnerUpScore: number | null;
    topGap: number | null;
    clustered: boolean;
  };
  retrievalRanking?: {
    topFusionScore: number | null;
    runnerUpFusionScore: number | null;
    topGap: number | null;
  };
  nextAction: string;
};

export type ReportRetrieval = {
  mode: "structural-lexical" | "structural-lexical-semantic";
  weights: { structural: number; lexical: number; semantic: number; reciprocalRankConstant: number };
  semantic?: {
    id: string;
    version: string;
    model: string;
    artifactHash: string;
    runtime: string;
    dimensions: number;
    normalization: "l2" | "none";
    local: boolean;
    cacheKey: string;
    indexedFiles: number;
    truncatedFiles: number;
  };
};

export type FixMapReport = {
  /** Machine-output contract. Additive fields do not bump this; breaking changes do. */
  reportVersion?: 1;
  summary: string;
  contextFiles: RankedFile[];
  testRoutes: TestRoute[];
  risks: RiskNote[];
  /** Additive v1 field: evidence-backed files likely worth inspecting after the primary context. */
  impact?: ImpactMap;
  changedFiles: string[];
  diagnostics: ScanDiagnostic[];
  analysis?: TaskAnalysis;
  /** Additive provenance for an explicitly requested hybrid ranking. */
  retrieval?: ReportRetrieval;
};

export type VerifyFinding = {
  code:
    | "edit-in-generated-location"
    | "tracked-generated-edit"
    | "unmapped-change"
    | "leading-file-untouched"
    | "no-test-changed"
    | "new-risk-area"
    | "impact-file-unreviewed"
    | "plan-partially-stale"
    | "planned-file-deleted"
    | "plan-repository-mismatch";
  severity: "info" | "warning" | "error";
  paths: string[];
  message: string;
};

export type VerifyResult = {
  summary: string;
  changedFiles: string[];
  findings: VerifyFinding[];
  /**
   * Scan-level notes from resolving the diff, carried so `verify --format json` reports
   * the same three kinds of thing `plan --format json` does: a summary, the files, and
   * everything the caller should know about. `findings` remain the plan-versus-diff
   * comparison; `diagnostics` are what FixMap noticed while looking.
   */
  diagnostics: ScanDiagnostic[];
  impact?: ImpactMap;
};
