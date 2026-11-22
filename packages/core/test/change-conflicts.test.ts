import { describe, expect, it } from "vitest";
import { detectChangeConflicts, type ChangeIntent } from "../src/change-conflicts.js";
import { buildIdentityGraph, createGraphEquivalence, createGraphIdentity } from "../src/identity-graph.js";
import type { IdentityGraphNode } from "../src/identity-graph.js";

const workspace = "company";
const authRepository = createGraphIdentity({ workspace, kind: "repository", key: "auth" });
const paymentsRepository = createGraphIdentity({ workspace, kind: "repository", key: "payments" });
const authFile = createGraphIdentity({ workspace, kind: "file", repository: "auth", key: "src/user.ts" });
const paymentsFile = createGraphIdentity({ workspace, kind: "file", repository: "payments", key: "src/user.ts" });
const authContract = createGraphIdentity({ workspace, kind: "contract", repository: "auth", key: "users-api" });

function intent(id: string, overrides: Partial<ChangeIntent> = {}): ChangeIntent {
  return {
    changeIntentVersion: 1,
    id,
    baseGraphFingerprint: "graph:0123456789abcdef",
    edits: [], impacts: [], contracts: [],
    ...overrides
  };
}

function node(
  id: string,
  kind: IdentityGraphNode["kind"],
  key: string,
  repository?: string,
  parent?: string
): IdentityGraphNode {
  return { id, kind, key, ...(repository ? { repository } : {}), ...(parent ? { parent } : {}), derivedFrom: [] };
}

describe("change conflict detection", () => {
  it("finds edit/edit, directed edit/impact, contract, and stale-baseline conflicts with evidence", () => {
    const result = detectChangeConflicts([
      intent("agent-a", { edits: [{ identity: authFile }], contracts: [{ identity: authContract }] }),
      intent("agent-b", {
        baseGraphFingerprint: "graph:fedcba9876543210",
        edits: [{ identity: authFile }],
        impacts: [{ identity: authFile }],
        contracts: [{ identity: authContract }]
      })
    ]);

    expect(result.conflicts).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "edit-edit", severity: "error", identities: [authFile] }),
      expect.objectContaining({ kind: "edit-impact", severity: "warning", identities: [authFile] }),
      expect.objectContaining({ kind: "contract-contract", identities: [authContract] }),
      expect.objectContaining({ kind: "stale-baseline", identities: [] })
    ]));
    expect(result.conflicts.every((conflict) => conflict.evidence.length > 0)).toBe(true);
    expect(new Set(result.conflicts.map((conflict) => conflict.id)).size).toBe(result.conflicts.length);
  });

  it("does not confuse matching labels across repositories", () => {
    const result = detectChangeConflicts([
      intent("auth-agent", { edits: [{ identity: authFile, label: "UserService" }] }),
      intent("payments-agent", { edits: [{ identity: paymentsFile, label: "UserService" }] })
    ]);
    expect(result.conflicts).toEqual([]);
  });

  it("uses only explicit graph alias/equivalence edges to canonicalize zones", () => {
    const graph = buildIdentityGraph({
      workspace,
      nodes: [
        node(authRepository, "repository", "auth"),
        node(paymentsRepository, "repository", "payments"),
        node(authFile, "file", "src/user.ts", "auth", authRepository),
        node(paymentsFile, "file", "src/user.ts", "payments", paymentsRepository)
      ],
      edges: [createGraphEquivalence({
        kind: "equivalent-to",
        from: authFile,
        to: paymentsFile,
        reason: "Reviewed shared generated contract projection."
      })]
    });
    const result = detectChangeConflicts([
      intent("auth-agent", { edits: [{ identity: authFile }] }),
      intent("payments-agent", { edits: [{ identity: paymentsFile }] })
    ], graph);
    expect(result.conflicts).toContainEqual(expect.objectContaining({ kind: "edit-edit", severity: "error" }));
  });

  it("is deterministic across input and zone order", () => {
    const a = intent("a", { edits: [{ identity: authFile }, { identity: paymentsFile }] });
    const b = intent("b", { impacts: [{ identity: paymentsFile }, { identity: authFile }] });
    expect(detectChangeConflicts([a, b])).toEqual(detectChangeConflicts([
      { ...b, impacts: [...b.impacts].reverse() },
      { ...a, edits: [...a.edits].reverse() }
    ]));
  });
});
