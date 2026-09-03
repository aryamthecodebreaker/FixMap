import { describe, expect, it } from "vitest";
import { createGraphIdentity } from "../src/identity-graph.js";
import { comparePlanAlternatives, type PlanAlternative } from "../src/plan-alternatives.js";

const workspace = "company";
const auth = createGraphIdentity({ workspace, kind: "file", repository: "api", key: "src/auth.ts" });
const session = createGraphIdentity({ workspace, kind: "file", repository: "api", key: "src/session.ts" });
const contract = createGraphIdentity({ workspace, kind: "contract", repository: "api", key: "auth-api" });

function alternative(id: string, overrides: Partial<PlanAlternative> = {}): PlanAlternative {
  return {
    planAlternativeVersion: 1,
    id,
    graphFingerprint: "graph:0123456789abcdef",
    edits: [auth],
    impacts: [],
    contracts: [{ identity: contract, compatibility: "compatible", reason: "No public entry is removed." }],
    policyFindings: [],
    tests: [{ command: "npm test -- auth", covers: [auth], reason: "Covers the intended auth edit." }],
    reversibility: { mode: "full", reason: "Single reversible code change.", rollbackSteps: ["Revert the auth commit."] },
    uncertainties: [],
    ...overrides
  };
}

describe("alternative plan comparison", () => {
  it("compares every required tradeoff axis without inventing a winner score", () => {
    const safe = alternative("safe");
    const risky = alternative("risky", {
      impacts: [session],
      contracts: [{ identity: contract, compatibility: "breaking", reason: "Removes the legacy session field." }],
      policyFindings: [{ ruleId: "auth-boundary", severity: "error", message: "Crosses the auth boundary." }],
      tests: [],
      reversibility: { mode: "none", reason: "Destructive data rewrite.", rollbackSteps: [] },
      uncertainties: [{ id: "consumer-coverage", severity: "high", detail: "External consumers are not inventoried." }]
    });
    const comparison = comparePlanAlternatives([risky, safe]);
    const riskyAssessment = comparison.alternatives.find((entry) => entry.id === "risky")!;

    expect(riskyAssessment.metrics).toMatchObject({
      impactIdentities: 1,
      totalBlastRadiusIdentities: 3,
      breakingContracts: 1,
      policyErrors: 1,
      uncoveredEditIdentities: [auth],
      reversibility: "none",
      highUncertainties: 1
    });
    expect(riskyAssessment.evidence.map((entry) => entry.axis)).toEqual([
      "edits", "impact", "contracts", "policy", "tests", "reversibility", "uncertainty"
    ]);
    expect(comparison.pairwise[0]?.differences.map((entry) => entry.axis)).toEqual(expect.arrayContaining([
      "impact-identities", "blast-radius-identities", "breaking-contracts", "policy-errors", "planned-tests", "uncovered-edits", "reversibility", "high-uncertainties"
    ]));
    expect(comparison.nonDominatedAlternatives).toEqual(["safe"]);
    expect(comparison).not.toHaveProperty("winner");
    expect(comparison).not.toHaveProperty("score");
  });

  it("keeps real tradeoffs on the non-dominated frontier", () => {
    const smaller = alternative("smaller", {
      tests: [],
      reversibility: { mode: "partial", reason: "Cache state may remain.", rollbackSteps: ["Revert code."] }
    });
    const broader = alternative("broader", {
      edits: [auth, session],
      tests: [
        { command: "npm test -- auth", covers: [auth], reason: "Covers auth." },
        { command: "npm test -- session", covers: [session], reason: "Covers session." }
      ]
    });
    expect(comparePlanAlternatives([smaller, broader]).nonDominatedAlternatives).toEqual(["broader", "smaller"]);
  });

  it("rejects comparisons across different graph states and invalid coverage claims", () => {
    expect(() => comparePlanAlternatives([
      alternative("a"),
      alternative("b", { graphFingerprint: "graph:fedcba9876543210" })
    ])).toThrow("same exact graph fingerprint");
    expect(() => comparePlanAlternatives([
      alternative("a"),
      alternative("b", { tests: [{ command: "npm test", covers: [session], reason: "Wrong scope." }] })
    ])).toThrow("outside its edit set");
  });

  it("is deterministic across alternative and identity order", () => {
    const a = alternative("a", { edits: [auth, session], impacts: [session, auth] });
    const b = alternative("b");
    expect(comparePlanAlternatives([a, b])).toEqual(comparePlanAlternatives([
      b,
      { ...a, edits: [...a.edits].reverse(), impacts: [...a.impacts].reverse() }
    ]));
  });
});
