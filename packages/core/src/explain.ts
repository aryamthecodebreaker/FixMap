// Answers the question a ranked list cannot: "why isn't my file in there?"
//
// A report explains the files it chose. The harder and more common question is about a
// file it left out — and until now the only answer available was silence, which reads
// like the tool has nothing to say for itself. Every branch below reports a specific,
// checkable cause rather than a score.

import type { PathExcluder } from "./exclude.js";
import { isBackupPath, isGeneratedPath, isRecordedEvaluationOutput, moduleStem } from "./paths.js";
import { REPORT_SCORE_CUTOFF, rankContextFiles } from "./rank.js";
import { extractFileMentions } from "./signals.js";
import type { RankedFile, RepoMap } from "./types.js";

export type FileExplanation = {
  path: string;
  status: "ranked" | "below-cutoff" | "outside-limit" | "excluded" | "not-scanned";
  rank?: number;
  score?: number;
  confidence?: RankedFile["confidence"];
  cutoff?: number;
  reasons: string[];
  summary: string;
};

export function explainFile(
  repo: RepoMap,
  input: {
    issueText?: string | undefined;
    diffText?: string | undefined;
    exclude?: PathExcluder | undefined;
    limit?: number | undefined;
  },
  targetPath: string
): FileExplanation {
  const normalizedRoot = repo.root.replace(/\\/g, "/").replace(/\/$/, "");
  let requested = targetPath.replace(/\\/g, "/");
  if (requested.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
    requested = requested.slice(normalizedRoot.length + 1);
  } else if (/^(?:[a-z]:\/|\/)/i.test(requested)) {
    return { path: requested, status: "not-scanned", reasons: [], summary: "Not scanned: the absolute path is outside this repository." };
  }
  const parts: string[] = [];
  for (const segment of requested.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (parts.length === 0) return { path: requested, status: "not-scanned", reasons: [], summary: "Not scanned: the path escapes above the repository root." };
      parts.pop();
    } else parts.push(segment);
  }
  const normalized = parts.join("/");
  const path = repo.files.find((entry) => entry.path.toLowerCase() === normalized.toLowerCase())?.path ?? normalized;

  // Asked first, because an excluded file has no score to report and "scored below the
  // cutoff" would be a false explanation for a deliberate omission.
  const excludedBy = input.exclude?.reasonFor(path);
  if (excludedBy) {
    return {
      path,
      status: "excluded",
      reasons: [],
      summary:
        `Excluded: matched the exclusion pattern "${excludedBy}". ` +
        "Remove it from .fixmapignore or --exclude to let this file rank."
    };
  }

  const reported = rankContextFiles(repo, input, input.limit);
  const position = reported.findIndex((file) => file.path === path);
  if (position !== -1) {
    const file = reported[position]!;
    return {
      path,
      status: "ranked",
      rank: position + 1,
      score: file.score,
      confidence: file.confidence,
      reasons: file.reasons,
      summary: `Ranked ${position + 1} of ${reported.length} at ${file.confidence} confidence, score ${file.score}.`
    };
  }

  const exclusion = describeExclusion(repo, input, path);
  if (exclusion) {
    return { path, status: exclusion.status, reasons: [], summary: exclusion.summary };
  }

  // The file was a candidate and simply did not score highly enough. Report the score it
  // did earn and what it earned it for, which is the only actionable form of this answer.
  const everything = rankContextFiles(repo, input, Number.MAX_SAFE_INTEGER, Number.NEGATIVE_INFINITY);
  const scored = everything.find((file) => file.path === path);
  const lowestReported = reported[reported.length - 1]?.score;
  const outsideLimit = scored !== undefined && lowestReported !== undefined && scored.score >= lowestReported;

  return {
    path,
    status: outsideLimit ? "outside-limit" : "below-cutoff",
    score: scored?.score ?? 0,
    cutoff: lowestReported ?? REPORT_SCORE_CUTOFF,
    reasons: scored?.reasons ?? [],
    summary: outsideLimit
      ? `Scored ${scored.score}, tied with or above the lowest reported score of ${lowestReported}, but fell outside the top ${reported.length} after score and path tie-breaking.`
      : `Scored ${scored?.score ?? 0}, below the ${reported.length > 0 ? `lowest reported score of ${lowestReported}` : `reporting cutoff of ${REPORT_SCORE_CUTOFF}`}. ` +
        "Name a symbol, error string, or path from this file in the task to raise it."
  };
}

/** Renders one file's explanation. The summary carries the answer; reasons show the working. */
export function renderExplanationMarkdown(explanation: FileExplanation): string {
  const lines = [`# Why ${explanation.path}`, "", explanation.summary];
  if (explanation.reasons.length > 0) {
    lines.push("", "## Signals", "");
    for (const reason of explanation.reasons) {
      lines.push(`- ${reason}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

type Exclusion = { status: "excluded" | "not-scanned"; summary: string };

// Mirrors the candidate filter in rankContextFiles. `explain.test.ts` asserts the two
// agree on every file in a fixture, so this cannot drift silently.
function describeExclusion(
  repo: RepoMap,
  input: { issueText?: string | undefined; diffText?: string | undefined },
  path: string
): Exclusion | null {
  const file = repo.files.find((entry) => entry.path === path);
  if (!file) {
    if (repo.diagnostics.some((diagnostic) => diagnostic.code === "scan-limit-reached")) {
      return {
        status: "not-scanned",
        summary: "Not scanned: the scan reached its file limit before this path. Point FixMap at a narrower directory."
      };
    }
    // Git tracks the path but nothing is on disk. Blaming .gitignore sent people looking at
    // ignore rules that never mentioned it, when the file is indexed and simply absent.
    if (repo.trackedFiles?.includes(path)) {
      return {
        status: "not-scanned",
        summary: "Not scanned: git tracks this path but no file is present on disk, so it was never read. " +
          "That is usually a sparse or partial checkout — widen the cone to rank it — and otherwise a deletion."
      };
    }
    return {
      status: "not-scanned",
      summary: "Not scanned: no such path in this repository, or it is ignored by .gitignore."
    };
  }

  const mentioned = [...extractFileMentions(input.issueText ?? "")]
    .some((mention) => path === mention || path.endsWith(`/${mention}`) || mention.endsWith(`/${path}`));
  if (mentioned) {
    return null;
  }

  if (file.isTest) {
    return {
      status: "excluded",
      summary: "Excluded: test files are routed as test commands rather than ranked as edit targets."
    };
  }
  if (!file.isSource) {
    return {
      status: "not-scanned",
      summary: `Not scanned: ${file.extension || "this file type"} is outside the supported source extensions.`
    };
  }
  if (LOCKFILES.has(path.split("/").pop() ?? "")) {
    return { status: "excluded", summary: "Excluded: lockfiles are never edit targets." };
  }
  if (path.startsWith("benchmarks/")) {
    if (isRecordedEvaluationOutput(path)) {
      return { status: "excluded", summary: "Excluded: recorded evaluation output is regenerated by the evaluation record command, not edited by hand." };
    }
    return {
      status: "excluded",
      summary: "Excluded: benchmark fixtures are ranked only when the task is about evaluation."
    };
  }

  if (isGeneratedPath(path) && !repo.changedFiles.includes(path)) {
    const stem = moduleStem(path);
    const counterpart = repo.files.find((entry) =>
      entry.path !== path &&
      entry.isSource &&
      !isGeneratedPath(entry.path) &&
      !isBackupPath(entry.path) &&
      moduleStem(entry.path) === stem
    );
    if (counterpart) {
      return {
        status: "excluded",
        summary: `Excluded: generated output for ${counterpart.path}, which the next build overwrites. That file was ranked instead.`
      };
    }
  }

  return null;
}

const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"]);
