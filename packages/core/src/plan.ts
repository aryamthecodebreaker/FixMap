import { buildReportFromRepo } from "./report.js";
import { scanRepo } from "./repo-scan.js";
import type { FixMapInput, FixMapReport } from "./types.js";

export async function buildFixMapReport(
  input: Pick<FixMapInput, "repoRoot" | "issueText" | "diffSpec" | "baseRef" | "headRef">
): Promise<FixMapReport> {
  const repo = await scanRepo(input);
  return buildReportFromRepo(repo, { issueText: input.issueText });
}
