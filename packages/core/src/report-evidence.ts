import { collectEvidence, type CollectedEvidenceItem, type EvidenceProvider, type EvidenceProviderDiagnostic } from "./evidence.js";
import type { FixMapReport, RepoMap } from "./types.js";

/** Evidence from explicitly supplied providers, limited to the files this report is about. */
export type ReportEvidence = {
  evidenceVersion: 1;
  collectedAt: string;
  sources: Array<{ provider: string; version: string; documentSha256?: string }>;
  items: CollectedEvidenceItem[];
  /** Collected items not attached because none of their subjects is a file in this report. */
  omittedItems: number;
  diagnostics: EvidenceProviderDiagnostic[];
};

export type ReportEvidenceSource = {
  provider: EvidenceProvider;
  /** SHA-256 of the exact bundle bytes, when the provider came from a serialized bundle. */
  documentSha256?: string;
};

export const MAX_REPORT_EVIDENCE_ITEMS = 50;

/**
 * Collects evidence with no network or code-execution grants and keeps the items whose
 * file or symbol subjects are among the report's ranked, impact, or changed paths. The
 * rest are counted, not silently dropped.
 */
export async function attachReportEvidence(
  report: FixMapReport,
  repo: RepoMap,
  sources: readonly ReportEvidenceSource[],
  context: { issueText: string; now?: string }
): Promise<ReportEvidence> {
  const collected = await collectEvidence(
    sources.map((source) => source.provider),
    { repo, issueText: context.issueText, diffText: repo.diffText ?? "" },
    { allowNetwork: false, allowCodeExecution: false, ...(context.now ? { now: context.now } : {}) }
  );
  const reportPaths = new Set<string>([
    ...report.contextFiles.map((file) => file.path),
    ...(report.impact?.files ?? []).map((file) => file.path),
    ...report.changedFiles
  ]);
  const relevant = collected.items.filter((item) => item.subjects.some((subject) =>
    (subject.kind === "file" || subject.kind === "symbol" || subject.kind === "contract") &&
    "path" in subject && typeof subject.path === "string" && reportPaths.has(subject.path)
  ));
  const items = relevant.slice(0, MAX_REPORT_EVIDENCE_ITEMS);
  return {
    evidenceVersion: 1,
    collectedAt: collected.collectedAt,
    sources: sources.map((source) => ({
      provider: source.provider.id,
      version: source.provider.version,
      ...(source.documentSha256 ? { documentSha256: source.documentSha256 } : {})
    })),
    items,
    omittedItems: collected.items.length - items.length,
    diagnostics: collected.diagnostics
  };
}
