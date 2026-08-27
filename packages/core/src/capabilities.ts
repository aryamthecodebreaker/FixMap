import { buildChangeScope, renderChangeScopeMarkdown } from "./change-scope.js";
import type {
  ChangeScopeAnchor,
  ChangeScopeDirection,
  ChangeScopeResult
} from "./change-scope.js";
import { createGraphIdentity } from "./identity-graph.js";
import type { RepoMap } from "./types.js";

export type CapabilityDefinition = {
  id: string;
  name: string;
  anchors: ChangeScopeAnchor[];
  traversal?: {
    direction?: ChangeScopeDirection;
    maxDepth?: number;
    maxNodes?: number;
  };
};

export type CapabilityStore = {
  capabilityStoreVersion: 1;
  workspace: string;
  repository: string;
  capabilities: CapabilityDefinition[];
};

export type CapabilityStoreSource = {
  path: ".fixmap/capabilities.json";
  fingerprint: string;
};

export type CapabilityMap = {
  capabilityMapVersion: 1;
  capability: CapabilityDefinition;
  source: CapabilityStoreSource;
  scope: ChangeScopeResult;
};

const CAPABILITY_PATH = ".fixmap/capabilities.json" as const;
const CAPABILITY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_CAPABILITIES = 256;
const MAX_ANCHORS = 64;

/** Strictly validates persistent human intent; generated scope conclusions never enter the store. */
export function validateCapabilityStore(candidate: unknown): CapabilityStore {
  if (!isRecord(candidate) || candidate.capabilityStoreVersion !== 1 ||
    typeof candidate.workspace !== "string" || typeof candidate.repository !== "string" ||
    !Array.isArray(candidate.capabilities)) {
    throw new Error("Capability store must be a version-1 object with workspace, repository, and capabilities fields.");
  }
  assertOnlyKeys(candidate, ["capabilityStoreVersion", "workspace", "repository", "capabilities"], "capability store");
  // Reuse the graph identity grammar so capability and scope identities cannot silently drift.
  createGraphIdentity({ workspace: candidate.workspace, kind: "repository", key: candidate.repository });
  if (candidate.capabilities.length > MAX_CAPABILITIES) {
    throw new Error(`Capability store supports at most ${MAX_CAPABILITIES} capabilities.`);
  }
  const seen = new Set<string>();
  const capabilities = candidate.capabilities.map((entry, index) => validateDefinition(entry, index));
  for (const capability of capabilities) {
    if (seen.has(capability.id)) throw new Error(`Duplicate capability id: ${capability.id}.`);
    seen.add(capability.id);
  }
  return {
    capabilityStoreVersion: 1,
    workspace: candidate.workspace,
    repository: candidate.repository,
    capabilities: capabilities.sort((left, right) => left.id.localeCompare(right.id))
  };
}

export function capabilityStoreFromRepo(
  repo: RepoMap
): { store: CapabilityStore; source: CapabilityStoreSource } | undefined {
  const file = repo.files.find((candidate) => candidate.path === CAPABILITY_PATH);
  if (!file) return undefined;
  if (file.textSampleComplete === false || !file.contentFingerprint) {
    throw new Error(`${CAPABILITY_PATH} requires complete content and an exact source fingerprint.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(file.textSample);
  } catch (error) {
    throw new Error(`${CAPABILITY_PATH} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  return {
    store: validateCapabilityStore(parsed),
    source: { path: CAPABILITY_PATH, fingerprint: file.contentFingerprint }
  };
}

export function buildCapabilityMap(repo: RepoMap, input: { id: string; asOf: string }): CapabilityMap {
  const loaded = capabilityStoreFromRepo(repo);
  if (!loaded) throw new Error(`${CAPABILITY_PATH} was not found in the repository snapshot.`);
  const id = input.id.trim().toLowerCase();
  const capability = loaded.store.capabilities.find((entry) => entry.id === id);
  if (!capability) throw new Error(`Capability ${JSON.stringify(input.id)} was not found in ${CAPABILITY_PATH}.`);
  const scope = buildChangeScope(repo, {
    workspace: loaded.store.workspace,
    repository: loaded.store.repository,
    anchors: capability.anchors,
    asOf: input.asOf,
    ...(capability.traversal?.direction ? { direction: capability.traversal.direction } : {}),
    ...(capability.traversal?.maxDepth !== undefined ? { maxDepth: capability.traversal.maxDepth } : {}),
    ...(capability.traversal?.maxNodes !== undefined ? { maxNodes: capability.traversal.maxNodes } : {})
  });
  return {
    capabilityMapVersion: 1,
    capability: copyDefinition(capability),
    source: loaded.source,
    scope
  };
}

export function renderCapabilityMapMarkdown(result: CapabilityMap): string {
  const scope = renderChangeScopeMarkdown(result.scope).replace(/^# FixMap Change Scope/, `# FixMap Capability: ${result.capability.name}`);
  return [
    scope.trimEnd(),
    "",
    `Capability id: \`${result.capability.id}\`.`,
    `Definition source: \`${result.source.path}\` (${result.source.fingerprint}).`,
    ""
  ].join("\n");
}

function validateDefinition(candidate: unknown, index: number): CapabilityDefinition {
  if (!isRecord(candidate)) throw new Error(`Capability at index ${index} must be an object.`);
  assertOnlyKeys(candidate, ["id", "name", "anchors", "traversal"], `capability at index ${index}`);
  if (typeof candidate.id !== "string" || !CAPABILITY_ID.test(candidate.id)) {
    throw new Error(`Capability at index ${index} has an invalid id; use lowercase letters, numbers, dots, dashes, or underscores.`);
  }
  if (typeof candidate.name !== "string" || !candidate.name.trim() || candidate.name.length > 120 || /[\0-\x1f\x7f]/.test(candidate.name)) {
    throw new Error(`Capability ${candidate.id} needs a bounded non-empty name.`);
  }
  if (!Array.isArray(candidate.anchors) || candidate.anchors.length === 0 || candidate.anchors.length > MAX_ANCHORS) {
    throw new Error(`Capability ${candidate.id} requires 1-${MAX_ANCHORS} explicit anchors.`);
  }
  const anchors = candidate.anchors.map((anchor, anchorIndex) => validateAnchor(anchor, candidate.id as string, anchorIndex));
  const anchorKeys = new Set<string>();
  for (const anchor of anchors) {
    const key = `${anchor.operation}\0${anchor.path}`;
    if (anchorKeys.has(key)) throw new Error(`Capability ${candidate.id} has a duplicate ${anchor.operation} anchor for ${anchor.path}.`);
    anchorKeys.add(key);
  }
  const traversal = candidate.traversal === undefined ? undefined : validateTraversal(candidate.traversal, candidate.id);
  return {
    id: candidate.id,
    name: candidate.name.trim(),
    anchors,
    ...(traversal ? { traversal } : {})
  };
}

function validateAnchor(candidate: unknown, capability: string, index: number): ChangeScopeAnchor {
  if (!isRecord(candidate)) throw new Error(`Capability ${capability} anchor at index ${index} must be an object.`);
  assertOnlyKeys(candidate, ["operation", "path"], `capability ${capability} anchor at index ${index}`);
  if (candidate.operation !== "touch" && candidate.operation !== "add") {
    throw new Error(`Capability ${capability} anchor at index ${index} needs operation touch or add.`);
  }
  if (typeof candidate.path !== "string") throw new Error(`Capability ${capability} anchor at index ${index} needs a path.`);
  const path = normalizePath(candidate.path);
  return { operation: candidate.operation, path };
}

function validateTraversal(candidate: unknown, capability: string): CapabilityDefinition["traversal"] {
  if (!isRecord(candidate)) throw new Error(`Capability ${capability} traversal must be an object.`);
  assertOnlyKeys(candidate, ["direction", "maxDepth", "maxNodes"], `capability ${capability} traversal`);
  const direction = candidate.direction;
  if (direction !== undefined && direction !== "dependencies" && direction !== "dependents" && direction !== "both") {
    throw new Error(`Capability ${capability} traversal direction is invalid.`);
  }
  if (candidate.maxDepth !== undefined && (!Number.isSafeInteger(candidate.maxDepth) || Number(candidate.maxDepth) < 0 || Number(candidate.maxDepth) > 8)) {
    throw new Error(`Capability ${capability} traversal maxDepth must be an integer from 0 to 8.`);
  }
  if (candidate.maxNodes !== undefined && (!Number.isSafeInteger(candidate.maxNodes) || Number(candidate.maxNodes) < 1 || Number(candidate.maxNodes) > 2_000)) {
    throw new Error(`Capability ${capability} traversal maxNodes must be an integer from 1 to 2000.`);
  }
  return {
    ...(direction ? { direction } : {}),
    ...(candidate.maxDepth !== undefined ? { maxDepth: Number(candidate.maxDepth) } : {}),
    ...(candidate.maxNodes !== undefined ? { maxNodes: Number(candidate.maxNodes) } : {})
  };
}

function normalizePath(value: string): string {
  const path = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path.length > 1_000 || path.includes("\0") || /^[\/]/.test(path) || /^[A-Za-z]:/.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid capability anchor path: ${value}`);
  }
  return path;
}

function copyDefinition(capability: CapabilityDefinition): CapabilityDefinition {
  return {
    ...capability,
    anchors: capability.anchors.map((anchor) => ({ ...anchor })),
    ...(capability.traversal ? { traversal: { ...capability.traversal } } : {})
  };
}

function assertOnlyKeys(record: Record<string, unknown>, allowed: string[], label: string): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(record).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) throw new Error(`${label} has unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
