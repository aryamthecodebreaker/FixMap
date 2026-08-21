import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { buildPathExcluder, parseIgnoreFile, NO_EXCLUSIONS } from "./exclude.js";
import { markdownCode } from "./markdown.js";
import type { PathExcluder } from "./exclude.js";
import { buildHybridReportFromRepo, buildReportFromRepo } from "./report.js";
import { scanRepo } from "./repo-scan.js";
import type { EmbeddingProvider } from "./semantic.js";
import type { FixMapInput, FixMapReport } from "./types.js";

export async function buildFixMapReport(
  input: Pick<
    FixMapInput,
    "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef" | "workingTree" | "includeUntracked" | "useCache" | "includeHistory"
  > & {
    limit?: number | undefined;
    exclude?: string[] | undefined;
    /** Known command artifacts that must not compete with repository files in ranking. */
    internalExclude?: string[] | undefined;
    embeddingProvider?: EmbeddingProvider | undefined;
  }
): Promise<FixMapReport> {
  return (await buildFixMapAnalysis(input)).report;
}

/**
 * Builds a report and returns the exact repository snapshot that produced it. Consumers such as
 * Context Packs must not rescan between ranking paths and selecting their source ranges: an active
 * working tree could change between those reads and produce a mixed-state result.
 */
export async function buildFixMapAnalysis(
  input: Pick<
    FixMapInput,
    "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef" | "workingTree" | "includeUntracked" | "useCache" | "includeHistory"
  > & {
    limit?: number | undefined;
    exclude?: string[] | undefined;
    internalExclude?: string[] | undefined;
    embeddingProvider?: EmbeddingProvider | undefined;
  }
): Promise<{ report: FixMapReport; repo: Awaited<ReturnType<typeof scanRepo>> }> {
  const repo = await scanRepo({ ...input, includeHistory: input.includeHistory !== false });
  const requestedExclude = await resolveExclusions(input.repoRoot, input.exclude ?? []);
  const internalExclude = buildPathExcluder(
    (input.internalExclude ?? []).map((pattern) => normalizeAbsolutePattern(input.repoRoot, pattern))
  );
  const exclude = combineExclusions(requestedExclude, internalExclude);

  const reportInput = {
    issueText: input.issueText,
    limit: input.limit,
    exclude,
    annotationAsOf: new Date().toISOString()
  };
  const report = input.embeddingProvider
    ? await buildHybridReportFromRepo(repo, { ...reportInput, embeddingProvider: input.embeddingProvider })
    : buildReportFromRepo(repo, reportInput);

  if (requestedExclude.patterns.length > 0) {
    const excludedPaths = repo.files.filter((file) => requestedExclude.excludes(file.path)).map((file) => file.path);
    const unmatchedPatterns = requestedExclude.patterns.filter((pattern) =>
      !pattern.startsWith("!") && !requestedExclude.matchedPatterns.has(pattern)
    );
    if (unmatchedPatterns.length > 0) {
      const sample = unmatchedPatterns.slice(0, 5).map(markdownCode).join(", ");
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
          `${requestedExclude.patterns.length} exclusion ${requestedExclude.patterns.length === 1 ? "pattern" : "patterns"} ` +
          `removed ${excludedPaths.length} ${excludedPaths.length === 1 ? "path" : "paths"} from ranking: ${requestedExclude.patterns.map(markdownCode).join(", ")}. ` +
          "Run --explain on a file you expected to see if this is why it is absent.",
        paths: excludedPaths.slice(0, 8)
      });
    }
  }

  return { report, repo };
}

function combineExclusions(primary: PathExcluder, internal: PathExcluder): PathExcluder {
  if (internal.patterns.length === 0) return primary;
  if (primary.patterns.length === 0) return internal;
  return {
    excludes: (path) => primary.excludes(path) || internal.excludes(path),
    reasonFor: (path) => primary.reasonFor(path) ?? internal.reasonFor(path),
    patterns: [...primary.patterns, ...internal.patterns],
    matchedPatterns: new Set([...primary.matchedPatterns, ...internal.matchedPatterns])
  };
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
