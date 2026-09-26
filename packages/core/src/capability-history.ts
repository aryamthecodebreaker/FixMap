import { scanRepoAtRef } from "./architecture-history.js";
import type { HistoricalRepoMap } from "./architecture-history.js";
import { buildCapabilityMap, capabilityStoreFromRepo } from "./capabilities.js";
import type { CapabilityDefinition, CapabilityMap } from "./capabilities.js";
import { markdownCode } from "./markdown.js";

export type CapabilityRefSnapshot = {
  requestedRef: string;
  commit: string;
  state: "present" | "absent";
  capability?: CapabilityDefinition;
  map?: CapabilityMap;
  testAssociations: Array<{ path: string; sourceFingerprint: string }>;
  reason?: string;
};

export type CapabilityPathDiff = {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
};

export type CapabilityEntityDiff = {
  added: string[];
  removed: string[];
  modified: string[];
  unchanged: string[];
};

export type CapabilityHistoryDiff = {
  capabilityHistoryVersion: 1;
  id: string;
  from: CapabilityRefSnapshot;
  to: CapabilityRefSnapshot;
  definitionChanged: boolean;
  selected: CapabilityPathDiff;
  affected: CapabilityPathDiff;
  contracts: CapabilityEntityDiff;
  decisions: CapabilityEntityDiff;
  testAssociations: CapabilityEntityDiff;
  reviewers: CapabilityEntityDiff;
  architectureFindings: CapabilityEntityDiff;
  summary: string;
};

/** Compare two exact committed capability maps without checkout or worktree mutation. */
export async function compareCapabilityRefs(input: {
  repoRoot: string;
  id: string;
  fromRef: string;
  toRef: string;
  asOf: string;
}): Promise<CapabilityHistoryDiff> {
  if (!Number.isFinite(Date.parse(input.asOf))) throw new Error("Capability history requires a valid asOf timestamp.");
  const id = input.id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id)) throw new Error("Capability history requires a valid capability id.");
  const [historicalFrom, historicalTo] = await Promise.all([
    scanRepoAtRef({ repoRoot: input.repoRoot, ref: input.fromRef }),
    scanRepoAtRef({ repoRoot: input.repoRoot, ref: input.toRef })
  ]);
  const from = capabilitySnapshot(historicalFrom, id, input.asOf);
  const to = capabilitySnapshot(historicalTo, id, input.asOf);
  const selected = comparePaths(from.map?.scope.selected ?? [], to.map?.scope.selected ?? []);
  const affected = comparePaths(from.map?.scope.affected ?? [], to.map?.scope.affected ?? []);
  const contracts = compareEntities(
    from.map?.scope.contracts.map((entry) => ({ id: entry.id, fingerprint: `${entry.sourceFingerprint}\0${canonicalize(entry.entries)}` })) ?? [],
    to.map?.scope.contracts.map((entry) => ({ id: entry.id, fingerprint: `${entry.sourceFingerprint}\0${canonicalize(entry.entries)}` })) ?? []
  );
  const decisions = compareEntities(
    from.map?.scope.decisions.map((entry) => ({ id: entry.id, fingerprint: entry.sourceFingerprint })) ?? [],
    to.map?.scope.decisions.map((entry) => ({ id: entry.id, fingerprint: entry.sourceFingerprint })) ?? []
  );
  const testAssociations = compareEntities(
    from.testAssociations.map((entry) => ({ id: entry.path, fingerprint: entry.sourceFingerprint })),
    to.testAssociations.map((entry) => ({ id: entry.path, fingerprint: entry.sourceFingerprint }))
  );
  const reviewers = compareEntities(reviewerEntities(from.map), reviewerEntities(to.map));
  const architectureFindings = compareEntities(findingEntities(from.map), findingEntities(to.map));
  const definitionChanged = canonicalize(from.capability ?? null) !== canonicalize(to.capability ?? null);
  const totalChanges = [selected, affected, contracts, decisions, testAssociations, reviewers, architectureFindings]
    .reduce((total, diff) => total + diff.added.length + diff.removed.length + diff.modified.length, definitionChanged ? 1 : 0);
  return {
    capabilityHistoryVersion: 1,
    id,
    from,
    to,
    definitionChanged,
    selected,
    affected,
    contracts,
    decisions,
    testAssociations,
    reviewers,
    architectureFindings,
    summary: totalChanges === 0
      ? `Capability ${id} has no evidenced change between ${from.commit} and ${to.commit}.`
      : `Capability ${id} has ${totalChanges.toLocaleString()} evidenced ${totalChanges === 1 ? "change" : "changes"} between ${from.commit} and ${to.commit}.`
  };
}

export function renderCapabilityHistoryMarkdown(diff: CapabilityHistoryDiff): string {
  const lines = [
    `# FixMap Capability Diff: ${diff.id}`,
    "",
    diff.summary,
    "",
    `From ${markdownCode(diff.from.requestedRef)} at ${markdownCode(diff.from.commit)}: ${diff.from.state}.`,
    `To ${markdownCode(diff.to.requestedRef)} at ${markdownCode(diff.to.commit)}: ${diff.to.state}.`,
    `Definition changed: ${diff.definitionChanged ? "yes" : "no"}.`,
    "",
    "## Selected scope",
    "",
    ...renderDiff(diff.selected),
    "",
    "## Structural consequences",
    "",
    ...renderDiff(diff.affected),
    "",
    "## Contracts",
    "",
    ...renderDiff(diff.contracts),
    "",
    "## Decisions",
    "",
    ...renderDiff(diff.decisions),
    "",
    "## Test associations",
    "",
    ...renderDiff(diff.testAssociations),
    "",
    "## Reviewers",
    "",
    ...renderDiff(diff.reviewers),
    "",
    "## Architecture findings",
    "",
    ...renderDiff(diff.architectureFindings),
    "",
    "Both sides were read from immutable Git objects. FixMap did not check out either ref or interpret product semantics.",
    ""
  ];
  return lines.join("\n");
}

function capabilitySnapshot(historical: HistoricalRepoMap, id: string, asOf: string): CapabilityRefSnapshot {
  const loaded = capabilityStoreFromRepo(historical.repo);
  if (!loaded) {
    return {
      requestedRef: historical.requestedRef,
      commit: historical.commit,
      state: "absent",
      testAssociations: [],
      reason: ".fixmap/capabilities.json is absent at this ref."
    };
  }
  const capability = loaded.store.capabilities.find((entry) => entry.id === id);
  if (!capability) {
    return {
      requestedRef: historical.requestedRef,
      commit: historical.commit,
      state: "absent",
      testAssociations: [],
      reason: `Capability ${id} is absent at this ref.`
    };
  }
  const map = buildCapabilityMap(historical.repo, { id, asOf });
  const scopedPaths = new Set([...map.scope.selected, ...map.scope.affected].map((entry) => entry.path));
  const testAssociations = historical.repo.files
    .filter((file) => file.isTest && scopedPaths.has(file.path) && file.contentFingerprint)
    .map((file) => ({ path: file.path, sourceFingerprint: file.contentFingerprint! }))
    .sort((left, right) => left.path.localeCompare(right.path));
  return {
    requestedRef: historical.requestedRef,
    commit: historical.commit,
    state: "present",
    capability,
    map,
    testAssociations
  };
}

function comparePaths(
  previous: Array<{ path: string; sourceFingerprint?: string }>,
  current: Array<{ path: string; sourceFingerprint?: string }>
): CapabilityPathDiff {
  return compareMaps(
    new Map(previous.map((entry) => [entry.path, entry.sourceFingerprint ?? "unknown"])),
    new Map(current.map((entry) => [entry.path, entry.sourceFingerprint ?? "unknown"]))
  );
}

function compareEntities(previous: Array<{ id: string; fingerprint: string }>, current: Array<{ id: string; fingerprint: string }>): CapabilityEntityDiff {
  return compareMaps(new Map(previous.map((entry) => [entry.id, entry.fingerprint])), new Map(current.map((entry) => [entry.id, entry.fingerprint])));
}

function compareMaps(previous: Map<string, string>, current: Map<string, string>): CapabilityPathDiff {
  const keys = [...new Set([...previous.keys(), ...current.keys()])].sort();
  const result: CapabilityPathDiff = { added: [], removed: [], modified: [], unchanged: [] };
  for (const key of keys) {
    if (!previous.has(key)) result.added.push(key);
    else if (!current.has(key)) result.removed.push(key);
    else if (previous.get(key) !== current.get(key)) result.modified.push(key);
    else result.unchanged.push(key);
  }
  return result;
}

function reviewerEntities(map: CapabilityMap | undefined): Array<{ id: string; fingerprint: string }> {
  return (map?.scope.reviewers ?? []).map((reviewer) => ({
    id: reviewer.reviewer,
    fingerprint: canonicalize({ paths: reviewer.paths, evidence: reviewer.evidence })
  }));
}

function findingEntities(map: CapabilityMap | undefined): Array<{ id: string; fingerprint: string }> {
  return (map?.scope.architectureFindings ?? []).map((finding) => ({
    id: `${finding.ruleId}:${finding.code}:${finding.paths.join("|")}`,
    fingerprint: canonicalize(finding)
  }));
}

function renderDiff(diff: CapabilityPathDiff | CapabilityEntityDiff): string[] {
  const lines = [
    ...diff.added.map((entry) => `- added ${markdownCode(entry)}`),
    ...diff.removed.map((entry) => `- removed ${markdownCode(entry)}`),
    ...diff.modified.map((entry) => `- modified ${markdownCode(entry)}`)
  ];
  return lines.length > 0 ? lines : ["- No evidenced changes"];
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
