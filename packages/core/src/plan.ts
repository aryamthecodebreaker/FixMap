import { rankContextFiles } from "./rank.js";
import { buildRiskNotes, buildSummary, buildTestRoutes } from "./report.js";
import { scanRepo } from "./repo-scan.js";
import { findGatedTestDiagnostics } from "./test-gates.js";
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
  const routedTestPaths = [...new Set(testRoutes.flatMap((route) => route.relatedFiles))];

  return {
    summary: buildSummary(contextFiles.length, testRoutes.length),
    contextFiles,
    testRoutes,
    risks: buildRiskNotes(contextPaths, repo.changedFiles),
    changedFiles: repo.changedFiles,
    diagnostics: [...repo.diagnostics, ...findGatedTestDiagnostics(repo.files, routedTestPaths)]
  };
}
