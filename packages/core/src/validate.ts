import type { FixMapReport } from "./types.js";
import { validateAnnotationStore } from "./annotations.js";

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

  const record = candidate as Record<string, unknown>;
  if (record.reportVersion !== undefined && record.reportVersion !== 1) {
    return {
      success: false,
      message: `${label} uses unsupported reportVersion ${JSON.stringify(record.reportVersion)}; this FixMap release supports reportVersion 1.`
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

  const versioned = record.reportVersion === 1;
  const contextFiles = (candidate as FixMapReport).contextFiles;
  const invalid = contextFiles.findIndex((file) => {
    if (!isRecord(file)) return true;
    const ranked = file;
    if (!isRepositoryRelativePath(ranked.path)) return true;
    if ((versioned || ranked.rank !== undefined) && (!Number.isSafeInteger(ranked.rank) || (ranked.rank as number) < 1)) return true;
    if ((versioned || ranked.score !== undefined) && (typeof ranked.score !== "number" || !Number.isFinite(ranked.score))) return true;
    if (
      (versioned || ranked.confidence !== undefined) &&
      ranked.confidence !== "high" && ranked.confidence !== "medium" && ranked.confidence !== "low"
    ) return true;
    if ((versioned || ranked.reasons !== undefined) && !isStringArray(ranked.reasons)) return true;
    if ((ranked.fusionScore === undefined) !== (ranked.retrieval === undefined)) return true;
    if (ranked.fusionScore !== undefined && (!isPositiveFiniteNumber(ranked.fusionScore) || !isRetrievalSignal(ranked.retrieval))) return true;
    return false;
  });
  if (invalid !== -1) {
    return {
      success: false,
      message:
        `${label} has an invalid contextFiles entry at index ${invalid}; each entry needs a non-empty string "path", ` +
        `${versioned ? "and version 1 requires" : "and optional"} rank, score, confidence, and reasons fields with their documented types.`
    };
  }
  const duplicatePath = contextFiles.findIndex((file, index) =>
    contextFiles.findIndex((candidate) => candidate.path === file.path) !== index
  );
  if (duplicatePath !== -1) {
    return {
      success: false,
      message: `${label} has a duplicate contextFiles path at index ${duplicatePath}; each ranked path must appear once.`
    };
  }
  if (versioned) {
    const outOfOrderRank = contextFiles.findIndex((file, index) => file.rank !== index + 1);
    if (outOfOrderRank !== -1) {
      return {
        success: false,
        message: `${label} has an out-of-order contextFiles rank at index ${outOfOrderRank}; version 1 ranks must be sequential and match array order.`
      };
    }
  }

  const testRoutes = record.testRoutes as unknown[];
  const invalidRoute = testRoutes.findIndex((route) => {
    if (!isRecord(route)) return true;
    return typeof route.command !== "string" || !route.command.trim() ||
      !isRepositoryRelativePathArray(route.relatedFiles) ||
      ((versioned || route.kind !== undefined) && route.kind !== "test" && route.kind !== "validation") ||
      ((versioned || route.reason !== undefined) && typeof route.reason !== "string");
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
      ((versioned || risk.reason !== undefined) && typeof risk.reason !== "string") ||
      ((versioned || risk.severity !== undefined) && risk.severity !== "low" && risk.severity !== "medium" && risk.severity !== "high");
  });
  if (invalidRisk !== -1) {
    return {
      success: false,
      message: `${label} has an invalid risks entry at index ${invalidRisk}; each risk needs a non-empty string "area", and optional reason and severity fields must use their documented types.`
    };
  }

  if (record.impact !== undefined) {
    const impact = record.impact;
    const history = isRecord(impact) ? impact.history : undefined;
    if (!isRecord(impact) || !isRepositoryRelativePathArray(impact.seeds) ||
      !Array.isArray(impact.files) || !isRepositoryRelativePathArray(impact.inspectionOrder) ||
      !isRecord(history) || typeof history.available !== "boolean" ||
      typeof history.eligibleCommits !== "number" || !Number.isSafeInteger(history.eligibleCommits) || history.eligibleCommits < 0 ||
      typeof history.shallow !== "boolean" || typeof history.truncated !== "boolean") {
      return { success: false, message: `${label} has an invalid impact graph envelope.` };
    }
    const invalidImpact = impact.files.findIndex((file) => {
      if (!isRecord(file) || !isRepositoryRelativePath(file.path) ||
        typeof file.score !== "number" || !Number.isFinite(file.score) || file.score < 0 ||
        (file.confidence !== "high" && file.confidence !== "medium" && file.confidence !== "low") ||
        !Array.isArray(file.evidence)) return true;
      return file.evidence.some((evidence) => !isRecord(evidence) ||
        !["imports", "imported-by", "co-change", "test-route"].includes(String(evidence.kind)) ||
        !isRepositoryRelativePath(evidence.seed) || typeof evidence.reason !== "string" || !evidence.reason.trim() ||
        (evidence.occurrences !== undefined && (!Number.isSafeInteger(evidence.occurrences) || (evidence.occurrences as number) < 0)) ||
        (evidence.seedChanges !== undefined && (!Number.isSafeInteger(evidence.seedChanges) || (evidence.seedChanges as number) < 0))
      );
    });
    if (invalidImpact !== -1) {
      return { success: false, message: `${label} has an invalid impact.files entry at index ${invalidImpact}.` };
    }
  }

  if (!isRepositoryRelativePathArray(record.changedFiles)) {
    return { success: false, message: `${label} has invalid changedFiles; every entry must be a safe repository-relative path.` };
  }

  if (record.annotations !== undefined) {
    const annotations = record.annotations;
    if (!isRecord(annotations) || typeof annotations.asOf !== "string" || !Number.isFinite(Date.parse(annotations.asOf)) ||
      !isRepositoryRelativePath(annotations.sourcePath) || typeof annotations.sourceFingerprint !== "string" ||
      !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(annotations.sourceFingerprint) ||
      !Array.isArray(annotations.entries)) {
      return { success: false, message: `${label} has an invalid annotations envelope.` };
    }
    const invalidAnnotation = annotations.entries.findIndex((assessment) => {
      if (!isRecord(assessment) || !isRecord(assessment.annotation) || typeof assessment.message !== "string" ||
        !["active", "expired", "missing-target", "renamed-target"].includes(String(assessment.status)) ||
        (assessment.suggestedPath !== undefined && !isRepositoryRelativePath(assessment.suggestedPath))) return true;
      try {
        validateAnnotationStore({ annotationStoreVersion: 1, annotations: [assessment.annotation] });
        return false;
      } catch {
        return true;
      }
    });
    if (invalidAnnotation !== -1) {
      return { success: false, message: `${label} has an invalid annotations entry at index ${invalidAnnotation}.` };
    }
  }

  if (record.decisions !== undefined) {
    if (!Array.isArray(record.decisions)) return { success: false, message: `${label} has invalid decisions; expected an array.` };
    const invalidDecision = record.decisions.findIndex((decision) => {
      if (!isRecord(decision) || typeof decision.id !== "string" || !/^decision:[a-f0-9]{16}$/.test(decision.id) ||
        !isRepositoryRelativePath(decision.path) || typeof decision.title !== "string" || !decision.title.trim() ||
        !["proposed", "accepted", "rejected", "deprecated", "superseded", "unknown"].includes(String(decision.status)) ||
        typeof decision.decision !== "string" || !decision.decision.trim() ||
        typeof decision.sourceFingerprint !== "string" || !/^(?:git|worktree):[a-f0-9]{40,64}$/i.test(decision.sourceFingerprint) ||
        !Array.isArray(decision.targets) || !Array.isArray(decision.supersedes) ||
        !decision.supersedes.every((value) => typeof value === "string" && value.trim()) ||
        (decision.date !== undefined && (typeof decision.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(decision.date))) ||
        (decision.context !== undefined && typeof decision.context !== "string") ||
        (decision.consequences !== undefined && typeof decision.consequences !== "string")) return true;
      return decision.targets.some((target) => {
        if (!isRecord(target) || !["explicit", "literal-mention"].includes(String(target.evidence))) return true;
        if (target.kind === "file") return !isRepositoryRelativePath(target.path);
        if (target.kind === "symbol") return typeof target.name !== "string" || !target.name.trim() ||
          (target.path !== undefined && !isRepositoryRelativePath(target.path));
        return (target.kind !== "service" && target.kind !== "contract") || typeof target.name !== "string" || !target.name.trim();
      });
    });
    if (invalidDecision !== -1) return { success: false, message: `${label} has an invalid decisions entry at index ${invalidDecision}.` };
  }

  const diagnostics = record.diagnostics as unknown[];
  const invalidDiagnostic = diagnostics.findIndex((diagnostic) => {
    if (!isRecord(diagnostic)) return true;
    return typeof diagnostic.code !== "string" || !diagnostic.code.trim() ||
      typeof diagnostic.message !== "string" ||
      (diagnostic.severity !== "info" && diagnostic.severity !== "warning" && diagnostic.severity !== "error") ||
      (diagnostic.paths !== undefined && !isRepositoryRelativePathArray(diagnostic.paths));
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
      !isIdentifierStatus(identifier.status) ||
      !isRepositoryRelativePathArray(identifier.matchedFiles)
    );
    if (invalidIdentifier !== -1) {
      return {
        success: false,
        message: `${label} has an invalid analysis.grounding.identifiers entry at index ${invalidIdentifier}.`
      };
    }
    if (analysis.retrievalRanking !== undefined) {
      const retrievalRanking = analysis.retrievalRanking;
      if (!isRecord(retrievalRanking) ||
        !isNullableFiniteNumber(retrievalRanking.topFusionScore) ||
        !isNullableFiniteNumber(retrievalRanking.runnerUpFusionScore) ||
        !isNullableFiniteNumber(retrievalRanking.topGap)) {
        return { success: false, message: `${label} has invalid analysis.retrievalRanking fields.` };
      }
    }
  }

  if (record.retrieval !== undefined) {
    const retrieval = record.retrieval;
    const weights = isRecord(retrieval) ? retrieval.weights : undefined;
    if (!isRecord(retrieval) ||
      (retrieval.mode !== "structural-lexical" && retrieval.mode !== "structural-lexical-semantic") ||
      !isRecord(weights) || !isPositiveFiniteNumber(weights.structural) ||
      !isPositiveFiniteNumber(weights.lexical) || !isPositiveFiniteNumber(weights.semantic) ||
      !isPositiveFiniteNumber(weights.reciprocalRankConstant)) {
      return { success: false, message: `${label} has an invalid retrieval envelope.` };
    }
    if (retrieval.mode === "structural-lexical-semantic" && !isSemanticProvenance(retrieval.semantic)) {
      return { success: false, message: `${label} has invalid or missing semantic retrieval provenance.` };
    }
    if (retrieval.mode === "structural-lexical" && retrieval.semantic !== undefined) {
      return { success: false, message: `${label} carries semantic provenance while declaring structural-lexical retrieval.` };
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

function isRepositoryRelativePathArray(candidate: unknown): candidate is string[] {
  return Array.isArray(candidate) && candidate.every(isRepositoryRelativePath);
}

function isRepositoryRelativePath(candidate: unknown): candidate is string {
  if (typeof candidate !== "string" || !candidate.trim() || candidate.includes("\0") ||
    /^[\\/]/.test(candidate) || /^[A-Za-z]:/.test(candidate)) {
    return false;
  }
  const segments = candidate.replace(/\\/g, "/").split("/");
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isNullableFiniteNumber(candidate: unknown): boolean {
  return candidate === null || (typeof candidate === "number" && Number.isFinite(candidate));
}

function isIdentifierStatus(candidate: unknown): boolean {
  return candidate === "exact-definition" || candidate === "exact-text" ||
    candidate === "partial-definition" || candidate === "not-found" || candidate === "unverified";
}

function isRetrievalSignal(candidate: unknown): boolean {
  if (!isRecord(candidate)) return false;
  const ranks = [candidate.structuralRank, candidate.lexicalRank, candidate.semanticRank];
  if (ranks.every((rank) => rank === undefined)) return false;
  if (ranks.some((rank) => rank !== undefined && (!Number.isSafeInteger(rank) || Number(rank) < 1))) return false;
  if (candidate.structuralScore !== undefined &&
    (typeof candidate.structuralScore !== "number" || !Number.isFinite(candidate.structuralScore))) return false;
  return candidate.semanticSimilarity === undefined ||
    (typeof candidate.semanticSimilarity === "number" && Number.isFinite(candidate.semanticSimilarity) &&
      candidate.semanticSimilarity >= -1 && candidate.semanticSimilarity <= 1);
}

function isSemanticProvenance(candidate: unknown): boolean {
  if (!isRecord(candidate)) return false;
  return typeof candidate.id === "string" && candidate.id.trim().length > 0 &&
    typeof candidate.version === "string" && candidate.version.trim().length > 0 &&
    typeof candidate.model === "string" && candidate.model.trim().length > 0 &&
    typeof candidate.artifactHash === "string" && /^[a-f0-9]{64}$/.test(candidate.artifactHash) &&
    typeof candidate.runtime === "string" && candidate.runtime.trim().length > 0 &&
    Number.isSafeInteger(candidate.dimensions) && Number(candidate.dimensions) > 0 &&
    (candidate.normalization === "l2" || candidate.normalization === "none") &&
    typeof candidate.local === "boolean" && typeof candidate.cacheKey === "string" && candidate.cacheKey.trim().length > 0 &&
    Number.isSafeInteger(candidate.indexedFiles) && Number(candidate.indexedFiles) >= 0 &&
    Number.isSafeInteger(candidate.truncatedFiles) && Number(candidate.truncatedFiles) >= 0;
}

function isPositiveFiniteNumber(candidate: unknown): boolean {
  return typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0;
}
