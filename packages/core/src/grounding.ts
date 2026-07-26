import { extractTaskSignals, tokenizeText } from "./signals.js";
import type {
  IdentifierGrounding,
  RankedFile,
  RepoMap,
  TaskAnalysis
} from "./types.js";

const MAX_IDENTIFIER_MATCHED_FILES = 5;
const VAGUE_TASK_PATTERN =
  /\b(?:improve|better|clean\s+up|cleanup|refactor|developer\s+experience|dx|general|overall|errors?|reliability|performance)\b/i;
// Same vocabulary, global, for stripping rather than detecting. A `g` regex carries
// lastIndex between calls, so detection keeps its own non-global copy.
const VAGUE_TASK_TERMS = new RegExp(VAGUE_TASK_PATTERN.source, "gi");

export type TaskGrounding = TaskAnalysis["grounding"];
export type RankingShape = TaskAnalysis["ranking"];

export function analyzeTaskGrounding(
  repo: RepoMap,
  input: { issueText?: string | undefined; diffText?: string | undefined }
): TaskGrounding {
  const issueText = input.issueText ?? "";
  const signals = extractTaskSignals({
    issueText,
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const anchorIdentifiers = [...signals.identifiers]
    .filter((identifier) => isAnchorIdentifier(identifier, issueText));
  const identifiers = anchorIdentifiers.map((identifier) => groundIdentifier(repo, identifier));
  const unresolvedIdentifiers = identifiers
    .filter((entry) => entry.status === "not-found")
    .map((entry) => entry.identifier);
  const partiallyResolvedIdentifiers = identifiers
    .filter((entry) => entry.status === "partial-definition")
    .map((entry) => entry.identifier);
  const unverifiedIdentifiers = identifiers
    .filter((entry) => entry.status === "unverified")
    .map((entry) => entry.identifier);
  const resolvedIdentifierCount = identifiers.filter((entry) =>
    entry.status === "exact-definition" || entry.status === "exact-text"
  ).length;
  const hasMatchedFileMention = [...signals.fileMentions].some((mention) =>
    repo.files.some((file) => pathMatchesMention(file.path, mention))
  );
  const hasDirectAnchor =
    repo.changedFiles.length > 0 ||
    hasMatchedFileMention ||
    resolvedIdentifierCount > 0 ||
    partiallyResolvedIdentifiers.length > 0;
  const vague = !hasDirectAnchor && isVagueTask(issueText);

  return {
    specificity: hasDirectAnchor ? "anchored" : vague ? "vague" : "descriptive",
    identifiers,
    unresolvedIdentifiers,
    partiallyResolvedIdentifiers,
    unverifiedIdentifiers,
    scanComplete: !repo.diagnostics.some((diagnostic) => diagnostic.code === "scan-limit-reached")
  };
}

export function buildGroundedTaskTokens(
  grounding: TaskGrounding,
  input: {
    issueText?: string | undefined;
    diffText?: string | undefined;
    changedFiles?: string[];
  }
): Set<string> {
  if (grounding.unresolvedIdentifiers.length === 0) {
    return extractTaskSignals(input).tokens;
  }

  const sanitizedIssueText = removeIdentifiers(
    input.issueText ?? "",
    grounding.unresolvedIdentifiers
  );
  const sanitizedDiffText = removeIdentifiers(
    input.diffText ?? "",
    grounding.unresolvedIdentifiers
  );

  return extractTaskSignals({
    ...input,
    issueText: sanitizedIssueText,
    diffText: sanitizedDiffText
  }).tokens;
}

export function buildRankingShape(contextFiles: RankedFile[]): RankingShape {
  const sortedScores = contextFiles
    .map((file) => file.score)
    .sort((a, b) => b - a);
  const topScore = sortedScores[0] ?? null;
  const runnerUpScore = sortedScores[1] ?? null;
  const topGap =
    topScore === null || runnerUpScore === null
      ? null
      : topScore - runnerUpScore;
  const thirdScore = sortedScores[2];
  const clustered =
    topScore !== null &&
    thirdScore !== undefined &&
    topScore - thirdScore <= 2;

  return { topScore, runnerUpScore, topGap, clustered };
}

export function buildNextAction(
  grounding: TaskGrounding,
  ranking: RankingShape,
  contextFiles: RankedFile[]
): string {
  if (grounding.unresolvedIdentifiers.length > 0) {
    return "Verify or correct the unresolved identifiers before editing ranked files.";
  }
  if (grounding.unverifiedIdentifiers.length > 0) {
    return "Narrow the repository or inspect large unread files before trusting identifier-based recommendations.";
  }
  if (grounding.partiallyResolvedIdentifiers.length > 0) {
    return "Verify the partially matched symbol name in the leading file before editing.";
  }
  if (!grounding.scanComplete) {
    return "Narrow the repository or package scope, then rerun FixMap before treating the ranking as complete.";
  }
  if (grounding.specificity === "vague") {
    return "Add a concrete failing behavior, symbol, error string, command, or file path and rerun FixMap.";
  }
  if (ranking.clustered) {
    return "Treat the leading files as a subsystem neighborhood and verify the exact edit point before changing code.";
  }
  if (contextFiles[0]) {
    return `Inspect ${contextFiles[0].path} and its routed tests before editing.`;
  }
  return "Add a concrete repository anchor and rerun FixMap.";
}

function groundIdentifier(repo: RepoMap, identifier: string): IdentifierGrounding {
  const definitionPattern = new RegExp(
    `\\b(?:export\\s+)?(?:async\\s+)?(?:const|let|var|function|class|interface|type|enum|def|fn|struct|trait)\\s+${escapeRegExp(identifier)}\\b`
  );
  const exactPattern = new RegExp(
    `(^|[^$A-Za-z0-9_])${escapeRegExp(identifier)}(?=$|[^$A-Za-z0-9_])`
  );
  const definitionFiles = repo.files
    .filter((file) => definitionPattern.test(file.textSample))
    .map((file) => file.path)
    .slice(0, MAX_IDENTIFIER_MATCHED_FILES);

  if (definitionFiles.length > 0) {
    return {
      identifier,
      status: "exact-definition",
      matchedFiles: definitionFiles
    };
  }

  const textFiles = repo.files
    .filter((file) => exactPattern.test(file.textSample))
    .map((file) => file.path)
    .slice(0, MAX_IDENTIFIER_MATCHED_FILES);

  return textFiles.length > 0
    ? { identifier, status: "exact-text", matchedFiles: textFiles }
    : groundPartialOrUnverifiedIdentifier(repo, identifier);
}

function groundPartialOrUnverifiedIdentifier(
  repo: RepoMap,
  identifier: string
): IdentifierGrounding {
  const identifierParts = tokenizeText(identifier);
  const partialFiles = repo.files
    .filter((file) => hasDefinitionContainingTokens(file.textSample, identifierParts))
    .map((file) => file.path)
    .slice(0, MAX_IDENTIFIER_MATCHED_FILES);

  if (identifierParts.size >= 2 && partialFiles.length > 0) {
    return {
      identifier,
      status: "partial-definition",
      matchedFiles: partialFiles
    };
  }

  if (repo.files.some((file) => file.isSource && file.textSampleComplete === false)) {
    return { identifier, status: "unverified", matchedFiles: [] };
  }

  return { identifier, status: "not-found", matchedFiles: [] };
}

function hasDefinitionContainingTokens(text: string, expectedTokens: Set<string>): boolean {
  if (expectedTokens.size < 2) {
    return false;
  }
  const definitionPattern =
    /\b(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum|def|fn|struct|trait)\s+([$A-Za-z_][$A-Za-z0-9_]*)\b/g;

  for (const match of text.matchAll(definitionPattern)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const candidateTokens = tokenizeText(name);
    if ([...expectedTokens].every((token) => candidateTokens.has(token))) {
      return true;
    }
  }
  return false;
}

function isAnchorIdentifier(identifier: string, issueText: string): boolean {
  if (new RegExp(`\`${escapeRegExp(identifier)}\``).test(issueText)) {
    return true;
  }
  if (/[_$0-9]/.test(identifier)) {
    return true;
  }
  if (/^[a-z][A-Za-z0-9_$]*[A-Z]/.test(identifier)) {
    return true;
  }
  return [...identifier].filter((character) => /[A-Z]/.test(character)).length >= 3;
}

// Vagueness is not shortness. "clean this up and make the general performance
// better overall" is longer than "improve DX" and just as unroutable, because
// nothing is left once the generic-improvement vocabulary is removed. Counting
// what survives that removal also keeps a concrete request that merely asks for
// an improvement — "improve the retry backoff so a 503 stops hammering the
// upstream host" — out of the vague bucket.
const MAX_RESIDUAL_TOKENS_FOR_VAGUE = 3;

function isVagueTask(issueText: string): boolean {
  if (issueText.trim().length === 0 || !VAGUE_TASK_PATTERN.test(issueText)) {
    return false;
  }
  const residual = tokenizeText(issueText.replace(VAGUE_TASK_TERMS, " "));
  return residual.size <= MAX_RESIDUAL_TOKENS_FOR_VAGUE;
}

function removeIdentifiers(text: string, identifiers: string[]): string {
  return identifiers.reduce(
    (current, identifier) =>
      current.replace(new RegExp(escapeRegExp(identifier), "g"), " "),
    text
  );
}

function pathMatchesMention(path: string, mention: string): boolean {
  return path === mention || path.endsWith(`/${mention}`) || mention.endsWith(`/${path}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Kept here instead of comparing raw identifier substrings so compound words from an
// invented symbol cannot silently become strong ranking evidence.
export function identifierTokens(identifier: string): Set<string> {
  return tokenizeText(identifier);
}
