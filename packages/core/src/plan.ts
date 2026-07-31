import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildPathExcluder, parseIgnoreFile, NO_EXCLUSIONS } from "./exclude.js";
import type { PathExcluder } from "./exclude.js";
import { buildReportFromRepo } from "./report.js";
import { scanRepo } from "./repo-scan.js";
import type { FixMapInput, FixMapReport } from "./types.js";

export async function buildFixMapReport(
  input: Pick<
    FixMapInput,
    "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef" | "workingTree" | "includeUntracked"
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
    report.diagnostics.push({
      code: "paths-excluded",
      severity: "info",
      message:
        `${exclude.patterns.length} exclusion ${exclude.patterns.length === 1 ? "pattern" : "patterns"} ` +
        `removed paths from ranking: ${exclude.patterns.join(", ")}. ` +
        "Run --explain on a file you expected to see if this is why it is absent."
    });
  }

  return report;
}

/**
 * Command-line exclusions and `.fixmapignore` combine rather than override. A repository
 * that ships an ignore file has said something durable about itself; a flag is one run's
 * refinement of that, not a replacement for it.
 */
export async function resolveExclusions(repoRoot: string, patterns: string[]): Promise<PathExcluder> {
  const combined = [...await readIgnoreFile(repoRoot), ...patterns];
  return combined.length > 0 ? buildPathExcluder(combined) : NO_EXCLUSIONS;
}

async function readIgnoreFile(repoRoot: string): Promise<string[]> {
  try {
    return parseIgnoreFile(await readFile(join(repoRoot, ".fixmapignore"), "utf8"));
  } catch {
    // Having no ignore file is the normal case, not an error worth reporting.
    return [];
  }
}
