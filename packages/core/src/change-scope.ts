import { architecturePolicyFromRepo, evaluateArchitecturePolicy } from "./architecture.js";
import type { ArchitecturePolicyFinding } from "./architecture.js";
import { contractSourcesFromRepo, inventoryContracts } from "./contracts.js";
import type { ContractSurface } from "./contracts.js";
import { inventoryDecisionRecords, selectDecisionRecords } from "./decisions.js";
import type { DecisionRecord } from "./decisions.js";
import { createGraphIdentity } from "./identity-graph.js";
import { buildImportGraph } from "./import-graph.js";
import { routeReviewers } from "./ownership.js";
import type { ReviewSuggestion } from "./ownership.js";
import { isFixMapArtifact } from "./artifacts.js";
import { isBackupPath, isGeneratedPath } from "./paths.js";
import { buildTestRoutes } from "./report.js";
import { markdownCode } from "./markdown.js";
import type { RepoFile, RepoMap, TestRoute } from "./types.js";

export type ChangeScopeDirection = "dependencies" | "dependents" | "both";

export type ChangeScopeAnchor = {
  operation: "touch" | "add";
  path: string;
};

export type ChangeScopeTraversal = {
  direction: ChangeScopeDirection;
  maxDepth: number;
  maxNodes: number;
};

export type ChangeScopeEvidence = {
  kind: "declared" | "dependency" | "dependent";
  from?: string;
  to: string;
  reason: string;
};

export type ChangeScopePath = {
  identity: string;
  path: string;
  role: "selected" | "affected";
  distance: number;
  sourceFingerprint?: string;
  evidence: ChangeScopeEvidence[];
};

export type ResolvedChangeScopeAnchor = ChangeScopeAnchor & {
  status: "resolved" | "unresolved";
  matchedPaths: string[];
};

export type ChangeScopeDiagnostic = {
  code:
    | "scope-anchor-unresolved"
    | "scope-bounded"
    | "scope-contract-warning"
    | "scope-decision-warning"
    | "scope-ownership-warning"
    | "scope-policy-warning";
  severity: "info" | "warning";
  message: string;
  paths?: string[];
};

export type ChangeScopeResult = {
  changeScopeVersion: 1;
  workspace: string;
  repository: string;
  repositoryIdentity: string;
  traversal: ChangeScopeTraversal;
  anchors: ResolvedChangeScopeAnchor[];
  selected: ChangeScopePath[];
  affected: ChangeScopePath[];
  testRoutes: TestRoute[];
  contracts: ContractSurface[];
  decisions: DecisionRecord[];
  reviewers: ReviewSuggestion[];
  architectureFindings: ArchitecturePolicyFinding[];
  evidenceCounts: {
    declared: number;
    observed: number;
    derived: number;
    unresolved: number;
  };
  bounded: {
    truncated: boolean;
    omittedNodes: number;
  };
  diagnostics: ChangeScopeDiagnostic[];
};

export type ChangeScopeInput = {
  workspace: string;
  repository: string;
  anchors: readonly ChangeScopeAnchor[];
  direction?: ChangeScopeDirection;
  maxDepth?: number;
  maxNodes?: number;
  /** Explicit assessment time keeps annotation expiry deterministic in Core/browser use. */
  asOf: string;
};

const MAX_ANCHORS = 64;
const MAX_DEPTH = 8;
const MAX_NODES = 2_000;

/**
 * Expands only explicit path anchors over exact repository import edges. Product meaning is
 * never inferred from anchor names or file text.
 */
export function buildChangeScope(repo: RepoMap, input: ChangeScopeInput): ChangeScopeResult {
  if (!Number.isFinite(Date.parse(input.asOf))) throw new Error("Change scope requires a valid asOf timestamp.");
  if (input.anchors.length === 0 || input.anchors.length > MAX_ANCHORS) {
    throw new Error(`Change scope requires 1-${MAX_ANCHORS} explicit anchors.`);
  }
  const traversal = normalizeTraversal(input);
  const repositoryIdentity = createGraphIdentity({ workspace: input.workspace, kind: "repository", key: input.repository });
  const files = repo.files
    .filter((file) => !isFixMapArtifact(file) && !isGeneratedPath(file.path) && !isBackupPath(file.path))
    .sort((left, right) => left.path.localeCompare(right.path));
  const fileByPath = new Map(files.map((file) => [file.path, file]));
  const normalizedAnchors = input.anchors.map(normalizeAnchor);
  const selectedPaths = new Map<string, ChangeScopeEvidence[]>();
  const diagnostics: ChangeScopeDiagnostic[] = [];
  const resolvedAnchors: ResolvedChangeScopeAnchor[] = [];
  const omitted = new Set<string>();

  for (const anchor of normalizedAnchors) {
    const exact = fileByPath.has(anchor.path) ? [anchor.path] : [];
    const prefix = `${anchor.path}/`;
    const matches = exact.length > 0 ? exact : files.filter((file) => file.path.startsWith(prefix)).map((file) => file.path);
    const accepted: string[] = [];
    for (const path of matches) {
      if (selectedPaths.has(path)) {
        const evidence = selectedPaths.get(path)!;
        const declared: ChangeScopeEvidence = {
          kind: "declared",
          to: path,
          reason: `${anchor.operation} anchor ${anchor.path} explicitly selected ${path}.`
        };
        if (!evidence.some((entry) => evidenceKey(entry) === evidenceKey(declared))) evidence.push(declared);
        accepted.push(path);
        continue;
      }
      if (selectedPaths.size >= traversal.maxNodes) {
        omitted.add(path);
        continue;
      }
      selectedPaths.set(path, [{
        kind: "declared",
        to: path,
        reason: `${anchor.operation} anchor ${anchor.path} explicitly selected ${path}.`
      }]);
      accepted.push(path);
    }
    const status = matches.length > 0 ? "resolved" as const : "unresolved" as const;
    resolvedAnchors.push({ ...anchor, status, matchedPaths: accepted });
    if (status === "unresolved") {
      diagnostics.push({
        code: "scope-anchor-unresolved",
        severity: anchor.operation === "add" ? "info" : "warning",
        message:
          `${anchor.operation} anchor ${anchor.path} does not match an existing repository file or directory. ` +
          "It remains declared but was not expanded into invented implementation evidence.",
        paths: [anchor.path]
      });
    }
  }

  const graph = buildImportGraph(files);
  const affected = new Map<string, { distance: number; evidence: ChangeScopeEvidence[] }>();
  const visited = new Set(selectedPaths.keys());
  const queue = [...selectedPaths.keys()].map((path) => ({ path, distance: 0 }));
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.distance >= traversal.maxDepth) continue;
    for (const neighbor of scopeNeighbors(graph, current.path, traversal.direction)) {
      if (visited.has(neighbor.path)) {
        const existing = affected.get(neighbor.path);
        if (existing && current.distance + 1 <= existing.distance &&
          !existing.evidence.some((entry) => evidenceKey(entry) === evidenceKey(neighbor.evidence))) {
          existing.evidence.push(neighbor.evidence);
          existing.evidence.sort((left, right) => left.kind.localeCompare(right.kind) || left.reason.localeCompare(right.reason));
        }
        continue;
      }
      if (visited.size >= traversal.maxNodes) {
        omitted.add(neighbor.path);
        continue;
      }
      visited.add(neighbor.path);
      const distance = current.distance + 1;
      affected.set(neighbor.path, { distance, evidence: [neighbor.evidence] });
      queue.push({ path: neighbor.path, distance });
    }
  }

  if (omitted.size > 0) {
    diagnostics.push({
      code: "scope-bounded",
      severity: "warning",
      message:
        `Change scope reached its ${traversal.maxNodes.toLocaleString()}-node bound and omitted ` +
        `${omitted.size.toLocaleString()} additional structural ${omitted.size === 1 ? "node" : "nodes"}.`,
      paths: [...omitted].sort().slice(0, 8)
    });
  }

  const selected = [...selectedPaths]
    .map(([path, evidence]) => scopePath(repositoryIdentity, fileByPath.get(path)!, path, "selected", 0, evidence, input))
    .sort(pathOrder);
  const affectedPaths = [...affected]
    .map(([path, entry]) => scopePath(repositoryIdentity, fileByPath.get(path)!, path, "affected", entry.distance, entry.evidence, input))
    .sort(pathOrder);
  const allPaths = [...selected.map((entry) => entry.path), ...affectedPaths.map((entry) => entry.path)];
  const pathSet = new Set(allPaths);
  const scopeRepo = { ...repo, changedFiles: allPaths };
  const testRoutes = buildTestRoutes(scopeRepo, allPaths);

  const contractSources = contractSourcesFromRepo(repo);
  const contractInventory = inventoryContracts(
    contractSources.sources.filter((source) => pathSet.has(source.path)),
    contractSources.diagnostics.filter((diagnostic) => pathSet.has(diagnostic.path))
  );
  const contracts = contractInventory.surfaces.filter((surface) => pathSet.has(surface.path));
  diagnostics.push(...contractInventory.diagnostics.map((entry): ChangeScopeDiagnostic => ({
    code: "scope-contract-warning",
    severity: entry.severity,
    message: entry.message,
    paths: [entry.path]
  })));

  const decisionInventory = inventoryDecisionRecords(repo);
  const decisions = selectDecisionRecords(decisionInventory, { paths: allPaths, task: "" });
  diagnostics.push(...decisionInventory.diagnostics.filter((entry) => pathSet.has(entry.path)).map((entry): ChangeScopeDiagnostic => ({
    code: "scope-decision-warning",
    severity: entry.severity,
    message: entry.message,
    paths: [entry.path]
  })));

  const reviewRouting = routeReviewers(repo, { changedPaths: allPaths, now: input.asOf });
  const reviewers = reviewRouting.suggestions;
  diagnostics.push(...reviewRouting.diagnostics.map((entry): ChangeScopeDiagnostic => ({
    code: "scope-ownership-warning",
    severity: entry.severity,
    message: entry.message
  })));
  let architectureFindings: ArchitecturePolicyFinding[] = [];
  try {
    const policy = architecturePolicyFromRepo(repo);
    if (policy) {
      architectureFindings = evaluateArchitecturePolicy(policy, {
        repo: scopeRepo,
        focusPaths: allPaths
      }).findings;
    }
  } catch (error) {
    diagnostics.push({
      code: "scope-policy-warning",
      severity: "warning",
      message: `Architecture evidence was skipped: ${error instanceof Error ? error.message : String(error)}`
    });
  }

  const routedTestPaths = new Set(testRoutes.flatMap((route) => route.relatedFiles));
  return {
    changeScopeVersion: 1,
    workspace: input.workspace,
    repository: input.repository,
    repositoryIdentity,
    traversal,
    anchors: resolvedAnchors,
    selected,
    affected: affectedPaths,
    testRoutes,
    contracts,
    decisions,
    reviewers,
    architectureFindings,
    evidenceCounts: {
      declared: resolvedAnchors.length,
      observed: selected.length + contracts.length + decisions.length + reviewers.length,
      derived: affectedPaths.length + routedTestPaths.size + architectureFindings.length,
      unresolved: resolvedAnchors.filter((anchor) => anchor.status === "unresolved").length
    },
    bounded: { truncated: omitted.size > 0, omittedNodes: omitted.size },
    diagnostics: diagnostics.sort((left, right) => left.code.localeCompare(right.code) || left.message.localeCompare(right.message))
  };
}

export function renderChangeScopeMarkdown(result: ChangeScopeResult): string {
  const lines = [
    "# FixMap Change Scope",
    "",
    `Explicit scope in ${markdownCode(result.repository)} (${markdownCode(result.workspace)}). ` +
      `Traversal: ${result.traversal.direction}, depth ${result.traversal.maxDepth}, at most ${result.traversal.maxNodes.toLocaleString()} nodes.`,
    "",
    "## Declared anchors",
    "",
    ...listOrNone(result.anchors.map((anchor) =>
      `- ${anchor.operation} ${markdownCode(anchor.path)}: ${anchor.status}` +
      `${anchor.matchedPaths.length > 0 ? ` (${anchor.matchedPaths.length.toLocaleString()} existing ${anchor.matchedPaths.length === 1 ? "path" : "paths"})` : ""}`
    )),
    "",
    "## Selected scope",
    "",
    ...listOrNone(result.selected.map((entry) => `- ${markdownCode(entry.path)}: ${entry.evidence.map((item) => item.reason).join("; ")}`)),
    "",
    "## Structural consequences",
    "",
    ...listOrNone(result.affected.map((entry) =>
      `- ${markdownCode(entry.path)} (distance ${entry.distance}): ${entry.evidence.map((item) => item.reason).join("; ")}`
    )),
    "",
    "## Tests and checks",
    "",
    ...listOrNone(result.testRoutes.map((route) =>
      `- ${markdownCode(route.command)}: ${route.reason}` +
      `${route.relatedFiles.length > 0 ? `. Related: ${route.relatedFiles.map(markdownCode).join(", ")}.` : "."}`
    )),
    "",
    "## Contracts and decisions",
    "",
    ...listOrNone([
      ...result.contracts.map((contract) => `- contract ${markdownCode(contract.name)} (${contract.kind}) from ${markdownCode(contract.path)}`),
      ...result.decisions.map((decision) => `- decision ${markdownCode(decision.title)} (${decision.status}) from ${markdownCode(decision.path)}`)
    ]),
    "",
    "## Review and architecture",
    "",
    ...listOrNone([
      ...result.reviewers.map((reviewer) =>
        `- reviewer ${markdownCode(reviewer.reviewer)} (${reviewer.confidence} confidence) for ${reviewer.paths.map(markdownCode).join(", ")}`
      ),
      ...result.architectureFindings.map((finding) => `- ${finding.severity} ${markdownCode(finding.ruleId)}: ${finding.message}`)
    ]),
    "",
    "## Evidence accounting",
    "",
    `- Declared anchors: ${result.evidenceCounts.declared.toLocaleString()}`,
    `- Observed repository items: ${result.evidenceCounts.observed.toLocaleString()}`,
    `- Derived structural items: ${result.evidenceCounts.derived.toLocaleString()}`,
    `- Unresolved anchors: ${result.evidenceCounts.unresolved.toLocaleString()}`,
    `- Bounded output: ${result.bounded.truncated ? `yes; ${result.bounded.omittedNodes.toLocaleString()} observed nodes omitted` : "no"}`,
    "",
    "## Diagnostics",
    "",
    ...listOrNone(result.diagnostics.map((diagnostic) => `- **${diagnostic.severity}** ${diagnostic.message}`)),
    "",
    "FixMap expanded explicit repository evidence only. It did not interpret the product meaning of the anchor names.",
    ""
  ];
  return lines.join("\n");
}

function normalizeTraversal(input: ChangeScopeInput): ChangeScopeTraversal {
  const direction = input.direction ?? "both";
  if (!(["dependencies", "dependents", "both"] as const).includes(direction)) {
    throw new Error(`Invalid change-scope direction: ${String(direction)}.`);
  }
  const maxDepth = input.maxDepth ?? 2;
  const maxNodes = input.maxNodes ?? 200;
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || maxDepth > MAX_DEPTH) {
    throw new Error(`Change-scope maxDepth must be an integer from 0 to ${MAX_DEPTH}.`);
  }
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 1 || maxNodes > MAX_NODES) {
    throw new Error(`Change-scope maxNodes must be an integer from 1 to ${MAX_NODES}.`);
  }
  return { direction, maxDepth, maxNodes };
}

function normalizeAnchor(anchor: ChangeScopeAnchor): ChangeScopeAnchor {
  if (anchor.operation !== "touch" && anchor.operation !== "add") {
    throw new Error(`Invalid change-scope operation: ${String(anchor.operation)}.`);
  }
  const path = anchor.path.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path.length > 1_000 || path.includes("\0") || /^[\/]/.test(path) || /^[A-Za-z]:/.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid change-scope path: ${anchor.path}`);
  }
  return { operation: anchor.operation, path };
}

function scopeNeighbors(
  graph: ReturnType<typeof buildImportGraph>,
  path: string,
  direction: ChangeScopeDirection
): Array<{ path: string; evidence: ChangeScopeEvidence }> {
  const neighbors: Array<{ path: string; evidence: ChangeScopeEvidence }> = [];
  if (direction === "dependencies" || direction === "both") {
    for (const target of graph.imports.get(path) ?? []) {
      neighbors.push({
        path: target,
        evidence: { kind: "dependency", from: path, to: target, reason: `${path} imports ${target}.` }
      });
    }
  }
  if (direction === "dependents" || direction === "both") {
    for (const dependent of graph.importedBy.get(path) ?? []) {
      neighbors.push({
        path: dependent,
        evidence: { kind: "dependent", from: dependent, to: path, reason: `${dependent} imports ${path}.` }
      });
    }
  }
  return neighbors.sort((left, right) => left.path.localeCompare(right.path) || left.evidence.kind.localeCompare(right.evidence.kind));
}

function scopePath(
  repositoryIdentity: string,
  file: RepoFile,
  path: string,
  role: ChangeScopePath["role"],
  distance: number,
  evidence: ChangeScopeEvidence[],
  input: Pick<ChangeScopeInput, "workspace" | "repository">
): ChangeScopePath {
  return {
    identity: createGraphIdentity({
      workspace: input.workspace,
      kind: "file",
      repository: input.repository,
      parent: repositoryIdentity,
      key: path
    }),
    path,
    role,
    distance,
    ...(file.contentFingerprint ? { sourceFingerprint: file.contentFingerprint } : {}),
    evidence: [...evidence].sort((left, right) => left.kind.localeCompare(right.kind) || left.reason.localeCompare(right.reason))
  };
}

function pathOrder(left: ChangeScopePath, right: ChangeScopePath): number {
  return left.distance - right.distance || left.path.localeCompare(right.path);
}

function evidenceKey(evidence: ChangeScopeEvidence): string {
  return `${evidence.kind}\0${evidence.from ?? ""}\0${evidence.to}\0${evidence.reason}`;
}

function listOrNone(values: string[]): string[] {
  return values.length > 0 ? values : ["- None found"];
}
