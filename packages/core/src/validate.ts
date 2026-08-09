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

  const invalidEnvelopeFields = [
    typeof record.summary === "string" ? undefined : "summary (string)",
    Array.isArray(record.testRoutes) ? undefined : "testRoutes (array)",
    Array.isArray(record.risks) ? undefined : "risks (array)",
    Array.isArray(record.changedFiles) ? undefined : "changedFiles (array)",
    Array.isArray(record.diagnostics) ? undefined : "diagnostics (array)"
  ].filter((field): field is string => field !== undefined);
  if (invalidEnvelopeFields.length > 0) {
    return {
      success: false,
      message:
        `${label} is missing or has invalid fields in the complete FixMap report envelope: ` +
        `${invalidEnvelopeFields.join(", ")}.`
    };
  }

  const testRoutes = record.testRoutes as unknown[];
  const invalidRoute = testRoutes.findIndex((route) => {
    if (typeof route !== "object" || route === null || Array.isArray(route)) return true;
    const entry = route as Record<string, unknown>;
    return typeof entry.command !== "string" ||
      !Array.isArray(entry.relatedFiles) ||
      !entry.relatedFiles.every((path) => typeof path === "string");
  });
  if (invalidRoute !== -1) {
    return {
      success: false,
      message:
        `${label} has an invalid testRoutes entry at index ${invalidRoute}; each route needs a string "command" ` +
        "and a string array named relatedFiles."
    };
  }

  const risks = record.risks as unknown[];
  const invalidRisk = risks.findIndex((risk) => {
    if (typeof risk !== "object" || risk === null || Array.isArray(risk)) return true;
    return typeof (risk as Record<string, unknown>).area !== "string";
  });
  if (invalidRisk !== -1) {
    return {
      success: false,
      message: `${label} has an invalid risks entry at index ${invalidRisk}; each risk needs a string "area".`
    };
  }

  if (!(record.changedFiles as unknown[]).every((path) => typeof path === "string")) {
    return { success: false, message: `${label} has invalid changedFiles; every entry must be a string path.` };
  }

  if (record.analysis !== undefined) {
    const analysis = record.analysis;
    const grounding = typeof analysis === "object" && analysis !== null && !Array.isArray(analysis)
      ? (analysis as Record<string, unknown>).grounding
      : undefined;
    const specificity = typeof grounding === "object" && grounding !== null && !Array.isArray(grounding)
      ? (grounding as Record<string, unknown>).specificity
      : undefined;
    if (specificity !== "anchored" && specificity !== "descriptive" && specificity !== "vague") {
      return {
        success: false,
        message: `${label} has invalid analysis.grounding.specificity; expected anchored, descriptive, or vague.`
      };
    }
  }

  return { success: true, report: candidate as FixMapReport };
}
