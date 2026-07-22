import { buildImportGraph, findImportProximity } from "./import-graph.js";
import type { ImportProximity } from "./import-graph.js";
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
const DEFINITION_IDENTIFIER_BOOST = 4;
const DEFINITION_LITERAL_BOOST = 8;
const MAX_DEFINITION_IDENTIFIERS = 2;

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

  const mentionedPaths = matchMentionedPaths(signals.fileMentions, repo.files.map((file) => file.path));
  const taskTargetsEvaluation = hasAny(signals.tokens, ["benchmark", "benchmarks", "evaluation", "evaluate"]);
  const candidates = repo.files.filter((file) =>
    mentionedPaths.has(file.path) ||
    (file.isSource &&
      !file.isTest &&
      !LOCKFILES.has(file.path.split("/").pop() ?? "") &&
      (!file.path.startsWith("benchmarks/") || taskTargetsEvaluation))
  );
  const contentTokensByPath = new Map(candidates.map((file) => [file.path, tokenizeText(file.textSample)]));
  const commonTokens = findCommonTokens(contentTokensByPath);
  const definitionSignals = buildDefinitionSignals(signals.identifiers);
  const taskTargetsDocumentation = hasAny(signals.tokens, ["docs", "documentation", "readme", "guide", "copy"]);
  const taskTargetsConfiguration = hasAny(signals.tokens, ["config", "configuration", "workflow", "action", "ci", "yaml"]);
  const taskTargetsDeployment = hasAny(signals.tokens, DEPLOYMENT_TERMS);
  const taskText = [input.issueText ?? "", input.diffText ?? ""].join("\n");
  const taskTargetsExamples = /\b(?:demos?|examples?|samples?)\b/i.test(
    taskText.replace(/\bfor example\b/gi, "")
  );
  const taskTargetsTypeDeclarations =
    /\b(?:typescript|type definitions?|declarations?|typings?|\.d\.(?:ts|mts|cts))\b/i.test(taskText);

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
        score += 12;
        reasons.push("explicitly named in the task");
      }

      const pathTokens = tokenizePath(file.path);
      const pathOverlap = [...pathTokens].filter((token) => signals.tokens.has(token));
      if (pathOverlap.length > 0) {
        score += pathOverlap.length * 3;
        reasons.push(`path matches task terms: ${pathOverlap.join(", ")}`);
      }

      const contentTokens = contentTokensByPath.get(file.path) ?? new Set<string>();
      const contentOverlap = [...contentTokens].filter((token) => signals.tokens.has(token) && !commonTokens.has(token));
      if (contentOverlap.length > 0) {
        score += Math.min(contentOverlap.length, 8) * 2;
        reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
      }

      const definedIdentifiers = findDefinedIdentifiers(file.textSample, definitionSignals)
        .slice(0, MAX_DEFINITION_IDENTIFIERS);
      if (definedIdentifiers.length > 0) {
        score += definedIdentifiers.length * DEFINITION_IDENTIFIER_BOOST;
        reasons.push(`defines task identifiers: ${definedIdentifiers.join(", ")}`);
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
      }

      if (pathTokens.has("auth") || pathTokens.has("login")) {
        if (signals.tokens.has("auth") || signals.tokens.has("login") || signals.tokens.has("password")) {
          score += 2;
          reasons.push("auth-related task signal");
        }
      }

      return { path: file.path, score, isChanged, reasons };
    });

  applyImportProximity(scored, repo);

  return scored
    .map((entry) => ({
      path: entry.path,
      score: entry.score,
      confidence: confidenceForScore(entry.score, entry.isChanged),
      reasons: entry.reasons.length > 0 ? entry.reasons : ["source file baseline"]
    }))
    .filter((file) => file.score >= 4)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function applyImportProximity(scored: ScoredFile[], repo: RepoMap): void {
  const seedEntries = scored
    .filter((entry) => confidenceForScore(entry.score, entry.isChanged) === "high")
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

function confidenceForScore(score: number, isChanged: boolean): RankedFile["confidence"] {
  if (isChanged || score >= 14) return "high";
  if (score >= 8) return "medium";
  return "low";
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

function isTypeDeclarationPath(path: string): boolean {
  return /\.d\.(?:ts|mts|cts)$/i.test(path);
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

function findCommonTokens(contentTokensByPath: Map<string, Set<string>>): Set<string> {
  const fileCount = contentTokensByPath.size;
  if (fileCount < 4) {
    return new Set();
  }

  const threshold = Math.ceil(fileCount / 2);
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
