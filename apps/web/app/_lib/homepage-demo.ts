import { buildReportFromRepo } from "@aryam/fixmap-core/browser";
import { demoPresets } from "../demo-presets";
import { sampleRepo } from "../sample-repo";

export const homepageDefaultTask = demoPresets[2].label;

export const homepagePresets = [
  { label: "Reset email", task: demoPresets[0].label },
  { label: "TOKEN TTL", task: demoPresets[2].label },
  { label: "Invoice duplication", task: demoPresets[3].label },
  { label: "Vague task", task: demoPresets[4].label }
] as const;

export type HomepageReport = ReturnType<typeof buildReportFromRepo>;

export function buildHomepageReport(task: string): HomepageReport {
  return buildReportFromRepo(sampleRepo, { issueText: task, limit: 3 });
}

export function selectHomepageEvidence(report: HomepageReport) {
  const editCandidate = report.contextFiles[0];
  const impactFile = (report.impact?.files ?? []).find(
    (file) => !file.path.startsWith("test/") && file.path !== editCandidate?.path
  );
  const candidatePath = editCandidate?.path ?? "";
  const matchingRisk = report.risks.find((risk) =>
    (risk.area === "authentication" && candidatePath.includes("/auth/")) ||
    (risk.area === "billing" && candidatePath.includes("/billing/")) ||
    (risk.area === "public-api" && candidatePath.includes("/http/"))
  );

  return {
    editCandidate,
    impactFile,
    testRoute: report.testRoutes[0],
    risk: matchingRisk ?? report.risks[0],
    diagnostic:
      report.diagnostics.find((entry) => entry.severity === "warning" || entry.severity === "error") ??
      report.diagnostics[0]
  };
}

export const homepageDefaultReport = buildHomepageReport(homepageDefaultTask);
export const homepageDefaultEvidence = selectHomepageEvidence(homepageDefaultReport);

if (
  !homepageDefaultEvidence.editCandidate ||
  !homepageDefaultEvidence.impactFile ||
  !homepageDefaultEvidence.testRoute ||
  !homepageDefaultEvidence.risk
) {
  throw new Error(
    "The homepage example no longer contains the file, test, impact, and risk evidence it is designed to explain."
  );
}
