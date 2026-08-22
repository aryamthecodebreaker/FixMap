import { NO_EXCLUSIONS } from "./exclude.js";
import type { PathExcluder } from "./exclude.js";
import { isFixMapArtifact } from "./artifacts.js";
import { buildImportGraph, findImportProximity } from "./import-graph.js";
import type { ImportProximity } from "./import-graph.js";
import { extractLanguageDefinitions } from "./language-adapters.js";
import {
  analyzeTaskGrounding,
  buildRankingShape,
  buildGroundedTaskTokens,
  CLUSTERED_RANKING_MARGIN,
  isVagueTaskText
} from "./grounding.js";
import type { TaskGrounding } from "./grounding.js";
import { isBackupPath, isGeneratedPath, isRecordedEvaluationOutput, LOCKFILE_NAMES, moduleStem, pathMatchesMention } from "./paths.js";
import { extractTaskSignals, tokenizePath, tokenizeText } from "./signals.js";
import {
  buildRetrievalQuery,
  rankByBm25Detailed,
  rankSymbolsByBm25Detailed
} from "./retrieval.js";
import type { RankedFile, RepoFile, RepoMap } from "./types.js";

const DEPLOYMENT_TERMS = [
  "deploy", "deployment", "vercel", "netlify", "docker", "kubernetes", "hosting", "serverless", "production"
];
const CONFIGURATION_TERMS = ["config", "configuration", "workflow", "action", "ci", "yaml"];
const PRESENTATION_TERMS = [
  "browser", "button", "client", "display", "form", "frontend", "layout", "page", "screen", "ui", "visitor", "web", "website"
];
export const RANKING_SIGNAL_TERMS = [...DEPLOYMENT_TERMS, ...CONFIGURATION_TERMS, ...PRESENTATION_TERMS];
const AUXILIARY_CODE_DIRS = new Set(["demo", "demos", "example", "examples", "sample", "samples"]);
const COMPILED_TO_SOURCE_MENTION_EXTENSIONS: Readonly<Record<string, readonly string[]>> = {
  ".js": [".ts", ".tsx"],
  ".jsx": [".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
const MAX_FILES_PER_MENTION = 5;
const MAX_PROXIMITY_SEEDS = 5;
const IMPORT_PROXIMITY_BOOSTS: Record<ImportProximity["distance"], number> = { 1: 4, 2: 2 };
const EXAMPLE_CODE_PENALTY = 8;
const AUXILIARY_REPRODUCTION_PENALTY = 20;
const PRESENTATION_CODE_PENALTY = 8;
const INTERACTIVE_PRESENTATION_BOOST = 4;
const TYPE_DECLARATION_PENALTY = 4;
const TYPE_DECLARATION_DIRECT_PENALTY = 8;
const BACKUP_COPY_PENALTY = 10;
const BUNDLED_OUTPUT_PENALTY = 16;
const GENERATED_TWIN_PENALTY = 21;
const GENERATED_TWIN_REASON = "generated build artifact; maintained source counterpart exists";
// Bundlers strip newlines; people do not. A file averaging hundreds of characters per
// line is machine output, whatever directory it sits in. Repositories commit these —
// Next.js keeps pre-bundled dependencies under `src/compiled/` — and because they have
// no first-party counterpart the generated-duplicate rule keeps them, while their
// minified text contains the exact symbol names a task searches for. Editing one is
// always wrong: it is regenerated from a source that is not in this repository.
// Measured on content rather than path so readable vendored source, however long, is
// untouched — chalk's `source/vendor/supports-color/index.js` stays rankable.
const BUNDLED_LINE_LENGTH = 400;
const MIN_BUNDLE_SAMPLE_BYTES = 2_000;
const BUNDLE_MARKERS = [
  /\b__webpack_require__\b/,
  /\bwebpackChunk[A-Za-z0-9_$]*\b/,
  /\/\*\s*webpack\/runtime\//,
  /\/\*\s*harmony (?:export|import)\s*\*\//,
  /\b__commonJS\s*=/,
  /\b__toESM\s*=/,
  /\b__defProp\s*=/,
  /\/\/# sourceMappingURL=/
] as const;
const EXPLICIT_PATH_BOOST = 60;
const EXACT_LITERAL_BOOST = 8;
const MEMBER_MENTION_BOOST = 8;
// A term counts as repository-wide boilerplate only when nearly every file carries it.
// The previous half-of-all-files cutoff mistook subject matter for boilerplate: chalk
// mentions "color" in 55% of its files because that is what chalk does, and suppressing
// the word left a color-detection task with no signal at all.
const WIDESPREAD_TOKEN_SHARE = 0.85;
const DEFINITION_IDENTIFIER_BOOST = 24;
const DEFINITION_LITERAL_BOOST = 8;
const MAX_DEFINITION_IDENTIFIERS = 2;
const TASK_MATCHED_DEFINITION_BOOST = 4;
// How close to the leader a file must score to share its "high" label. Two points matches
// the window `isClusteredRanking` already treats as indistinguishable.
const HIGH_CONFIDENCE_MARGIN = CLUSTERED_RANKING_MARGIN;

type ScoredFile = { path: string; score: number; isChanged: boolean; reasons: string[] };
type DefinitionSignal = { identifier: string; pattern: RegExp };

export const REPORT_SCORE_CUTOFF = 4;

export const DEFAULT_CONTEXT_FILE_LIMIT = 8;

const RETRIEVAL_CANDIDATES_PER_SOURCE = 50;

export type RetrievalIntent =
  | "configuration"
  | "documentation"
  | "implementation"
  | "presentation"
  | "tests"
  | "types";

export type RetrievalEvidenceTier = "direct" | "corroborated" | "single-source";

export type RetrievalEvidenceProfile = {
  path: string;
  intent: RetrievalIntent;
  tier: RetrievalEvidenceTier;
  direct: boolean;
  structuralRank?: number;
  structuralScore?: number;
  lexicalRank?: number;
  lexicalScore?: number;
  symbolRank?: number;
  symbolScore?: number;
  symbol?: string;
  queryExpansions: ReturnType<typeof buildRetrievalQuery>["expansions"];
  fusionScore: number;
};

export type EvidenceRankingResult = {
  contextFiles: RankedFile[];
  /** Complete structural ranking from the single shared pass; used by semantic union. */
  structuralFiles: RankedFile[];
  profiles: RetrievalEvidenceProfile[];
  ranking: import("./grounding.js").RankingShape;
  candidateCounts: { structural: number; lexical: number; symbol: number; union: number };
  timingsMs: { structural: number; lexical: number; symbol: number; rerank: number; total: number };
};

export function rankContextFiles(
  repo: RepoMap,
  input: {
    issueText?: string | undefined;
    diffText?: string | undefined;
    exclude?: PathExcluder | undefined;
  },
  limit = DEFAULT_CONTEXT_FILE_LIMIT,
  minScore = REPORT_SCORE_CUTOFF
): RankedFile[] {
  if (minScore !== REPORT_SCORE_CUTOFF) {
    return rankContextFilesDetailed(repo, input, limit, minScore).contextFiles;
  }
  return rankContextFilesEvidenceDetailed(repo, input, limit, minScore).contextFiles;
}

/**
 * Two-stage retrieval: independent structural, whole-file lexical, and symbol-unit
 * generators create a high-recall union; a deterministic evidence reranker orders it.
 * BM25 scores remain provenance only; bounded rank evidence adjusts the structural score.
 */
export function rankContextFilesEvidenceDetailed(
  repo: RepoMap,
  input: {
    issueText?: string | undefined;
    diffText?: string | undefined;
    exclude?: PathExcluder | undefined;
  },
  limit = DEFAULT_CONTEXT_FILE_LIMIT,
  minScore = REPORT_SCORE_CUTOFF
): EvidenceRankingResult {
  const startedAt = performance.now();
  const structuralResult = rankContextFilesDetailed(
    repo,
    input,
    Number.MAX_SAFE_INTEGER,
    Number.NEGATIVE_INFINITY
  );
  const structuralFinishedAt = performance.now();
  const structural = structuralResult.contextFiles;
  const structuralByPath = new Map(structural.map((file) => [file.path, file]));
  const eligibleFiles = repo.files.filter((file) => structuralByPath.has(file.path));
  const task = [input.issueText ?? "", input.diffText ?? ""].filter(Boolean).join("\n");
  const query = buildRetrievalQuery(task);
  const intent = classifyRetrievalIntent(task);
  const lexicalKinds = intent === "documentation"
    ? new Set<RepoFile["kind"]>(["code", "documentation"])
    : intent === "configuration"
      ? new Set<RepoFile["kind"]>(["code", "config"])
      : new Set<RepoFile["kind"]>(["code"]);
  const sourceLimit = Math.min(eligibleFiles.length, RETRIEVAL_CANDIDATES_PER_SOURCE);
  const structuralCandidates = structural.slice(0, sourceLimit);
  const lexicalCandidates = rankByBm25Detailed(eligibleFiles, task, sourceLimit, lexicalKinds);
  const lexicalFinishedAt = performance.now();
  const symbolCandidates = rankSymbolsByBm25Detailed(eligibleFiles, task, sourceLimit);
  const symbolFinishedAt = performance.now();
  const structuralRank = new Map(structuralCandidates.map((file, index) => [file.path, index + 1]));
  const lexicalByPath = new Map(lexicalCandidates.map((entry) => [entry.id, entry]));
  const symbolByPath = new Map(symbolCandidates.map((entry) => [entry.path, entry]));
  const union = new Set([
    ...structuralCandidates.map((file) => file.path),
    ...lexicalCandidates.map((entry) => entry.id),
    ...symbolCandidates.map((entry) => entry.path)
  ]);

  const profiles = [...union].flatMap((path): RetrievalEvidenceProfile[] => {
    const structuralFile = structuralByPath.get(path);
    if (!structuralFile) return [];
    const lexical = lexicalByPath.get(path);
    const symbol = symbolByPath.get(path);
    const structuralPosition = structuralRank.get(path);
    const direct = hasDirectRetrievalEvidence(structuralFile);
    const sources = [structuralPosition, lexical?.rank, symbol?.rank].filter((rank) => rank !== undefined).length;
    // Structural score carries evidence strength, intent, and safety penalties that a
    // rank-only fusion erases. Independent retrievers can move close candidates through
    // bounded bonuses and the reserved coverage slot below, without letting a vocabulary-
    // dense generated or wrong-intent file jump a strongly grounded implementation.
    const fusionScore = structuralFile.score +
      boundedRankBonus(lexical?.rank, 3) +
      boundedRankBonus(symbol?.rank, 2) +
      Math.max(0, sources - 1) * 0.5;
    return [{
      path,
      intent,
      tier: direct ? "direct" : sources >= 2 ? "corroborated" : "single-source",
      direct,
      ...(structuralPosition === undefined ? {} : {
        structuralRank: structuralPosition,
        structuralScore: structuralFile.score
      }),
      ...(lexical ? { lexicalRank: lexical.rank, lexicalScore: roundRetrieval(lexical.score) } : {}),
      ...(symbol ? {
        symbolRank: symbol.rank,
        symbolScore: roundRetrieval(symbol.score),
        symbol: symbol.symbol
      } : {}),
      queryExpansions: query.expansions,
      fusionScore: roundRetrieval(fusionScore)
    }];
  }).sort((left, right) =>
    right.fusionScore - left.fusionScore ||
    (left.structuralRank ?? Number.MAX_SAFE_INTEGER) - (right.structuralRank ?? Number.MAX_SAFE_INTEGER) ||
    left.path.localeCompare(right.path)
  );

  const eligibleProfiles = profiles.filter((profile) => {
    const file = structuralByPath.get(profile.path);
    return profile.direct || (file?.score ?? Number.NEGATIVE_INFINITY) >= minScore;
  });
  const selectedProfiles = selectEvidenceProfiles(eligibleProfiles, Math.max(0, limit));
  const contextFiles = selectedProfiles.map((profile, index) => {
    const file = structuralByPath.get(profile.path)!;
    const reasons = [...file.reasons];
    if (profile.lexicalRank !== undefined) reasons.push(`BM25 whole-file candidate #${profile.lexicalRank}`);
    if (profile.symbolRank !== undefined && profile.symbol) {
      reasons.push(`BM25 symbol candidate #${profile.symbolRank}: ${profile.symbol}`);
    }
    if (profile.tier === "corroborated") reasons.push("corroborated by independent retrieval sources");
    return {
      ...file,
      rank: index + 1,
      fusionScore: profile.fusionScore,
      retrieval: {
        ...(profile.structuralRank === undefined ? {} : {
          structuralRank: profile.structuralRank,
          structuralScore: profile.structuralScore
        }),
        ...(profile.lexicalRank === undefined ? {} : { lexicalRank: profile.lexicalRank }),
        ...(profile.symbolRank === undefined ? {} : { symbolRank: profile.symbolRank })
      },
      reasons
    } satisfies RankedFile;
  });

  const finishedAt = performance.now();
  return {
    contextFiles,
    structuralFiles: structural,
    profiles,
    ranking: structuralResult.ranking,
    candidateCounts: {
      structural: structuralCandidates.length,
      lexical: lexicalCandidates.length,
      symbol: symbolCandidates.length,
      union: union.size
    },
    timingsMs: {
      structural: roundRetrieval(structuralFinishedAt - startedAt),
      lexical: roundRetrieval(lexicalFinishedAt - structuralFinishedAt),
      symbol: roundRetrieval(symbolFinishedAt - lexicalFinishedAt),
      rerank: roundRetrieval(finishedAt - symbolFinishedAt),
      total: roundRetrieval(finishedAt - startedAt)
    }
  };
}

export function rankContextFilesDetailed(
  repo: RepoMap,
  input: {
    issueText?: string | undefined;
    diffText?: string | undefined;
    exclude?: PathExcluder | undefined;
  },
  limit = DEFAULT_CONTEXT_FILE_LIMIT,
  // `explainFile` lowers this to see what a file scored below the reporting cutoff.
  // Ranking never calls it with anything but the default.
  minScore = REPORT_SCORE_CUTOFF
): { contextFiles: RankedFile[]; ranking: import("./grounding.js").RankingShape } {
  const exclude = input.exclude ?? NO_EXCLUSIONS;
  const signals = extractTaskSignals({
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });
  const grounding = analyzeTaskGrounding(repo, input);
  const taskTokens = buildGroundedTaskTokens(grounding, {
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });

  const mentionedPaths = matchMentionedPaths(signals.fileMentions, repo.files.map((file) => file.path), repo.root);
  // Excluded before anything else reads the candidate set. The boilerplate threshold below
  // is a share of that set, so removing files later would leave scoring computed against a
  // population that no longer exists.
  const scannable = repo.files.filter((file) =>
    !exclude.excludes(file.path) &&
    (mentionedPaths.has(file.path) ||
    (file.isSource &&
      !file.isTest &&
      !LOCKFILE_NAMES.has(file.path.split("/").pop() ?? "")))
  );
  // Generated output is kept only when the source it came from is absent. chalk's sole
  // color-detection implementation lives in `source/vendor/`, so it stays; a committed
  // bundle beside the module it was built from does not, because editing it is always
  // wrong — the next build overwrites it.
  const maintainedStems = new Set(
    scannable
      .filter((file) => !isGeneratedPath(file.path) && !isBackupPath(file.path))
      .map((file) => moduleStem(file.path))
  );
  const candidateFiles = scannable.filter((file) =>
    !isRecordedEvaluationOutput(file.path) && !isFixMapArtifact(file) && (
      mentionedPaths.has(file.path) ||
      signals.changedFiles.has(file.path) ||
      !isGeneratedPath(file.path) ||
      !maintainedStems.has(moduleStem(file.path))
    )
  );
  const regexTokensByPath = new Map(candidateFiles.map((file) => [file.path, extractRegexTokens(rankingText(file))]));
  const contentTokensByPath = new Map(candidateFiles.map((file) => [
    file.path,
    taskTokensInFile(
      rankingText(file),
      taskTokens,
      regexTokensByPath.get(file.path) ?? new Set<string>()
    )
  ]));
  const commonTokens = findCommonTokens(contentTokensByPath);
  const allTaskTermsAreWidespread = taskTokens.size > 0 &&
    [...taskTokens].every((token) => commonTokens.has(token));
  const definitionSignals = buildDefinitionSignals(signals.identifiers);
  const memberSignals = [...signals.memberMentions].map((member) => ({
    member,
    pattern: exactIdentifierPattern(member)
  }));
  const taskText = [input.issueText ?? "", input.diffText ?? ""].join("\n");
  const exactFragmentOccurrences = new Map(
    signals.exactFragments.map((fragment) => [fragment, countOccurrences(taskText, fragment)])
  );
  const taskTargetsDocumentation = targetsDocumentation(taskText);
  const taskTargetsConfiguration = hasAnyNormalized(taskTokens, taskText, CONFIGURATION_TERMS);
  const taskTargetsDeployment = hasAnyNormalized(taskTokens, taskText, DEPLOYMENT_TERMS);
  const taskTargetsExamples = /\b(?:demos?|examples?|samples?)\b/i.test(
    taskText.replace(/\bfor example\b/gi, "")
  );
  const taskTargetsPresentation = hasAnyNormalized(taskTokens, taskText, PRESENTATION_TERMS);
  const taskTargetsTypeDeclarations =
    /\b(?:typescript|types?|type definitions?|declarations?|typings?|\.d\.(?:ts|mts|cts))\b/i.test(taskText);

  const scored: ScoredFile[] = candidateFiles
    .map((file) => {
      const reasons: string[] = [];
      let score = 0;
      const isChanged = signals.changedFiles.has(file.path);

      if (isChanged) {
        score += 20;
        reasons.push("changed file");
      }

      if (mentionedPaths.has(file.path)) {
        score += EXPLICIT_PATH_BOOST;
        reasons.push("explicitly named in the task");
      }

      if (isGeneratedPath(file.path) && maintainedStems.has(moduleStem(file.path))) {
        score -= GENERATED_TWIN_PENALTY;
        reasons.push(GENERATED_TWIN_REASON);
        reasons.push("generated counterpart deprioritized below maintained source");
      }

      const pathTokens = tokenizePath(file.path);
      const pathOverlap = [...pathTokens].filter((token) => taskTokens.has(token));
      if (pathOverlap.length > 0) {
        score += pathOverlap.length * 3;
        reasons.push(`path matches task terms: ${pathOverlap.join(", ")}`);
        if (pathOverlap.length >= 2) {
          score += 4;
          reasons.push("multiple task terms converge in the file path");
          const fileName = file.path.split("/").at(-1)?.replace(/\.[^.]+$/, "") ?? "";
          const fileNameTokens = tokenizeText(fileName);
          if (fileNameTokens.size === 1 && [...fileNameTokens].some((token) => taskTokens.has(token))) {
            score += 5;
            reasons.push("file module name exactly matches a task term");
          }
        }
      }

      const contentTokens = contentTokensByPath.get(file.path) ?? new Set<string>();
      const contentOverlap = [...contentTokens].filter((token) =>
        taskTokens.has(token) && (allTaskTermsAreWidespread || !commonTokens.has(token))
      );
      if (contentOverlap.length > 0) {
        score += Math.min(contentOverlap.length, 8) * 2;
        reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
      }

      const regexTokenOverlap = [...(regexTokensByPath.get(file.path) ?? [])]
        .filter((token) => taskTokens.has(token))
        .slice(0, 2);
      if (regexTokenOverlap.length > 0) {
        score += Math.min(regexTokenOverlap.length, 2) * 12;
        reasons.push(`regex literal matches task tokens: ${regexTokenOverlap.join(", ")}`);
      }

      const matchedMembers = memberSignals
        .filter((signal) => signal.pattern.test(rankingText(file)))
        .map((signal) => signal.member)
        .slice(0, 3);
      if (matchedMembers.length > 0) {
        score += matchedMembers.length * MEMBER_MENTION_BOOST;
        reasons.push(`contains task member names: ${matchedMembers.join(", ")}`);
      }

      const exactLiteral = signals.exactFragments
        .filter((fragment) => rankingText(file).includes(fragment))
        .sort((a, b) =>
          (exactFragmentOccurrences.get(b) ?? 0) - (exactFragmentOccurrences.get(a) ?? 0) ||
          b.length - a.length
        )[0];
      if (exactLiteral) {
        score += EXACT_LITERAL_BOOST * Math.min(3, exactFragmentOccurrences.get(exactLiteral) ?? 0);
        reasons.push(`contains exact task literal: ${previewFragment(exactLiteral)}`);
      }

      const definedIdentifiers = (file.kind === "documentation" ? [] : findDefinedIdentifiers(file, definitionSignals))
        .slice(0, MAX_DEFINITION_IDENTIFIERS);
      if (definedIdentifiers.length > 0) {
        score += definedIdentifiers.length * DEFINITION_IDENTIFIER_BOOST;
        reasons.push(`defines task identifiers: ${definedIdentifiers.join(", ")}`);
        if (
          file.kind === "code" &&
          !file.isTest &&
          !isAuxiliaryCodePath(file.path) &&
          !isTypeDeclarationPath(file.path) &&
          !file.path.toLowerCase().startsWith("benchmarks/")
        ) {
          score += 4;
          reasons.push("task identifier is defined in maintained implementation source");
        }
      }

      const taskMatchedDefinitions = signals.exactFragments.length === 0 &&
        !taskTargetsDocumentation
        ? (file.kind === "documentation" ? [] : findTaskMatchedDefinitions(file, taskTokens))
          .filter((identifier) => !definedIdentifiers.includes(identifier))
          .slice(0, MAX_DEFINITION_IDENTIFIERS)
        : [];
      if (taskMatchedDefinitions.length > 0) {
        score += taskMatchedDefinitions.length * TASK_MATCHED_DEFINITION_BOOST;
        reasons.push(`defines symbols matching task terms: ${taskMatchedDefinitions.join(", ")}`);
      }

      const definitionFragment = file.kind === "documentation" ? undefined : signals.exactFragments.find((fragment) =>
        hasExactFragmentAtDefinition(rankingText(file), fragment, definedIdentifiers)
      );
      if (definitionFragment) {
        score += DEFINITION_LITERAL_BOOST;
        reasons.push(`exact task literal at definition: ${previewFragment(definitionFragment)}`);
      }

      if (isNearbyChangedFile(file.path, repo.changedFiles)) {
        score += 2;
        reasons.push("near changed file");
      }

      if (file.kind === "code") {
        score += 2;
      } else if (file.kind === "documentation" && taskTargetsDocumentation) {
        score += 8;
        reasons.push("documentation-focused task");
      } else if (file.kind === "documentation" && !taskTargetsDocumentation && !isChanged) {
        score -= 14;
        reasons.push("documentation deprioritized for an implementation task");
      } else if (file.kind === "config" && (taskTargetsConfiguration || taskTargetsDeployment)) {
        score += 2;
        reasons.push(taskTargetsConfiguration ? "configuration-focused task" : "deployment-focused task");
      } else if (file.kind === "config" && !isChanged) {
        score -= 4;
      }

      const isDeploymentConfig =
        file.path === "package.json" || DEPLOYMENT_TERMS.some((term) =>
          [...tokenizeText(term)].some((token) => pathTokens.has(token))
        );
      if (taskTargetsDeployment && file.kind === "config" && !file.path.includes("/") && isDeploymentConfig) {
        score += 5;
        reasons.push("root configuration for a deployment-related task");
      }

      if (
        file.kind === "code" &&
        isAuxiliaryCodePath(file.path) &&
        !taskTargetsExamples &&
        !taskTargetsPresentation &&
        !isChanged &&
        !mentionedPaths.has(file.path)
      ) {
        score -= EXAMPLE_CODE_PENALTY;
        reasons.push("example or demo code deprioritized for an implementation task");
        if (exactLiteral && definedIdentifiers.length > 0) {
          score -= AUXILIARY_REPRODUCTION_PENALTY;
          reasons.push("task reproduction evidence is weaker in auxiliary example code");
        }
      }

      if (isPresentationSurfacePath(file.path)) {
        if (taskTargetsPresentation) {
          score += PRESENTATION_CODE_PENALTY;
          reasons.push("presentation surface matches a UI-focused task");
          if (isInteractivePresentation(file.textSample)) {
            score += INTERACTIVE_PRESENTATION_BOOST;
            reasons.push("interactive presentation surface matches the requested user flow");
          }
        } else if (!taskTargetsExamples && !isChanged && !mentionedPaths.has(file.path)) {
          score -= PRESENTATION_CODE_PENALTY;
          reasons.push("presentation or demo surface deprioritized for a non-UI implementation task");
        }
      }

      if (
        isTypeDeclarationPath(file.path) &&
        !taskTargetsTypeDeclarations &&
        !isChanged &&
        !mentionedPaths.has(file.path)
      ) {
        score -= TYPE_DECLARATION_PENALTY;
        reasons.push("type declaration deprioritized for a runtime task");
        if (definedIdentifiers.length > 0) {
          score -= TYPE_DECLARATION_DIRECT_PENALTY;
          reasons.push("runtime implementation preferred over a matching declaration");
        }
      } else if (
        isTypeDeclarationPath(file.path) &&
        taskTargetsTypeDeclarations &&
        !isChanged
      ) {
        score += TYPE_DECLARATION_PENALTY;
        reasons.push("type declaration matches a type-focused task");
      }

      if (isBackupPath(file.path) && !isChanged && !mentionedPaths.has(file.path)) {
        score -= BACKUP_COPY_PENALTY;
        reasons.push("backup or archived copy deprioritized");
      }

      if (isBundledOutput(file.textSample, file.path) && !isChanged && !mentionedPaths.has(file.path)) {
        score -= BUNDLED_OUTPUT_PENALTY;
        reasons.push("machine-generated bundle deprioritized");
      }

      if (pathTokens.has("auth") || pathTokens.has("login")) {
        if (taskTokens.has("auth") || taskTokens.has("login") || taskTokens.has("password")) {
          score += 2;
          reasons.push("auth-related task signal");
        }
      }

      return { path: file.path, score, isChanged, reasons };
    });

  applyImportProximity(scored, repo);

  const candidates = scored
    .filter((file) => file.score >= minScore)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const ranking = buildRankingShape(candidates);
  const clustered = ranking.clustered;
  const leadIsContested = hasContestedLead(candidates);
  const ranked = candidates.slice(0, limit);

  const contextFiles = ranked
    .map((entry, position) => ({
      rank: position + 1,
      path: entry.path,
      score: entry.score,
      confidence: confidenceForEntry(entry, grounding, clustered, {
        position,
        topScore: candidates[0]?.score ?? entry.score,
        leadIsContested,
        issueIsVague: isVagueTaskText(input.issueText ?? "")
      }),
      reasons: entry.reasons.length > 0 ? entry.reasons : ["source file baseline"]
    }));
  return { contextFiles, ranking };
}

/**
 * Is the leading file's claim disputed by a definition site behind it?
 *
 * #102 established that a file defining the symbol a task names is a better answer than a
 * file that merely talks about it a lot, however dense that talk is. So when the leader
 * carries no definition evidence of its own and something below it does, the lead is not
 * decisive — it is one of two plausible answers, and the one below has the stronger kind
 * of evidence. Saying "high" there is the expensive failure, because an agent that opens
 * only the first result never sees the competitor.
 *
 * Score margin is deliberately not part of this. A definition site six points back is
 * still the definition site; ranking it lower is exactly the vocabulary-density bias the
 * boost exists to correct, so a margin would reintroduce the thing being guarded against.
 */
function hasContestedLead(ranked: ScoredFile[]): boolean {
  const leader = ranked[0];
  if (!leader || hasDefinitionEvidence(leader)) {
    return false;
  }
  return ranked.slice(1).some((entry) => hasDefinitionEvidence(entry));
}

function hasDefinitionEvidence(entry: ScoredFile): boolean {
  return entry.reasons.some((reason) =>
    reason.startsWith("defines task identifiers:") ||
    reason.startsWith("exact task literal at definition:")
  );
}

function applyImportProximity(scored: ScoredFile[], repo: RepoMap): void {
  const directSeeds = scored
    .filter((entry) => entry.score >= 8 && hasDirectEvidence(entry))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, MAX_PROXIMITY_SEEDS);
  const seedEntries = directSeeds.length > 0
    ? directSeeds
    : scored
      .filter((entry) => entry.score >= 8)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, 2);
  if (seedEntries.length === 0) {
    return;
  }

  const seeds = seedEntries.map((entry) => entry.path);
  const seedScores = new Map(seedEntries.map((entry) => [entry.path, entry.score]));
  const graph = buildImportGraph(repo.files);
  if ((graph.truncatedFiles > 0 || graph.truncatedEdges > 0) && !repo.diagnostics.some((entry) => entry.code === "import-graph-truncated")) {
    repo.diagnostics.push({
      code: "import-graph-truncated",
      severity: "info",
      message:
        `Import proximity was bounded: ${graph.truncatedFiles.toLocaleString()} parseable files and ` +
        `${graph.truncatedEdges.toLocaleString()} high-fanout files were not fully traversed. Ranking still uses path and content evidence.`
    });
  }
  const proximity = findImportProximity(graph, seeds);
  for (const entry of scored) {
    const hit = proximity.get(entry.path);
    if (hit) {
      const seedScore = seedScores.get(hit.seed);
      const availableBoost = seedScore === undefined ? 0 : Math.max(0, seedScore - entry.score - 1);
      const boost = Math.min(IMPORT_PROXIMITY_BOOSTS[hit.distance], availableBoost);
      if (boost === 0) {
        continue;
      }
      entry.score += boost;
      entry.reasons.push(proximityReason(hit));
    }
  }
}

function proximityReason(hit: ImportProximity): string {
  if (hit.distance === 2) {
    return `within two import hops of ranked file ${hit.seed}`;
  }
  return hit.direction === "imported-by" ? `imported by ranked file ${hit.seed}` : `imports ranked file ${hit.seed}`;
}

function confidenceForEntry(
  entry: ScoredFile,
  grounding: TaskGrounding,
  clustered: boolean,
  shape: { position: number; topScore: number; leadIsContested: boolean; issueIsVague: boolean }
): RankedFile["confidence"] {
  const hasMaintainedSourceTwin = entry.reasons.includes(GENERATED_TWIN_REASON);
  if (
    entry.reasons.includes("explicitly named in the task") &&
    shape.position === 0 &&
    !shape.leadIsContested &&
    !hasMaintainedSourceTwin
  ) {
    return "high";
  }

  let confidence: RankedFile["confidence"] =
    entry.score >= 14 ? "high" : entry.score >= 8 ? "medium" : "low";

  // An absolute threshold alone says nothing about whether this file beat the others.
  // On a real Zod task the top eight scored 43, 24, 22, 20, 20, 20, 19, 19 and every one
  // of them was labeled high — teaching an agent that the eighth guess is as safe to edit
  // as a leader nineteen points ahead. High is now reserved for a file that actually leads,
  // ties the lead, or carries definition-site evidence of its own; the rest are a
  // neighborhood to read, which is what medium already means.
  const leads = shape.position === 0 || entry.score >= shape.topScore - HIGH_CONFIDENCE_MARGIN;
  if (!leads && !hasDirectEvidence(entry)) {
    confidence = capConfidence(confidence, "medium");
  }
  if (shape.position === 0 && shape.leadIsContested) {
    confidence = capConfidence(confidence, "medium");
  }
  if (hasMaintainedSourceTwin) {
    confidence = capConfidence(confidence, "medium");
  }
  // A large lexical score and a wide lead can still be a convincing match to an absent
  // feature (for example, a generic `hasFlag` helper in a repository with no CLI). Reserve
  // high confidence for a changed file, an explicit path, or an exact identifier/literal
  // definition. Vocabulary-only leaders remain useful, but are honest medium-confidence
  // investigation targets.
  if (!hasDirectEvidence(entry)) {
    confidence = capConfidence(confidence, "medium");
  }
  const supportedIdentifierCount = grounding.identifiers.filter((identifier) =>
    identifier.status === "exact-definition" ||
    identifier.status === "exact-text" ||
    identifier.status === "partial-definition"
  ).length;

  if (grounding.unresolvedIdentifiers.length > 0) {
    if (supportedIdentifierCount === 0) {
      return "low";
    }
    confidence = capConfidence(confidence, "medium");
  }
  if (grounding.unverifiedIdentifiers.length > 0) {
    if (supportedIdentifierCount === 0) {
      return "low";
    }
    confidence = capConfidence(confidence, "medium");
  }
  if (grounding.partiallyResolvedIdentifiers.length > 0) {
    confidence = capConfidence(confidence, "medium");
  }
  if (grounding.specificity === "vague" || shape.issueIsVague) {
    return "low";
  }
  if (!grounding.scanComplete) {
    confidence = capConfidence(confidence, "medium");
  }
  if (clustered && !hasDirectEvidence(entry)) {
    confidence = capConfidence(confidence, "medium");
  }
  return confidence;
}

function capConfidence(
  confidence: RankedFile["confidence"],
  maximum: RankedFile["confidence"]
): RankedFile["confidence"] {
  const levels: RankedFile["confidence"][] = ["low", "medium", "high"];
  return levels.indexOf(confidence) > levels.indexOf(maximum) ? maximum : confidence;
}

function hasDirectEvidence(entry: ScoredFile): boolean {
  return entry.isChanged || entry.reasons.some((reason) =>
    reason === "explicitly named in the task" ||
    reason.startsWith("defines task identifiers:") ||
    reason.startsWith("exact task literal at definition:")
  );
}

function hasAnyNormalized(tokens: Set<string>, rawText: string, values: string[]): boolean {
  return values.some((value) => {
    const normalized = tokenizeText(value);
    if (normalized.size > 0 && [...normalized].every((token) => tokens.has(token))) return true;
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(value)}(?=$|[^\\p{L}\\p{N}_])`, "iu").test(rawText);
  });
}

function matchMentionedPaths(mentions: Set<string>, repoPaths: string[], repoRoot: string): Set<string> {
  const matched = new Set<string>();

  for (const rawMention of mentions) {
    const mention = repositoryRelativeMention(rawMention, repoRoot);
    if (!mention) continue;
    const exactMatches = repoPaths.filter((path) => pathMatchesMention(path, mention));
    if (exactMatches.length > 0) {
      if (exactMatches.length <= MAX_FILES_PER_MENTION) {
        for (const path of exactMatches) {
          matched.add(path);
        }
      }
      continue;
    }

    const fallbackVariants = compiledSourcePathVariants(mention);
    const fallbackMatches = repoPaths.filter((path) =>
      fallbackVariants.some((variant) => pathMatchesMention(path, variant))
    );
    if (fallbackMatches.length > 0 && fallbackMatches.length <= MAX_FILES_PER_MENTION) {
      for (const path of fallbackMatches) {
        matched.add(path);
      }
    }
  }

  return matched;
}

function repositoryRelativeMention(mention: string, repoRoot: string): string | undefined {
  const normalizedMention = mention.replace(/\\/g, "/");
  if (!/^(?:[A-Za-z]:\/|\/)/.test(normalizedMention)) return normalizedMention;

  const normalizedRoot = repoRoot.replace(/\\/g, "/").replace(/\/$/, "");
  const prefix = `${normalizedRoot}/`;
  return normalizedMention.toLowerCase().startsWith(prefix.toLowerCase())
    ? normalizedMention.slice(prefix.length)
    : undefined;
}

function compiledSourcePathVariants(path: string): string[] {
  const lowerPath = path.toLowerCase();

  for (const [compiledExtension, sourceExtensions] of Object.entries(COMPILED_TO_SOURCE_MENTION_EXTENSIONS)) {
    if (!lowerPath.endsWith(compiledExtension)) {
      continue;
    }
    const stem = path.slice(0, -compiledExtension.length);
    return sourceExtensions.map((extension) => `${stem}${extension}`);
  }

  return [];
}

function isAuxiliaryCodePath(path: string): boolean {
  const parts = path.split("/");
  const stem = (parts.at(-1) ?? "").replace(/\.[^.]+$/, "").toLowerCase();
  const parentSegments = parts.slice(0, -1).map((segment) => segment.toLowerCase());
  return parentSegments.some((segment) => AUXILIARY_CODE_DIRS.has(segment)) ||
    (stem === "sample-repo" && parentSegments.some((segment) => segment === "web" || segment === "website"));
}

function isPresentationSurfacePath(path: string): boolean {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  return /^(?:page|layout|demo)\.[cm]?[jt]sx?$/.test(name) ||
    /\.(?:css|less|sass|scss)$/.test(name);
}

function isInteractivePresentation(text: string): boolean {
  return /<(?:button|form|input|select|textarea)\b|\bon(?:Change|Click|Input|Submit)\s*=|\buseState\s*\(/.test(text);
}

function tokenizeFileContent(text: string, regexTokens: Set<string>): Set<string> {
  const tokens = tokenizeText(text);
  for (const token of regexTokens) tokens.add(token);
  return tokens;
}

function taskTokensInFile(text: string, taskTokens: ReadonlySet<string>, regexTokens: Set<string>): Set<string> {
  const regexOverlap = [...regexTokens].some((token) => taskTokens.has(token));
  if (!regexOverlap && !mightContainTaskToken(text, taskTokens)) return new Set<string>();
  const tokens = tokenizeFileContent(text, regexTokens);
  return new Set([...tokens].filter((token) => taskTokens.has(token)));
}

/** Cheap conservative gate before the full Unicode/stemming tokenizer. Normal stemming
 * preserves the leading characters. The two tokenizer rewrites that do not—CSS
 * preprocessor aliases and HTTP version shorthands—are checked explicitly. */
function mightContainTaskToken(text: string, taskTokens: ReadonlySet<string>): boolean {
  const lower = text.toLowerCase();
  for (const token of taskTokens) {
    if (token === "css" && /\b(?:css|scss|sass|less)\b/.test(lower)) return true;
    if (/^h[123]$/.test(token) && new RegExp(`(?:\\b${token}\\b|\\bhttp\\s*\\/\\s*${token[1]}\\b)`).test(lower)) {
      return true;
    }
    const prefix = token.length <= 4 ? token : token.slice(0, 4);
    if (lower.includes(prefix)) return true;
  }
  return false;
}

function extractRegexTokens(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const match of text.matchAll(/\b([A-Za-z])\{(\d+),(\d+)\}/g)) {
    const character = match[1]?.toLowerCase();
    const minimum = Number(match[2]);
    const maximum = Math.min(Number(match[3]), 8);
    if (!character || !Number.isSafeInteger(minimum) || !Number.isSafeInteger(maximum)) {
      continue;
    }
    for (let length = Math.max(3, minimum); length <= maximum; length += 1) {
      tokens.add(character.repeat(length));
    }
  }
  return tokens;
}

function isBundledOutput(textSample: string, path: string): boolean {
  if (textSample.length < MIN_BUNDLE_SAMPLE_BYTES) {
    return false;
  }
  const lineCount = textSample.split("\n").length;
  if (textSample.length / lineCount >= BUNDLED_LINE_LENGTH) {
    return true;
  }

  // Modern development bundles are often pretty-printed to a few dozen characters per
  // line, so line length alone misses them. Two independent fingerprints identify one
  // anywhere. A single fingerprint is enough only when the path supplies independent
  // generated-output evidence. That catches Next.js-style `dist/compiled/` bundles while
  // leaving ordinary readable vendored source, such as chalk's `source/vendor/`, alone.
  const markerCount = BUNDLE_MARKERS.filter((marker) => marker.test(textSample)).length;
  return markerCount >= 2 || (markerCount >= 1 && isConventionalBundlePath(path));
}

function isConventionalBundlePath(path: string): boolean {
  return isGeneratedPath(path) || path.split("/").slice(0, -1)
    .some((segment) => segment.toLowerCase() === "compiled");
}

function isTypeDeclarationPath(path: string): boolean {
  return /\.d\.(?:ts|mts|cts)$/i.test(path);
}

function targetsDocumentation(taskText: string): boolean {
  const documentation = "(?:docs?|documentation|readme|guide)";
  const action = "(?:add|change|correct|document|edit|fix|improve|remove|revise|rewrite|update|write)";
  const defect = "(?:typos?|spelling|grammar|wording|broken links?)";
  return (
    new RegExp(`\\b${action}\\b[^\\n.]{0,60}\\b${documentation}\\b`, "i").test(taskText) ||
    new RegExp(`\\b${documentation}\\b[^\\n.]{0,60}\\b${action}\\b`, "i").test(taskText) ||
    new RegExp(`\\b${defect}\\b[^\\n.]{0,60}\\b${documentation}\\b`, "i").test(taskText) ||
    new RegExp(`\\b${documentation}\\b[^\\n.]{0,60}\\b${defect}\\b`, "i").test(taskText) ||
    /\b(?:marketing|landing|website|page|button|label|headline|cta)\s+copy\b/i.test(taskText)
  );
}

function buildDefinitionSignals(identifiers: Set<string>): DefinitionSignal[] {
  return [...identifiers]
    .sort((a, b) => a.localeCompare(b))
    .map((identifier) => ({
      identifier,
      pattern: new RegExp(
        `(?<![\\p{L}\\p{N}_$])(?:export\\s+)?(?:async\\s+)?(?:function\\s*\\*?\\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\\s+)${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`,
        "u"
      )
    }));
}

function findDefinedIdentifiers(file: RepoFile, signals: DefinitionSignal[]): string[] {
  const adapterDefinitions = new Set(extractLanguageDefinitions(file).map((entry) => entry.name));
  return signals
    .filter((signal) => adapterDefinitions.has(signal.identifier) || signal.pattern.test(rankingText(file)))
    .map((signal) => signal.identifier);
}

function exactIdentifierPattern(identifier: string): RegExp {
  return new RegExp(
    `(?<![\\p{L}\\p{N}_$])${escapeRegExp(identifier)}(?![\\p{L}\\p{N}_$])`,
    "u"
  );
}

function findTaskMatchedDefinitions(file: RepoFile, taskTokens: Set<string>): string[] {
  const definitions = new Set(extractLanguageDefinitions(file).map((entry) => entry.name));
  const pattern =
    /(?<![\p{L}\p{N}_$])(?:export\s+)?(?:async\s+)?(?:function\s*\*?\s*|(?:const|let|var|class|interface|type|enum|def|fn|func|fun|struct|trait)\s+)([\p{L}_$][\p{L}\p{N}_$]*)(?![\p{L}\p{N}_$])/gu;

  for (const match of rankingText(file).matchAll(pattern)) {
    const identifier = match[1];
    if (identifier) definitions.add(identifier);
  }
  const matched: string[] = [];
  for (const identifier of definitions) {
    const overlap = [...tokenizeText(identifier)].filter((token) => taskTokens.has(token));
    if (overlap.length >= 2 || (overlap.length === 1 && identifier.length >= 6)) {
      matched.push(identifier);
    }
  }
  return matched;
}

function hasExactFragmentAtDefinition(text: string, fragment: string, definedIdentifiers: string[]): boolean {
  let index = text.indexOf(fragment);
  while (index !== -1) {
    const prefix = text.slice(Math.max(0, index - 240), index);
    const namesNearby = definedIdentifiers.some((identifier) =>
      prefix.includes(identifier)
    );
    const assignmentNearby = /\b(?:const|let|var)\s+[$A-Za-z_][$A-Za-z0-9_]*(?:\s*:[^=\r\n]+)?\s*=\s*[/("'`]?\s*$/.test(prefix);
    if (namesNearby || assignmentNearby) {
      return true;
    }
    index = text.indexOf(fragment, index + fragment.length);
  }
  return false;
}

function previewFragment(fragment: string): string {
  return fragment.length <= 40 ? fragment : `${fragment.slice(0, 37)}...`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text: string, value: string): number {
  if (!value) {
    return 0;
  }
  return text.split(value).length - 1;
}

function findCommonTokens(contentTokensByPath: Map<string, Set<string>>): Set<string> {
  const fileCount = contentTokensByPath.size;
  if (fileCount < 4) {
    return new Set();
  }

  const threshold = Math.ceil(fileCount * WIDESPREAD_TOKEN_SHARE);
  const frequency = new Map<string, number>();

  for (const tokens of contentTokensByPath.values()) {
    for (const token of tokens) {
      frequency.set(token, (frequency.get(token) ?? 0) + 1);
    }
  }

  return new Set([...frequency].filter(([, count]) => count >= threshold).map(([token]) => token));
}

function isNearbyChangedFile(path: string, changedFiles: string[]): boolean {
  const folder = path.split("/").slice(0, -1).join("/");

  if (!folder) {
    return false;
  }

  return changedFiles.some((changedPath) => changedPath !== path && changedPath.startsWith(`${folder}/`));
}

function rankingText(file: Pick<RepoFile, "textSample" | "searchTextSample">): string {
  return file.searchTextSample ?? file.textSample;
}

function hasDirectRetrievalEvidence(file: Pick<RankedFile, "reasons">): boolean {
  return file.reasons.some((reason) =>
    reason === "changed file" ||
    reason === "explicitly named in the task" ||
    reason.startsWith("defines task identifiers:") ||
    reason.startsWith("exact task literal at definition:")
  );
}

function classifyRetrievalIntent(task: string): RetrievalIntent {
  if (/\b(?:docs?|documentation|readme|guide|wording|typos?)\b/i.test(task)) return "documentation";
  if (/\b(?:test|tests|testing|spec|coverage|fixture)\b/i.test(task)) return "tests";
  if (/\b(?:typescript|types?|typings?|declarations?|\.d\.(?:ts|mts|cts))\b/i.test(task)) return "types";
  if (/\b(?:config|configuration|workflow|ci|yaml|docker|deploy(?:ment)?)\b/i.test(task)) return "configuration";
  if (/\b(?:browser|button|client|form|frontend|layout|page|screen|ui|website)\b/i.test(task)) return "presentation";
  return "implementation";
}

function boundedRankBonus(rank: number | undefined, maximum: number): number {
  if (rank === undefined || rank > RETRIEVAL_CANDIDATES_PER_SOURCE) return 0;
  return maximum * ((RETRIEVAL_CANDIDATES_PER_SOURCE + 1 - rank) / RETRIEVAL_CANDIDATES_PER_SOURCE);
}

/**
 * Keep the strongest evidence-led prefix, then reserve one tail slot for
 * independent retrieval coverage. This preserves the ranker's Top-3 decisions while
 * preventing a high-recall lexical/symbol generator from finding the right file and then
 * having the reranker bury it outside the context window.
 */
export function selectEvidenceProfiles(profiles: RetrievalEvidenceProfile[], limit: number): RetrievalEvidenceProfile[] {
  if (profiles.length <= limit || limit < 3) return profiles.slice(0, limit);
  const primaryCount = Math.max(1, limit - 1);
  const selected = profiles.slice(0, primaryCount);
  const selectedPaths = new Set(selected.map((profile) => profile.path));
  const byCoverage = [...profiles]
    .filter((profile) =>
      (profile.direct && (profile.structuralRank ?? Number.MAX_SAFE_INTEGER) <= limit) ||
      consensusRank(profile) !== Number.MAX_SAFE_INTEGER
    )
    .sort((left, right) =>
      Number(isStrongConsensus(right)) - Number(isStrongConsensus(left)) ||
      right.fusionScore - left.fusionScore ||
      consensusRank(left) - consensusRank(right) ||
      (left.structuralRank ?? Number.MAX_SAFE_INTEGER) - (right.structuralRank ?? Number.MAX_SAFE_INTEGER) ||
      left.path.localeCompare(right.path)
    );
  const byConsensus = [...profiles].sort((left, right) =>
    consensusRank(left) - consensusRank(right) ||
    right.fusionScore - left.fusionScore ||
    left.path.localeCompare(right.path)
  );
  const byLexical = [...profiles].sort((left, right) =>
    (left.lexicalRank ?? Number.MAX_SAFE_INTEGER) - (right.lexicalRank ?? Number.MAX_SAFE_INTEGER) ||
    right.fusionScore - left.fusionScore ||
    left.path.localeCompare(right.path)
  );
  const bySymbol = [...profiles].sort((left, right) =>
    (left.symbolRank ?? Number.MAX_SAFE_INTEGER) - (right.symbolRank ?? Number.MAX_SAFE_INTEGER) ||
    right.fusionScore - left.fusionScore ||
    left.path.localeCompare(right.path)
  );
  for (const candidate of [...byCoverage, ...byConsensus, ...byLexical, ...bySymbol, ...profiles]) {
    if (selected.length >= limit) break;
    if (selectedPaths.has(candidate.path)) continue;
    selected.push(candidate);
    selectedPaths.add(candidate.path);
  }
  for (const candidate of profiles) {
    if (selected.length >= limit) break;
    if (!selectedPaths.has(candidate.path)) selected.push(candidate);
  }
  return selected;
}

function isStrongConsensus(profile: RetrievalEvidenceProfile): boolean {
  return consensusRank(profile) <= 6;
}

function consensusRank(profile: RetrievalEvidenceProfile): number {
  return profile.lexicalRank !== undefined && profile.lexicalRank <= 10 &&
    profile.symbolRank !== undefined && profile.symbolRank <= 10
    ? profile.lexicalRank + profile.symbolRank
    : Number.MAX_SAFE_INTEGER;
}

function roundRetrieval(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
