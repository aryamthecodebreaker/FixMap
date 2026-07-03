import { extractTaskSignals, tokenizePath, tokenizeText } from "./signals.js";
import type { RankedFile, RepoMap } from "./types.js";

export function rankContextFiles(
  repo: RepoMap,
  input: { issueText?: string | undefined; diffText?: string | undefined },
  limit = 12
): RankedFile[] {
  const signals = extractTaskSignals({
    issueText: input.issueText ?? "",
    diffText: input.diffText ?? "",
    changedFiles: repo.changedFiles
  });

  return repo.files
    .filter((file) => file.isSource && !file.isTest)
    .map((file) => {
      const reasons: string[] = [];
      let score = 0;

      if (signals.changedFiles.has(file.path)) {
        score += 10;
        reasons.push("changed file");
      }

      const pathTokens = tokenizePath(file.path);
      const pathOverlap = [...pathTokens].filter((token) => signals.tokens.has(token));
      if (pathOverlap.length > 0) {
        score += pathOverlap.length * 3;
        reasons.push(`path matches task terms: ${pathOverlap.join(", ")}`);
      }

      const contentTokens = tokenizeText(file.textSample);
      const contentOverlap = [...contentTokens].filter((token) => signals.tokens.has(token));
      if (contentOverlap.length > 0) {
        score += Math.min(contentOverlap.length, 8) * 2;
        reasons.push(`content matches task terms: ${contentOverlap.slice(0, 8).join(", ")}`);
      }

      if (isNearbyChangedFile(file.path, repo.changedFiles)) {
        score += 3;
        reasons.push("near changed file");
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
        reasons: reasons.length > 0 ? reasons : ["source file baseline"]
      };
    })
    .filter((file) => file.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, limit);
}

function isNearbyChangedFile(path: string, changedFiles: string[]): boolean {
  const folder = path.split("/").slice(0, -1).join("/");

  if (!folder) {
    return false;
  }

  return changedFiles.some((changedPath) => changedPath !== path && changedPath.startsWith(`${folder}/`));
}
