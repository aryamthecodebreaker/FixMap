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
  textSample: string;
};

export type PackageScript = {
  name: string;
  command: string;
};

export type RepoMap = {
  root: string;
  files: RepoFile[];
  packageScripts: PackageScript[];
  changedFiles: string[];
  diffText: string;
};

export type RankedFile = {
  path: string;
  score: number;
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

export type FixMapReport = {
  summary: string;
  contextFiles: RankedFile[];
  testRoutes: TestRoute[];
  risks: RiskNote[];
  changedFiles: string[];
};
