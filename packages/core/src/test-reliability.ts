import type { TestRoute } from "./types.js";

export type TestObservationStatus = "passed" | "failed" | "skipped" | "quarantined" | "timeout" | "crashed";

export type TestHistoryBundle = {
  testHistoryBundleVersion: 1;
  source: { tool: string; version: string; documentFingerprint: string };
  observations: Array<{
    id: string;
    testId: string;
    path?: string;
    command: string;
    status: TestObservationStatus;
    commit: string;
    environment: string;
    observedAt: string;
    attempt: number;
    gates: string[];
  }>;
};

export type TestReliabilityAssessment = {
  testId: string;
  path?: string;
  reliability: "reliably-observed" | "flaky-observed" | "failing-observed" | "skipped-observed" | "quarantined" | "insufficient";
  confidence: "high" | "medium" | "low";
  counts: Record<TestObservationStatus, number>;
  observedCommits: number;
  environments: string[];
  gates: string[];
  evidence: Array<{ observationId: string; status: TestObservationStatus; commit: string; environment: string; observedAt: string }>;
  source: TestHistoryBundle["source"];
  message: string;
};

export type ReliableCoverageResult = {
  reliableCoverageVersion: 1;
  routes: Array<{
    command: string;
    declaredTestPaths: string[];
    reliableTestPaths: string[];
    unreliableTestPaths: string[];
    status: "reliable-observed" | "unreliable-observed" | "no-declared-tests" | "no-history";
    message: string;
  }>;
  riskPaths: string[];
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;
const MAX_OBSERVATIONS = 100_000;

export function validateTestHistoryBundle(candidate: unknown): TestHistoryBundle {
  if (!isRecord(candidate) || candidate.testHistoryBundleVersion !== 1 || !isRecord(candidate.source) ||
    !bounded(candidate.source.tool, 100) || !bounded(candidate.source.version, 100) ||
    typeof candidate.source.documentFingerprint !== "string" || !SHA256.test(candidate.source.documentFingerprint) ||
    !Array.isArray(candidate.observations) || candidate.observations.length > MAX_OBSERVATIONS) {
    throw new Error("Invalid test-history bundle envelope.");
  }
  const observations = candidate.observations.map((value, index) => validateObservation(value, index));
  const duplicate = observations.find((value, index) => observations.findIndex((entry) => entry.id === value.id) !== index);
  if (duplicate) throw new Error(`Duplicate test observation id: ${duplicate.id}`);
  return {
    testHistoryBundleVersion: 1,
    source: {
      tool: candidate.source.tool.trim() as string,
      version: candidate.source.version.trim() as string,
      documentFingerprint: candidate.source.documentFingerprint.toLowerCase()
    },
    observations: observations.sort((a, b) => a.observedAt.localeCompare(b.observedAt) || a.id.localeCompare(b.id))
  };
}

export function analyzeTestReliability(candidate: unknown): TestReliabilityAssessment[] {
  const bundle = validateTestHistoryBundle(candidate);
  const grouped = new Map<string, TestHistoryBundle["observations"]>();
  for (const observation of bundle.observations) grouped.set(observation.testId, [...(grouped.get(observation.testId) ?? []), observation]);
  return [...grouped].map(([testId, observations]) => assess(testId, observations, bundle.source))
    .sort((a, b) => reliabilityOrder(a.reliability) - reliabilityOrder(b.reliability) || a.testId.localeCompare(b.testId));
}

export function assessReliableCoverage(
  routes: readonly TestRoute[],
  assessments: readonly TestReliabilityAssessment[],
  riskPaths: readonly string[]
): ReliableCoverageResult {
  const byPath = new Map<string, TestReliabilityAssessment[]>();
  for (const assessment of assessments) {
    if (!assessment.path) continue;
    if (!safePath(assessment.path)) throw new Error("Invalid reliability assessment path.");
    const path = normalizePath(assessment.path);
    byPath.set(path, [...(byPath.get(path) ?? []), assessment]);
  }
  const result = routes.filter((route) => route.kind === "test").map((route) => {
    const declaredTestPaths = normalizePaths(route.relatedFiles);
    if (declaredTestPaths.length === 0) return {
      command: route.command, declaredTestPaths, reliableTestPaths: [], unreliableTestPaths: [],
      status: "no-declared-tests" as const,
      message: "The route declares a command but no related test paths."
    };
    const withHistory = declaredTestPaths.filter((path) => byPath.has(path));
    const reliableTestPaths = withHistory.filter((path) =>
      byPath.get(path)!.every((assessment) => assessment.reliability === "reliably-observed"));
    const unreliableTestPaths = withHistory.filter((path) => !reliableTestPaths.includes(path));
    if (withHistory.length === 0) return {
      command: route.command, declaredTestPaths, reliableTestPaths, unreliableTestPaths,
      status: "no-history" as const,
      message: "Related tests are declared, but the imported CI history has no matching test-path observations."
    };
    return {
      command: route.command, declaredTestPaths, reliableTestPaths, unreliableTestPaths,
      status: reliableTestPaths.length === declaredTestPaths.length ? "reliable-observed" as const : "unreliable-observed" as const,
      message: reliableTestPaths.length === declaredTestPaths.length
        ? `${reliableTestPaths.length} related test path${reliableTestPaths.length === 1 ? " has" : "s have"} repeated clean observations; this is execution reliability evidence, not correctness proof.`
        : `${reliableTestPaths.length} of ${declaredTestPaths.length} related test paths meet the repeated clean-observation threshold; declared coverage is not fully reliable-running coverage.`
    };
  });
  const hasReliable = result.some((route) => route.status === "reliable-observed");
  return {
    reliableCoverageVersion: 1,
    routes: result,
    riskPaths: hasReliable ? [] : normalizePaths(riskPaths)
  };
}

function assess(
  testId: string,
  observations: TestHistoryBundle["observations"],
  source: TestHistoryBundle["source"]
): TestReliabilityAssessment {
  const counts = countStatuses();
  for (const observation of observations) counts[observation.status] += 1;
  const commits = new Set(observations.map((observation) => observation.commit));
  const environments = [...new Set(observations.map((observation) => observation.environment))].sort();
  const gates = [...new Set(observations.flatMap((observation) => observation.gates))].sort();
  const groups = new Map<string, Set<TestObservationStatus>>();
  for (const observation of observations) {
    const key = `${observation.commit}\0${observation.environment}`;
    groups.set(key, new Set([...(groups.get(key) ?? []), observation.status]));
  }
  const flaky = [...groups.values()].some((statuses) => statuses.has("passed") &&
    (statuses.has("failed") || statuses.has("timeout") || statuses.has("crashed")));
  const latest = observations.at(-1)!;
  let reliability: TestReliabilityAssessment["reliability"];
  let confidence: TestReliabilityAssessment["confidence"];
  let message: string;
  if (counts.quarantined > 0) {
    reliability = "quarantined"; confidence = "high";
    message = "CI history explicitly marks this test quarantined; it is not reliable coverage.";
  } else if (flaky) {
    reliability = "flaky-observed"; confidence = "high";
    message = "The same commit and environment produced both pass and fail/timeout/crash observations.";
  } else if (["failed", "timeout", "crashed"].includes(latest.status)) {
    reliability = "failing-observed"; confidence = "medium";
    message = `The newest imported observation is ${latest.status}; later code may change this state.`;
  } else if (counts.passed === 0 && counts.skipped > 0) {
    reliability = "skipped-observed"; confidence = "high";
    message = "Imported history contains skips but no completed passing execution.";
  } else if (gates.length > 0) {
    reliability = "insufficient"; confidence = "low";
    message = "This test is conditionally gated, so its passing history is not treated as generally reliable-running coverage.";
  } else if (counts.passed >= 5 && commits.size >= 2 && counts.failed === 0 && counts.timeout === 0 && counts.crashed === 0 && counts.skipped === 0) {
    reliability = "reliably-observed"; confidence = "medium";
    message = `${counts.passed} clean passes across ${commits.size} commits were observed; this does not prove test correctness or future stability.`;
  } else {
    reliability = "insufficient"; confidence = "low";
    message = "History is insufficient for reliable-running coverage; one or a few passes are not upgraded to strong proof.";
  }
  return {
    testId,
    ...(latest.path ? { path: latest.path } : {}),
    reliability,
    confidence,
    counts,
    observedCommits: commits.size,
    environments,
    gates,
    evidence: observations.map((observation) => ({
      observationId: observation.id,
      status: observation.status,
      commit: observation.commit,
      environment: observation.environment,
      observedAt: observation.observedAt
    })),
    source,
    message
  };
}

function validateObservation(value: unknown, index: number): TestHistoryBundle["observations"][number] {
  if (!isRecord(value) || typeof value.id !== "string" || !ID.test(value.id) || typeof value.testId !== "string" || !ID.test(value.testId) ||
    (value.path !== undefined && (typeof value.path !== "string" || !safePath(value.path))) || !bounded(value.command, 1_000) ||
    !["passed", "failed", "skipped", "quarantined", "timeout", "crashed"].includes(String(value.status)) ||
    typeof value.commit !== "string" || !/^[a-f0-9]{7,64}$/i.test(value.commit) || !bounded(value.environment, 300) ||
    typeof value.observedAt !== "string" || !Number.isFinite(Date.parse(value.observedAt)) ||
    !Number.isSafeInteger(value.attempt) || Number(value.attempt) < 1 || Number(value.attempt) > 100 ||
    !Array.isArray(value.gates) || value.gates.length > 100 || !value.gates.every((gate) => bounded(gate, 200))) {
    throw new Error(`Invalid test observation at index ${index}.`);
  }
  return {
    id: value.id,
    testId: value.testId,
    ...(typeof value.path === "string" ? { path: normalizePath(value.path) } : {}),
    command: value.command.trim(),
    status: value.status as TestObservationStatus,
    commit: value.commit.toLowerCase(),
    environment: value.environment.trim(),
    observedAt: new Date(value.observedAt).toISOString(),
    attempt: Number(value.attempt),
    gates: [...new Set(value.gates as string[])].sort()
  };
}

function countStatuses(): Record<TestObservationStatus, number> {
  return { passed: 0, failed: 0, skipped: 0, quarantined: 0, timeout: 0, crashed: 0 };
}
function normalizePaths(values: readonly string[]): string[] {
  const normalized = values.map(normalizePath);
  if (!normalized.every(safePath)) throw new Error("Invalid reliability risk path.");
  return [...new Set(normalized)].sort();
}
function safePath(value: string): boolean {
  const normalized = normalizePath(value);
  return Boolean(normalized) && normalized.length <= 1_000 && !normalized.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    normalized.split("/").every((part) => part && part !== "." && part !== "..");
}
function normalizePath(value: string): string { return value.replace(/\\/g, "/"); }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function reliabilityOrder(value: TestReliabilityAssessment["reliability"]): number {
  return ["quarantined", "flaky-observed", "failing-observed", "skipped-observed", "insufficient", "reliably-observed"].indexOf(value);
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
