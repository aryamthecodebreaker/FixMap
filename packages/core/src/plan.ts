import {
  analyzeTaskGrounding,
  buildNextAction,
  buildRankingShape
} from "./grounding.js";
import type { RankingShape, TaskGrounding } from "./grounding.js";
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
  const grounding = analyzeTaskGrounding(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  });
  const ranking = buildRankingShape(contextFiles);
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
      ...findTaskDiagnostics(grounding, ranking),
      ...findEmptyResultDiagnostics(repo, contextFiles, input.issueText ?? "")
    ],
    analysis: {
      grounding,
      ranking,
      nextAction: buildNextAction(grounding, ranking, contextFiles)
    }
  };
}

function findTaskDiagnostics(
  grounding: TaskGrounding,
  ranking: RankingShape
): ScanDiagnostic[] {
  const diagnostics: ScanDiagnostic[] = [];

  if (grounding.unresolvedIdentifiers.length > 0) {
    diagnostics.push({
      code: "unresolved-identifier",
      severity: "warning",
      message:
        `Identifier${grounding.unresolvedIdentifiers.length === 1 ? "" : "s"} not found exactly in the scanned repository: ` +
        `${grounding.unresolvedIdentifiers.join(", ")}. Component words from unresolved identifiers were ignored, ` +
        "and unsupported recommendations were capped at low confidence."
    });
  }

  if (grounding.partiallyResolvedIdentifiers.length > 0) {
    diagnostics.push({
      code: "partially-resolved-identifier",
      severity: "info",
      message:
        `Identifier${grounding.partiallyResolvedIdentifiers.length === 1 ? "" : "s"} matched a longer repository symbol by component terms: ` +
        `${grounding.partiallyResolvedIdentifiers.join(", ")}. The component terms were retained, but confidence was capped at medium.`
    });
  }

  if (grounding.unverifiedIdentifiers.length > 0) {
    diagnostics.push({
      code: "identifier-unverified",
      severity: "warning",
      message:
        `Identifier${grounding.unverifiedIdentifiers.length === 1 ? "" : "s"} could not be verified because one or more source files exceeded the text-sampling limit: ` +
        `${grounding.unverifiedIdentifiers.join(", ")}. FixMap did not claim that the identifier was absent, and confidence was capped at low without another anchor.`
    });
  }

  if (grounding.specificity === "vague") {
    diagnostics.push({
      code: "vague-task",
      severity: "warning",
      message:
        "The task is broad and has no verified symbol, file, or diff anchor. Treat the ranking as subsystem guidance only, " +
        "or add a failing behavior, error string, command, symbol, or file path."
    });
  }

  if (ranking.clustered && grounding.specificity !== "anchored") {
    diagnostics.push({
      code: "flat-ranking",
      severity: "warning",
      message:
        "The leading files have tightly clustered scores, so FixMap cannot identify a decisive edit point. " +
        "Use them as a starting neighborhood and verify the exact file before editing."
    });
  }

  return diagnostics;
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
