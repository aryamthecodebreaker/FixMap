import { rankContextFiles } from "./rank.js";
import { buildRiskNotes, buildSummary, buildTestRoutes } from "./report.js";
import { scanRepo } from "./repo-scan.js";
import type { FixMapInput, FixMapReport } from "./types.js";

export async function buildFixMapReport(
  input: Pick<FixMapInput, "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef">
): Promise<FixMapReport> {
  const repo = await scanRepo(input);
  const contextFiles = rankContextFiles(repo, {
    issueText: input.issueText,
    diffText: repo.diffText
  });
  const contextPaths = contextFiles.map((file) => file.path);
  const testRoutes = buildTestRoutes(repo, contextPaths);

  return {
    summary: buildSummary(contextFiles.length, testRoutes.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths),
    changedFiles: repo.changedFiles,
    diagnostics: repo.diagnostics
  };
}
