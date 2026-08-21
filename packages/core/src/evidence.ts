import type { RepoMap } from "./types.js";

export type EvidenceKind =
  | "structure"
  | "semantic"
  | "history"
  | "human-intent"
  | "contract"
  | "runtime"
  | "security"
  | "ownership"
  | "custom";

export type EvidenceConfidence = "high" | "medium" | "low";

export type EvidenceSubject =
  | { kind: "repository"; repository: string }
  | { kind: "package"; name: string; version?: string; purl?: string }
  | { kind: "file"; path: string }
  | { kind: "symbol"; path: string; symbol: string }
  | { kind: "contract"; name: string; path?: string }
  | { kind: "runtime"; name: string };

export type EvidenceItem = {
  /** Provider-local stable identifier. Core namespaces it with the provider ID. */
  id: string;
  kind: EvidenceKind;
  summary: string;
  confidence: EvidenceConfidence;
  subjects: EvidenceSubject[];
  observedAt?: string;
  metadata?: Record<string, string | number | boolean>;
};

export type EvidenceRelationship = {
  /** Provider-local stable identifier. */
  id: string;
  from: string;
  to: string;
  relation: string;
  reason: string;
  confidence: EvidenceConfidence;
};

export type EvidenceProviderResult = {
  items: EvidenceItem[];
  relationships?: EvidenceRelationship[];
};

export type EvidenceProviderCapabilities = {
  network: "never" | "optional" | "required";
  executesCode: boolean;
};

export type EvidenceProviderContext = {
  repo: RepoMap;
  issueText: string;
  diffText: string;
  /** Explicit grants for optional capabilities. Providers must not infer permission. */
  permissions: {
    network: boolean;
    codeExecution: boolean;
  };
  /** Stable clock supplied by the caller so built-in providers do not need ambient time. */
  now: string;
  signal: AbortSignal;
};

export type EvidenceProvider = {
  id: string;
  version: string;
  capabilities: EvidenceProviderCapabilities;
  collect(context: EvidenceProviderContext): Promise<EvidenceProviderResult> | EvidenceProviderResult;
};

export type CollectedEvidenceItem = EvidenceItem & {
  id: string;
  provider: { id: string; version: string };
};

export type CollectedEvidenceRelationship = EvidenceRelationship & {
  id: string;
  from: string;
  to: string;
  provider: { id: string; version: string };
};

export type EvidenceProviderDiagnostic = {
  provider: string;
  severity: "info" | "warning" | "error";
  code: "duplicate-provider" | "provider-disallowed" | "provider-failed" | "provider-invalid" | "provider-truncated";
  message: string;
};

export type CollectedEvidence = {
  evidenceVersion: 1;
  collectedAt: string;
  items: CollectedEvidenceItem[];
  relationships: CollectedEvidenceRelationship[];
  diagnostics: EvidenceProviderDiagnostic[];
};

export type EvidenceCollectionOptions = {
  now?: string;
  allowNetwork?: boolean;
  allowCodeExecution?: boolean;
  maxItemsPerProvider?: number;
  maxRelationshipsPerProvider?: number;
  timeoutMs?: number;
};

const PROVIDER_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const LOCAL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const DEFAULT_MAX_ITEMS = 5_000;
const DEFAULT_MAX_RELATIONSHIPS = 10_000;
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Runs trusted in-process providers behind a deterministic, validated contract. Capability
 * declarations are policy gates, not a security sandbox; untrusted providers belong in the
 * separate execution sandbox and must communicate through a serialized evidence bundle.
 */
export async function collectEvidence(
  providers: readonly EvidenceProvider[],
  context: Omit<EvidenceProviderContext, "now" | "signal" | "permissions">,
  options: EvidenceCollectionOptions = {}
): Promise<CollectedEvidence> {
  const now = normalizeNow(options.now);
  const diagnostics: EvidenceProviderDiagnostic[] = [];
  const items: CollectedEvidenceItem[] = [];
  const relationships: CollectedEvidenceRelationship[] = [];
  const seenProviders = new Set<string>();

  for (const provider of [...providers].sort((a, b) => a.id.localeCompare(b.id))) {
    const label = provider.id || "<unnamed>";
    if (!PROVIDER_ID.test(provider.id) || !provider.version.trim()) {
      diagnostics.push({
        provider: label,
        severity: "error",
        code: "provider-invalid",
        message: `Evidence provider ${label} has an invalid ID or empty version.`
      });
      continue;
    }
    if (seenProviders.has(provider.id)) {
      diagnostics.push({
        provider: provider.id,
        severity: "error",
        code: "duplicate-provider",
        message: `Evidence provider ${provider.id} was registered more than once; duplicate results were ignored.`
      });
      continue;
    }
    seenProviders.add(provider.id);

    const networkDisallowed = provider.capabilities.network === "required" && options.allowNetwork !== true;
    const executionDisallowed = provider.capabilities.executesCode && options.allowCodeExecution !== true;
    if (networkDisallowed || executionDisallowed) {
      const reasons = [networkDisallowed ? "network access" : "", executionDisallowed ? "code execution" : ""]
        .filter(Boolean).join(" and ");
      diagnostics.push({
        provider: provider.id,
        severity: "info",
        code: "provider-disallowed",
        message: `Evidence provider ${provider.id} was not run because it requires ${reasons}; opt in explicitly to allow it.`
      });
      continue;
    }

    const controller = new AbortController();
    try {
      const result = await withTimeout(
        Promise.resolve(provider.collect({
          ...context,
          permissions: {
            network: options.allowNetwork === true,
            codeExecution: options.allowCodeExecution === true
          },
          now,
          signal: controller.signal
        })),
        positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS),
        controller
      );
      const validated = validateProviderResult(result);
      if (!validated.success) {
        diagnostics.push({
          provider: provider.id,
          severity: "error",
          code: "provider-invalid",
          message: `Evidence provider ${provider.id} returned invalid evidence: ${validated.message}`
        });
        continue;
      }

      const maxItems = positiveInteger(options.maxItemsPerProvider, DEFAULT_MAX_ITEMS);
      const maxRelationships = positiveInteger(options.maxRelationshipsPerProvider, DEFAULT_MAX_RELATIONSHIPS);
      const selectedItems = validated.items.slice(0, maxItems);
      const selectedItemIds = new Set(selectedItems.map((item) => item.id));
      const selectedRelationships = validated.relationships
        .filter((relationship) => selectedItemIds.has(relationship.from) && selectedItemIds.has(relationship.to))
        .slice(0, maxRelationships);
      if (validated.items.length > selectedItems.length || validated.relationships.length > selectedRelationships.length) {
        diagnostics.push({
          provider: provider.id,
          severity: "warning",
          code: "provider-truncated",
          message:
            `Evidence provider ${provider.id} was bounded to ${selectedItems.length.toLocaleString()} item(s) and ` +
            `${selectedRelationships.length.toLocaleString()} relationship(s).`
        });
      }

      const provenance = { id: provider.id, version: provider.version };
      items.push(...selectedItems.map((item) => ({
        ...item,
        id: namespaceId(provider.id, item.id),
        provider: provenance
      })));
      relationships.push(...selectedRelationships.map((relationship) => ({
        ...relationship,
        id: namespaceId(provider.id, relationship.id),
        from: namespaceId(provider.id, relationship.from),
        to: namespaceId(provider.id, relationship.to),
        provider: provenance
      })));
    } catch (error) {
      diagnostics.push({
        provider: provider.id,
        severity: "warning",
        code: "provider-failed",
        message: `Evidence provider ${provider.id} failed without aborting FixMap: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      controller.abort();
    }
  }

  return {
    evidenceVersion: 1,
    collectedAt: now,
    items: items.sort((a, b) => a.id.localeCompare(b.id)),
    relationships: relationships.sort((a, b) => a.id.localeCompare(b.id)),
    diagnostics
  };
}

type ValidatedResult =
  | { success: true; items: EvidenceItem[]; relationships: EvidenceRelationship[] }
  | { success: false; message: string };

function validateProviderResult(result: unknown): ValidatedResult {
  if (!isRecord(result) || !Array.isArray(result.items) ||
    !(result.relationships === undefined || Array.isArray(result.relationships))) {
    return { success: false, message: "expected { items, relationships? } arrays" };
  }
  const items = result.items as unknown[];
  const relationships = (result.relationships ?? []) as unknown[];
  const itemIds = new Set<string>();
  for (const candidate of items) {
    const message = validateEvidenceItem(candidate);
    if (message) return { success: false, message };
    const item = candidate as EvidenceItem;
    if (itemIds.has(item.id)) return { success: false, message: `duplicate item ID ${item.id}` };
    itemIds.add(item.id);
  }
  const relationshipIds = new Set<string>();
  for (const candidate of relationships) {
    const message = validateRelationship(candidate, itemIds);
    if (message) return { success: false, message };
    const relationship = candidate as EvidenceRelationship;
    if (relationshipIds.has(relationship.id)) return { success: false, message: `duplicate relationship ID ${relationship.id}` };
    relationshipIds.add(relationship.id);
  }
  // Copy provider output so later provider-side mutation cannot change the collected bundle.
  return {
    success: true,
    items: items.map((item) => structuredClone(item as EvidenceItem)),
    relationships: relationships.map((relationship) => structuredClone(relationship as EvidenceRelationship))
  };
}

function validateEvidenceItem(candidate: unknown): string | undefined {
  if (!isRecord(candidate) || typeof candidate.id !== "string" || !LOCAL_ID.test(candidate.id)) return "an item has an invalid ID";
  if (!isEvidenceKind(candidate.kind)) return `item ${candidate.id} has an invalid kind`;
  if (typeof candidate.summary !== "string" || !candidate.summary.trim() || candidate.summary.length > 1_000) return `item ${candidate.id} has an invalid summary`;
  if (!isConfidence(candidate.confidence)) return `item ${candidate.id} has invalid confidence`;
  if (!Array.isArray(candidate.subjects) || candidate.subjects.length === 0 || candidate.subjects.length > 100 ||
    !candidate.subjects.every(isEvidenceSubject)) return `item ${candidate.id} has invalid subjects`;
  if (candidate.observedAt !== undefined &&
    (typeof candidate.observedAt !== "string" || !Number.isFinite(Date.parse(candidate.observedAt)))) return `item ${candidate.id} has an invalid observedAt timestamp`;
  if (candidate.metadata !== undefined && !isScalarMetadata(candidate.metadata)) return `item ${candidate.id} has invalid metadata`;
  return undefined;
}

function validateRelationship(candidate: unknown, itemIds: Set<string>): string | undefined {
  if (!isRecord(candidate) || typeof candidate.id !== "string" || !LOCAL_ID.test(candidate.id)) return "a relationship has an invalid ID";
  if (typeof candidate.from !== "string" || !itemIds.has(candidate.from) ||
    typeof candidate.to !== "string" || !itemIds.has(candidate.to)) return `relationship ${candidate.id} references an unknown item`;
  if (typeof candidate.relation !== "string" || !candidate.relation.trim() || candidate.relation.length > 100) return `relationship ${candidate.id} has an invalid relation`;
  if (typeof candidate.reason !== "string" || !candidate.reason.trim() || candidate.reason.length > 1_000) return `relationship ${candidate.id} has an invalid reason`;
  if (!isConfidence(candidate.confidence)) return `relationship ${candidate.id} has invalid confidence`;
  return undefined;
}

function isEvidenceSubject(candidate: unknown): candidate is EvidenceSubject {
  if (!isRecord(candidate)) return false;
  if (candidate.kind === "repository") return typeof candidate.repository === "string" && candidate.repository.trim().length > 0;
  if (candidate.kind === "package") return typeof candidate.name === "string" && candidate.name.trim().length > 0 && candidate.name.length <= 300 &&
    (candidate.version === undefined || (typeof candidate.version === "string" && candidate.version.trim().length > 0 && candidate.version.length <= 300)) &&
    (candidate.purl === undefined || (typeof candidate.purl === "string" && candidate.purl.startsWith("pkg:") && candidate.purl.length <= 1_000));
  if (candidate.kind === "file") return typeof candidate.path === "string" && isSafeRelativePath(candidate.path);
  if (candidate.kind === "symbol") return typeof candidate.path === "string" && isSafeRelativePath(candidate.path) &&
    typeof candidate.symbol === "string" && candidate.symbol.trim().length > 0;
  if (candidate.kind === "contract") return typeof candidate.name === "string" && candidate.name.trim().length > 0 &&
    (candidate.path === undefined || (typeof candidate.path === "string" && isSafeRelativePath(candidate.path)));
  return candidate.kind === "runtime" && typeof candidate.name === "string" && candidate.name.trim().length > 0;
}

function isSafeRelativePath(path: string): boolean {
  if (!path.trim() || path.includes("\0") || /^[\\/]/.test(path) || /^[A-Za-z]:/.test(path)) return false;
  return path.replace(/\\/g, "/").split("/").every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

function isScalarMetadata(candidate: unknown): candidate is Record<string, string | number | boolean> {
  if (!isRecord(candidate) || Object.keys(candidate).length > 50) return false;
  return Object.entries(candidate).every(([key, value]) =>
    key.length > 0 && key.length <= 100 &&
    ((typeof value === "string" && value.length <= 1_000) || typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value)))
  );
}

function isEvidenceKind(candidate: unknown): candidate is EvidenceKind {
  return ["structure", "semantic", "history", "human-intent", "contract", "runtime", "security", "ownership", "custom"]
    .includes(String(candidate));
}

function isConfidence(candidate: unknown): candidate is EvidenceConfidence {
  return candidate === "high" || candidate === "medium" || candidate === "low";
}

function namespaceId(provider: string, local: string): string {
  return `${provider}:${local}`;
}

function normalizeNow(now?: string): string {
  if (now === undefined) return new Date().toISOString();
  if (!Number.isFinite(Date.parse(now))) throw new Error(`Invalid evidence collection timestamp: ${now}`);
  return new Date(now).toISOString();
}

function positiveInteger(value: number | undefined, fallback: number): number {
  return value !== undefined && Number.isSafeInteger(value) && value > 0 ? value : fallback;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, controller: AbortController): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`timed out after ${timeoutMs.toLocaleString()} ms`));
    }, timeoutMs);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
