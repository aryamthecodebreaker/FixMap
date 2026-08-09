import type { FixMapReport } from "./types.js";

export type ValidatedFixMapReport =
  | { success: true; report: FixMapReport }
  | { success: false; message: string };

/** Validate the documented report structure without rejecting additive fields. */
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
    if (!isRecord(file)) return true;
    const ranked = file;
    if (typeof ranked.path !== "string" || ranked.path.trim().length === 0) return true;
    if (ranked.rank !== undefined && (!Number.isSafeInteger(ranked.rank) || (ranked.rank as number) < 1)) return true;
    if (ranked.score !== undefined && (typeof ranked.score !== "number" || !Number.isFinite(ranked.score))) return true;
    if (
      ranked.confidence !== undefined &&
      ranked.confidence !== "high" && ranked.confidence !== "medium" && ranked.confidence !== "low"
    ) return true;
    if (ranked.reasons !== undefined && !isStringArray(ranked.reasons)) return true;
    return false;
  });
  if (invalid !== -1) {
    return {
      success: false,
      message:
        `${label} has an invalid contextFiles entry at index ${invalid}; each entry needs a non-empty string "path", ` +
        "and optional rank, score, confidence, and reasons fields must use their documented types."
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
    if (!isRecord(route)) return true;
    return typeof route.command !== "string" || !route.command.trim() ||
      !isNonBlankStringArray(route.relatedFiles) ||
      (route.kind !== undefined && route.kind !== "test" && route.kind !== "validation") ||
      (route.reason !== undefined && typeof route.reason !== "string");
  });
  if (invalidRoute !== -1) {
    return {
      success: false,
      message:
        `${label} has an invalid testRoutes entry at index ${invalidRoute}; each route needs a string "command" ` +
        "and an array of non-empty string paths named relatedFiles; optional kind and reason fields must use their documented types."
    };
  }

  const risks = record.risks as unknown[];
  const invalidRisk = risks.findIndex((risk) => {
    if (!isRecord(risk)) return true;
    return typeof risk.area !== "string" || !risk.area.trim() ||
      (risk.reason !== undefined && typeof risk.reason !== "string") ||
      (risk.severity !== undefined && risk.severity !== "low" && risk.severity !== "medium" && risk.severity !== "high");
  });
  if (invalidRisk !== -1) {
    return {
      success: false,
      message: `${label} has an invalid risks entry at index ${invalidRisk}; each risk needs a non-empty string "area", and optional reason and severity fields must use their documented types.`
    };
  }

  if (!isNonBlankStringArray(record.changedFiles)) {
    return { success: false, message: `${label} has invalid changedFiles; every entry must be a non-empty string path.` };
  }

  const diagnostics = record.diagnostics as unknown[];
  const invalidDiagnostic = diagnostics.findIndex((diagnostic) => {
    if (!isRecord(diagnostic)) return true;
    return typeof diagnostic.code !== "string" || !diagnostic.code.trim() ||
      typeof diagnostic.message !== "string" ||
      (diagnostic.severity !== "info" && diagnostic.severity !== "warning" && diagnostic.severity !== "error") ||
      (diagnostic.paths !== undefined && !isNonBlankStringArray(diagnostic.paths));
  });
  if (invalidDiagnostic !== -1) {
    return {
      success: false,
      message:
        `${label} has an invalid diagnostics entry at index ${invalidDiagnostic}; each diagnostic needs string code and message fields, ` +
        "an info, warning, or error severity, and optional non-empty string paths."
    };
  }

  if (record.analysis !== undefined) {
    const analysis = record.analysis;
    const grounding = isRecord(analysis) ? analysis.grounding : undefined;
    const specificity = isRecord(grounding) ? grounding.specificity : undefined;
    if (specificity !== "anchored" && specificity !== "descriptive" && specificity !== "vague") {
      return {
        success: false,
        message: `${label} has invalid analysis.grounding.specificity; expected anchored, descriptive, or vague.`
      };
    }
    if (!isRecord(analysis) || !isRecord(grounding) ||
      !Array.isArray(grounding.identifiers) ||
      !isStringArray(grounding.unresolvedIdentifiers) ||
      !isStringArray(grounding.partiallyResolvedIdentifiers) ||
      !isStringArray(grounding.unverifiedIdentifiers) ||
      typeof grounding.scanComplete !== "boolean" ||
      !isRecord(analysis.ranking) ||
      !isNullableFiniteNumber(analysis.ranking.topScore) ||
      !isNullableFiniteNumber(analysis.ranking.runnerUpScore) ||
      !isNullableFiniteNumber(analysis.ranking.topGap) ||
      typeof analysis.ranking.clustered !== "boolean" ||
      typeof analysis.nextAction !== "string") {
      return {
        success: false,
        message: `${label} has incomplete or invalid analysis grounding, ranking, or nextAction fields.`
      };
    }
    const invalidIdentifier = grounding.identifiers.findIndex((identifier) =>
      !isRecord(identifier) ||
      typeof identifier.identifier !== "string" || !identifier.identifier.trim() ||
      typeof identifier.status !== "string" || !identifier.status.trim() ||
      !isNonBlankStringArray(identifier.matchedFiles)
    );
    if (invalidIdentifier !== -1) {
      return {
        success: false,
        message: `${label} has an invalid analysis.grounding.identifiers entry at index ${invalidIdentifier}.`
      };
    }
  }

  return { success: true, report: candidate as FixMapReport };
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}

function isStringArray(candidate: unknown): candidate is string[] {
  return Array.isArray(candidate) && candidate.every((entry) => typeof entry === "string");
}

function isNonBlankStringArray(candidate: unknown): candidate is string[] {
  return isStringArray(candidate) && candidate.every((entry) => entry.trim().length > 0);
}

function isNullableFiniteNumber(candidate: unknown): boolean {
  return candidate === null || (typeof candidate === "number" && Number.isFinite(candidate));
}
