import { extractLanguageDefinitions } from "./language-adapters.js";
import { pathMatchesMention } from "./paths.js";
import { extractTaskSignals, tokenizeIdentifier, tokenizeText } from "./signals.js";
import type {
  IdentifierGrounding,
  RankedFile,
  RepoMap,
  TaskAnalysis
} from "./types.js";

const MAX_IDENTIFIER_MATCHED_FILES = 5;
const VAGUE_TASK_PATTERN = /^\s*(?:please\s+)?(?:improve|make|clean(?:\s+(?:this|it|things?))?\s+up|cleanup|refactor)\b/i;
// Same vocabulary, global, for stripping rather than detecting. A `g` regex carries
// lastIndex between calls, so detection keeps its own non-global copy.
const VAGUE_TASK_TERMS =
  /\b(?:please|improve|better|clean(?:\s+(?:this|it|things?))?\s+up|cleanup|refactor|developer\s+experience|dx|general|overall|codebase|quality|make|things?)\b/gi;

export type TaskGrounding = TaskAnalysis["grounding"];
export type RankingShape = TaskAnalysis["ranking"];
export const CLUSTERED_RANKING_MARGIN = 2;

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
  const batchedMatches = collectBatchedIdentifierMatches(repo, anchorIdentifiers);
  const identifiers = anchorIdentifiers.map((identifier) => groundIdentifier(
    repo,
    identifier,
    batchedMatches.definitions.get(identifier),
    batchedMatches.text.get(identifier)
  ));
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
    hasMatchedFileMention ||
    resolvedIdentifierCount > 0 ||
    partiallyResolvedIdentifiers.length > 0;
  const issueTokens = tokenizeText(issueText);
  const singleTokenHasRepoMatch = issueTokens.size === 1 && repo.files.some((file) => {
    const token = [...issueTokens][0]!;
    return tokenizeText(file.path).has(token) || tokenizeText(file.textSample).has(token);
  });
  const singleUnmatchedToken = issueTokens.size === 1 && !singleTokenHasRepoMatch;
  const vague = !hasDirectAnchor && (isVagueTaskText(issueText) || singleUnmatchedToken);

  return {
    specificity: hasDirectAnchor ? "anchored" : vague ? "vague" : "descriptive",
    identifiers,
    unresolvedIdentifiers,
    partiallyResolvedIdentifiers,
    unverifiedIdentifiers,
    // "Complete" has to mean every candidate was actually read, not merely that the file
    // limit was never reached. A file past the sample ceiling, or one holding NUL bytes, is
    // still listed and still scored on its path while its contents were never seen — so a
    // report could claim a complete scan of a repository whose largest definition files went
    // unread, which is exactly where an answer hides.
    scanComplete:
      !repo.diagnostics.some((diagnostic) =>
        diagnostic.code === "scan-limit-reached" || diagnostic.code === "tracked-paths-absent"
      ) &&
      // Explicitly false, not merely absent: `textSampleComplete` is optional, and callers
      // that build a RepoMap by hand — the browser demo, an MCP client — leave it undefined.
      // Reading undefined as "incomplete" capped confidence for every one of them.
      !repo.files.some((file) => file.isSource && file.textSampleComplete === false)
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

export function buildRankingShape(contextFiles: Array<Pick<RankedFile, "score">>): RankingShape {
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
    topScore - thirdScore <= CLUSTERED_RANKING_MARGIN;

  return { topScore, runnerUpScore, topGap, clustered };
}

export function buildNextAction(
  grounding: TaskGrounding,
  ranking: RankingShape,
  contextFiles: RankedFile[],
  hasRoutedTests = true
): string {
  if (grounding.unresolvedIdentifiers.length > 0) {
    return "Verify or correct the unresolved identifiers before editing ranked files.";
  }
  if (grounding.unverifiedIdentifiers.length > 0) {
    return "Inspect the content diagnostics and make those source files readable before trusting identifier-based recommendations.";
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
    const leading = contextFiles.find((file) =>
      !file.reasons.includes("generated build artifact; maintained source counterpart exists")
    ) ?? contextFiles[0];
    return hasRoutedTests
      ? `Inspect ${leading.path} and its routed tests before editing.`
      : `Inspect ${leading.path} before editing; no related test file was routed.`;
  }
  return "Add a concrete repository anchor and rerun FixMap.";
}

/** Match all task identifiers in two repository passes instead of rescanning per identifier. */
function collectBatchedIdentifierMatches(
  repo: RepoMap,
  identifiers: string[]
): { definitions: Map<string, string[]>; text: Map<string, string[]> } {
  const definitions = collectIdentifierMatches(repo, identifiers, true);
  const withoutDefinitions = identifiers.filter((identifier) => (definitions.get(identifier)?.length ?? 0) === 0);
  return { definitions, text: collectIdentifierMatches(repo, withoutDefinitions, false) };
}

function collectIdentifierMatches(repo: RepoMap, identifiers: string[], definitions: boolean): Map<string, string[]> {
  const matches = new Map(identifiers.map((identifier) => [identifier, [] as string[]]));
  if (identifiers.length === 0) return matches;
  const wanted = new Set(identifiers);
  const alternatives = [...identifiers]
    .sort((a, b) => b.length - a.length || a.localeCompare(b))
    .map(escapeRegExp)
    .join("|");
  const prefix = definitions
    ? "(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\\s+)"
    : "";
  const pattern = new RegExp(
    "(?<![\\p{L}\\p{N}_$])" + prefix + "(" + alternatives + ")(?![\\p{L}\\p{N}_$])",
    "gu"
  );

  for (const file of repo.files) {
    const found = new Set<string>();
    if (definitions) {
      for (const definition of extractLanguageDefinitions(file)) {
        if (wanted.has(definition.name)) found.add(definition.name);
      }
    }
    for (const match of file.textSample.matchAll(pattern)) {
      if (match[1]) found.add(match[1]);
    }
    for (const identifier of found) {
      const paths = matches.get(identifier);
      if (paths && paths.length < MAX_IDENTIFIER_MATCHED_FILES) paths.push(file.path);
    }
  }
  return matches;
}

function groundIdentifier(
  repo: RepoMap,
  identifier: string,
  precomputedDefinitionFiles?: string[],
  precomputedTextFiles?: string[]
): IdentifierGrounding {
  const definitionPattern = new RegExp(
    `(?<![\\p{L}\\p{N}_$])(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\\s+)${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`,
    "u"
  );
  const exactPattern = new RegExp(
    `(?<![\\p{L}\\p{N}_$])${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`,
    "u"
  );
  const definitionFiles = precomputedDefinitionFiles ?? repo.files
    .filter((file) =>
      extractLanguageDefinitions(file).some((entry) => entry.name === identifier) ||
      definitionPattern.test(file.textSample)
    )
    .map((file) => file.path)
    .slice(0, MAX_IDENTIFIER_MATCHED_FILES);

  if (definitionFiles.length > 0) {
    return {
      identifier,
      status: "exact-definition",
      matchedFiles: definitionFiles
    };
  }

  const textFiles = precomputedTextFiles ?? repo.files
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
  const identifierParts = tokenizeIdentifier(identifier);
  const partialFiles = repo.files
    .filter((file) => hasDefinitionContainingTokens(file, identifierParts))
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

function hasDefinitionContainingTokens(
  file: RepoMap["files"][number],
  expectedTokens: Set<string>
): boolean {
  if (expectedTokens.size < 2) {
    return false;
  }
  for (const definition of extractLanguageDefinitions(file)) {
    const candidateTokens = tokenizeIdentifier(definition.name);
    if ([...expectedTokens].every((token) => candidateTokens.has(token))) return true;
  }
  const definitionPattern =
    /(?<![\p{L}\p{N}_$])(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\s+)([\p{L}_$][\p{L}\p{N}_$]*)(?![\p{L}\p{N}_$])/gu;

  for (const match of file.textSample.matchAll(definitionPattern)) {
    const name = match[1];
    if (!name) {
      continue;
    }
    const candidateTokens = tokenizeIdentifier(name);
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
  if (!/^[\x00-\x7F]+$/.test(identifier)) {
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

export function isVagueTaskText(issueText: string): boolean {
  if (issueText.trim().length === 0 || !VAGUE_TASK_PATTERN.test(issueText)) {
    return false;
  }
  if (/^\s*(?:please\s+)?(?:refactor|cleanup|clean\s+up)\s+(?:broke|breaks?|caused|causes|deleted?|deletes?|fails?|failed)\b/i.test(issueText)) {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Kept here instead of comparing raw identifier substrings so compound words from an
// invented symbol cannot silently become strong ranking evidence.
export function identifierTokens(identifier: string): Set<string> {
  return tokenizeText(identifier);
}
