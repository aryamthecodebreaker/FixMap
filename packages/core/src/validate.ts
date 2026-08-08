import type { FixMapReport } from "./types.js";

export type ValidatedFixMapReport =
  | { success: true; report: FixMapReport }
  | { success: false; message: string };

/** Validate the report fields read by compare and verify without rejecting additive fields. */
export function validateFixMapReport(candidate: unknown, label: string): ValidatedFixMapReport {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    !Array.isArray((candidate as Partial<FixMapReport>).contextFiles)
  ) {
    return {
      success: false,
      message: `${label} is not a FixMap JSON report: no contextFiles array.`
    };
  }

  const contextFiles = (candidate as FixMapReport).contextFiles;
  const record = candidate as Record<string, unknown>;
  if (record.reportVersion !== undefined && record.reportVersion !== 1) {
    return {
      success: false,
      message: `${label} uses unsupported reportVersion ${JSON.stringify(record.reportVersion)}; this FixMap release supports reportVersion 1.`
    };
  }
  if (
    contextFiles.length === 0 &&
    !(
      typeof record.summary === "string" &&
      Array.isArray(record.testRoutes) &&
      Array.isArray(record.risks) &&
      Array.isArray(record.changedFiles) &&
      Array.isArray(record.diagnostics)
    )
  ) {
    return {
      success: false,
      message:
        `${label} has no context files and is missing the complete FixMap report envelope ` +
        "(summary, testRoutes, risks, changedFiles, and diagnostics)."
    };
  }

  const invalid = contextFiles.findIndex((file) => {
    if (typeof file !== "object" || file === null) return true;
    const ranked = file as unknown as Record<string, unknown>;
    if (typeof ranked.path !== "string" || ranked.path.trim().length === 0) return true;
    if (ranked.rank !== undefined && (!Number.isSafeInteger(ranked.rank) || (ranked.rank as number) < 1)) return true;
    if (ranked.score !== undefined && (typeof ranked.score !== "number" || !Number.isFinite(ranked.score))) return true;
    if (
      ranked.confidence !== undefined &&
      ranked.confidence !== "high" && ranked.confidence !== "medium" && ranked.confidence !== "low"
    ) return true;
    return false;
  });
  if (invalid !== -1) {
    return {
      success: false,
      message:
        `${label} has an invalid contextFiles entry at index ${invalid}; each entry needs a non-empty string "path", ` +
        "and optional rank, score, and confidence fields must use their documented types."
    };
  }

  return { success: true, report: candidate as FixMapReport };
}
