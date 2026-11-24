import type { IdentityGraph } from "./identity-graph.js";

/** Optional line ranges narrow an edit zone; two edits of one identity with disjoint ranges are a warning, not a conflict. */
export type ChangeZone = { identity: string; label?: string; ranges?: Array<{ startLine: number; endLine: number }> };

export type ChangeIntent = {
  changeIntentVersion: 1;
  id: string;
  baseGraphFingerprint: string;
  edits: ChangeZone[];
  impacts: ChangeZone[];
  contracts: ChangeZone[];
};

export type ChangeConflict = {
  id: string;
  kind: "edit-edit" | "edit-disjoint-ranges" | "edit-impact" | "contract-contract" | "stale-baseline";
  severity: "warning" | "error";
  intents: [string, string];
  identities: string[];
  message: string;
  evidence: Array<{ intent: string; zone: "edit" | "impact" | "contract" | "baseline"; identity?: string; detail: string }>;
};

export type ChangeConflictAnalysis = {
  changeConflictAnalysisVersion: 1;
  intents: string[];
  conflicts: ChangeConflict[];
};

const INTENT_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const FINGERPRINT = /^[A-Za-z0-9][A-Za-z0-9._:-]{5,255}$/;
const MAX_INTENTS = 100;
const MAX_ZONES = 1_000;

/** Compare explicit change zones. Names and labels never establish identity or equivalence. */
export function detectChangeConflicts(
  candidates: readonly ChangeIntent[],
  graph?: IdentityGraph
): ChangeConflictAnalysis {
  if (candidates.length > MAX_INTENTS) throw new Error(`Conflict analysis supports at most ${MAX_INTENTS} intents.`);
  const intents = candidates.map(validateIntent).sort((a, b) => a.id.localeCompare(b.id));
  const duplicate = intents.find((intent, index) => intents.findIndex((value) => value.id === intent.id) !== index);
  if (duplicate) throw new Error(`Duplicate change intent id: ${duplicate.id}`);
  const canonical = equivalenceResolver(graph);
  const conflicts: ChangeConflict[] = [];

  for (let leftIndex = 0; leftIndex < intents.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < intents.length; rightIndex += 1) {
      const left = intents[leftIndex]!;
      const right = intents[rightIndex]!;
      if (left.baseGraphFingerprint !== right.baseGraphFingerprint) {
        conflicts.push(conflict("stale-baseline", "warning", left, right, [], [
          { intent: left.id, zone: "baseline", detail: left.baseGraphFingerprint },
          { intent: right.id, zone: "baseline", detail: right.baseGraphFingerprint }
        ], "The plans were built from different graph versions; refresh before treating non-overlap as safe."));
      }
      const leftEdits = zoneMap(left.edits, canonical);
      const rightEdits = zoneMap(right.edits, canonical);
      const leftImpacts = zoneMap(left.impacts, canonical);
      const rightImpacts = zoneMap(right.impacts, canonical);
      const leftContracts = zoneMap(left.contracts, canonical);
      const rightContracts = zoneMap(right.contracts, canonical);

      const sharedEdits = intersection(leftEdits, rightEdits);
      const disjoint = sharedEdits.filter((identity) => rangesDisjoint(leftEdits.get(identity)!, rightEdits.get(identity)!));
      const overlapping = sharedEdits.filter((identity) => !disjoint.includes(identity));
      if (overlapping.length > 0) conflicts.push(zoneConflict(
        "edit-edit", "error", left, right, overlapping, "edit", "edit",
        "Both plans intend to edit the same graph identity."
      ));
      if (disjoint.length > 0) conflicts.push(zoneConflict(
        "edit-disjoint-ranges", "warning", left, right, disjoint, "edit", "edit",
        "Both plans edit the same file, in line ranges that do not overlap; coordinate the merge."
      ));
      const leftIntoRight = intersection(leftEdits, rightImpacts);
      if (leftIntoRight.length > 0) conflicts.push(zoneConflict(
        "edit-impact", "warning", left, right, leftIntoRight, "edit", "impact",
        `${left.id} edits identities in ${right.id}'s impact zone.`
      ));
      const rightIntoLeft = intersection(rightEdits, leftImpacts);
      if (rightIntoLeft.length > 0) conflicts.push(zoneConflict(
        "edit-impact", "warning", right, left, rightIntoLeft, "edit", "impact",
        `${right.id} edits identities in ${left.id}'s impact zone.`
      ));
      const sharedContracts = intersection(leftContracts, rightContracts);
      if (sharedContracts.length > 0) conflicts.push(zoneConflict(
        "contract-contract", "warning", left, right, sharedContracts, "contract", "contract",
        "Both plans touch the same contract identity."
      ));
    }
  }
  return {
    changeConflictAnalysisVersion: 1,
    intents: intents.map((intent) => intent.id),
    conflicts: conflicts.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity) ||
      a.kind.localeCompare(b.kind) || a.id.localeCompare(b.id))
  };
}

function validateIntent(intent: ChangeIntent): ChangeIntent {
  if (!intent || intent.changeIntentVersion !== 1 || !INTENT_ID.test(intent.id) || !FINGERPRINT.test(intent.baseGraphFingerprint)) {
    throw new Error("Invalid change intent envelope.");
  }
  return {
    changeIntentVersion: 1,
    id: intent.id,
    baseGraphFingerprint: intent.baseGraphFingerprint,
    edits: validateZones(intent.edits, "edits"),
    impacts: validateZones(intent.impacts, "impacts"),
    contracts: validateZones(intent.contracts, "contracts")
  };
}

function validateZones(zones: readonly ChangeZone[], label: string): ChangeZone[] {
  if (!Array.isArray(zones) || zones.length > MAX_ZONES) throw new Error(`Invalid or excessive ${label} zones.`);
  const result = zones.map((zone) => {
    if (!zone || typeof zone.identity !== "string" || !zone.identity.startsWith("fixmap://") || zone.identity.length > 2_048 ||
      (zone.label !== undefined && (typeof zone.label !== "string" || !zone.label.trim() || zone.label.length > 500))) {
      throw new Error(`Invalid ${label} change zone.`);
    }
    return { identity: zone.identity, ...(zone.label ? { label: zone.label.trim() } : {}), ...(zone.ranges !== undefined ? { ranges: validateRanges(zone.ranges, label) } : {}) };
  }).sort((a, b) => a.identity.localeCompare(b.identity));
  return result.filter((zone, index) => result.findIndex((value) => value.identity === zone.identity) === index);
}

function validateRanges(ranges: unknown, label: string): Array<{ startLine: number; endLine: number }> {
  if (!Array.isArray(ranges) || ranges.length === 0 || ranges.length > 50) throw new Error(`Invalid ${label} change zone ranges.`);
  return ranges.map((range: { startLine?: unknown; endLine?: unknown }) => {
    if (!Number.isInteger(range?.startLine) || !Number.isInteger(range?.endLine) || (range.startLine as number) < 1 || (range.endLine as number) < (range.startLine as number)) {
      throw new Error(`Invalid ${label} change zone range.`);
    }
    return { startLine: range.startLine as number, endLine: range.endLine as number };
  }).sort((a, b) => a.startLine - b.startLine || a.endLine - b.endLine);
}

/** Only provably separate edits are disjoint: both sides must name ranges, and no pair may overlap. */
function rangesDisjoint(left: ChangeZone, right: ChangeZone): boolean {
  if (!left.ranges || !right.ranges) return false;
  return left.ranges.every((a) => right.ranges!.every((b) => a.endLine < b.startLine || b.endLine < a.startLine));
}

function equivalenceResolver(graph?: IdentityGraph): (identity: string) => string {
  const parent = new Map<string, string>();
  const find = (value: string): string => {
    const current = parent.get(value);
    if (!current || current === value) return value;
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const a = find(left);
    const b = find(right);
    if (a === b) return;
    const [root, child] = [a, b].sort();
    parent.set(child!, root!);
    parent.set(root!, root!);
  };
  for (const edge of graph?.edges ?? []) {
    if (edge.kind === "aliases" || edge.kind === "equivalent-to") union(edge.from, edge.to);
  }
  return find;
}

function zoneMap(zones: readonly ChangeZone[], canonical: (identity: string) => string): Map<string, ChangeZone> {
  const result = new Map<string, ChangeZone>();
  for (const zone of zones) if (!result.has(canonical(zone.identity))) result.set(canonical(zone.identity), zone);
  return result;
}

function intersection(left: ReadonlyMap<string, ChangeZone>, right: ReadonlyMap<string, ChangeZone>): string[] {
  return [...left.keys()].filter((identity) => right.has(identity)).sort();
}

function zoneConflict(
  kind: ChangeConflict["kind"],
  severity: ChangeConflict["severity"],
  left: ChangeIntent,
  right: ChangeIntent,
  identities: string[],
  leftZone: "edit" | "impact" | "contract",
  rightZone: "edit" | "impact" | "contract",
  message: string
): ChangeConflict {
  return conflict(kind, severity, left, right, identities, identities.flatMap((identity) => [
    { intent: left.id, zone: leftZone, identity, detail: `${left.id} declares ${identity} as ${leftZone}.` },
    { intent: right.id, zone: rightZone, identity, detail: `${right.id} declares ${identity} as ${rightZone}.` }
  ]), message);
}

function conflict(
  kind: ChangeConflict["kind"],
  severity: ChangeConflict["severity"],
  left: ChangeIntent,
  right: ChangeIntent,
  identities: string[],
  evidence: ChangeConflict["evidence"],
  message: string
): ChangeConflict {
  const intents = [left.id, right.id].sort() as [string, string];
  const evidenceKey = evidence.map((entry) => `${entry.intent}:${entry.zone}:${entry.identity ?? entry.detail}`).sort().join("\0");
  return {
    id: `change-conflict:${stableHash(`${kind}\0${intents.join("\0")}\0${identities.join("\0")}\0${evidenceKey}`)}`,
    kind,
    severity,
    intents,
    identities,
    message,
    evidence
  };
}

function severityOrder(value: ChangeConflict["severity"]): number { return value === "error" ? 0 : 1; }

function stableHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}
