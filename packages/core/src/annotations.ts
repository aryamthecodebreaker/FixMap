import type { RepoMap } from "./types.js";

export type AnnotationScope =
  | { kind: "file"; path: string }
  | { kind: "symbol"; path: string; symbol: string }
  | { kind: "service"; name: string }
  | { kind: "contract"; name: string; path?: string };

export type FixMapAnnotation = {
  id: string;
  scope: AnnotationScope;
  note: string;
  owner?: string;
  createdAt: string;
  expiresAt?: string;
  sourceRevision?: string;
};

export type AnnotationStore = {
  annotationStoreVersion: 1;
  annotations: FixMapAnnotation[];
};

export type AnnotationAssessment = {
  annotation: FixMapAnnotation;
  status: "active" | "expired" | "missing-target" | "renamed-target";
  message: string;
  suggestedPath?: string;
};

export type AnnotationRename = { from: string; to: string };

export type CreateAnnotationInput = {
  scope: AnnotationScope;
  note: string;
  owner?: string;
  createdAt: string;
  expiresAt?: string;
  sourceRevision?: string;
};

const ID = /^annotation:[a-f0-9]{16}$/;
const REVISION = /^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,255}$/;

export function emptyAnnotationStore(): AnnotationStore {
  return { annotationStoreVersion: 1, annotations: [] };
}

export function createAnnotation(input: CreateAnnotationInput): FixMapAnnotation {
  const normalized = normalizeAnnotationInput(input);
  return {
    id: `annotation:${stableHash(canonicalize(normalized))}`,
    ...normalized
  };
}

export function addAnnotation(store: AnnotationStore, annotation: FixMapAnnotation): AnnotationStore {
  const validated = validateAnnotationStore(store);
  validateAnnotation(annotation);
  if (validated.annotations.some((entry) => entry.id === annotation.id)) {
    throw new Error(`Annotation ${annotation.id} already exists.`);
  }
  const semanticDuplicate = validated.annotations.find((entry) =>
    canonicalize(entry.scope) === canonicalize(annotation.scope) && entry.note === annotation.note && entry.expiresAt === annotation.expiresAt
  );
  if (semanticDuplicate) throw new Error(`An equivalent annotation already exists as ${semanticDuplicate.id}.`);
  return validateAnnotationStore({
    annotationStoreVersion: 1,
    annotations: [...validated.annotations, copyAnnotation(annotation)]
  });
}

export function removeAnnotation(store: AnnotationStore, id: string): AnnotationStore {
  const validated = validateAnnotationStore(store);
  if (!ID.test(id)) throw new Error(`Invalid annotation ID: ${id}`);
  const annotations = validated.annotations.filter((annotation) => annotation.id !== id);
  if (annotations.length === validated.annotations.length) throw new Error(`Annotation ${id} does not exist.`);
  return { annotationStoreVersion: 1, annotations };
}

export function validateAnnotationStore(candidate: unknown): AnnotationStore {
  if (!isRecord(candidate) || candidate.annotationStoreVersion !== 1 || !Array.isArray(candidate.annotations)) {
    throw new Error("Unsupported or invalid FixMap annotation store. Expected annotationStoreVersion 1.");
  }
  const ids = new Set<string>();
  const annotations = candidate.annotations.map((value) => {
    validateAnnotation(value);
    if (ids.has(value.id)) throw new Error(`Duplicate annotation ID: ${value.id}`);
    ids.add(value.id);
    return copyAnnotation(value);
  }).sort((a, b) => scopeKey(a.scope).localeCompare(scopeKey(b.scope)) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  return { annotationStoreVersion: 1, annotations };
}

export function assessAnnotations(
  store: AnnotationStore,
  repo: Pick<RepoMap, "files">,
  options: { now: string; renames?: readonly AnnotationRename[] }
): AnnotationAssessment[] {
  const validated = validateAnnotationStore(store);
  const now = parseTimestamp(options.now, "assessment time");
  const paths = new Set(repo.files.map((file) => normalizePath(file.path)));
  const renames = new Map((options.renames ?? []).map((rename) => {
    const from = validateRelativePath(rename.from, "rename source");
    const to = validateRelativePath(rename.to, "rename target");
    return [from, to];
  }));
  return validated.annotations.map((annotation): AnnotationAssessment => {
    if (annotation.expiresAt && parseTimestamp(annotation.expiresAt, "annotation expiry") <= now) {
      return { annotation, status: "expired", message: `Annotation ${annotation.id} expired at ${annotation.expiresAt}.` };
    }
    const targetPath = annotation.scope.kind === "file" || annotation.scope.kind === "symbol" ||
      (annotation.scope.kind === "contract" && annotation.scope.path)
      ? annotation.scope.path
      : undefined;
    if (targetPath) {
      const renamedTo = renames.get(targetPath);
      if (renamedTo) {
        return {
          annotation,
          status: "renamed-target",
          message: `Annotation target ${targetPath} was renamed to ${renamedTo}; review and update the annotation scope.`,
          suggestedPath: renamedTo
        };
      }
      if (!paths.has(targetPath)) {
        return { annotation, status: "missing-target", message: `Annotation target ${targetPath} is not present in this repository snapshot.` };
      }
    }
    return { annotation, status: "active", message: `Annotation ${annotation.id} is active.` };
  });
}

export function annotationsForPath(assessments: readonly AnnotationAssessment[], path: string): AnnotationAssessment[] {
  const normalized = validateRelativePath(path, "query path");
  return assessments.filter((assessment) => {
    const scope = assessment.annotation.scope;
    return (scope.kind === "file" || scope.kind === "symbol") && scope.path === normalized ||
      scope.kind === "contract" && scope.path === normalized;
  });
}

function normalizeAnnotationInput(input: CreateAnnotationInput): Omit<FixMapAnnotation, "id"> {
  const scope = validateScope(input.scope);
  const note = normalizeText(input.note, "annotation note", 2_000);
  const createdAt = new Date(parseTimestamp(input.createdAt, "annotation creation time")).toISOString();
  const expiresAt = input.expiresAt
    ? new Date(parseTimestamp(input.expiresAt, "annotation expiry")).toISOString()
    : undefined;
  if (expiresAt && Date.parse(expiresAt) <= Date.parse(createdAt)) throw new Error("Annotation expiry must be after its creation time.");
  const owner = input.owner ? normalizeText(input.owner, "annotation owner", 200) : undefined;
  const sourceRevision = input.sourceRevision?.trim();
  if (sourceRevision && !REVISION.test(sourceRevision)) throw new Error(`Invalid annotation source revision: ${sourceRevision}`);
  return {
    scope,
    note,
    ...(owner ? { owner } : {}),
    createdAt,
    ...(expiresAt ? { expiresAt } : {}),
    ...(sourceRevision ? { sourceRevision } : {})
  };
}

function validateAnnotation(candidate: unknown): asserts candidate is FixMapAnnotation {
  if (!isRecord(candidate) || typeof candidate.id !== "string" || !ID.test(candidate.id) ||
    typeof candidate.note !== "string" || typeof candidate.createdAt !== "string") {
    throw new Error("Invalid FixMap annotation record.");
  }
  const normalized = normalizeAnnotationInput({
    scope: candidate.scope as AnnotationScope,
    note: candidate.note,
    ...(typeof candidate.owner === "string" ? { owner: candidate.owner } : {}),
    createdAt: candidate.createdAt,
    ...(typeof candidate.expiresAt === "string" ? { expiresAt: candidate.expiresAt } : {}),
    ...(typeof candidate.sourceRevision === "string" ? { sourceRevision: candidate.sourceRevision } : {})
  });
  if (candidate.note !== normalized.note || candidate.createdAt !== normalized.createdAt ||
    candidate.owner !== normalized.owner || candidate.expiresAt !== normalized.expiresAt ||
    candidate.sourceRevision !== normalized.sourceRevision || canonicalize(candidate.scope) !== canonicalize(normalized.scope)) {
    throw new Error(`Annotation ${candidate.id} is not canonically encoded.`);
  }
  const expectedId = `annotation:${stableHash(canonicalize(normalized))}`;
  if (candidate.id !== expectedId) throw new Error(`Annotation ${candidate.id} does not match its content identity.`);
}

function validateScope(candidate: AnnotationScope): AnnotationScope {
  if (!isRecord(candidate) || typeof candidate.kind !== "string") throw new Error("Annotation scope is invalid.");
  if (candidate.kind === "file") {
    return { kind: "file", path: validateRelativePath(String(candidate.path ?? ""), "annotation file") };
  }
  if (candidate.kind === "symbol") {
    return {
      kind: "symbol",
      path: validateRelativePath(String(candidate.path ?? ""), "annotation symbol file"),
      symbol: normalizeText(String(candidate.symbol ?? ""), "annotation symbol", 300)
    };
  }
  if (candidate.kind === "service") {
    return { kind: "service", name: normalizeText(String(candidate.name ?? ""), "annotation service", 300) };
  }
  if (candidate.kind === "contract") {
    const path = candidate.path === undefined ? undefined : validateRelativePath(String(candidate.path), "annotation contract file");
    return {
      kind: "contract",
      name: normalizeText(String(candidate.name ?? ""), "annotation contract", 300),
      ...(path ? { path } : {})
    };
  }
  throw new Error("Unsupported annotation scope.");
}

function validateRelativePath(value: string, label: string): string {
  const normalized = normalizePath(value.trim());
  if (!normalized || /^(?:[\\/]|[A-Za-z]:)/.test(value) || value.includes("\0") ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return normalized;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function normalizeText(value: string, label: string, maximum: number): string {
  const normalized = value.replace(/\r\n/g, "\n").trim();
  if (!normalized || normalized.length > maximum || normalized.includes("\0")) throw new Error(`Invalid ${label}.`);
  return normalized;
}

function parseTimestamp(value: string, label: string): number {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}: ${value}`);
  return parsed;
}

function scopeKey(scope: AnnotationScope): string {
  if (scope.kind === "file") return `file:${scope.path}`;
  if (scope.kind === "symbol") return `symbol:${scope.path}:${scope.symbol}`;
  if (scope.kind === "service") return `service:${scope.name}`;
  return `contract:${scope.path ?? ""}:${scope.name}`;
}

function copyAnnotation(annotation: FixMapAnnotation): FixMapAnnotation {
  return { ...annotation, scope: { ...annotation.scope } };
}

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
