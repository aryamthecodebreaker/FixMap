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
};

export type RepoFile = {
  path: string;
  extension: string;
  sizeBytes: number;
  isTest: boolean;
  isSource: boolean;
  kind: "code" | "config" | "documentation" | "other";
  textSample: string;
  textSampleComplete?: boolean;
};

export type PackageScript = {
  name: string;
  command: string;
  packageDir: string;
};

export type ScanDiagnostic = {
  code:
    | "diff-unavailable"
    | "package-json-invalid"
    | "scan-limit-reached"
    | "tracked-paths-absent"
    | "duplicate-real-path"
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
    | "paths-excluded"
    | "working-tree-diff";
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
};

export type RankedFile = {
  /** Stable, one-based position so JSON consumers do not have to infer array order. */
  rank: number;
  path: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
};

export type TestRoute = {
  command: string;
  reason: string;
  relatedFiles: string[];
};

export type RiskNote = {
  area: string;
  reason: string;
  severity: "low" | "medium" | "high";
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
  nextAction: string;
};

export type FixMapReport = {
  summary: string;
  contextFiles: RankedFile[];
  testRoutes: TestRoute[];
  risks: RiskNote[];
  changedFiles: string[];
  diagnostics: ScanDiagnostic[];
  analysis?: TaskAnalysis;
};

export type VerifyFinding = {
  code:
    | "edit-in-generated-location"
    | "tracked-generated-edit"
    | "unmapped-change"
    | "leading-file-untouched"
    | "no-test-changed"
    | "new-risk-area";
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
};
