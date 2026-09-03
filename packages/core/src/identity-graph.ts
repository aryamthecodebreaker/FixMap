export type GraphEntityKind =
  | "repository"
  | "service"
  | "package"
  | "module"
  | "file"
  | "symbol"
  | "contract"
  | "runtime-component"
  | "deployment";

export type GraphRelationshipKind =
  | "contains"
  | "depends-on"
  | "imports"
  | "implements"
  | "publishes"
  | "observed-as"
  | "deployed-as"
  | "aliases"
  | "equivalent-to";

export type GraphIdentityInput = {
  workspace: string;
  kind: GraphEntityKind;
  key: string;
  repository?: string;
  parent?: string;
};

export type GraphSourceDerivation = {
  kind: "source";
  repository: string;
  path: string;
  fingerprint: string;
};

export type GraphElementDerivation = {
  kind: "node" | "edge";
  id: string;
};

export type GraphDerivation = GraphSourceDerivation | GraphElementDerivation;

export type IdentityGraphNode = {
  id: string;
  kind: GraphEntityKind;
  key: string;
  repository?: string;
  parent?: string;
  label?: string;
  attributes?: Record<string, string | number | boolean>;
  derivedFrom: GraphDerivation[];
};

export type IdentityGraphEdge = {
  id: string;
  kind: GraphRelationshipKind;
  from: string;
  to: string;
  confidence: "high" | "medium" | "low";
  reason: string;
  derivedFrom: GraphDerivation[];
};

export type IdentityGraphVersion = {
  sequence: number;
  fingerprint: string;
  parentFingerprint?: string;
};

export type IdentityGraph = {
  identityGraphVersion: 1;
  workspace: string;
  version: IdentityGraphVersion;
  nodes: IdentityGraphNode[];
  edges: IdentityGraphEdge[];
};

export type GraphDependencyIndex = {
  dependencyIndexVersion: 1;
  graphFingerprint: string;
  sources: Record<string, { fingerprint: string; dependents: string[] }>;
  elements: Record<string, string[]>;
};

export type GraphSourceChange = {
  repository: string;
  path: string;
  beforeFingerprint?: string;
  afterFingerprint?: string;
  renamedTo?: string;
};

export type GraphInvalidation = {
  fromVersion: IdentityGraphVersion;
  toVersion: IdentityGraphVersion;
  staleNodes: string[];
  staleEdges: string[];
  reasons: Array<{ element: string; source?: string; dependency?: string }>;
};

const ID_SCOPE = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,255}$/;
const ENTITY_KINDS = new Set<GraphEntityKind>([
  "repository", "service", "package", "module", "file", "symbol", "contract", "runtime-component", "deployment"
]);
const RELATIONSHIP_KINDS = new Set<GraphRelationshipKind>([
  "contains", "depends-on", "imports", "implements", "publishes", "observed-as", "deployed-as", "aliases", "equivalent-to"
]);

/** Creates a stable hierarchical identity without inferring equivalence from names. */
export function createGraphIdentity(input: GraphIdentityInput): string {
  if (!ENTITY_KINDS.has(input.kind)) throw new Error(`Invalid graph entity kind: ${String(input.kind)}`);
  validateIdentityScope(input.workspace, "workspace");
  validateIdentityKey(input.key, "key");
  if (input.repository) validateIdentityScope(input.repository, "repository");
  if (input.parent && !input.parent.startsWith("fixmap://")) throw new Error("Graph identity parent must be a FixMap identity.");
  const base = `fixmap://workspace/${encodePart(input.workspace)}`;
  if (input.kind === "repository") return `${base}/repository/${encodePart(input.key)}`;
  const scope = input.parent
    ? input.parent
    : input.repository
      ? `${base}/repository/${encodePart(input.repository)}`
      : base;
  return `${scope}/${input.kind}/${encodePart(input.key)}`;
}

/** Stable edge IDs make aliases and equivalence reviewable in diffs and persisted graphs. */
export function createGraphEdgeIdentity(
  kind: GraphRelationshipKind,
  from: string,
  to: string
): string {
  if (!RELATIONSHIP_KINDS.has(kind)) throw new Error(`Invalid graph relationship kind: ${String(kind)}`);
  if (!from.startsWith("fixmap://") || !to.startsWith("fixmap://")) throw new Error("Graph edges require FixMap node identities.");
  const [left, right] = kind === "aliases" || kind === "equivalent-to"
    ? [from, to].sort()
    : [from, to];
  return `fixmap-edge:${kind}:${stableHash(`${left}\0${right}`)}`;
}

/** Creates an explicit alias/equivalence edge; FixMap never infers one from matching labels. */
export function createGraphEquivalence(input: {
  kind: "aliases" | "equivalent-to";
  from: string;
  to: string;
  reason: string;
  confidence?: IdentityGraphEdge["confidence"];
  derivedFrom?: readonly GraphDerivation[];
}): IdentityGraphEdge {
  if (!input.reason.trim()) throw new Error("Graph equivalence needs an explicit reason.");
  return {
    id: createGraphEdgeIdentity(input.kind, input.from, input.to),
    kind: input.kind,
    from: input.from,
    to: input.to,
    confidence: input.confidence ?? "high",
    reason: input.reason.trim(),
    derivedFrom: (input.derivedFrom ?? []).map((derivation) => ({ ...derivation }))
  };
}

export function buildIdentityGraph(input: {
  workspace: string;
  nodes: readonly IdentityGraphNode[];
  edges: readonly IdentityGraphEdge[];
  sequence?: number;
  parentFingerprint?: string;
}): IdentityGraph {
  validateIdentityScope(input.workspace, "workspace");
  const nodes = [...input.nodes].map(copyNode).sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...input.edges].map(copyEdge).sort((a, b) => a.id.localeCompare(b.id));
  validateGraphElements(input.workspace, nodes, edges);
  const fingerprint = stableHash(canonicalize({ workspace: input.workspace, nodes, edges }));
  return {
    identityGraphVersion: 1,
    workspace: input.workspace,
    version: {
      sequence: input.sequence ?? 1,
      fingerprint,
      ...(input.parentFingerprint ? { parentFingerprint: input.parentFingerprint } : {})
    },
    nodes,
    edges
  };
}

/** Builds reverse derivation indexes for exact incremental invalidation. */
export function buildGraphDependencyIndex(graph: IdentityGraph): GraphDependencyIndex {
  const sources: GraphDependencyIndex["sources"] = {};
  const elements: GraphDependencyIndex["elements"] = {};
  for (const [elementKey, derivations] of graphElements(graph)) {
    for (const derivation of derivations) {
      if (derivation.kind === "source") {
        const key = graphSourceKey(derivation.repository, derivation.path);
        const existing = sources[key];
        if (existing && existing.fingerprint !== derivation.fingerprint) {
          throw new Error(`Graph source ${key} has conflicting fingerprints in one snapshot.`);
        }
        const entry = existing ?? { fingerprint: derivation.fingerprint, dependents: [] };
        if (!entry.dependents.includes(elementKey)) entry.dependents.push(elementKey);
        sources[key] = entry;
      } else {
        const dependency = graphElementKey(derivation.kind, derivation.id);
        const dependents = elements[dependency] ?? [];
        if (!dependents.includes(elementKey)) dependents.push(elementKey);
        elements[dependency] = dependents;
      }
    }
  }
  // Hierarchy and topology are derivations too: a child cannot remain current when its
  // parent is stale, and an edge cannot remain current when either endpoint is stale.
  for (const node of graph.nodes) {
    if (node.parent) addElementDependent(elements, graphElementKey("node", node.parent), graphElementKey("node", node.id));
  }
  for (const edge of graph.edges) {
    addElementDependent(elements, graphElementKey("node", edge.from), graphElementKey("edge", edge.id));
    addElementDependent(elements, graphElementKey("node", edge.to), graphElementKey("edge", edge.id));
  }
  for (const entry of Object.values(sources)) entry.dependents.sort();
  for (const dependents of Object.values(elements)) dependents.sort();
  return { dependencyIndexVersion: 1, graphFingerprint: graph.version.fingerprint, sources, elements };
}

/**
 * Computes a non-mutating stale set. Direct source changes invalidate their derived graph
 * elements, then staleness cascades through node/edge derivations until a fixed point.
 */
export function invalidateIdentityGraph(
  graph: IdentityGraph,
  index: GraphDependencyIndex,
  changes: readonly GraphSourceChange[]
): GraphInvalidation {
  if (index.graphFingerprint !== graph.version.fingerprint) {
    throw new Error("Graph dependency index belongs to a different graph version.");
  }
  const stale = new Set<string>();
  const reasons: GraphInvalidation["reasons"] = [];
  const normalizedChanges = normalizeSourceChanges(changes);
  for (const change of normalizedChanges) {
    const source = graphSourceKey(change.repository, change.path);
    const indexed = index.sources[source];
    if (!indexed) continue;
    if (change.beforeFingerprint !== undefined && change.beforeFingerprint !== indexed.fingerprint) {
      throw new Error(`Graph source change for ${source} does not match the indexed before fingerprint.`);
    }
    if (change.afterFingerprint !== undefined && change.afterFingerprint === indexed.fingerprint && !change.renamedTo) continue;
    for (const dependent of indexed.dependents) {
      stale.add(dependent);
      reasons.push({ element: dependent, source });
    }
  }
  const queue = [...stale].sort();
  while (queue.length > 0) {
    const dependency = queue.shift()!;
    for (const dependent of index.elements[dependency] ?? []) {
      if (stale.has(dependent)) continue;
      stale.add(dependent);
      queue.push(dependent);
      queue.sort();
      reasons.push({ element: dependent, dependency });
    }
  }
  const toVersion: IdentityGraphVersion = stale.size === 0
    ? { ...graph.version }
    : {
        sequence: graph.version.sequence + 1,
        parentFingerprint: graph.version.fingerprint,
        fingerprint: stableHash(`${graph.version.fingerprint}\0${stableHash(canonicalize(normalizedChanges))}`)
      };
  return {
    fromVersion: graph.version,
    toVersion,
    staleNodes: [...stale].filter((key) => key.startsWith("node:")).map((key) => key.slice(5)).sort(),
    staleEdges: [...stale].filter((key) => key.startsWith("edge:")).map((key) => key.slice(5)).sort(),
    reasons: reasons.sort((a, b) => a.element.localeCompare(b.element) ||
      (a.source ?? a.dependency ?? "").localeCompare(b.source ?? b.dependency ?? ""))
  };
}

export function graphSourceFingerprint(content: string): string {
  return `content:${stableHash(content)}`;
}

function validateGraphElements(workspace: string, nodes: IdentityGraphNode[], edges: IdentityGraphEdge[]): void {
  const workspacePrefix = `fixmap://workspace/${encodePart(workspace)}/`;
  const nodeIds = new Set<string>();
  const repositoryKeys = new Set<string>();
  for (const node of nodes) {
    if (!node.id.startsWith(workspacePrefix)) throw new Error(`Graph node identity does not belong to workspace ${workspace}: ${node.id}`);
    const canonicalId = createGraphIdentity({
      workspace,
      kind: node.kind,
      key: node.key,
      ...(node.repository ? { repository: node.repository } : {}),
      ...(node.parent ? { parent: node.parent } : {})
    });
    if (node.id !== canonicalId) throw new Error(`Graph node ${node.id} is not canonically identified.`);
    if (node.kind === "repository" && node.parent) throw new Error(`Repository node ${node.id} cannot have a parent.`);
    if (node.kind !== "repository" && !node.parent) throw new Error(`Graph node ${node.id} requires a hierarchical parent.`);
    if (node.kind === "repository") repositoryKeys.add(node.key);
    if (nodeIds.has(node.id)) throw new Error(`Duplicate graph node identity: ${node.id}`);
    nodeIds.add(node.id);
    validateDerivations(node.derivedFrom);
  }
  const edgeIds = new Set<string>();
  for (const edge of edges) {
    if (!RELATIONSHIP_KINDS.has(edge.kind)) throw new Error(`Invalid graph relationship kind: ${String(edge.kind)}`);
    if (!(["high", "medium", "low"] as const).includes(edge.confidence)) {
      throw new Error(`Graph edge ${edge.id} has invalid confidence.`);
    }
    if (edge.id !== createGraphEdgeIdentity(edge.kind, edge.from, edge.to)) throw new Error(`Graph edge ${edge.id} is not canonically identified.`);
    if (edgeIds.has(edge.id)) throw new Error(`Duplicate graph edge identity: ${edge.id}`);
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) throw new Error(`Graph edge ${edge.id} references an unknown node.`);
    if (!edge.reason.trim()) throw new Error(`Graph edge ${edge.id} needs a reason.`);
    validateDerivations(edge.derivedFrom);
    edgeIds.add(edge.id);
  }
  for (const node of nodes) {
    if (node.parent && !nodeIds.has(node.parent)) throw new Error(`Graph node ${node.id} references an unknown parent.`);
    for (const derivation of node.derivedFrom) validateDerivationReference(derivation, nodeIds, edgeIds, repositoryKeys);
  }
  for (const edge of edges) {
    for (const derivation of edge.derivedFrom) validateDerivationReference(derivation, nodeIds, edgeIds, repositoryKeys);
  }
}

function validateDerivationReference(
  derivation: GraphDerivation,
  nodes: Set<string>,
  edges: Set<string>,
  repositories: Set<string>
): void {
  if (derivation.kind === "source" && !repositories.has(derivation.repository)) {
    throw new Error(`Graph derivation references unknown repository ${derivation.repository}.`);
  }
  if (derivation.kind === "node" && !nodes.has(derivation.id)) throw new Error(`Graph derivation references unknown node ${derivation.id}.`);
  if (derivation.kind === "edge" && !edges.has(derivation.id)) throw new Error(`Graph derivation references unknown edge ${derivation.id}.`);
}

function validateDerivations(derivations: GraphDerivation[]): void {
  for (const derivation of derivations) {
    if (derivation.kind === "source") {
      validateIdentityScope(derivation.repository, "source repository");
      validateSourcePath(derivation.path);
      if (!FINGERPRINT.test(derivation.fingerprint)) throw new Error(`Invalid graph source fingerprint for ${derivation.path}.`);
    } else if (!derivation.id.trim()) {
      throw new Error("Graph element derivation needs an identity.");
    }
  }
}

function graphElements(graph: IdentityGraph): Array<[string, GraphDerivation[]]> {
  return [
    ...graph.nodes.map((node): [string, GraphDerivation[]] => [graphElementKey("node", node.id), node.derivedFrom]),
    ...graph.edges.map((edge): [string, GraphDerivation[]] => [graphElementKey("edge", edge.id), edge.derivedFrom])
  ];
}

function graphElementKey(kind: "node" | "edge", id: string): string {
  return `${kind}:${id}`;
}

function addElementDependent(elements: Record<string, string[]>, dependency: string, dependent: string): void {
  const dependents = elements[dependency] ?? [];
  if (!dependents.includes(dependent)) dependents.push(dependent);
  elements[dependency] = dependents;
}

function graphSourceKey(repository: string, path: string): string {
  return `source:${encodeURIComponent(repository)}:${encodeURIComponent(path.replace(/\\/g, "/"))}`;
}

function validateSourceChange(change: GraphSourceChange): void {
  validateIdentityScope(change.repository, "source repository");
  validateSourcePath(change.path);
  if (change.renamedTo !== undefined) validateSourcePath(change.renamedTo);
  for (const [label, fingerprint] of [
    ["before", change.beforeFingerprint],
    ["after", change.afterFingerprint]
  ] as const) {
    if (fingerprint !== undefined && !FINGERPRINT.test(fingerprint)) {
      throw new Error(`Invalid graph source ${label} fingerprint for ${change.path}.`);
    }
  }
}

function normalizeSourceChanges(changes: readonly GraphSourceChange[]): GraphSourceChange[] {
  const bySource = new Map<string, GraphSourceChange>();
  for (const change of changes) {
    validateSourceChange(change);
    const key = graphSourceKey(change.repository, change.path);
    const copy = { ...change };
    const existing = bySource.get(key);
    if (existing && canonicalize(existing) !== canonicalize(copy)) {
      throw new Error(`Conflicting graph source changes for ${key}.`);
    }
    bySource.set(key, copy);
  }
  return [...bySource.values()].sort((left, right) =>
    left.repository.localeCompare(right.repository) ||
    left.path.localeCompare(right.path) ||
    canonicalize(left).localeCompare(canonicalize(right))
  );
}

function validateSourcePath(path: string): void {
  if (!path.trim() || path.includes("\0") || /^[\\/]/.test(path) || /^[A-Za-z]:/.test(path) ||
    path.replace(/\\/g, "/").split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid graph source path: ${path}`);
  }
}

function validateIdentityScope(value: string, label: string): void {
  if (!ID_SCOPE.test(value) || value === "." || value === "..") throw new Error(`Invalid graph identity ${label}: ${value}`);
}

function validateIdentityKey(value: string, label: string): void {
  const segments = value.split("/");
  if (!value.trim() || value !== value.trim() || value.length > 512 || /[\0-\x1f\x7f]/.test(value) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid graph identity ${label}: ${value}`);
  }
}

function encodePart(value: string): string {
  return value.split("/").map(encodeURIComponent).join("/");
}

function copyNode(node: IdentityGraphNode): IdentityGraphNode {
  return {
    ...node,
    ...(node.attributes ? { attributes: { ...node.attributes } } : {}),
    derivedFrom: normalizeDerivations(node.derivedFrom)
  };
}

function copyEdge(edge: IdentityGraphEdge): IdentityGraphEdge {
  return { ...edge, derivedFrom: normalizeDerivations(edge.derivedFrom) };
}

function normalizeDerivations(derivations: readonly GraphDerivation[]): GraphDerivation[] {
  const byIdentity = new Map<string, GraphDerivation>();
  for (const derivation of derivations) byIdentity.set(canonicalize(derivation), { ...derivation });
  return [...byIdentity.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, derivation]) => derivation);
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

/** FNV-1a 64-bit is deterministic across Node/browser; identity is not a security digest. */
function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
