export type CIMatrixDimension = "os" | "runtime" | "database" | "browser" | "feature-flag" | "deployment";

export type CIMatrixEvidence = {
  kind: "repository" | "history" | "policy" | "runtime";
  sourceFingerprint: string;
  reference: string;
  reason: string;
};

export type CIMatrixRequirement = {
  id: string;
  dimension: CIMatrixDimension;
  value: string;
  affectedPaths: string[];
  reason: string;
  evidence: CIMatrixEvidence[];
};

export type CIMatrixCandidate = {
  id: string;
  command: string;
  dimensions: Partial<Record<CIMatrixDimension, string>>;
  coverage: Array<{ requirementId: string; evidence: CIMatrixEvidence[] }>;
};

export type CIMatrixSelection = {
  ciMatrixVersion: 1;
  selectedCells: Array<{
    id: string;
    command: string;
    dimensions: Partial<Record<CIMatrixDimension, string>>;
    coveredRequirementIds: string[];
    justification: Array<{
      requirementId: string;
      dimension: CIMatrixDimension;
      value: string;
      affectedPaths: string[];
      requirementReason: string;
      requirementEvidence: CIMatrixEvidence[];
      coverageEvidence: CIMatrixEvidence[];
    }>;
  }>;
  uncoveredRequirements: CIMatrixRequirement[];
  omittedCandidateIds: string[];
  selectionMethod: "deterministic-greedy-set-cover";
  minimalityClaimed: false;
  diagnostics: string[];
};

const DIMENSIONS: CIMatrixDimension[] = ["os", "runtime", "database", "browser", "feature-flag", "deployment"];
const DIMENSION_SET = new Set<string>(DIMENSIONS);
const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;
const MAX_REQUIREMENTS = 1_000;
const MAX_CANDIDATES = 2_000;

/**
 * Selects a bounded matrix from caller-declared cells. It does not invent jobs,
 * infer that a command exercises an environment, or claim the greedy result is
 * the globally smallest possible matrix.
 */
export function selectCIMatrix(
  requirementsInput: readonly CIMatrixRequirement[],
  candidatesInput: readonly CIMatrixCandidate[]
): CIMatrixSelection {
  const requirements = validateRequirements(requirementsInput);
  const requirementMap = new Map(requirements.map((requirement) => [requirement.id, requirement]));
  const candidates = validateCandidates(candidatesInput, requirementMap);
  const uncovered = new Set(requirements.map((requirement) => requirement.id));
  const remaining = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selected: CIMatrixSelection["selectedCells"] = [];

  while (uncovered.size > 0) {
    const ranked = [...remaining.values()].map((candidate) => ({
      candidate,
      newlyCovered: candidate.coverage.map((entry) => entry.requirementId).filter((id) => uncovered.has(id))
    })).filter((entry) => entry.newlyCovered.length > 0)
      .sort((a, b) => b.newlyCovered.length - a.newlyCovered.length ||
        Object.keys(a.candidate.dimensions).length - Object.keys(b.candidate.dimensions).length ||
        a.candidate.id.localeCompare(b.candidate.id));
    const next = ranked[0];
    if (!next) break;
    const coveredRequirementIds = [...new Set(next.newlyCovered)].sort();
    selected.push({
      id: next.candidate.id,
      command: next.candidate.command,
      dimensions: next.candidate.dimensions,
      coveredRequirementIds,
      justification: coveredRequirementIds.map((requirementId) => {
        const requirement = requirementMap.get(requirementId)!;
        const coverage = next.candidate.coverage.find((entry) => entry.requirementId === requirementId)!;
        return {
          requirementId,
          dimension: requirement.dimension,
          value: requirement.value,
          affectedPaths: requirement.affectedPaths,
          requirementReason: requirement.reason,
          requirementEvidence: requirement.evidence,
          coverageEvidence: coverage.evidence
        };
      })
    });
    for (const id of coveredRequirementIds) uncovered.delete(id);
    remaining.delete(next.candidate.id);
  }

  const uncoveredRequirements = requirements.filter((requirement) => uncovered.has(requirement.id));
  return {
    ciMatrixVersion: 1,
    selectedCells: selected,
    uncoveredRequirements,
    omittedCandidateIds: candidates.map((candidate) => candidate.id)
      .filter((id) => !selected.some((cell) => cell.id === id)).sort(),
    selectionMethod: "deterministic-greedy-set-cover",
    minimalityClaimed: false,
    diagnostics: uncoveredRequirements.length === 0 ? [] : [
      `${uncoveredRequirements.length} required CI matrix cell${uncoveredRequirements.length === 1 ? " is" : "s are"} not covered by any selected declared candidate.`
    ]
  };
}

function validateRequirements(input: readonly CIMatrixRequirement[]): CIMatrixRequirement[] {
  if (!Array.isArray(input) || input.length > MAX_REQUIREMENTS) throw new Error("Invalid CI matrix requirements.");
  const requirements = input.map((requirement, index) => {
    if (!requirement || !ID.test(requirement.id) || !DIMENSION_SET.has(requirement.dimension) ||
      !bounded(requirement.value, 200) || !bounded(requirement.reason, 1_000) ||
      !Array.isArray(requirement.affectedPaths) || requirement.affectedPaths.length > 1_000 ||
      !Array.isArray(requirement.evidence) || requirement.evidence.length === 0 || requirement.evidence.length > 100) {
      throw new Error(`Invalid CI matrix requirement at index ${index}.`);
    }
    return {
      id: requirement.id,
      dimension: requirement.dimension,
      value: requirement.value.trim(),
      affectedPaths: normalizePaths(requirement.affectedPaths),
      reason: requirement.reason.trim(),
      evidence: normalizeEvidence(requirement.evidence, `requirement ${requirement.id}`)
    };
  });
  assertUnique(requirements.map((requirement) => requirement.id), "CI matrix requirement");
  return requirements.sort((a, b) => a.id.localeCompare(b.id));
}

function validateCandidates(
  input: readonly CIMatrixCandidate[],
  requirements: ReadonlyMap<string, CIMatrixRequirement>
): CIMatrixCandidate[] {
  if (!Array.isArray(input) || input.length > MAX_CANDIDATES) throw new Error("Invalid CI matrix candidates.");
  const candidates = input.map((candidate, index) => {
    if (!candidate || !ID.test(candidate.id) || !bounded(candidate.command, 2_000) ||
      !isRecord(candidate.dimensions) || Object.keys(candidate.dimensions).length === 0 ||
      Object.keys(candidate.dimensions).some((dimension) => !DIMENSION_SET.has(dimension)) ||
      !Object.values(candidate.dimensions).every((value) => bounded(value, 200)) ||
      !Array.isArray(candidate.coverage) || candidate.coverage.length === 0 || candidate.coverage.length > MAX_REQUIREMENTS) {
      throw new Error(`Invalid CI matrix candidate at index ${index}.`);
    }
    const dimensions = Object.fromEntries(DIMENSIONS.flatMap((dimension) => {
      const value = candidate.dimensions[dimension];
      return typeof value === "string" ? [[dimension, value.trim()]] : [];
    })) as Partial<Record<CIMatrixDimension, string>>;
    const coverage: CIMatrixCandidate["coverage"] = candidate.coverage.map((
      entry: CIMatrixCandidate["coverage"][number], coverageIndex: number
    ) => {
      if (!entry || !ID.test(entry.requirementId) || !Array.isArray(entry.evidence) ||
        entry.evidence.length === 0 || entry.evidence.length > 100) {
        throw new Error(`Invalid CI matrix coverage at candidate ${candidate.id}, index ${coverageIndex}.`);
      }
      const requirement = requirements.get(entry.requirementId);
      if (!requirement) throw new Error(`Unknown CI matrix requirement ${entry.requirementId}.`);
      if (dimensions[requirement.dimension] !== requirement.value) {
        throw new Error(`Candidate ${candidate.id} does not set ${requirement.dimension}=${requirement.value} required by ${requirement.id}.`);
      }
      return {
        requirementId: entry.requirementId,
        evidence: normalizeEvidence(entry.evidence, `candidate ${candidate.id} coverage ${entry.requirementId}`)
      };
    });
    assertUnique(coverage.map((entry) => entry.requirementId), `coverage in candidate ${candidate.id}`);
    for (const [dimension, value] of Object.entries(dimensions) as Array<[CIMatrixDimension, string]>) {
      const justified = coverage.some((entry) => {
        const requirement = requirements.get(entry.requirementId)!;
        return requirement.dimension === dimension && requirement.value === value;
      });
      if (!justified) throw new Error(`Candidate ${candidate.id} dimension ${dimension}=${value} has no covered requirement.`);
    }
    return { id: candidate.id, command: candidate.command.trim(), dimensions, coverage };
  });
  assertUnique(candidates.map((candidate) => candidate.id), "CI matrix candidate");
  return candidates.sort((a, b) => a.id.localeCompare(b.id));
}

function normalizeEvidence(input: readonly CIMatrixEvidence[], label: string): CIMatrixEvidence[] {
  return input.map((evidence, index) => {
    if (!evidence || !["repository", "history", "policy", "runtime"].includes(evidence.kind) ||
      !SHA256.test(evidence.sourceFingerprint) || !bounded(evidence.reference, 1_000) || !bounded(evidence.reason, 1_000)) {
      throw new Error(`Invalid CI matrix evidence for ${label} at index ${index}.`);
    }
    return {
      kind: evidence.kind,
      sourceFingerprint: evidence.sourceFingerprint.toLowerCase(),
      reference: evidence.reference.trim(),
      reason: evidence.reason.trim()
    };
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.reference.localeCompare(b.reference) || a.reason.localeCompare(b.reason));
}

function normalizePaths(input: readonly string[]): string[] {
  const paths = input.map((path) => path.replace(/\\/g, "/"));
  if (!paths.every(safePath)) throw new Error("Invalid CI matrix affected path.");
  return [...new Set(paths)].sort();
}

function safePath(value: string): boolean {
  return Boolean(value) && value.length <= 1_000 && !value.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    value.split("/").every((part) => part && part !== "." && part !== "..");
}

function assertUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`Duplicate ${label} id: ${duplicate}`);
}

function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
