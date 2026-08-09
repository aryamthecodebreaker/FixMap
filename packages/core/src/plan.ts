import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildPathExcluder, parseIgnoreFile, NO_EXCLUSIONS } from "./exclude.js";
import type { PathExcluder } from "./exclude.js";
import { buildReportFromRepo } from "./report.js";
import { scanRepo } from "./repo-scan.js";
import type { FixMapInput, FixMapReport } from "./types.js";

export async function buildFixMapReport(
  input: Pick<
    FixMapInput,
    "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef" | "workingTree" | "includeUntracked" | "useCache"
  > & { limit?: number | undefined; exclude?: string[] | undefined }
): Promise<FixMapReport> {
  const repo = await scanRepo(input);
  const exclude = await resolveExclusions(input.repoRoot, input.exclude ?? []);

  const report = buildReportFromRepo(repo, {
    issueText: input.issueText,
    limit: input.limit,
    exclude
  });

  if (exclude.patterns.length > 0) {
    const excludedPaths = repo.files.filter((file) => exclude.excludes(file.path)).map((file) => file.path);
    const unmatchedPatterns = exclude.patterns.filter((pattern) =>
      !pattern.startsWith("!") && !exclude.matchedPatterns.has(pattern)
    );
    if (unmatchedPatterns.length > 0) {
      const sample = unmatchedPatterns.slice(0, 5).join(", ");
      report.diagnostics.push({
        code: "exclusion-no-match",
        severity: "warning",
        message:
          `${unmatchedPatterns.length} exclusion ${unmatchedPatterns.length === 1 ? "pattern matched" : "patterns matched"} no scanned paths: ${sample}` +
          `${unmatchedPatterns.length > 5 ? ", ..." : ""}. Check that patterns are repository-relative or run --explain on an expected file.`
      });
    }
    if (excludedPaths.length > 0) {
      report.diagnostics.push({
        code: "paths-excluded",
        severity: report.contextFiles.length === 0 ? "warning" : "info",
        message:
          `${exclude.patterns.length} exclusion ${exclude.patterns.length === 1 ? "pattern" : "patterns"} ` +
          `removed ${excludedPaths.length} ${excludedPaths.length === 1 ? "path" : "paths"} from ranking: ${exclude.patterns.join(", ")}. ` +
          "Run --explain on a file you expected to see if this is why it is absent."
      });
    }
  }

  return report;
}

/**
 * Command-line exclusions and `.fixmapignore` combine rather than override. A repository
 * that ships an ignore file has said something durable about itself; a flag is one run's
 * refinement of that, not a replacement for it.
 */
export async function resolveExclusions(repoRoot: string, patterns: string[]): Promise<PathExcluder> {
  const combined = [...await readIgnoreFile(repoRoot), ...patterns]
    .map((pattern) => normalizeAbsolutePattern(repoRoot, pattern));
  return combined.length > 0 ? buildPathExcluder(combined) : NO_EXCLUSIONS;
}

/**
 * A leading slash normally anchors a pattern to the repository root. If a user instead
 * pastes the repository's full absolute path, strip that known prefix so the intent remains
 * portable inside the scan. Paths outside the repository keep their normal anchored meaning.
 */
function normalizeAbsolutePattern(repoRoot: string, pattern: string): string {
  const trimmed = pattern.trim();
  const negated = trimmed.startsWith("!");
  const body = (negated ? trimmed.slice(1) : trimmed).replace(/\\/g, "/");
  const normalizedRoot = resolve(repoRoot).replace(/\\/g, "/").replace(/\/$/, "");
  const caseInsensitive = /^[A-Za-z]:\//.test(normalizedRoot);
  const comparableBody = caseInsensitive ? body.toLowerCase() : body;
  const comparableRoot = caseInsensitive ? normalizedRoot.toLowerCase() : normalizedRoot;
  if (!comparableBody.startsWith(`${comparableRoot}/`)) return pattern;
  return `${negated ? "!" : ""}/${body.slice(normalizedRoot.length + 1)}`;
}

async function readIgnoreFile(repoRoot: string): Promise<string[]> {
  try {
    return parseIgnoreFile(await readFile(join(repoRoot, ".fixmapignore"), "utf8"));
  } catch {
    // Having no ignore file is the normal case, not an error worth reporting.
    return [];
  }
}
