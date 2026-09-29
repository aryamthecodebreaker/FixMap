export type PlanAlternative = {
  planAlternativeVersion: 1;
  id: string;
  graphFingerprint: string;
  edits: string[];
  impacts: string[];
  contracts: Array<{ identity: string; compatibility: "compatible" | "breaking" | "unknown"; reason: string }>;
  policyFindings: Array<{ ruleId: string; severity: "info" | "warning" | "error"; message: string }>;
  tests: Array<{ command: string; covers: string[]; reason: string }>;
  reversibility: { mode: "full" | "partial" | "none"; reason: string; rollbackSteps: string[] };
  uncertainties: Array<{ id: string; severity: "low" | "medium" | "high"; detail: string }>;
};

export type PlanAlternativeAssessment = {
  id: string;
  metrics: {
    editIdentities: number;
    impactIdentities: number;
    contractIdentities: number;
    totalBlastRadiusIdentities: number;
    breakingContracts: number;
    unknownContracts: number;
    policyErrors: number;
    policyWarnings: number;
    plannedTests: number;
    coveredEditIdentities: number;
    uncoveredEditIdentities: string[];
    reversibility: "full" | "partial" | "none";
    highUncertainties: number;
    mediumUncertainties: number;
  };
  evidence: Array<{ axis: string; detail: string; identities?: string[] }>;
};

export type AlternativePlanComparison = {
  alternativePlanComparisonVersion: 1;
  graphFingerprint: string;
  fingerprint: string;
  alternatives: PlanAlternativeAssessment[];
  pairwise: Array<{
    left: string;
    right: string;
    differences: Array<{ axis: string; left: string | number; right: string | number }>;
  }>;
  nonDominatedAlternatives: string[];
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,255}$/;
const MAX_ALTERNATIVES = 20;
const MAX_ENTRIES = 2_000;

/** Compare tradeoffs on an identical graph state without collapsing them into an arbitrary score. */
export function comparePlanAlternatives(candidates: readonly PlanAlternative[]): AlternativePlanComparison {
  if (candidates.length < 2 || candidates.length > MAX_ALTERNATIVES) {
    throw new Error(`Alternative comparison requires 2-${MAX_ALTERNATIVES} plans.`);
  }
  const alternatives = candidates.map(validateAlternative).sort((a, b) => a.id.localeCompare(b.id));
  const duplicate = alternatives.find((value, index) => alternatives.findIndex((entry) => entry.id === value.id) !== index);
  if (duplicate) throw new Error(`Duplicate plan alternative id: ${duplicate.id}`);
  const graphFingerprints = new Set(alternatives.map((alternative) => alternative.graphFingerprint));
  if (graphFingerprints.size !== 1) throw new Error("Plan alternatives must use the same exact graph fingerprint.");
  const assessments = alternatives.map(assess);
  const pairwise = assessments.flatMap((left, leftIndex) => assessments.slice(leftIndex + 1).map((right) => ({
    left: left.id,
    right: right.id,
    differences: compareMetrics(left, right)
  })));
  const nonDominatedAlternatives = assessments
    .filter((candidate) => !assessments.some((other) => other.id !== candidate.id && dominates(other, candidate)))
    .map((assessment) => assessment.id);
  const graphFingerprint = alternatives[0]!.graphFingerprint;
  const canonical = { graphFingerprint, alternatives: assessments, pairwise, nonDominatedAlternatives };
  return {
    alternativePlanComparisonVersion: 1,
    graphFingerprint,
    fingerprint: `alternatives:${stableHash(canonicalize(canonical))}`,
    alternatives: assessments,
    pairwise,
    nonDominatedAlternatives
  };
}

function validateAlternative(value: PlanAlternative): PlanAlternative {
  if (!value || value.planAlternativeVersion !== 1 || !ID.test(value.id) || !FINGERPRINT.test(value.graphFingerprint) ||
    !Array.isArray(value.edits) || value.edits.length === 0 || value.edits.length > MAX_ENTRIES ||
    !Array.isArray(value.impacts) || value.impacts.length > MAX_ENTRIES ||
    !Array.isArray(value.contracts) || value.contracts.length > MAX_ENTRIES ||
    !Array.isArray(value.policyFindings) || value.policyFindings.length > MAX_ENTRIES ||
    !Array.isArray(value.tests) || value.tests.length > MAX_ENTRIES ||
    !Array.isArray(value.uncertainties) || value.uncertainties.length > MAX_ENTRIES || !value.reversibility) {
    throw new Error("Invalid plan alternative envelope.");
  }
  const edits = graphIdentities(value.edits, "edits");
  const impacts = graphIdentities(value.impacts, "impacts");
  const contracts = value.contracts.map((entry) => {
    if (!entry || !graphIdentity(entry.identity) || !["compatible", "breaking", "unknown"].includes(entry.compatibility) || !bounded(entry.reason, 1_000)) {
      throw new Error(`Invalid contract evidence in ${value.id}.`);
    }
    return { identity: entry.identity, compatibility: entry.compatibility, reason: entry.reason.trim() };
  }).sort((a, b) => a.identity.localeCompare(b.identity));
  const duplicateContract = contracts.find((entry, index) => contracts.findIndex((value) => value.identity === entry.identity) !== index);
  if (duplicateContract) throw new Error(`Duplicate contract identity in ${value.id}: ${duplicateContract.identity}`);
  const policyFindings = value.policyFindings.map((entry) => {
    if (!entry || !ID.test(entry.ruleId) || !["info", "warning", "error"].includes(entry.severity) || !bounded(entry.message, 1_000)) {
      throw new Error(`Invalid policy evidence in ${value.id}.`);
    }
    return { ruleId: entry.ruleId, severity: entry.severity, message: entry.message.trim() };
  }).sort((a, b) => a.ruleId.localeCompare(b.ruleId));
  const tests = value.tests.map((entry) => {
    if (!entry || !bounded(entry.command, 1_000) || !bounded(entry.reason, 1_000) || !Array.isArray(entry.covers)) {
      throw new Error(`Invalid test evidence in ${value.id}.`);
    }
    const covers = graphIdentities(entry.covers, "test coverage");
    if (covers.some((identity) => !edits.includes(identity))) throw new Error(`A test in ${value.id} covers an identity outside its edit set.`);
    return { command: entry.command.trim(), covers, reason: entry.reason.trim() };
  }).sort((a, b) => a.command.localeCompare(b.command));
  const reversibility = validateReversibility(value.reversibility, value.id);
  const uncertainties = value.uncertainties.map((entry) => {
    if (!entry || !ID.test(entry.id) || !["low", "medium", "high"].includes(entry.severity) || !bounded(entry.detail, 1_000)) {
      throw new Error(`Invalid uncertainty evidence in ${value.id}.`);
    }
    return { id: entry.id, severity: entry.severity, detail: entry.detail.trim() };
  }).sort((a, b) => severityRank(b.severity) - severityRank(a.severity) || a.id.localeCompare(b.id));
  return {
    planAlternativeVersion: 1,
    id: value.id,
    graphFingerprint: value.graphFingerprint,
    edits,
    impacts,
    contracts,
    policyFindings,
    tests,
    reversibility,
    uncertainties
  };
}

function validateReversibility(value: PlanAlternative["reversibility"], id: string): PlanAlternative["reversibility"] {
  if (!["full", "partial", "none"].includes(value.mode) || !bounded(value.reason, 1_000) ||
    !Array.isArray(value.rollbackSteps) || value.rollbackSteps.length > 100 ||
    !value.rollbackSteps.every((step) => bounded(step, 1_000)) || (value.mode !== "none" && value.rollbackSteps.length === 0)) {
    throw new Error(`Plan alternative ${id} has invalid reversibility evidence.`);
  }
  return { mode: value.mode, reason: value.reason.trim(), rollbackSteps: value.rollbackSteps.map((step) => step.trim()) };
}

function assess(alternative: PlanAlternative): PlanAlternativeAssessment {
  const covered = new Set(alternative.tests.flatMap((test) => test.covers));
  const uncoveredEditIdentities = alternative.edits.filter((identity) => !covered.has(identity));
  const breaking = alternative.contracts.filter((entry) => entry.compatibility === "breaking");
  const unknown = alternative.contracts.filter((entry) => entry.compatibility === "unknown");
  const errors = alternative.policyFindings.filter((entry) => entry.severity === "error");
  const warnings = alternative.policyFindings.filter((entry) => entry.severity === "warning");
  const high = alternative.uncertainties.filter((entry) => entry.severity === "high");
  const medium = alternative.uncertainties.filter((entry) => entry.severity === "medium");
  return {
    id: alternative.id,
    metrics: {
      editIdentities: alternative.edits.length,
      impactIdentities: alternative.impacts.length,
      contractIdentities: alternative.contracts.length,
      totalBlastRadiusIdentities: new Set([
        ...alternative.edits,
        ...alternative.impacts,
        ...alternative.contracts.map((entry) => entry.identity)
      ]).size,
      breakingContracts: breaking.length,
      unknownContracts: unknown.length,
      policyErrors: errors.length,
      policyWarnings: warnings.length,
      plannedTests: alternative.tests.length,
      coveredEditIdentities: covered.size,
      uncoveredEditIdentities,
      reversibility: alternative.reversibility.mode,
      highUncertainties: high.length,
      mediumUncertainties: medium.length
    },
    evidence: [
      { axis: "edits", detail: `${alternative.edits.length} intended edit identities.`, identities: alternative.edits },
      { axis: "impact", detail: `${alternative.impacts.length} impact identities.`, identities: alternative.impacts },
      { axis: "contracts", detail: `${breaking.length} breaking and ${unknown.length} unknown contract changes.`, identities: [...breaking, ...unknown].map((entry) => entry.identity) },
      { axis: "policy", detail: `${errors.length} policy errors and ${warnings.length} warnings.` },
      { axis: "tests", detail: `${covered.size} of ${alternative.edits.length} edit identities have declared test coverage.`, identities: uncoveredEditIdentities },
      { axis: "reversibility", detail: `${alternative.reversibility.mode}: ${alternative.reversibility.reason}` },
      { axis: "uncertainty", detail: `${high.length} high and ${medium.length} medium uncertainties.` }
    ]
  };
}

function compareMetrics(left: PlanAlternativeAssessment, right: PlanAlternativeAssessment) {
  const axes: Array<[string, string | number, string | number]> = [
    ["edit-identities", left.metrics.editIdentities, right.metrics.editIdentities],
    ["impact-identities", left.metrics.impactIdentities, right.metrics.impactIdentities],
    ["contract-identities", left.metrics.contractIdentities, right.metrics.contractIdentities],
    ["blast-radius-identities", left.metrics.totalBlastRadiusIdentities, right.metrics.totalBlastRadiusIdentities],
    ["breaking-contracts", left.metrics.breakingContracts, right.metrics.breakingContracts],
    ["unknown-contracts", left.metrics.unknownContracts, right.metrics.unknownContracts],
    ["policy-errors", left.metrics.policyErrors, right.metrics.policyErrors],
    ["policy-warnings", left.metrics.policyWarnings, right.metrics.policyWarnings],
    ["planned-tests", left.metrics.plannedTests, right.metrics.plannedTests],
    ["covered-edit-identities", left.metrics.coveredEditIdentities, right.metrics.coveredEditIdentities],
    ["uncovered-edits", left.metrics.uncoveredEditIdentities.length, right.metrics.uncoveredEditIdentities.length],
    ["reversibility", left.metrics.reversibility, right.metrics.reversibility],
    ["high-uncertainties", left.metrics.highUncertainties, right.metrics.highUncertainties],
    ["medium-uncertainties", left.metrics.mediumUncertainties, right.metrics.mediumUncertainties]
  ];
  return axes.flatMap(([axis, leftValue, rightValue]) => leftValue === rightValue ? [] : [{ axis, left: leftValue, right: rightValue }]);
}

function dominates(left: PlanAlternativeAssessment, right: PlanAlternativeAssessment): boolean {
  const a = dominanceVector(left);
  const b = dominanceVector(right);
  return a.every((value, index) => value <= b[index]!) && a.some((value, index) => value < b[index]!);
}

function dominanceVector(value: PlanAlternativeAssessment): number[] {
  return [
    value.metrics.totalBlastRadiusIdentities,
    value.metrics.breakingContracts,
    value.metrics.unknownContracts,
    value.metrics.policyErrors,
    value.metrics.policyWarnings,
    value.metrics.uncoveredEditIdentities.length,
    2 - reversibilityRank(value.metrics.reversibility),
    value.metrics.highUncertainties,
    value.metrics.mediumUncertainties
  ];
}

function graphIdentities(values: readonly string[], label: string): string[] {
  if (values.length > MAX_ENTRIES || !values.every(graphIdentity)) throw new Error(`Invalid ${label} graph identities.`);
  return [...new Set(values)].sort();
}
function graphIdentity(value: unknown): value is string { return typeof value === "string" && value.startsWith("fixmap://") && value.length <= 2_048; }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function severityRank(value: "low" | "medium" | "high"): number { return value === "high" ? 2 : value === "medium" ? 1 : 0; }
function reversibilityRank(value: "full" | "partial" | "none"): number { return value === "full" ? 2 : value === "partial" ? 1 : 0; }

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) { hash ^= BigInt(byte); hash = BigInt.asUintN(64, hash * 0x100000001b3n); }
  return hash.toString(16).padStart(16, "0");
}
