import { buildImportGraph, findImportProximity } from "./import-graph.js";
import type { ImportProximity } from "./import-graph.js";
import {
  analyzeTaskGrounding,
  buildGroundedTaskTokens
} from "./grounding.js";
import type { TaskGrounding } from "./grounding.js";
import { isBackupPath, isGeneratedPath, moduleStem } from "./paths.js";
import { extractTaskSignals, tokenizePath, tokenizeText } from "./signals.js";
import type { RankedFile, RepoMap } from "./types.js";

const DEPLOYMENT_TERMS = [
  "deploy", "deployment", "vercel", "netlify", "docker", "kubernetes", "hosting", "serverless", "production", "404", "500", "502"
];
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"]);
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
const EXAMPLE_CODE_PENALTY = 2;
const TYPE_DECLARATION_PENALTY = 4;
const BACKUP_COPY_PENALTY = 10;
const BUNDLED_OUTPUT_PENALTY = 12;
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
const EXPLICIT_PATH_BOOST = 40;
const EXACT_LITERAL_BOOST = 8;
const MEMBER_MENTION_BOOST = 8;
// A term counts as repository-wide boilerplate only when nearly every file carries it.
// The previous half-of-all-files cutoff mistook subject matter for boilerplate: chalk
// mentions "color" in 55% of its files because that is what chalk does, and suppressing
// the word left a color-detection task with no signal at all.
const WIDESPREAD_TOKEN_SHARE = 0.85;
const DEFINITION_IDENTIFIER_BOOST = 4;
const DEFINITION_LITERAL_BOOST = 8;
const MAX_DEFINITION_IDENTIFIERS = 2;
const TASK_MATCHED_DEFINITION_BOOST = 4;

type ScoredFile = { path: string; score: number; isChanged: boolean; reasons: string[] };
type DefinitionSignal = { identifier: string; pattern: RegExp };

export function rankContextFiles(
  repo: RepoMap,
  input: { issueText?: string | undefined; diffText?: string | undefined },
  limit = 8
): RankedFile[] {
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

  const mentionedPaths = matchMentionedPaths(signals.fileMentions, repo.files.map((file) => file.path));
  const taskTargetsEvaluation = hasAny(taskTokens, ["benchmark", "benchmarks", "evaluation", "evaluate"]);
  const scannable = repo.files.filter((file) =>
    mentionedPaths.has(file.path) ||
    (file.isSource &&
      !file.isTest &&
      !LOCKFILES.has(file.path.split("/").pop() ?? "") &&
      (!file.path.startsWith("benchmarks/") || taskTargetsEvaluation))
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
  const candidates = scannable.filter((file) =>
    mentionedPaths.has(file.path) ||
    signals.changedFiles.has(file.path) ||
    !isGeneratedPath(file.path) ||
    !maintainedStems.has(moduleStem(file.path))
  );
  const contentTokensByPath = new Map(candidates.map((file) => [file.path, tokenizeText(file.textSample)]));
  const commonTokens = findCommonTokens(contentTokensByPath);
  const definitionSignals = buildDefinitionSignals(signals.identifiers);
  const taskText = [input.issueText ?? "", input.diffText ?? ""].join("\n");
  const taskTargetsDocumentation = targetsDocumentation(taskText);
  const taskTargetsConfiguration = hasAny(taskTokens, ["config", "configuration", "workflow", "action", "ci", "yaml"]);
  const taskTargetsDeployment = hasAny(taskTokens, DEPLOYMENT_TERMS);
  const taskTargetsExamples = /\b(?:demos?|examples?|samples?)\b/i.test(
    taskText.replace(/\bfor example\b/gi, "")
  );
  const taskTargetsTypeDeclarations =
    /\b(?:typescript|types?|type definitions?|declarations?|typings?|\.d\.(?:ts|mts|cts))\b/i.test(taskText);

  const scored: ScoredFile[] = candidates
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

      const pathTokens = tokenizePath(file.path);
      const pathOverlap = [...pathTokens].filter((token) => taskTokens.has(token));
      if (pathOverlap.length > 0) {
        score += pathOverlap.length * 3;
        reasons.push(`path matches task terms: ${pathOverlap.join(", ")}`);
      }

      const contentTokens = contentTokensByPath.get(file.path) ?? new Set<string>();
      const contentOverlap = [...contentTokens].filter((token) => taskTokens.has(token) && !commonTokens.has(token));
      if (contentOverlap.length > 0) {
        score += Math.min(contentOverlap.length, 8) * 2;
        reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
      }

      const matchedMembers = [...signals.memberMentions]
        .filter((member) => hasExactIdentifier(file.textSample, member))
        .slice(0, 3);
      if (matchedMembers.length > 0) {
        score += matchedMembers.length * MEMBER_MENTION_BOOST;
        reasons.push(`contains task member names: ${matchedMembers.join(", ")}`);
      }

      const exactLiteral = signals.exactFragments
        .filter((fragment) => file.textSample.includes(fragment))
        .sort((a, b) =>
          countOccurrences(taskText, b) - countOccurrences(taskText, a) ||
          b.length - a.length
        )[0];
      if (exactLiteral) {
        score += EXACT_LITERAL_BOOST * Math.min(3, countOccurrences(taskText, exactLiteral));
        reasons.push(`contains exact task literal: ${previewFragment(exactLiteral)}`);
      }

      const definedIdentifiers = findDefinedIdentifiers(file.textSample, definitionSignals)
        .slice(0, MAX_DEFINITION_IDENTIFIERS);
      if (definedIdentifiers.length > 0) {
        score += definedIdentifiers.length * DEFINITION_IDENTIFIER_BOOST;
        reasons.push(`defines task identifiers: ${definedIdentifiers.join(", ")}`);
      }

      const taskMatchedDefinitions = signals.exactFragments.length === 0
        ? findTaskMatchedDefinitions(file.textSample, taskTokens)
          .filter((identifier) => !definedIdentifiers.includes(identifier))
          .slice(0, MAX_DEFINITION_IDENTIFIERS)
        : [];
      if (taskMatchedDefinitions.length > 0) {
        score += taskMatchedDefinitions.length * TASK_MATCHED_DEFINITION_BOOST;
        reasons.push(`defines symbols matching task terms: ${taskMatchedDefinitions.join(", ")}`);
      }

      const definitionFragment = signals.exactFragments.find((fragment) =>
        hasExactFragmentAtDefinition(file.textSample, fragment, definedIdentifiers)
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
        score -= 6;
      } else if (file.kind === "config" && (taskTargetsConfiguration || taskTargetsDeployment)) {
        score += 2;
        reasons.push(taskTargetsConfiguration ? "configuration-focused task" : "deployment-focused task");
      } else if (file.kind === "config" && !isChanged) {
        score -= 4;
      }

      const isDeploymentConfig =
        file.path === "package.json" || DEPLOYMENT_TERMS.some((term) => pathTokens.has(term));
      if (taskTargetsDeployment && file.kind === "config" && !file.path.includes("/") && isDeploymentConfig) {
        score += 5;
        reasons.push("root configuration for a deployment-related task");
      }

      if (
        file.kind === "code" &&
        isAuxiliaryCodePath(file.path) &&
        !taskTargetsExamples &&
        !isChanged &&
        !mentionedPaths.has(file.path)
      ) {
        score -= EXAMPLE_CODE_PENALTY;
        reasons.push("example or demo code deprioritized for an implementation task");
      }

      if (
        isTypeDeclarationPath(file.path) &&
        !taskTargetsTypeDeclarations &&
        !isChanged &&
        !mentionedPaths.has(file.path)
      ) {
        score -= TYPE_DECLARATION_PENALTY;
        reasons.push("type declaration deprioritized for a runtime task");
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

      if (isBundledOutput(file.textSample) && !isChanged && !mentionedPaths.has(file.path)) {
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

  const ranked = scored
    .filter((file) => file.score >= 4)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
  const clustered = isClusteredRanking(ranked);

  return ranked
    .map((entry) => ({
      path: entry.path,
      score: entry.score,
      confidence: confidenceForEntry(entry, grounding, clustered),
      reasons: entry.reasons.length > 0 ? entry.reasons : ["source file baseline"]
    }));
}

function applyImportProximity(scored: ScoredFile[], repo: RepoMap): void {
  const seedEntries = scored
    .filter((entry) => entry.score >= 8 && hasDirectEvidence(entry))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, MAX_PROXIMITY_SEEDS);
  if (seedEntries.length === 0) {
    return;
  }

  const seeds = seedEntries.map((entry) => entry.path);
  const seedScores = new Map(seedEntries.map((entry) => [entry.path, entry.score]));
  const proximity = findImportProximity(buildImportGraph(repo.files), seeds);
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
  clustered: boolean
): RankedFile["confidence"] {
  if (entry.isChanged || entry.reasons.includes("explicitly named in the task")) {
    return "high";
  }

  let confidence: RankedFile["confidence"] =
    entry.score >= 14 ? "high" : entry.score >= 8 ? "medium" : "low";
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
  if (grounding.specificity === "vague") {
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

function isClusteredRanking(entries: ScoredFile[]): boolean {
  const top = entries[0]?.score;
  const third = entries[2]?.score;
  return top !== undefined && third !== undefined && top - third <= 2;
}

function hasAny(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
}

function matchMentionedPaths(mentions: Set<string>, repoPaths: string[]): Set<string> {
  const matched = new Set<string>();

  for (const mention of mentions) {
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

function pathMatchesMention(path: string, mention: string): boolean {
  return path === mention || path.endsWith(`/${mention}`) || mention.endsWith(`/${path}`);
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
  return path.split("/").slice(0, -1).some((segment) => AUXILIARY_CODE_DIRS.has(segment.toLowerCase()));
}

function isBundledOutput(textSample: string): boolean {
  if (textSample.length < MIN_BUNDLE_SAMPLE_BYTES) {
    return false;
  }
  const lineCount = textSample.split("\n").length;
  return textSample.length / lineCount >= BUNDLED_LINE_LENGTH;
}

function isTypeDeclarationPath(path: string): boolean {
  return /\.d\.(?:ts|mts|cts)$/i.test(path);
}

function targetsDocumentation(taskText: string): boolean {
  const documentation = "(?:docs?|documentation|readme|guide|copy)";
  const action = "(?:add|edit|update|write|rewrite|revise|remove|correct|document)";
  return (
    new RegExp(`\\b${action}\\b[^\\n.]{0,60}\\b${documentation}\\b`, "i").test(taskText) ||
    new RegExp(`\\b${documentation}\\b[^\\n.]{0,60}\\b${action}\\b`, "i").test(taskText)
  );
}

function buildDefinitionSignals(identifiers: Set<string>): DefinitionSignal[] {
  return [...identifiers]
    .sort((a, b) => a.localeCompare(b))
    .map((identifier) => ({
      identifier,
      pattern: new RegExp(
        `\\b(?:export\\s+)?(?:async\\s+)?(?:const|let|var|function|class|interface|type|enum|def|fn|struct|trait)\\s+${escapeRegExp(identifier)}\\b`
      )
    }));
}

function findDefinedIdentifiers(text: string, signals: DefinitionSignal[]): string[] {
  return signals.filter((signal) => signal.pattern.test(text)).map((signal) => signal.identifier);
}

function hasExactIdentifier(text: string, identifier: string): boolean {
  return new RegExp(
    `(^|[^$A-Za-z0-9_])${escapeRegExp(identifier)}(?=$|[^$A-Za-z0-9_])`
  ).test(text);
}

function findTaskMatchedDefinitions(text: string, taskTokens: Set<string>): string[] {
  const definitions = new Set<string>();
  const pattern =
    /\b(?:export\s+)?(?:async\s+)?(?:const|let|var|function|class|interface|type|enum|def|fn|struct|trait)\s+([$A-Za-z_][$A-Za-z0-9_]*)\b/g;

  for (const match of text.matchAll(pattern)) {
    const identifier = match[1];
    if (!identifier) {
      continue;
    }
    const overlap = [...tokenizeText(identifier)].filter((token) => taskTokens.has(token));
    if (overlap.length >= 2) {
      definitions.add(identifier);
    }
  }
  return [...definitions];
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
