export type FixMapInput = {
  repoRoot: string;
  issueText?: string | undefined;
  diffText?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  diffSpec?: string | undefined;
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
    | "repo-root-missing"
    | "gated-test-skipped"
    | "remote-issue-fetched"
    | "remote-repo-fetched"
    | "remote-checkout-cleanup-failed"
    | "no-task-terms"
    | "no-context-match"
    | "unresolved-identifier"
    | "partially-resolved-identifier"
    | "identifier-unverified"
    | "vague-task"
    | "flat-ranking";
  message: string;
  severity: "info" | "warning" | "error";
};

export type RepoMap = {
  root: string;
  files: RepoFile[];
  packageScripts: PackageScript[];
  changedFiles: string[];
  diffText: string;
  packageManager: "npm" | "pnpm" | "yarn" | "bun";
  diagnostics: ScanDiagnostic[];
};

export type RankedFile = {
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
