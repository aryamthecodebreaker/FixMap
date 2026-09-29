export type DossierAssumption = {
  id: string;
  statement: string;
  status: "unverified" | "confirmed" | "rejected";
  evidenceFingerprints: string[];
};

export type ChangeDossierInput = {
  id: string;
  repositoryIdentity: string;
  createdAt: string;
  updatedAt: string;
  request: { summary: string; sourceFingerprint: string };
  assumptions: DossierAssumption[];
  plan: { reportFingerprint: string; graphFingerprint: string; artifactPath?: string };
  decisions: Array<{ id: string; path: string; sourceFingerprint: string }>;
  diff: null | { sourceFingerprint: string; changedFiles: string[]; base?: string; head?: string };
  tests: Array<{
    command: string;
    status: "passed" | "failed" | "timeout" | "crashed" | "unavailable" | "not-run";
    evidenceFingerprint?: string;
    relatedPaths: string[];
  }>;
  runtimeEvidence: Array<{
    id: string;
    kind: "trace" | "profile" | "log" | "metric" | "deployment";
    classification: "observation" | "inference";
    sourceFingerprint: string;
    observedAt: string;
  }>;
  reviews: Array<{
    id: string;
    status: "requested" | "approved" | "changes-requested" | "commented";
    sourceFingerprint: string;
  }>;
  releaseIdentifiers: {
    commit?: string;
    pullRequest?: string;
    deployment?: string;
    version?: string;
  };
};

export type ChangeDossier = ChangeDossierInput & {
  changeDossierVersion: 1;
  fingerprint: string;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,255}$/;
const MAX_ENTRIES = 5_000;

export function buildChangeDossier(input: ChangeDossierInput): ChangeDossier {
  const normalized = normalizeInput(input);
  return {
    changeDossierVersion: 1,
    fingerprint: dossierFingerprint(normalized),
    ...normalized
  };
}

export function validateChangeDossier(candidate: unknown): ChangeDossier {
  if (!isRecord(candidate) || candidate.changeDossierVersion !== 1 ||
    typeof candidate.fingerprint !== "string" || !/^dossier:[a-f0-9]{16}$/.test(candidate.fingerprint)) {
    throw new Error("Invalid change dossier envelope.");
  }
  const normalized = normalizeInput(candidate as unknown as ChangeDossierInput);
  const fingerprint = dossierFingerprint(normalized);
  if (candidate.fingerprint !== fingerprint) throw new Error("Change dossier fingerprint does not match its content.");
  return { changeDossierVersion: 1, fingerprint, ...normalized };
}

function normalizeInput(input: ChangeDossierInput): ChangeDossierInput {
  if (!input || !ID.test(input.id) || typeof input.repositoryIdentity !== "string" ||
    !input.repositoryIdentity.startsWith("fixmap://") || input.repositoryIdentity.length > 2_048 ||
    !validDate(input.createdAt) || !validDate(input.updatedAt) || Date.parse(input.updatedAt) < Date.parse(input.createdAt) ||
    !input.request || !bounded(input.request.summary, 5_000) || !fingerprint(input.request.sourceFingerprint) ||
    !input.plan || !fingerprint(input.plan.reportFingerprint) || !fingerprint(input.plan.graphFingerprint) ||
    (input.plan.artifactPath !== undefined && !safePath(input.plan.artifactPath))) {
    throw new Error("Invalid change dossier input.");
  }
  if (!boundedArray(input.assumptions) || !boundedArray(input.decisions) || !boundedArray(input.tests) ||
    !boundedArray(input.runtimeEvidence) || !boundedArray(input.reviews)) {
    throw new Error("Change dossier section exceeds its entry bound.");
  }
  const assumptions = input.assumptions.map((entry) => {
    if (!entry || !ID.test(entry.id) || !bounded(entry.statement, 2_000) ||
      !["unverified", "confirmed", "rejected"].includes(entry.status) ||
      !Array.isArray(entry.evidenceFingerprints) || entry.evidenceFingerprints.length > 100 ||
      !entry.evidenceFingerprints.every(fingerprint) || (entry.status !== "unverified" && entry.evidenceFingerprints.length === 0)) {
      throw new Error(`Invalid dossier assumption ${entry?.id ?? "<unknown>"}.`);
    }
    return {
      id: entry.id,
      statement: entry.statement.trim(),
      status: entry.status,
      evidenceFingerprints: [...new Set(entry.evidenceFingerprints)].sort()
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  uniqueIds(assumptions, "assumption");
  const decisions = input.decisions.map((entry) => {
    if (!entry || !ID.test(entry.id) || !safePath(entry.path) || !fingerprint(entry.sourceFingerprint)) {
      throw new Error("Invalid dossier decision reference.");
    }
    return { id: entry.id, path: normalizePath(entry.path), sourceFingerprint: entry.sourceFingerprint };
  }).sort((a, b) => a.id.localeCompare(b.id));
  uniqueIds(decisions, "decision");
  const diff = normalizeDiff(input.diff);
  const tests = input.tests.map((entry) => {
    if (!entry || !bounded(entry.command, 1_000) ||
      !["passed", "failed", "timeout", "crashed", "unavailable", "not-run"].includes(entry.status) ||
      (entry.evidenceFingerprint !== undefined && !fingerprint(entry.evidenceFingerprint)) ||
      (entry.status !== "not-run" && !entry.evidenceFingerprint) || !Array.isArray(entry.relatedPaths)) {
      throw new Error("Invalid dossier test evidence.");
    }
    return {
      command: entry.command.trim(),
      status: entry.status,
      ...(entry.evidenceFingerprint ? { evidenceFingerprint: entry.evidenceFingerprint } : {}),
      relatedPaths: paths(entry.relatedPaths)
    };
  }).sort((a, b) => a.command.localeCompare(b.command));
  const runtimeEvidence = input.runtimeEvidence.map((entry) => {
    if (!entry || !ID.test(entry.id) || !["trace", "profile", "log", "metric", "deployment"].includes(entry.kind) ||
      !["observation", "inference"].includes(entry.classification) || !fingerprint(entry.sourceFingerprint) ||
      !validDate(entry.observedAt) || Date.parse(entry.observedAt) > Date.parse(input.updatedAt)) {
      throw new Error("Invalid dossier runtime evidence.");
    }
    return { ...entry, observedAt: new Date(entry.observedAt).toISOString() };
  }).sort((a, b) => a.id.localeCompare(b.id));
  uniqueIds(runtimeEvidence, "runtime evidence");
  const reviews = input.reviews.map((entry) => {
    if (!entry || !ID.test(entry.id) || !["requested", "approved", "changes-requested", "commented"].includes(entry.status) ||
      !fingerprint(entry.sourceFingerprint)) throw new Error("Invalid dossier review evidence.");
    return { ...entry };
  }).sort((a, b) => a.id.localeCompare(b.id));
  uniqueIds(reviews, "review");
  const releaseIdentifiers = normalizeReleaseIdentifiers(input.releaseIdentifiers);
  return {
    id: input.id,
    repositoryIdentity: input.repositoryIdentity,
    createdAt: new Date(input.createdAt).toISOString(),
    updatedAt: new Date(input.updatedAt).toISOString(),
    request: { summary: input.request.summary.trim(), sourceFingerprint: input.request.sourceFingerprint },
    assumptions,
    plan: {
      reportFingerprint: input.plan.reportFingerprint,
      graphFingerprint: input.plan.graphFingerprint,
      ...(input.plan.artifactPath ? { artifactPath: normalizePath(input.plan.artifactPath) } : {})
    },
    decisions,
    diff,
    tests,
    runtimeEvidence,
    reviews,
    releaseIdentifiers
  };
}

function normalizeDiff(value: ChangeDossierInput["diff"]): ChangeDossierInput["diff"] {
  if (value === null) return null;
  if (!value || !fingerprint(value.sourceFingerprint) || !Array.isArray(value.changedFiles) ||
    (value.base !== undefined && !bounded(value.base, 500)) || (value.head !== undefined && !bounded(value.head, 500))) {
    throw new Error("Invalid dossier diff evidence.");
  }
  return {
    sourceFingerprint: value.sourceFingerprint,
    changedFiles: paths(value.changedFiles),
    ...(value.base ? { base: value.base.trim() } : {}),
    ...(value.head ? { head: value.head.trim() } : {})
  };
}

function normalizeReleaseIdentifiers(value: ChangeDossierInput["releaseIdentifiers"]): ChangeDossierInput["releaseIdentifiers"] {
  if (!isRecord(value)) throw new Error("Invalid dossier release identifiers.");
  const result: ChangeDossierInput["releaseIdentifiers"] = {};
  for (const key of ["commit", "pullRequest", "deployment", "version"] as const) {
    const entry = value[key];
    if (entry !== undefined) {
      if (!bounded(entry, 500) || /[\0\r\n]/.test(entry)) throw new Error(`Invalid dossier release identifier: ${key}.`);
      result[key] = entry.trim();
    }
  }
  return result;
}

function uniqueIds(values: readonly { id: string }[], label: string): void {
  const duplicate = values.find((entry, index) => values.findIndex((value) => value.id === entry.id) !== index);
  if (duplicate) throw new Error(`Duplicate dossier ${label} id: ${duplicate.id}`);
}
function paths(values: readonly string[]): string[] {
  if (values.length > MAX_ENTRIES || !values.every(safePath)) throw new Error("Invalid dossier paths.");
  return [...new Set(values.map(normalizePath))].sort();
}
function safePath(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim() || value.length > 1_000 || value.includes("\0") || /^(?:[\/]|[A-Za-z]:)/.test(value)) return false;
  return normalizePath(value).split("/").every((part) => part && part !== "." && part !== "..");
}
function normalizePath(value: string): string { return value.replace(/\\/g, "/"); }
function boundedArray(value: unknown): value is unknown[] { return Array.isArray(value) && value.length <= MAX_ENTRIES; }
function bounded(value: unknown, max: number): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max; }
function validDate(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
function fingerprint(value: unknown): value is string { return typeof value === "string" && FINGERPRINT.test(value); }
function dossierFingerprint(value: ChangeDossierInput): string { return `dossier:${stableHash(canonicalize(value))}`; }
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
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
