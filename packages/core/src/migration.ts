import type { IdentityGraph } from "./identity-graph.js";

export type MigrationCompatibility = {
  mode: "not-required" | "backward-compatible" | "dual-read" | "dual-write" | "expand-contract";
  reason: string;
  exitCriteria?: string;
};

export type MigrationStep = {
  id: string;
  summary: string;
  dependsOn: string[];
  edits: string[];
  impacts: string[];
  contracts: string[];
  compatibility: MigrationCompatibility;
  tests: Array<{ command: string; reason: string }>;
  rollback: { trigger: string; action: string };
};

export type MigrationPhase = {
  phase: number;
  stepIds: string[];
  prerequisites: string[];
  compatibilityWindows: Array<{ stepId: string; strategy: MigrationCompatibility }>;
  tests: Array<{ stepId: string; command: string; reason: string }>;
  rollbackPoints: Array<{ stepId: string; trigger: string; action: string }>;
  blastRadius: {
    editIdentities: string[];
    impactIdentities: string[];
    contractIdentities: string[];
    totalIdentities: number;
  };
};

export type MigrationPlan = {
  migrationPlanVersion: 1;
  graphFingerprint: string;
  fingerprint: string;
  phases: MigrationPhase[];
};

const STEP_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const MAX_STEPS = 500;
const MAX_IDENTITIES = 2_000;
const MAX_TESTS = 100;

/** Build dependency-ordered migration phases against one exact identity-graph snapshot. */
export function buildMigrationPlan(graph: IdentityGraph, candidates: readonly MigrationStep[]): MigrationPlan {
  if (graph.identityGraphVersion !== 1 || !graph.version.fingerprint) throw new Error("Migration planning requires a version-1 identity graph.");
  if (candidates.length === 0 || candidates.length > MAX_STEPS) throw new Error(`Migration planning requires 1-${MAX_STEPS} steps.`);
  const graphIdentities = new Set(graph.nodes.map((node) => node.id));
  const steps = candidates.map((step) => validateStep(step, graphIdentities)).sort((a, b) => a.id.localeCompare(b.id));
  const byId = new Map<string, MigrationStep>();
  for (const step of steps) {
    if (byId.has(step.id)) throw new Error(`Duplicate migration step id: ${step.id}`);
    byId.set(step.id, step);
  }
  for (const step of steps) for (const dependency of step.dependsOn) {
    if (!byId.has(dependency)) throw new Error(`Migration step ${step.id} depends on unknown step ${dependency}.`);
    if (dependency === step.id) throw new Error(`Migration step ${step.id} cannot depend on itself.`);
  }

  const remaining = new Set(steps.map((step) => step.id));
  const completed = new Set<string>();
  const phases: MigrationPhase[] = [];
  while (remaining.size > 0) {
    const ready = [...remaining].filter((id) => byId.get(id)!.dependsOn.every((dependency) => completed.has(dependency))).sort();
    if (ready.length === 0) {
      throw new Error(`Migration dependency cycle detected among: ${[...remaining].sort().join(", ")}.`);
    }
    const phaseSteps = ready.map((id) => byId.get(id)!);
    assertParallelSafe(phaseSteps);
    phases.push(buildPhase(phases.length + 1, phaseSteps));
    for (const id of ready) {
      remaining.delete(id);
      completed.add(id);
    }
  }
  const canonical = { graphFingerprint: graph.version.fingerprint, phases };
  return {
    migrationPlanVersion: 1,
    graphFingerprint: graph.version.fingerprint,
    fingerprint: `migration:${stableHash(canonicalize(canonical))}`,
    phases
  };
}

function validateStep(step: MigrationStep, graphIdentities: ReadonlySet<string>): MigrationStep {
  if (!step || !STEP_ID.test(step.id) || !bounded(step.summary, 1_000) || !stringArray(step.dependsOn, MAX_STEPS, 128) ||
    !Array.isArray(step.tests) || step.tests.length === 0 || step.tests.length > MAX_TESTS ||
    !step.tests.every((test) => test && bounded(test.command, 1_000) && bounded(test.reason, 1_000)) ||
    !step.rollback || !bounded(step.rollback.trigger, 1_000) || !bounded(step.rollback.action, 2_000)) {
    throw new Error(`Invalid migration step ${step?.id ?? "<unknown>"}.`);
  }
  const edits = identities(step.edits, "edits", graphIdentities);
  if (edits.length === 0) throw new Error(`Migration step ${step.id} requires at least one edit identity.`);
  const impacts = identities(step.impacts, "impacts", graphIdentities);
  const contracts = identities(step.contracts, "contracts", graphIdentities);
  const compatibility = validateCompatibility(step.compatibility, step.id);
  return {
    id: step.id,
    summary: step.summary.trim(),
    dependsOn: [...new Set(step.dependsOn)].sort(),
    edits,
    impacts,
    contracts,
    compatibility,
    tests: step.tests.map((test) => ({ command: test.command.trim(), reason: test.reason.trim() }))
      .sort((a, b) => a.command.localeCompare(b.command) || a.reason.localeCompare(b.reason)),
    rollback: { trigger: step.rollback.trigger.trim(), action: step.rollback.action.trim() }
  };
}

function validateCompatibility(value: MigrationCompatibility, stepId: string): MigrationCompatibility {
  if (!value || !["not-required", "backward-compatible", "dual-read", "dual-write", "expand-contract"].includes(value.mode) ||
    !bounded(value.reason, 1_000) || (value.exitCriteria !== undefined && !bounded(value.exitCriteria, 1_000)) ||
    (value.mode !== "not-required" && !value.exitCriteria)) {
    throw new Error(`Migration step ${stepId} needs an explicit compatibility strategy and exit criteria.`);
  }
  return {
    mode: value.mode,
    reason: value.reason.trim(),
    ...(value.exitCriteria ? { exitCriteria: value.exitCriteria.trim() } : {})
  };
}

function identities(values: readonly string[], label: string, graphIdentities: ReadonlySet<string>): string[] {
  if (!Array.isArray(values) || values.length > MAX_IDENTITIES) throw new Error(`Invalid migration ${label} identities.`);
  const result = [...new Set(values)].sort();
  const invalid = result.find((identity) => typeof identity !== "string" || !graphIdentities.has(identity));
  if (invalid !== undefined) throw new Error(`Migration ${label} identity is absent from the graph: ${String(invalid)}`);
  return result;
}

function buildPhase(phase: number, steps: readonly MigrationStep[]): MigrationPhase {
  const editIdentities = unique(steps.flatMap((step) => step.edits));
  const impactIdentities = unique(steps.flatMap((step) => step.impacts));
  const contractIdentities = unique(steps.flatMap((step) => step.contracts));
  return {
    phase,
    stepIds: steps.map((step) => step.id),
    prerequisites: unique(steps.flatMap((step) => step.dependsOn)),
    compatibilityWindows: steps.map((step) => ({ stepId: step.id, strategy: step.compatibility })),
    tests: steps.flatMap((step) => step.tests.map((test) => ({ stepId: step.id, ...test }))),
    rollbackPoints: steps.map((step) => ({ stepId: step.id, ...step.rollback })),
    blastRadius: {
      editIdentities,
      impactIdentities,
      contractIdentities,
      totalIdentities: new Set([...editIdentities, ...impactIdentities, ...contractIdentities]).size
    }
  };
}

function assertParallelSafe(steps: readonly MigrationStep[]): void {
  for (let leftIndex = 0; leftIndex < steps.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < steps.length; rightIndex += 1) {
      const left = steps[leftIndex]!;
      const right = steps[rightIndex]!;
      const overlap = unique([
        ...left.edits.filter((identity) => right.edits.includes(identity)),
        ...left.contracts.filter((identity) => right.contracts.includes(identity))
      ]);
      if (overlap.length > 0) {
        throw new Error(
          `Parallel migration steps ${left.id} and ${right.id} overlap ${overlap.join(", ")}; add an explicit dependency.`
        );
      }
    }
  }
}

function unique(values: readonly string[]): string[] { return [...new Set(values)].sort(); }

function bounded(value: unknown, max: number): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function stringArray(value: unknown, maxEntries: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxEntries && value.every((entry) => bounded(entry, maxLength));
}

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
