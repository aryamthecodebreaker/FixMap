import type { RepoFile } from "./types.js";

export type RuntimeEvidenceBundle = {
  runtimeEvidenceBundleVersion: 1;
  source: {
    format: "opentelemetry" | "apm-normalized" | "speedscope" | "pprof";
    tool: string;
    version: string;
    documentFingerprint: string;
    capturedFrom: string;
    capturedTo: string;
    redactionReviewed: true;
    redactionSummary: string;
  };
  records: Array<RuntimeSpanRecord | RuntimeProfileFrameRecord>;
};

export type RuntimeCodeLocation = {
  repositoryId: string;
  path: string;
  symbol?: string;
  line?: number;
  evidenceReference: string;
};

export type RuntimeSpanRecord = {
  kind: "span";
  id: string;
  traceId: string;
  spanId: string;
  name: string;
  serviceName: string;
  startedAt: string;
  durationMs: number;
  status: "unset" | "ok" | "error";
  code?: RuntimeCodeLocation;
};

export type RuntimeProfileFrameRecord = {
  kind: "profile-frame";
  id: string;
  profileId: string;
  name: string;
  selfSamples: number;
  totalSamples: number;
  code?: RuntimeCodeLocation;
};

export type RuntimeRepositorySnapshot = {
  repositoryId: string;
  files: RepoFile[];
};

export type MappedRuntimeEvidence = {
  runtimeEvidenceVersion: 1;
  source: RuntimeEvidenceBundle["source"];
  observations: Array<{
    id: string;
    kind: RuntimeSpanRecord["kind"] | RuntimeProfileFrameRecord["kind"];
    name: string;
    subject: {
      repositoryId: string;
      path: string;
      contentFingerprint: string;
      symbol?: string;
      line?: number;
    };
    evidenceReference: string;
    measurement: { durationMs: number; status: RuntimeSpanRecord["status"] } |
      { selfSamples: number; totalSamples: number; sampleShare: number };
    classification: "observation";
  }>;
  unresolved: Array<{
    id: string;
    kind: RuntimeSpanRecord["kind"] | RuntimeProfileFrameRecord["kind"];
    name: string;
    reason: "no-code-location" | "unknown-repository" | "file-not-found" | "missing-content-fingerprint";
    repositoryId?: string;
    path?: string;
  }>;
  diagnostics: string[];
  claims: {
    spanDurationIsCpuTime: false;
    profileSamplesAreWallClockTime: false;
    causalImpactInferred: false;
  };
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,299}$/;
const HEX_ID = /^[a-f0-9]{8,64}$/i;
const SHA256 = /^sha256:[a-f0-9]{64}$/i;
const MAX_RECORDS = 100_000;

/** Maps only explicit runtime code locations; symbol names and service labels never establish identity. */
export function mapRuntimeEvidence(candidate: unknown, snapshotsInput: readonly RuntimeRepositorySnapshot[]): MappedRuntimeEvidence {
  const bundle = validateRuntimeEvidenceBundle(candidate);
  const snapshots = validateSnapshots(snapshotsInput);
  const byRepository = new Map(snapshots.map((snapshot) => [snapshot.repositoryId,
    new Map(snapshot.files.map((file) => [file.path, file]))]));
  const profileTotals = new Map<string, number>();
  for (const record of bundle.records) {
    if (record.kind !== "profile-frame") continue;
    profileTotals.set(record.profileId, (profileTotals.get(record.profileId) ?? 0) + record.selfSamples);
  }
  const observations: MappedRuntimeEvidence["observations"] = [];
  const unresolved: MappedRuntimeEvidence["unresolved"] = [];
  for (const record of bundle.records) {
    if (!record.code) {
      unresolved.push({ id: record.id, kind: record.kind, name: record.name, reason: "no-code-location" });
      continue;
    }
    const repository = byRepository.get(record.code.repositoryId);
    if (!repository) {
      unresolved.push({ id: record.id, kind: record.kind, name: record.name, reason: "unknown-repository",
        repositoryId: record.code.repositoryId, path: record.code.path });
      continue;
    }
    const file = repository.get(record.code.path);
    if (!file) {
      unresolved.push({ id: record.id, kind: record.kind, name: record.name, reason: "file-not-found",
        repositoryId: record.code.repositoryId, path: record.code.path });
      continue;
    }
    if (!exactFingerprint(file.contentFingerprint)) {
      unresolved.push({ id: record.id, kind: record.kind, name: record.name, reason: "missing-content-fingerprint",
        repositoryId: record.code.repositoryId, path: record.code.path });
      continue;
    }
    const subject = {
      repositoryId: record.code.repositoryId,
      path: record.code.path,
      contentFingerprint: file.contentFingerprint,
      ...(record.code.symbol ? { symbol: record.code.symbol } : {}),
      ...(record.code.line ? { line: record.code.line } : {})
    };
    if (record.kind === "span") {
      observations.push({
        id: record.id, kind: record.kind, name: record.name, subject,
        evidenceReference: record.code.evidenceReference,
        measurement: { durationMs: record.durationMs, status: record.status },
        classification: "observation"
      });
    } else {
      const totalSelfSamples = profileTotals.get(record.profileId) ?? 0;
      observations.push({
        id: record.id, kind: record.kind, name: record.name, subject,
        evidenceReference: record.code.evidenceReference,
        measurement: {
          selfSamples: record.selfSamples,
          totalSamples: record.totalSamples,
          sampleShare: totalSelfSamples === 0 ? 0 : record.selfSamples / totalSelfSamples
        },
        classification: "observation"
      });
    }
  }
  return {
    runtimeEvidenceVersion: 1,
    source: bundle.source,
    observations,
    unresolved,
    diagnostics: unresolved.length === 0 ? [] : [
      `${unresolved.length} of ${bundle.records.length} runtime record${bundle.records.length === 1 ? "" : "s"} could not be mapped to an exact repository file identity.`
    ],
    claims: { spanDurationIsCpuTime: false, profileSamplesAreWallClockTime: false, causalImpactInferred: false }
  };
}

export function validateRuntimeEvidenceBundle(candidate: unknown): RuntimeEvidenceBundle {
  if (!isRecord(candidate) || candidate.runtimeEvidenceBundleVersion !== 1 || !isRecord(candidate.source) ||
    !["opentelemetry", "apm-normalized", "speedscope", "pprof"].includes(String(candidate.source.format)) ||
    !bounded(candidate.source.tool, 100) || !bounded(candidate.source.version, 100) ||
    typeof candidate.source.documentFingerprint !== "string" || !SHA256.test(candidate.source.documentFingerprint) ||
    typeof candidate.source.capturedFrom !== "string" || !validDate(candidate.source.capturedFrom) ||
    typeof candidate.source.capturedTo !== "string" || !validDate(candidate.source.capturedTo) ||
    Date.parse(candidate.source.capturedTo) < Date.parse(candidate.source.capturedFrom) ||
    candidate.source.redactionReviewed !== true || !bounded(candidate.source.redactionSummary, 1_000) ||
    !Array.isArray(candidate.records) || candidate.records.length > MAX_RECORDS) {
    throw new Error("Invalid runtime evidence bundle envelope.");
  }
  const records = candidate.records.map((record, index) => validateRecord(record, index));
  assertUnique(records.map((record) => record.id), "runtime record");
  return {
    runtimeEvidenceBundleVersion: 1,
    source: {
      format: candidate.source.format as RuntimeEvidenceBundle["source"]["format"],
      tool: candidate.source.tool.trim() as string,
      version: candidate.source.version.trim() as string,
      documentFingerprint: candidate.source.documentFingerprint.toLowerCase(),
      capturedFrom: new Date(candidate.source.capturedFrom).toISOString(),
      capturedTo: new Date(candidate.source.capturedTo).toISOString(),
      redactionReviewed: true,
      redactionSummary: candidate.source.redactionSummary.trim() as string
    },
    records: records.sort((a, b) => a.id.localeCompare(b.id))
  };
}

function validateRecord(value: unknown, index: number): RuntimeSpanRecord | RuntimeProfileFrameRecord {
  if (!isRecord(value) || typeof value.id !== "string" || !ID.test(value.id) || !bounded(value.name, 1_000) ||
    !["span", "profile-frame"].includes(String(value.kind))) throw new Error(`Invalid runtime record at index ${index}.`);
  const code = value.code === undefined ? undefined : validateCodeLocation(value.code, index);
  if (value.kind === "span") {
    if (typeof value.traceId !== "string" || !HEX_ID.test(value.traceId) || typeof value.spanId !== "string" || !HEX_ID.test(value.spanId) ||
      !bounded(value.serviceName, 500) || typeof value.startedAt !== "string" || !validDate(value.startedAt) ||
      typeof value.durationMs !== "number" || !Number.isFinite(value.durationMs) || value.durationMs < 0 || value.durationMs > 86_400_000 ||
      !["unset", "ok", "error"].includes(String(value.status))) throw new Error(`Invalid runtime span at index ${index}.`);
    return {
      kind: "span", id: value.id, traceId: value.traceId.toLowerCase(), spanId: value.spanId.toLowerCase(),
      name: value.name.trim(), serviceName: value.serviceName.trim(), startedAt: new Date(value.startedAt).toISOString(),
      durationMs: value.durationMs, status: value.status as RuntimeSpanRecord["status"], ...(code ? { code } : {})
    };
  }
  if (!bounded(value.profileId, 300) || !Number.isSafeInteger(value.selfSamples) || Number(value.selfSamples) < 0 ||
    !Number.isSafeInteger(value.totalSamples) || Number(value.totalSamples) < Number(value.selfSamples) || Number(value.totalSamples) > 1_000_000_000) {
    throw new Error(`Invalid runtime profile frame at index ${index}.`);
  }
  return {
    kind: "profile-frame", id: value.id, profileId: value.profileId.trim(), name: value.name.trim(),
    selfSamples: Number(value.selfSamples), totalSamples: Number(value.totalSamples), ...(code ? { code } : {})
  };
}

function validateCodeLocation(value: unknown, index: number): RuntimeCodeLocation {
  if (!isRecord(value) || !bounded(value.repositoryId, 500) || typeof value.path !== "string" || !safePath(value.path) ||
    (value.symbol !== undefined && !bounded(value.symbol, 500)) ||
    (value.line !== undefined && (!Number.isSafeInteger(value.line) || Number(value.line) < 1 || Number(value.line) > 10_000_000)) ||
    !bounded(value.evidenceReference, 1_000)) throw new Error(`Invalid runtime code location at index ${index}.`);
  return {
    repositoryId: value.repositoryId.trim(), path: normalizePath(value.path),
    ...(typeof value.symbol === "string" ? { symbol: value.symbol.trim() } : {}),
    ...(typeof value.line === "number" ? { line: value.line } : {}),
    evidenceReference: value.evidenceReference.trim()
  };
}

function validateSnapshots(input: readonly RuntimeRepositorySnapshot[]): RuntimeRepositorySnapshot[] {
  if (!Array.isArray(input) || input.length > 1_000) throw new Error("Invalid runtime repository snapshots.");
  const snapshots = input.map((snapshot, index) => {
    if (!snapshot || !bounded(snapshot.repositoryId, 500) || !Array.isArray(snapshot.files)) {
      throw new Error(`Invalid runtime repository snapshot at index ${index}.`);
    }
    const paths = snapshot.files.map((file: RepoFile) => normalizePath(file.path));
    if (!paths.every(safePath)) throw new Error(`Invalid runtime repository file path at index ${index}.`);
    assertUnique(paths, `runtime repository file in ${snapshot.repositoryId}`);
    return { repositoryId: snapshot.repositoryId.trim(), files: snapshot.files.map((file: RepoFile) => ({ ...file, path: normalizePath(file.path) })) };
  });
  assertUnique(snapshots.map((snapshot) => snapshot.repositoryId), "runtime repository snapshot");
  return snapshots;
}

function normalizePath(value: string): string { return value.replace(/\\/g, "/"); }
function safePath(value: string): boolean {
  const normalized = normalizePath(value);
  return Boolean(normalized) && normalized.length <= 1_000 && !normalized.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    normalized.split("/").every((part) => part && part !== "." && part !== "..");
}
function validDate(value: string): boolean { return Number.isFinite(Date.parse(value)); }
function exactFingerprint(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 256 && !/[\0-\x20]/.test(value);
}
function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max && !value.includes("\0");
}
function assertUnique(values: readonly string[], label: string): void {
  const duplicate = values.find((value, index) => values.indexOf(value) !== index);
  if (duplicate) throw new Error(`Duplicate ${label} id: ${duplicate}`);
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
