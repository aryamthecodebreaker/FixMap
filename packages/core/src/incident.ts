import type { MappedRuntimeEvidence } from "./runtime-evidence.js";

export type IncidentRegressionInput = {
  incident: {
    id: string;
    summary: string;
    startedAt: string;
    detectedAt: string;
    sourceFingerprint: string;
  };
  deployments: Array<{
    id: string;
    repositoryId: string;
    commit: string;
    previousCommit: string;
    deployedAt: string;
    sourceFingerprint: string;
    changedFiles: Array<{ path: string; contentFingerprint: string }>;
  }>;
  errors: Array<{
    id: string;
    repositoryId: string;
    path: string;
    firstObservedAt: string;
    lastObservedAt: string;
    occurrenceCount: number;
    messageFingerprint: string;
    sourceFingerprint: string;
  }>;
  runtimeEvidence?: MappedRuntimeEvidence;
  impactLinks: Array<{
    repositoryId: string;
    changedPath: string;
    impactedPath: string;
    kind: "import" | "reverse-import" | "co-change" | "contract" | "runtime";
    sourceFingerprint: string;
    reference: string;
  }>;
  lookbackHours?: number;
};

export type IncidentRegressionResult = {
  incidentRegressionVersion: 1;
  incident: IncidentRegressionInput["incident"];
  suspects: Array<{
    rank: number;
    repositoryId: string;
    path: string;
    contentFingerprint: string;
    commit: string;
    deploymentId: string;
    deployedAt: string;
    score: number;
    signals: Array<{
      ruleId: "recent-deployment" | "error-location-match" | "runtime-location-match" | "impact-to-error" | "impact-to-runtime";
      classification: "observation" | "inference";
      weight: number;
      evidenceFingerprints: string[];
      references: string[];
      reason: string;
    }>;
    causality: "not-established";
  }>;
  excludedDeployments: Array<{ id: string; reason: "after-incident-detection" | "outside-lookback-window" }>;
  diagnostics: string[];
  rankingMethod: "transparent-rule-sum-v1";
  causalClaim: false;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/;
const COMMIT = /^[a-f0-9]{7,64}$/i;
const MAX_DEPLOYMENTS = 10_000;
const MAX_ERRORS = 100_000;
const MAX_LINKS = 100_000;

/** Ranks regression suspects for investigation; it never converts correlation into causality. */
export function rankIncidentSuspects(input: IncidentRegressionInput): IncidentRegressionResult {
  const normalized = validateIncidentInput(input);
  const detectedAt = Date.parse(normalized.incident.detectedAt);
  const cutoff = detectedAt - (normalized.lookbackHours ?? 168) * 3_600_000;
  const excludedDeployments: IncidentRegressionResult["excludedDeployments"] = [];
  const candidates: IncidentRegressionResult["suspects"] = [];
  for (const deployment of normalized.deployments) {
    const deployedAt = Date.parse(deployment.deployedAt);
    if (deployedAt > detectedAt) {
      excludedDeployments.push({ id: deployment.id, reason: "after-incident-detection" });
      continue;
    }
    if (deployedAt < cutoff) {
      excludedDeployments.push({ id: deployment.id, reason: "outside-lookback-window" });
      continue;
    }
    for (const file of deployment.changedFiles) {
      const signals: IncidentRegressionResult["suspects"][number]["signals"] = [{
        ruleId: "recent-deployment", classification: "observation", weight: 1,
        evidenceFingerprints: [deployment.sourceFingerprint], references: [deployment.id],
        reason: `${file.path} was included in a deployment within the declared incident lookback window.`
      }];
      const eligibleErrors = normalized.errors.filter((entry) => entry.repositoryId === deployment.repositoryId &&
        Date.parse(entry.firstObservedAt) <= detectedAt && Date.parse(entry.lastObservedAt) >= deployedAt);
      const directErrors = eligibleErrors.filter((entry) => entry.path === file.path);
      if (directErrors.length > 0) {
        signals.push({
          ruleId: "error-location-match", classification: "observation", weight: 4,
          evidenceFingerprints: unique(directErrors.map((error) => error.sourceFingerprint)),
          references: unique(directErrors.map((error) => error.id)),
          reason: `${directErrors.length} error record${directErrors.length === 1 ? "" : "s"} explicitly identify the same repository and path after deployment.`
        });
      }
      const runtimeEligible = normalized.runtimeEvidence &&
        Date.parse(normalized.runtimeEvidence.source.capturedTo) >= deployedAt &&
        Date.parse(normalized.runtimeEvidence.source.capturedFrom) <= detectedAt;
      const runtimeObservations = runtimeEligible ? normalized.runtimeEvidence!.observations.filter((observation) =>
        observation.subject.repositoryId === deployment.repositoryId) : [];
      const runtimeMatches = runtimeObservations.filter((observation) => observation.subject.path === file.path);
      if (runtimeMatches.length > 0) {
        signals.push({
          ruleId: "runtime-location-match", classification: "observation", weight: 3,
          evidenceFingerprints: [normalized.runtimeEvidence!.source.documentFingerprint],
          references: unique(runtimeMatches.map((runtime) => runtime.evidenceReference)),
          reason: `${runtimeMatches.length} runtime record${runtimeMatches.length === 1 ? "" : "s"} explicitly map to the same repository and exact file path.`
        });
      }
      const errorTargets = new Set(eligibleErrors.map((error) => error.path));
      const runtimeTargets = new Set(runtimeObservations.map((observation) => observation.subject.path));
      const links = normalized.impactLinks.filter((entry) =>
        entry.repositoryId === deployment.repositoryId && entry.changedPath === file.path);
      const errorLinks = links.filter((link) => errorTargets.has(link.impactedPath));
      if (errorLinks.length > 0) signals.push({
          ruleId: "impact-to-error", classification: "inference", weight: 2,
          evidenceFingerprints: unique(errorLinks.map((link) => link.sourceFingerprint)),
          references: unique(errorLinks.map((link) => link.reference)),
          reason: `Impact evidence links the changed file to ${errorLinks.length} error location relationship${errorLinks.length === 1 ? "" : "s"}; this is a triage inference.`
        });
      const runtimeLinks = links.filter((link) => runtimeTargets.has(link.impactedPath));
      if (runtimeLinks.length > 0) signals.push({
          ruleId: "impact-to-runtime", classification: "inference", weight: 2,
          evidenceFingerprints: unique(runtimeLinks.map((link) => link.sourceFingerprint)),
          references: unique(runtimeLinks.map((link) => link.reference)),
          reason: `Impact evidence links the changed file to ${runtimeLinks.length} runtime-observed relationship${runtimeLinks.length === 1 ? "" : "s"}; this is a triage inference.`
        });
      candidates.push({
        rank: 0,
        repositoryId: deployment.repositoryId,
        path: file.path,
        contentFingerprint: file.contentFingerprint,
        commit: deployment.commit,
        deploymentId: deployment.id,
        deployedAt: deployment.deployedAt,
        score: signals.reduce((sum, signal) => sum + signal.weight, 0),
        signals,
        causality: "not-established"
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score || b.deployedAt.localeCompare(a.deployedAt) ||
    a.repositoryId.localeCompare(b.repositoryId) || a.path.localeCompare(b.path) || a.commit.localeCompare(b.commit));
  candidates.forEach((candidate, index) => { candidate.rank = index + 1; });
  excludedDeployments.sort((a, b) => a.id.localeCompare(b.id));
  const diagnostics = [
    "Suspects are ranked for investigation from declared temporal and correlation evidence; FixMap has not established causality."
  ];
  if (candidates.length === 0) diagnostics.push("No deployed changed files fell inside the declared incident lookback window.");
  if ((normalized.runtimeEvidence?.unresolved.length ?? 0) > 0) {
    diagnostics.push(`${normalized.runtimeEvidence!.unresolved.length} runtime record(s) remained unresolved and did not contribute to ranking.`);
  }
  return {
    incidentRegressionVersion: 1,
    incident: normalized.incident,
    suspects: candidates,
    excludedDeployments,
    diagnostics,
    rankingMethod: "transparent-rule-sum-v1",
    causalClaim: false
  };
}

function validateIncidentInput(input: IncidentRegressionInput): IncidentRegressionInput {
  if (!input || !input.incident || !ID.test(input.incident.id) || !bounded(input.incident.summary, 2_000) ||
    !validDate(input.incident.startedAt) || !validDate(input.incident.detectedAt) ||
    Date.parse(input.incident.detectedAt) < Date.parse(input.incident.startedAt) || !fingerprint(input.incident.sourceFingerprint) ||
    !Array.isArray(input.deployments) || input.deployments.length > MAX_DEPLOYMENTS ||
    !Array.isArray(input.errors) || input.errors.length > MAX_ERRORS ||
    !Array.isArray(input.impactLinks) || input.impactLinks.length > MAX_LINKS ||
    (input.lookbackHours !== undefined && (!Number.isInteger(input.lookbackHours) || input.lookbackHours < 1 || input.lookbackHours > 8_760))) {
    throw new Error("Invalid incident regression input envelope.");
  }
  const incident = {
    ...input.incident,
    summary: input.incident.summary.trim(),
    startedAt: new Date(input.incident.startedAt).toISOString(),
    detectedAt: new Date(input.incident.detectedAt).toISOString()
  };
  const deployments = input.deployments.map((deployment, index) => {
    if (!deployment || !ID.test(deployment.id) || !bounded(deployment.repositoryId, 500) || !COMMIT.test(deployment.commit) ||
      !COMMIT.test(deployment.previousCommit) || !validDate(deployment.deployedAt) || !fingerprint(deployment.sourceFingerprint) ||
      !Array.isArray(deployment.changedFiles) || deployment.changedFiles.length > 10_000) {
      throw new Error(`Invalid incident deployment at index ${index}.`);
    }
    const changedFiles = deployment.changedFiles.map((file, fileIndex) => {
      if (!file || !safePath(file.path) || !fingerprint(file.contentFingerprint)) {
        throw new Error(`Invalid incident deployment file at deployment ${deployment.id}, index ${fileIndex}.`);
      }
      return { path: normalizePath(file.path), contentFingerprint: file.contentFingerprint };
    });
    assertUnique(changedFiles.map((file) => file.path), `changed file in deployment ${deployment.id}`);
    return { ...deployment, repositoryId: deployment.repositoryId.trim(), commit: deployment.commit.toLowerCase(),
      previousCommit: deployment.previousCommit.toLowerCase(), deployedAt: new Date(deployment.deployedAt).toISOString(),
      changedFiles: changedFiles.sort((a, b) => a.path.localeCompare(b.path)) };
  });
  assertUnique(deployments.map((deployment) => deployment.id), "incident deployment");
  const errors = input.errors.map((error, index) => {
    if (!error || !ID.test(error.id) || !bounded(error.repositoryId, 500) || !safePath(error.path) ||
      !validDate(error.firstObservedAt) || !validDate(error.lastObservedAt) ||
      Date.parse(error.lastObservedAt) < Date.parse(error.firstObservedAt) || !Number.isSafeInteger(error.occurrenceCount) ||
      error.occurrenceCount < 1 || error.occurrenceCount > 1_000_000_000 || !fingerprint(error.messageFingerprint) ||
      !fingerprint(error.sourceFingerprint)) throw new Error(`Invalid incident error at index ${index}.`);
    return { ...error, repositoryId: error.repositoryId.trim(), path: normalizePath(error.path),
      firstObservedAt: new Date(error.firstObservedAt).toISOString(), lastObservedAt: new Date(error.lastObservedAt).toISOString() };
  });
  assertUnique(errors.map((error) => error.id), "incident error");
  const impactLinks = input.impactLinks.map((link, index) => {
    if (!link || !bounded(link.repositoryId, 500) || !safePath(link.changedPath) || !safePath(link.impactedPath) ||
      !["import", "reverse-import", "co-change", "contract", "runtime"].includes(link.kind) ||
      !fingerprint(link.sourceFingerprint) || !bounded(link.reference, 1_000)) throw new Error(`Invalid incident impact link at index ${index}.`);
    return { ...link, repositoryId: link.repositoryId.trim(), changedPath: normalizePath(link.changedPath),
      impactedPath: normalizePath(link.impactedPath), reference: link.reference.trim() };
  });
  const runtimeEvidence = input.runtimeEvidence ? validateIncidentRuntimeEvidence(input.runtimeEvidence) : undefined;
  return { incident, deployments, errors, impactLinks, ...(runtimeEvidence ? { runtimeEvidence } : {}),
    ...(input.lookbackHours ? { lookbackHours: input.lookbackHours } : {}) };
}

function validateIncidentRuntimeEvidence(value: MappedRuntimeEvidence): MappedRuntimeEvidence {
  if (!value || value.runtimeEvidenceVersion !== 1 || !value.source || value.source.redactionReviewed !== true ||
    !fingerprint(value.source.documentFingerprint) ||
    !validDate(value.source.capturedFrom) || !validDate(value.source.capturedTo) ||
    Date.parse(value.source.capturedTo) < Date.parse(value.source.capturedFrom) ||
    !Array.isArray(value.observations) || value.observations.length > 100_000 ||
    !Array.isArray(value.unresolved) || value.unresolved.length > 100_000 || value.claims?.causalImpactInferred !== false) {
    throw new Error("Invalid mapped runtime evidence for incident ranking.");
  }
  const observations = value.observations.map((observation, index) => {
    if (!observation || !ID.test(observation.id) || !bounded(observation.name, 1_000) ||
      !observation.subject || !bounded(observation.subject.repositoryId, 500) || !safePath(observation.subject.path) ||
      !fingerprint(observation.subject.contentFingerprint) || !bounded(observation.evidenceReference, 1_000) ||
      observation.classification !== "observation") throw new Error(`Invalid incident runtime observation at index ${index}.`);
    return { ...observation, subject: { ...observation.subject, repositoryId: observation.subject.repositoryId.trim(),
      path: normalizePath(observation.subject.path) }, evidenceReference: observation.evidenceReference.trim() };
  });
  const unresolved = value.unresolved.map((entry, index) => {
    if (!entry || !ID.test(entry.id) || !bounded(entry.name, 1_000)) {
      throw new Error(`Invalid unresolved incident runtime record at index ${index}.`);
    }
    return entry;
  });
  assertUnique([...observations.map((entry) => entry.id), ...unresolved.map((entry) => entry.id)], "incident runtime record");
  return { ...value, source: { ...value.source, capturedFrom: new Date(value.source.capturedFrom).toISOString(),
    capturedTo: new Date(value.source.capturedTo).toISOString() }, observations, unresolved };
}

function normalizePath(value: string): string { return value.replace(/\\/g, "/"); }
function safePath(value: string): boolean {
  const normalized = normalizePath(value);
  return Boolean(normalized) && normalized.length <= 1_000 && !normalized.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    normalized.split("/").every((part) => part && part !== "." && part !== "..");
}
function validDate(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}
function fingerprint(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !/[\0-\x20]/.test(value);
}
function assertUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`Duplicate ${label} id: ${duplicate}`);
}
function unique(values: readonly string[]): string[] { return [...new Set(values)].sort(); }
