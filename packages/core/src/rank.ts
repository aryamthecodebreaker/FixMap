import { extractTaskSignals, tokenizePath, tokenizeText } from "./signals.js";
import type { RankedFile, RepoMap } from "./types.js";

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

  const taskTargetsEvaluation = hasAny(signals.tokens, ["benchmark", "benchmarks", "evaluation", "evaluate"]);
  const candidates = repo.files.filter((file) =>
    file.isSource &&
    !file.isTest &&
    (!file.path.startsWith("benchmarks/") || taskTargetsEvaluation)
  );
  const contentTokensByPath = new Map(candidates.map((file) => [file.path, tokenizeText(file.textSample)]));
  const commonTokens = findCommonTokens(contentTokensByPath);
  const taskTargetsDocumentation = hasAny(signals.tokens, ["docs", "documentation", "readme", "guide", "copy"]);
  const taskTargetsConfiguration = hasAny(signals.tokens, ["config", "configuration", "workflow", "action", "ci", "yaml"]);

  return candidates
    .map((file) => {
      const reasons: string[] = [];
      let score = 0;
      const isChanged = signals.changedFiles.has(file.path);

      if (isChanged) {
        score += 20;
        reasons.push("changed file");
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
      } else if (file.kind === "config" && taskTargetsConfiguration) {
        score += 2;
        reasons.push("configuration-focused task");
      } else if (file.kind === "config" && !taskTargetsConfiguration && !isChanged) {
        score -= 4;
      }

      if (pathTokens.has("auth") || pathTokens.has("login")) {
        if (signals.tokens.has("auth") || signals.tokens.has("login") || signals.tokens.has("password")) {
          score += 2;
          reasons.push("auth-related task signal");
        }
      }

      return {
        path: file.path,
        score,
        confidence: confidenceForScore(score, isChanged),
        reasons: reasons.length > 0 ? reasons : ["source file baseline"]
      };
    })
    .filter((file) => file.score >= 4)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function confidenceForScore(score: number, isChanged: boolean): RankedFile["confidence"] {
  if (isChanged || score >= 14) return "high";
  if (score >= 8) return "medium";
  return "low";
}

function hasAny(tokens: Set<string>, values: string[]): boolean {
  return values.some((value) => tokens.has(value));
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
