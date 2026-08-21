import { annotationsForPath } from "./annotations.js";
import type { FixMapReport } from "./types.js";
import { validateFixMapReport } from "./validate.js";

export type EditorProtocolMethod = "fixmap/capabilities" | "fixmap/plan" | "fixmap/file" | "fixmap/annotations";

export type EditorProtocolRequest = {
  editorProtocolVersion: 1;
  id: string;
  method: EditorProtocolMethod;
  params?: Record<string, unknown>;
};

export type EditorProtocolResponse = {
  editorProtocolVersion: 1;
  id: string | null;
  snapshotFingerprint: string;
  result?: unknown;
  error?: {
    code: "invalid-request" | "unsupported-version" | "method-not-found" | "invalid-params";
    message: string;
  };
};

export type EditorProtocolSnapshot = {
  editorProtocolVersion: 1;
  sourceReportVersion: 1;
  snapshotFingerprint: string;
  privacy: {
    transport: "local-process";
    networkRequired: false;
    sourceUpload: false;
    mutationSupported: false;
  };
  methods: EditorProtocolMethod[];
  report: FixMapReport;
};

const REQUEST_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/;
const METHODS: EditorProtocolMethod[] = ["fixmap/capabilities", "fixmap/plan", "fixmap/file", "fixmap/annotations"];

/** Creates one immutable, versioned view shared by editor adapters and the CLI report contract. */
export function createEditorProtocolSnapshot(candidate: unknown): EditorProtocolSnapshot {
  const validated = validateFixMapReport(candidate, "editor protocol report");
  if (!validated.success) throw new Error(validated.message);
  if (validated.report.reportVersion !== 1) {
    throw new Error("Editor protocol requires an explicit reportVersion 1 report.");
  }
  const report = structuredClone(validated.report);
  return deepFreeze({
    editorProtocolVersion: 1,
    sourceReportVersion: 1,
    snapshotFingerprint: `editor-snapshot:${stableHash(canonicalize(report))}`,
    privacy: { transport: "local-process", networkRequired: false, sourceUpload: false, mutationSupported: false },
    methods: [...METHODS],
    report
  });
}

export function handleEditorProtocolRequest(
  snapshot: EditorProtocolSnapshot,
  candidate: unknown
): EditorProtocolResponse {
  validateSnapshot(snapshot);
  const envelope = validateRequest(candidate);
  if ("error" in envelope) return response(snapshot, envelope.id, { error: envelope.error });
  const request = envelope.request;
  if (request.method === "fixmap/capabilities") {
    if (!emptyParams(request.params)) return invalidParams(snapshot, request.id, "fixmap/capabilities accepts no parameters.");
    return response(snapshot, request.id, { result: {
      methods: snapshot.methods,
      privacy: snapshot.privacy,
      sourceReportVersion: snapshot.sourceReportVersion
    } });
  }
  if (request.method === "fixmap/plan") {
    if (!emptyParams(request.params)) return invalidParams(snapshot, request.id, "fixmap/plan accepts no parameters.");
    const report = snapshot.report;
    return response(snapshot, request.id, { result: {
      summary: report.summary,
      contextFiles: report.contextFiles,
      changedFiles: report.changedFiles,
      impact: report.impact ?? null,
      testRoutes: report.testRoutes,
      risks: report.risks,
      diagnostics: report.diagnostics,
      analysis: report.analysis ?? null,
      retrieval: report.retrieval ?? null,
      policy: report.policy ?? null
    } });
  }
  if (request.method === "fixmap/file") {
    const path = requestPath(request.params);
    if (!path) return invalidParams(snapshot, request.id, "fixmap/file requires one safe repository-relative path.");
    const report = snapshot.report;
    return response(snapshot, request.id, { result: {
      path,
      context: report.contextFiles.find((file) => file.path === path) ?? null,
      impact: report.impact?.files.find((file) => file.path === path) ?? null,
      impactSeed: report.impact?.seeds.includes(path) ?? false,
      testRoutes: report.testRoutes.filter((route) => route.relatedFiles.includes(path)),
      annotations: report.annotations ? annotationsForPath(report.annotations.entries, path) : [],
      decisions: (report.decisions ?? []).filter((decision) => decision.path === path || decision.targets.some((target) =>
        (target.kind === "file" && target.path === path) || (target.kind === "symbol" && target.path === path))),
      policyFindings: report.policy?.findings.filter((finding) => finding.paths.includes(path)) ?? [],
      repositoryRisks: report.risks
    } });
  }
  if (request.method === "fixmap/annotations") {
    const params = request.params ?? {};
    if (!isRecord(params) || Object.keys(params).some((key) => key !== "path")) {
      return invalidParams(snapshot, request.id, "fixmap/annotations accepts only an optional safe repository-relative path.");
    }
    const path = params.path === undefined ? undefined : requestPath(params);
    if (params.path !== undefined && !path) {
      return invalidParams(snapshot, request.id, "fixmap/annotations path must be repository-relative.");
    }
    const annotations = snapshot.report.annotations;
    return response(snapshot, request.id, { result: {
      source: annotations ? { path: annotations.sourcePath, fingerprint: annotations.sourceFingerprint, asOf: annotations.asOf } : null,
      entries: annotations ? (path ? annotationsForPath(annotations.entries, path) : annotations.entries) : [],
      mutationSupported: false
    } });
  }
  return response(snapshot, request.id, { error: { code: "method-not-found", message: `Unsupported editor protocol method: ${String(request.method)}` } });
}

function validateSnapshot(snapshot: EditorProtocolSnapshot): void {
  if (!snapshot || snapshot.editorProtocolVersion !== 1 || snapshot.sourceReportVersion !== 1 ||
    snapshot.report?.reportVersion !== 1 || snapshot.snapshotFingerprint !== `editor-snapshot:${stableHash(canonicalize(snapshot.report))}` ||
    snapshot.privacy?.transport !== "local-process" || snapshot.privacy.networkRequired !== false ||
    snapshot.privacy.sourceUpload !== false || snapshot.privacy.mutationSupported !== false) {
    throw new Error("Invalid or mutated editor protocol snapshot.");
  }
}

function validateRequest(candidate: unknown):
  { request: EditorProtocolRequest } |
  { id: string | null; error: EditorProtocolResponse["error"] & {} } {
  const id = isRecord(candidate) && typeof candidate.id === "string" && REQUEST_ID.test(candidate.id) ? candidate.id : null;
  if (!isRecord(candidate)) return { id, error: { code: "invalid-request", message: "Editor protocol request must be an object." } };
  if (candidate.editorProtocolVersion !== 1) {
    return { id, error: { code: "unsupported-version", message: "This FixMap build supports editorProtocolVersion 1." } };
  }
  if (!id || typeof candidate.method !== "string") {
    return { id, error: { code: "invalid-request", message: "Editor protocol request needs a valid id and method." } };
  }
  if (!METHODS.includes(candidate.method as EditorProtocolMethod)) {
    return { id, error: { code: "method-not-found", message: `Unsupported editor protocol method: ${candidate.method}` } };
  }
  if (candidate.params !== undefined && !isRecord(candidate.params)) {
    return { id, error: { code: "invalid-params", message: "Editor protocol params must be an object." } };
  }
  return { request: {
    editorProtocolVersion: 1, id, method: candidate.method as EditorProtocolMethod,
    ...(candidate.params ? { params: candidate.params } : {})
  } };
}

function response(
  snapshot: EditorProtocolSnapshot,
  id: string | null,
  body: Pick<EditorProtocolResponse, "result" | "error">
): EditorProtocolResponse {
  return { editorProtocolVersion: 1, id, snapshotFingerprint: snapshot.snapshotFingerprint, ...body };
}
function invalidParams(snapshot: EditorProtocolSnapshot, id: string, message: string): EditorProtocolResponse {
  return response(snapshot, id, { error: { code: "invalid-params", message } });
}
function emptyParams(value: Record<string, unknown> | undefined): boolean { return value === undefined || Object.keys(value).length === 0; }
function requestPath(params: Record<string, unknown> | undefined): string | undefined {
  if (!params || Object.keys(params).some((key) => key !== "path") || typeof params.path !== "string" || !safePath(params.path)) return undefined;
  return params.path.replace(/\\/g, "/");
}
function safePath(value: string): boolean {
  const normalized = value.replace(/\\/g, "/");
  return Boolean(normalized) && normalized.length <= 1_000 && !normalized.includes("\0") && !/^(?:[\/]|[A-Za-z]:)/.test(value) &&
    normalized.split("/").every((part) => part && part !== "." && part !== "..");
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
    Object.freeze(value);
  }
  return value;
}
function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}
/** FNV-1a is a deterministic snapshot identity, not a security digest. */
function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
