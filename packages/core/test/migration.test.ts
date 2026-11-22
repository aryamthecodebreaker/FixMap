import { describe, expect, it } from "vitest";
import { buildIdentityGraph, createGraphIdentity } from "../src/identity-graph.js";
import { buildMigrationPlan, type MigrationStep } from "../src/migration.js";
import type { GraphEntityKind, IdentityGraphNode } from "../src/identity-graph.js";

const workspace = "company";
const repository = createGraphIdentity({ workspace, kind: "repository", key: "users" });
const schema = createGraphIdentity({ workspace, kind: "file", parent: repository, key: "db/schema.sql" });
const service = createGraphIdentity({ workspace, kind: "file", parent: repository, key: "src/users.ts" });
const consumer = createGraphIdentity({ workspace, kind: "file", parent: repository, key: "src/consumer.ts" });
const contract = createGraphIdentity({ workspace, kind: "contract", parent: repository, key: "users-api" });

function node(id: string, kind: GraphEntityKind, key: string, parent?: string): IdentityGraphNode {
  return { id, kind, key, ...(kind === "repository" ? {} : { repository: "users", parent }), derivedFrom: [] };
}

const graph = buildIdentityGraph({
  workspace,
  nodes: [
    node(repository, "repository", "users"),
    node(schema, "file", "db/schema.sql", repository),
    node(service, "file", "src/users.ts", repository),
    node(consumer, "file", "src/consumer.ts", repository),
    node(contract, "contract", "users-api", repository)
  ],
  edges: []
});

function step(id: string, overrides: Partial<MigrationStep> = {}): MigrationStep {
  return {
    id,
    summary: `Perform ${id}`,
    dependsOn: [],
    edits: [service],
    impacts: [consumer],
    contracts: [contract],
    compatibility: { mode: "not-required", reason: "Internal-only atomic change." },
    tests: [{ command: `npm test -- ${id}`, reason: `Verify ${id}.` }],
    rollback: { trigger: `${id} verification fails.`, action: `Revert ${id}.` },
    ...overrides
  };
}

describe("migration planner", () => {
  it("builds dependency phases with compatibility, tests, rollback, and per-phase blast radius", () => {
    const plan = buildMigrationPlan(graph, [
      step("contract", { dependsOn: ["dual-write"], edits: [consumer] }),
      step("expand", {
        edits: [schema],
        compatibility: {
          mode: "backward-compatible",
          reason: "Add the nullable column before writers use it.",
          exitCriteria: "Every supported deployment reads both schemas."
        }
      }),
      step("dual-write", {
        dependsOn: ["expand"],
        compatibility: {
          mode: "dual-write",
          reason: "Keep old and new fields synchronized during rollout.",
          exitCriteria: "All consumers read the new field and backfill is complete."
        }
      })
    ]);

    expect(plan.graphFingerprint).toBe(graph.version.fingerprint);
    expect(plan.phases.map((phase) => phase.stepIds)).toEqual([["expand"], ["dual-write"], ["contract"]]);
    expect(plan.phases[1]).toMatchObject({
      prerequisites: ["expand"],
      compatibilityWindows: [{ stepId: "dual-write", strategy: expect.objectContaining({ mode: "dual-write" }) }],
      tests: [expect.objectContaining({ stepId: "dual-write", command: "npm test -- dual-write" })],
      rollbackPoints: [expect.objectContaining({ stepId: "dual-write", action: "Revert dual-write." })],
      blastRadius: { totalIdentities: 3 }
    });
    expect(plan.fingerprint).toMatch(/^migration:[a-f0-9]{16}$/);
  });

  it("rejects dependency cycles, unknown identities, and incomplete safety details", () => {
    expect(() => buildMigrationPlan(graph, [
      step("a", { dependsOn: ["b"] }),
      step("b", { dependsOn: ["a"] })
    ])).toThrow("dependency cycle");
    expect(() => buildMigrationPlan(graph, [step("missing", { edits: ["fixmap://missing"] })]))
      .toThrow("absent from the graph");
    expect(() => buildMigrationPlan(graph, [step("untested", { tests: [] })]))
      .toThrow("Invalid migration step");
    expect(() => buildMigrationPlan(graph, [step("window", {
      compatibility: { mode: "dual-read", reason: "Read both formats." }
    })])).toThrow("exit criteria");
    expect(() => buildMigrationPlan(graph, [step("parallel-a"), step("parallel-b")]))
      .toThrow("add an explicit dependency");
  });

  it("is deterministic across input and identity order", () => {
    const first = step("first", { edits: [schema, service], impacts: [consumer, service] });
    const second = step("second", { edits: [consumer], dependsOn: ["first"] });
    const a = buildMigrationPlan(graph, [first, second]);
    const b = buildMigrationPlan(graph, [
      second,
      { ...first, edits: [...first.edits].reverse(), impacts: [...first.impacts].reverse() }
    ]);
    expect(a).toEqual(b);
  });
});
