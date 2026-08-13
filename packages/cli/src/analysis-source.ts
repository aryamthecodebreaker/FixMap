import {
  buildFixMapAnalysis,
  buildContextPack,
  type ContextPack,
  type FixMapReport,
  type RepoMap,
  type ScanDiagnostic
} from "@aryam/fixmap-core";
import {
  fetchPublicGitHubIssue,
  findLocalGitHubRepositoryUrl,
  parseGitHubIssueSource,
  parseRepositorySource,
  RepositorySourceError,
  withRepositorySource,
  type RepositorySourceDependencies
} from "./repository-source.js";

const MAX_ISSUE_BODY_CHARS = 20_000;

export type AnalysisSourceInput = {
  repo?: string | undefined;
  issueText?: string | undefined;
  diffSpec?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  checkoutRef?: string | undefined;
  workingTree?: boolean | undefined;
  includeUntracked?: boolean | undefined;
  useCache?: boolean | undefined;
  limit?: number | undefined;
  exclude?: string[] | undefined;
  internalExclude?: string[] | undefined;
};

export type AnalyzedRepository = {
  task: string;
  report: FixMapReport;
  repo: RepoMap;
};

export async function analyzeRepository(
  input: AnalysisSourceInput,
  dependencies: RepositorySourceDependencies = {}
): Promise<AnalyzedRepository> {
  const issueSource = input.issueText ? parseGitHubIssueSource(input.issueText) : undefined;
  const source = parseRepositorySource(input.repo ?? issueSource?.repositoryUrl ?? process.cwd());
  const localRepositoryUrl = issueSource && source.kind === "local"
    ? await findLocalGitHubRepositoryUrl(source.repoRoot)
    : undefined;
  if (
    issueSource &&
    ((source.kind === "github" && source.displayUrl.toLowerCase() !== issueSource.repositoryUrl.toLowerCase()) ||
      (source.kind === "local" && localRepositoryUrl && localRepositoryUrl.toLowerCase() !== issueSource.repositoryUrl.toLowerCase()))
  ) {
    const actualRepository = source.kind === "github" ? source.displayUrl : localRepositoryUrl;
    throw new RepositorySourceError(
      `GitHub issue "${issueSource.displayUrl}" belongs to ${issueSource.repositoryUrl}, ` +
      `but the scanned repository is ${actualRepository}. Remove --repo or use the matching repository.`
    );
  }
  if (
    source.kind === "github" &&
    (input.diffSpec !== undefined || input.baseRef !== undefined || input.headRef !== undefined || input.workingTree || input.includeUntracked)
  ) {
    throw new RepositorySourceError(
      "Git diff and working-tree options need a local checkout. A GitHub URL is fetched as a " +
      "single-commit shallow clone of the selected branch, so it has no history for a diff range " +
      "to resolve against and no working tree to compare. Clone the repository and pass --repo " +
      "with a local path, or use --issue alone."
    );
  }
  let task = input.issueText ?? "";
  let issueDiagnostic: ScanDiagnostic | undefined;
  if (issueSource) {
    const issue = await (dependencies.fetchPublicIssue ?? fetchPublicGitHubIssue)(issueSource);
    const body = issue.body.slice(0, MAX_ISSUE_BODY_CHARS);
    task = [issue.title, body].filter(Boolean).join("\n\n");
    issueDiagnostic = {
      code: issueSource.isPullRequest ? "remote-pull-fetched" : "remote-issue-fetched",
      severity: "info",
      message: `Fetched ${issueSource.displayUrl} anonymously for context selection.`
    };
  }

  return withRepositorySource(source, async (resolved) => {
    const { report, repo } = await buildFixMapAnalysis({
      repoRoot: resolved.repoRoot,
      issueText: task,
      diffSpec: input.diffSpec,
      baseRef: input.baseRef,
      headRef: input.headRef,
      workingTree: input.workingTree,
      includeUntracked: input.includeUntracked,
      useCache: input.useCache,
      includeHistory: true,
      limit: input.limit,
      exclude: input.exclude,
      internalExclude: input.internalExclude
    });
    report.diagnostics.unshift(...[issueDiagnostic, resolved.diagnostic].filter(
      (entry): entry is ScanDiagnostic => entry !== undefined
    ));
    return { task, report, repo };
  }, dependencies, (result, cleanupError, temporaryRoot) => {
    result.report.diagnostics.push({
      code: "remote-checkout-cleanup-failed",
      severity: "warning",
      message: `Analysis completed, but temporary checkout "${temporaryRoot}" could not be removed: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}.`
    });
  }, input.checkoutRef);
}

export function contextFromAnalysis(analysis: AnalyzedRepository, budgetTokens: number): ContextPack {
  return buildContextPack({
    report: analysis.report,
    repo: analysis.repo,
    task: analysis.task,
    budgetTokens
  });
}
