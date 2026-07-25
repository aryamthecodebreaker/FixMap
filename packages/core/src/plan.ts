import { rankContextFiles } from "./rank.js";
import { buildRiskNotes, buildSummary, buildTestRoutes } from "./report.js";
import { scanRepo } from "./repo-scan.js";
import { extractTaskSignals } from "./signals.js";
import { findGatedTestDiagnostics } from "./test-gates.js";
import type { FixMapInput, FixMapReport, RankedFile, RepoMap, ScanDiagnostic } from "./types.js";

const MAX_REPORTED_TERMS = 8;

export async function buildFixMapReport(
  input: Pick<FixMapInput, "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef">
): Promise<FixMapReport> {
  const repo = await scanRepo(input);
  const contextFiles = rankContextFiles(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  });
  const contextPaths = contextFiles.map((file) => file.path);
  const testRoutes = buildTestRoutes(repo, contextPaths);
  const routedTestPaths = [...new Set(testRoutes.flatMap((route) => route.relatedFiles))];

  return {
    summary: buildSummary(contextFiles.length, testRoutes.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths, repo.changedFiles),
    changedFiles: repo.changedFiles,
    diagnostics: [
      ...repo.diagnostics,
      ...findGatedTestDiagnostics(repo.files, routedTestPaths),
      ...findEmptyResultDiagnostics(repo, contextFiles, input.issueText ?? "")
    ]
  };
}

// An empty report is the one result that explains nothing on its own. Say whether the task
// text carried no searchable terms or whether the terms simply matched no file, so the
// reader knows which end to fix.
function findEmptyResultDiagnostics(
  repo: RepoMap,
  contextFiles: RankedFile[],
  issueText: string
): ScanDiagnostic[] {
  if (contextFiles.length > 0 || repo.files.length === 0) {
    return [];
  }

  const signals = extractTaskSignals({
    issueText,
    diffText: repo.diffText,
    changedFiles: repo.changedFiles
  });
  const terms = [...signals.tokens].sort();

  if (terms.length === 0 && signals.identifiers.size === 0 && signals.fileMentions.size === 0) {
    return [{
      code: "no-task-terms",
      severity: "warning",
      message:
        "No context files: the task text contained no searchable term. Every word was a common word, " +
        "a language keyword, or shorter than three characters. Name the failing behavior, a symbol, or a file path."
    }];
  }

  const preview = terms.slice(0, MAX_REPORTED_TERMS).join(", ");
  const remainder = terms.length > MAX_REPORTED_TERMS ? ` (+${terms.length - MAX_REPORTED_TERMS} more)` : "";
  return [{
    code: "no-context-match",
    severity: "warning",
    message:
      `No context files: no file in the ${repo.files.length} scanned matched the task terms ${preview}${remainder}. ` +
      "The repository may not contain this behavior, or it may name it differently."
  }];
}
