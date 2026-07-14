import { buildImportGraph, findImportProximity } from "./import-graph.js";
import type { ImportProximity } from "./import-graph.js";
import { extractTaskSignals, tokenizePath, tokenizeText } from "./signals.js";
import type { RankedFile, RepoMap } from "./types.js";

const DEPLOYMENT_TERMS = [
  "deploy", "deployment", "vercel", "netlify", "docker", "kubernetes", "hosting", "serverless", "production", "404", "500", "502"
];
const LOCKFILES = new Set(["package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", "bun.lock"]);
const MAX_FILES_PER_MENTION = 5;
const MAX_PROXIMITY_SEEDS = 5;
const IMPORT_PROXIMITY_BOOSTS: Record<ImportProximity["distance"], number> = { 1: 4, 2: 2 };

type ScoredFile = { path: string; score: number; isChanged: boolean; reasons: string[] };

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
  const taskTargetsDocumentation = hasAny(signals.tokens, ["docs", "documentation", "readme", "guide", "copy"]);
  const taskTargetsConfiguration = hasAny(signals.tokens, ["config", "configuration", "workflow", "action", "ci", "yaml"]);
  const taskTargetsDeployment = hasAny(signals.tokens, DEPLOYMENT_TERMS);

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
  const seeds = scored
    .filter((entry) => confidenceForScore(entry.score, entry.isChanged) === "high")
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, MAX_PROXIMITY_SEEDS)
    .map((entry) => entry.path);
  if (seeds.length === 0) {
    return;
  }

  const proximity = findImportProximity(buildImportGraph(repo.files), seeds);
  for (const entry of scored) {
    const hit = proximity.get(entry.path);
    if (hit) {
      entry.score += IMPORT_PROXIMITY_BOOSTS[hit.distance];
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
    const matches = repoPaths.filter(
      (path) => path === mention || path.endsWith(`/${mention}`) || mention.endsWith(`/${path}`)
    );
    if (matches.length > 0 && matches.length <= MAX_FILES_PER_MENTION) {
      for (const path of matches) {
        matched.add(path);
      }
    }
  }

  return matched;
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
