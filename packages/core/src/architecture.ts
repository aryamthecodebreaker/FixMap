import { buildPathExcluder } from "./exclude.js";
import { buildImportGraph } from "./import-graph.js";
import type { ContractComparison } from "./contracts.js";
import type { RepoMap } from "./types.js";

export type ArchitecturePolicy = {
  architecturePolicyVersion: 1;
  source: { path: string; fingerprint: string };
  boundaries: Array<{
    id: string;
    from: string[];
    deny: string[];
    reason: string;
    severity: "warning" | "error";
    decisionId?: string;
  }>;
  requiredTests: Array<{
    id: string;
    paths: string[];
    tests: string[];
    reason: string;
    severity: "warning" | "error";
  }>;
  requiredReviews: Array<{
    id: string;
    paths: string[];
    reviewers: string[];
    reason: string;
  }>;
  contracts: Array<{
    id: string;
    paths: string[];
    forbidBreaking: boolean;
    reason: string;
    severity: "warning" | "error";
  }>;
};

export type ArchitecturePolicyFinding = {
  code: "boundary-violation" | "required-test-missing" | "review-required" | "breaking-contract";
  severity: "info" | "warning" | "error";
  ruleId: string;
  message: string;
  paths: string[];
  evidence: Array<{
    kind: "import" | "changed-file" | "test-pattern" | "reviewer" | "contract-change" | "decision-record";
    detail: string;
    path?: string;
    relatedPath?: string;
  }>;
};

export type ArchitecturePolicyResult = {
  policyFingerprint: string;
  findings: ArchitecturePolicyFinding[];
};

export type ArchitectureSnapshot = {
  architectureSnapshotVersion: 1;
  fingerprint: string;
  sourceFingerprint: string;
  edges: Array<{ from: string; to: string }>;
  cycles: string[][];
  coupling: Array<{ path: string; incoming: number; outgoing: number; total: number }>;
  boundaryViolations: Array<{ ruleId: string; from: string; to: string }>;
  truncated: { files: number; edges: number };
};

export type ArchitectureDrift = {
  fromFingerprint: string;
  toFingerprint: string;
  addedEdges: Array<{ from: string; to: string }>;
  removedEdges: Array<{ from: string; to: string }>;
  newCycles: string[][];
  resolvedCycles: string[][];
  newBoundaryViolations: Array<{ ruleId: string; from: string; to: string }>;
  resolvedBoundaryViolations: Array<{ ruleId: string; from: string; to: string }>;
  couplingGrowth: Array<{ path: string; before: number; after: number; delta: number }>;
};

const RULE_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export function parseArchitecturePolicy(input: { path: string; content: string; fingerprint: string }): ArchitecturePolicy {
  const sourcePath = validateRelativePath(input.path, "architecture policy path");
  if (!input.fingerprint.trim() || /[\0-\x20]/.test(input.fingerprint)) throw new Error("Architecture policy needs a valid source fingerprint.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(input.content);
  } catch {
    throw new Error(`${sourcePath} is not valid JSON.`);
  }
  if (!isRecord(parsed) || parsed.architecturePolicyVersion !== 1) {
    throw new Error(`${sourcePath} must declare architecturePolicyVersion 1.`);
  }
  const policy: ArchitecturePolicy = {
    architecturePolicyVersion: 1,
    source: { path: sourcePath, fingerprint: input.fingerprint },
    boundaries: array(parsed.boundaries).map((rule, index) => boundaryRule(rule, index)),
    requiredTests: array(parsed.requiredTests).map((rule, index) => testRule(rule, index)),
    requiredReviews: array(parsed.requiredReviews).map((rule, index) => reviewRule(rule, index)),
    contracts: array(parsed.contracts).map((rule, index) => contractRule(rule, index))
  };
  const ids = [
    ...policy.boundaries.map((rule) => rule.id),
    ...policy.requiredTests.map((rule) => rule.id),
    ...policy.requiredReviews.map((rule) => rule.id),
    ...policy.contracts.map((rule) => rule.id)
  ];
  const duplicate = ids.find((id, index) => ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`Duplicate architecture policy rule id: ${duplicate}`);
  if (ids.length > 500) throw new Error("Architecture policy exceeds the 500-rule bound.");
  return policy;
}

export function architecturePolicyFromRepo(repo: RepoMap): ArchitecturePolicy | undefined {
  const file = repo.files.find((candidate) => candidate.path === ".fixmap/policy.json");
  if (!file) return undefined;
  if (file.textSampleComplete === false || !file.contentFingerprint) {
    throw new Error(".fixmap/policy.json requires complete content and an exact fingerprint.");
  }
  return parseArchitecturePolicy({ path: file.path, content: file.textSample, fingerprint: file.contentFingerprint });
}

export function evaluateArchitecturePolicy(
  policy: ArchitecturePolicy,
  input: { repo: RepoMap; contractComparison?: ContractComparison; focusPaths?: readonly string[] }
): ArchitecturePolicyResult {
  const findings: ArchitecturePolicyFinding[] = [];
  const graph = buildImportGraph(input.repo.files);
  const focus = input.focusPaths ? new Set(input.focusPaths) : undefined;
  for (const rule of policy.boundaries) {
    for (const [from, targets] of graph.imports) {
      if (focus && !focus.has(from)) continue;
      if (!matchesAny(from, rule.from)) continue;
      for (const to of targets) {
        if (!matchesAny(to, rule.deny)) continue;
        findings.push({
          code: "boundary-violation",
          severity: rule.severity,
          ruleId: rule.id,
          message: `${from} imports denied architecture target ${to}: ${rule.reason}`,
          paths: [from, to],
          evidence: [
            { kind: "import", path: from, relatedPath: to, detail: `${from} imports ${to}.` },
            ...(rule.decisionId ? [{ kind: "decision-record" as const, detail: rule.decisionId }] : [])
          ]
        });
      }
    }
  }
  const changed = input.repo.changedFiles;
  for (const rule of policy.requiredTests) {
    const triggering = changed.filter((path) => matchesAny(path, rule.paths));
    if (triggering.length === 0 || changed.some((path) => matchesAny(path, rule.tests))) continue;
    findings.push({
      code: "required-test-missing",
      severity: rule.severity,
      ruleId: rule.id,
      message: `${triggering.length} changed path${triggering.length === 1 ? "" : "s"} triggered ${rule.id}, but no required test pattern changed: ${rule.reason}`,
      paths: triggering,
      evidence: [
        ...triggering.map((path) => ({ kind: "changed-file" as const, path, detail: `Matches ${rule.paths.join(", ")}.` })),
        ...rule.tests.map((pattern) => ({ kind: "test-pattern" as const, detail: pattern }))
      ]
    });
  }
  for (const rule of policy.requiredReviews) {
    const triggering = changed.filter((path) => matchesAny(path, rule.paths));
    if (triggering.length === 0) continue;
    findings.push({
      code: "review-required",
      severity: "info",
      ruleId: rule.id,
      message: `${rule.reviewers.join(", ")} should review ${triggering.join(", ")}: ${rule.reason}`,
      paths: triggering,
      evidence: rule.reviewers.map((reviewer) => ({ kind: "reviewer", detail: reviewer }))
    });
  }
  for (const rule of policy.contracts) {
    if (!rule.forbidBreaking || !input.contractComparison) continue;
    for (const change of input.contractComparison.changes.filter((candidate) =>
      candidate.compatibility === "breaking" && matchesAny(candidate.path, rule.paths)
    )) {
      findings.push({
        code: "breaking-contract",
        severity: rule.severity,
        ruleId: rule.id,
        message: `${change.path} has a breaking contract change forbidden by ${rule.id}: ${rule.reason}`,
        paths: [change.path],
        evidence: [{ kind: "contract-change", path: change.path, detail: `${change.id}: ${change.reason}` }]
      });
    }
  }
  return {
    policyFingerprint: policy.source.fingerprint,
    findings: findings.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) ||
      a.ruleId.localeCompare(b.ruleId) || a.paths.join("\0").localeCompare(b.paths.join("\0")))
  };
}

export function buildArchitectureSnapshot(repo: RepoMap, policy?: ArchitecturePolicy): ArchitectureSnapshot {
  const graph = buildImportGraph(repo.files);
  const edges = [...graph.imports].flatMap(([from, targets]) => [...targets].map((to) => ({ from, to })))
    .sort(edgeOrder);
  const cycles = findCycles(edges);
  const paths = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort();
  const coupling = paths.map((path) => {
    const incoming = graph.importedBy.get(path)?.size ?? 0;
    const outgoing = graph.imports.get(path)?.size ?? 0;
    return { path, incoming, outgoing, total: incoming + outgoing };
  });
  const boundaryViolations = policy
    ? evaluateArchitecturePolicy(policy, { repo }).findings.flatMap((finding) =>
        finding.code === "boundary-violation" && finding.paths[0] && finding.paths[1]
          ? [{ ruleId: finding.ruleId, from: finding.paths[0], to: finding.paths[1] }]
          : []
      ).sort(violationOrder)
    : [];
  const canonical = { edges, cycles, coupling, boundaryViolations, truncated: { files: graph.truncatedFiles, edges: graph.truncatedEdges } };
  return {
    architectureSnapshotVersion: 1,
    fingerprint: `architecture:${stableHash(canonicalize(canonical))}`,
    sourceFingerprint: repoSourceFingerprint(repo),
    ...canonical
  };
}

export function compareArchitectureSnapshots(
  previous: ArchitectureSnapshot,
  current: ArchitectureSnapshot,
  options: { couplingDelta?: number } = {}
): ArchitectureDrift {
  if (previous.architectureSnapshotVersion !== 1 || current.architectureSnapshotVersion !== 1) {
    throw new Error("Unsupported architecture snapshot version.");
  }
  const previousEdges = new Map(previous.edges.map((edge) => [edgeKey(edge), edge]));
  const currentEdges = new Map(current.edges.map((edge) => [edgeKey(edge), edge]));
  const previousCycles = new Map(previous.cycles.map((cycle) => [cycle.join("\0"), cycle]));
  const currentCycles = new Map(current.cycles.map((cycle) => [cycle.join("\0"), cycle]));
  const previousViolations = new Map(previous.boundaryViolations.map((value) => [violationKey(value), value]));
  const currentViolations = new Map(current.boundaryViolations.map((value) => [violationKey(value), value]));
  const previousCoupling = new Map(previous.coupling.map((value) => [value.path, value.total]));
  const minimumDelta = options.couplingDelta ?? 2;
  return {
    fromFingerprint: previous.fingerprint,
    toFingerprint: current.fingerprint,
    addedEdges: mapDifference(currentEdges, previousEdges).sort(edgeOrder),
    removedEdges: mapDifference(previousEdges, currentEdges).sort(edgeOrder),
    newCycles: mapDifference(currentCycles, previousCycles).sort(cycleOrder),
    resolvedCycles: mapDifference(previousCycles, currentCycles).sort(cycleOrder),
    newBoundaryViolations: mapDifference(currentViolations, previousViolations).sort(violationOrder),
    resolvedBoundaryViolations: mapDifference(previousViolations, currentViolations).sort(violationOrder),
    couplingGrowth: current.coupling.flatMap((value) => {
      const before = previousCoupling.get(value.path) ?? 0;
      const delta = value.total - before;
      return delta >= minimumDelta ? [{ path: value.path, before, after: value.total, delta }] : [];
    }).sort((a, b) => b.delta - a.delta || a.path.localeCompare(b.path))
  };
}

function boundaryRule(value: unknown, index: number): ArchitecturePolicy["boundaries"][number] {
  const rule = ruleRecord(value, "boundaries", index);
  return {
    id: ruleId(rule.id, "boundaries", index),
    from: patterns(rule.from, "boundary from"),
    deny: patterns(rule.deny, "boundary deny"),
    reason: reason(rule.reason),
    severity: severity(rule.severity),
    ...(typeof rule.decisionId === "string" && rule.decisionId.trim() ? { decisionId: rule.decisionId.trim() } : {})
  };
}

function testRule(value: unknown, index: number): ArchitecturePolicy["requiredTests"][number] {
  const rule = ruleRecord(value, "requiredTests", index);
  return {
    id: ruleId(rule.id, "requiredTests", index), paths: patterns(rule.paths, "test paths"),
    tests: patterns(rule.tests, "required tests"), reason: reason(rule.reason), severity: severity(rule.severity)
  };
}

function reviewRule(value: unknown, index: number): ArchitecturePolicy["requiredReviews"][number] {
  const rule = ruleRecord(value, "requiredReviews", index);
  const reviewers = strings(rule.reviewers, "reviewers");
  return { id: ruleId(rule.id, "requiredReviews", index), paths: patterns(rule.paths, "review paths"), reviewers, reason: reason(rule.reason) };
}

function contractRule(value: unknown, index: number): ArchitecturePolicy["contracts"][number] {
  const rule = ruleRecord(value, "contracts", index);
  if (typeof rule.forbidBreaking !== "boolean") throw new Error(`contracts[${index}].forbidBreaking must be boolean.`);
  return {
    id: ruleId(rule.id, "contracts", index), paths: patterns(rule.paths, "contract paths"),
    forbidBreaking: rule.forbidBreaking, reason: reason(rule.reason), severity: severity(rule.severity)
  };
}

function ruleRecord(value: unknown, section: string, index: number): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${section}[${index}] must be an object.`);
  return value;
}

function ruleId(value: unknown, section: string, index: number): string {
  if (typeof value !== "string" || !RULE_ID.test(value)) throw new Error(`${section}[${index}] has an invalid id.`);
  return value;
}

function reason(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1_000) throw new Error("Architecture policy rules need a bounded reason.");
  return value.trim();
}

function severity(value: unknown): "warning" | "error" {
  if (value !== "warning" && value !== "error") throw new Error("Architecture policy severity must be warning or error.");
  return value;
}

function patterns(value: unknown, label: string): string[] {
  const values = strings(value, label);
  if (values.length > 100) throw new Error(`${label} exceeds the 100-pattern bound.`);
  for (const pattern of values) {
    if (pattern.length > 500 || pattern.startsWith("!") || pattern.includes("\0") || /^(?:[\\/]|[A-Za-z]:)/.test(pattern) || pattern.split(/[\\/]/).includes("..")) {
      throw new Error(`Invalid ${label} pattern: ${pattern}`);
    }
  }
  return [...new Set(values.map((pattern) => pattern.replace(/\\/g, "/")))].sort();
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || !value.every((entry) => typeof entry === "string" && entry.trim() && entry.length <= 500)) {
    throw new Error(`${label} must be a non-empty string array.`);
  }
  return value.map((entry: string) => entry.trim());
}

function matchesAny(path: string, patternsToMatch: readonly string[]): boolean {
  return patternsToMatch.some((pattern) => buildPathExcluder([pattern]).excludes(path));
}

function findCycles(edges: readonly { from: string; to: string }[]): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const edge of edges) adjacency.set(edge.from, [...(adjacency.get(edge.from) ?? []), edge.to].sort());
  const nodes = [...new Set(edges.flatMap((edge) => [edge.from, edge.to]))].sort();
  const index = new Map<string, number>();
  const low = new Map<string, number>();
  const stack: string[] = [];
  const onStack = new Set<string>();
  const cycles: string[][] = [];
  let next = 0;
  const visit = (node: string): void => {
    index.set(node, next);
    low.set(node, next);
    next += 1;
    stack.push(node);
    onStack.add(node);
    for (const neighbor of adjacency.get(node) ?? []) {
      if (!index.has(neighbor)) {
        visit(neighbor);
        low.set(node, Math.min(low.get(node)!, low.get(neighbor)!));
      } else if (onStack.has(neighbor)) {
        low.set(node, Math.min(low.get(node)!, index.get(neighbor)!));
      }
    }
    if (low.get(node) !== index.get(node)) return;
    const component: string[] = [];
    let popped: string;
    do {
      popped = stack.pop()!;
      onStack.delete(popped);
      component.push(popped);
    } while (popped !== node);
    component.sort();
    if (component.length > 1 || adjacency.get(component[0]!)?.includes(component[0]!)) cycles.push(component);
  };
  for (const node of nodes) if (!index.has(node)) visit(node);
  return cycles.sort(cycleOrder);
}

function repoSourceFingerprint(repo: RepoMap): string {
  const unversioned = repo.files.find((file) => !file.contentFingerprint);
  if (unversioned) throw new Error(`Architecture snapshots require an exact content fingerprint for ${unversioned.path}.`);
  const sources = repo.files.map((file) => `${file.path}\0${file.contentFingerprint!}`).sort();
  return `repository:${stableHash(sources.join("\0"))}`;
}

function mapDifference<T>(left: ReadonlyMap<string, T>, right: ReadonlyMap<string, unknown>): T[] {
  return [...left].flatMap(([key, value]) => right.has(key) ? [] : [value]);
}

function edgeKey(edge: { from: string; to: string }): string { return `${edge.from}\0${edge.to}`; }
function violationKey(value: { ruleId: string; from: string; to: string }): string { return `${value.ruleId}\0${value.from}\0${value.to}`; }
function edgeOrder(a: { from: string; to: string }, b: { from: string; to: string }): number { return a.from.localeCompare(b.from) || a.to.localeCompare(b.to); }
function violationOrder(a: { ruleId: string; from: string; to: string }, b: { ruleId: string; from: string; to: string }): number { return a.ruleId.localeCompare(b.ruleId) || edgeOrder(a, b); }
function cycleOrder(a: string[], b: string[]): number { return a.join("\0").localeCompare(b.join("\0")); }
function severityOrder(value: "info" | "warning" | "error"): number { return value === "error" ? 0 : value === "warning" ? 1 : 2; }

function validateRelativePath(value: string, label: string): string {
  const normalized = value.replace(/\\/g, "/").trim();
  if (!normalized || /^(?:[\\/]|[A-Za-z]:)/.test(value) || value.includes("\0") ||
    normalized.split("/").some((part) => !part || part === "." || part === "..")) throw new Error(`Invalid ${label}: ${value}`);
  return normalized;
}

function array(value: unknown): unknown[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error("Architecture policy sections must be arrays.");
  return value;
}
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => `${JSON.stringify(key)}:${canonicalize(entry)}`).join(",")}}`;
  return JSON.stringify(value);
}

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
