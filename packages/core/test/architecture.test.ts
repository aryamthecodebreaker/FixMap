import { describe, expect, it } from "vitest";
import {
  architecturePolicyFromRepo,
  buildArchitectureSnapshot,
  compareArchitectureSnapshots,
  evaluateArchitecturePolicy,
  parseArchitecturePolicy
} from "../src/architecture.js";
import type { ContractComparison } from "../src/contracts.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string, isTest = false): RepoFile {
  return {
    path,
    contentFingerprint: `worktree:${hashChar(path).repeat(64)}`,
    extension: `.${path.split(".").at(-1)}`,
    sizeBytes: textSample.length,
    isTest,
    isSource: true,
    kind: path.endsWith(".json") ? "config" : "code",
    textSample,
    textSampleComplete: true
  };
}

function hashChar(value: string): string {
  return (value.length % 16).toString(16);
}

function repo(files: RepoFile[], changedFiles: string[] = []): RepoMap {
  return { root: "/repo", files, packageScripts: [], changedFiles, diffText: "", packageManager: "npm", diagnostics: [] };
}

const policyContent = JSON.stringify({
  architecturePolicyVersion: 1,
  boundaries: [{
    id: "ui-no-data",
    from: ["src/ui/**"],
    deny: ["src/data/**"],
    reason: "UI must use the service layer.",
    severity: "error",
    decisionId: "decision:boundary"
  }],
  requiredTests: [{
    id: "auth-tests",
    paths: ["src/auth/**"],
    tests: ["test/auth/**"],
    reason: "Authentication changes need regression coverage.",
    severity: "warning"
  }],
  requiredReviews: [{
    id: "billing-review",
    paths: ["src/billing/**"],
    reviewers: ["payments-team"],
    reason: "Billing has financial impact."
  }],
  contracts: [{
    id: "public-api-compatible",
    paths: ["openapi.*"],
    forbidBreaking: true,
    reason: "Public API changes need a compatibility window.",
    severity: "error"
  }]
});

function policy() {
  return parseArchitecturePolicy({
    path: ".fixmap/policy.json",
    content: policyContent,
    fingerprint: `worktree:${"a".repeat(64)}`
  });
}

describe("architecture policy", () => {
  it("loads exact repository policy and rejects malformed rules", () => {
    const policyFile = file(".fixmap/policy.json", policyContent);
    expect(architecturePolicyFromRepo(repo([policyFile]))?.boundaries[0]?.id).toBe("ui-no-data");
    expect(() => parseArchitecturePolicy({
      path: ".fixmap/policy.json",
      content: JSON.stringify({ architecturePolicyVersion: 1, boundaries: [{ id: "../bad" }] }),
      fingerprint: "content:1234567890abcdef"
    })).toThrow("invalid id");
    expect(() => parseArchitecturePolicy({
      path: ".fixmap/policy.json",
      content: JSON.stringify({
        architecturePolicyVersion: 1,
        requiredReviews: [
          { id: "same", paths: ["src/**"], reviewers: ["a"], reason: "one" },
          { id: "same", paths: ["test/**"], reviewers: ["b"], reason: "two" }
        ]
      }),
      fingerprint: `worktree:${"b".repeat(64)}`
    })).toThrow("Duplicate architecture policy rule id");
  });

  it("enforces boundaries, tests, review routing, and contract compatibility with evidence", () => {
    const current = repo([
      file("src/ui/view.ts", "import { query } from '../data/query'; export const view = query;"),
      file("src/data/query.ts", "export const query = true;"),
      file("src/auth/login.ts", "export const login = true;"),
      file("src/billing/charge.ts", "export const charge = true;"),
      file("test/auth/login.test.ts", "test('login', () => {})", true)
    ], ["src/ui/view.ts", "src/auth/login.ts", "src/billing/charge.ts"]);
    const contracts: ContractComparison = {
      comparisonVersion: 1,
      summary: "one breaking",
      diagnostics: [],
      changes: [{
        id: "contract-change:1",
        contractId: "contract:openapi:openapi.yaml",
        contractKind: "openapi",
        path: "openapi.yaml",
        change: "entry-removed",
        compatibility: "breaking",
        reason: "Removed GET /users.",
        evidence: { beforeFingerprint: "before", afterFingerprint: "after" }
      }]
    };
    const result = evaluateArchitecturePolicy(policy(), { repo: current, contractComparison: contracts });
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "boundary-violation", severity: "error", paths: ["src/ui/view.ts", "src/data/query.ts"] }),
      expect.objectContaining({ code: "required-test-missing", severity: "warning" }),
      expect.objectContaining({ code: "review-required", severity: "info", evidence: [expect.objectContaining({ detail: "payments-team" })] }),
      expect.objectContaining({ code: "breaking-contract", severity: "error", paths: ["openapi.yaml"] })
    ]));
    expect(result.findings.every((finding) => finding.evidence.length > 0)).toBe(true);
  });

  it("accepts a required test change and focuses boundary checks when requested", () => {
    const current = repo([
      file("src/ui/view.ts", "import { query } from '../data/query';"),
      file("src/data/query.ts", "export const query = true;"),
      file("src/auth/login.ts", "export const login = true;"),
      file("test/auth/login.test.ts", "test('login', () => {})", true)
    ], ["src/auth/login.ts", "test/auth/login.test.ts"]);
    const result = evaluateArchitecturePolicy(policy(), { repo: current, focusPaths: ["src/auth/login.ts"] });
    expect(result.findings.map((finding) => finding.code)).not.toContain("required-test-missing");
    expect(result.findings.map((finding) => finding.code)).not.toContain("boundary-violation");
  });
});

describe("architecture drift", () => {
  it("reports added edges, new cycles, new boundary violations, and coupling growth", () => {
    const before = repo([
      file("src/ui/view.ts", "export const view = true;"),
      file("src/data/query.ts", "export const query = true;"),
      file("src/service/auth.ts", "export const auth = true;")
    ]);
    const after = repo([
      file("src/ui/view.ts", "import { query } from '../data/query'; import { auth } from '../service/auth';"),
      file("src/data/query.ts", "import { view } from '../ui/view'; export const query = view;"),
      file("src/service/auth.ts", "import { view } from '../ui/view'; export const auth = view;")
    ]);
    const previous = buildArchitectureSnapshot(before, policy());
    const current = buildArchitectureSnapshot(after, policy());
    const drift = compareArchitectureSnapshots(previous, current, { couplingDelta: 1 });
    expect(drift.addedEdges).toEqual(expect.arrayContaining([
      { from: "src/ui/view.ts", to: "src/data/query.ts" },
      { from: "src/data/query.ts", to: "src/ui/view.ts" }
    ]));
    expect(drift.newCycles).toContainEqual(["src/data/query.ts", "src/service/auth.ts", "src/ui/view.ts"]);
    expect(drift.newBoundaryViolations).toContainEqual({ ruleId: "ui-no-data", from: "src/ui/view.ts", to: "src/data/query.ts" });
    expect(drift.couplingGrowth.find((entry) => entry.path === "src/ui/view.ts")?.delta).toBeGreaterThan(0);
  });

  it("is deterministic across file order", () => {
    const files = [file("src/a.ts", "import './b';"), file("src/b.ts", "export const b = true;")];
    expect(buildArchitectureSnapshot(repo(files)).fingerprint)
      .toBe(buildArchitectureSnapshot(repo([...files].reverse())).fingerprint);
  });

  it("fails closed when a snapshot source has no exact content identity", () => {
    const unversioned = file("src/a.ts", "export const a = true;");
    delete unversioned.contentFingerprint;
    expect(() => buildArchitectureSnapshot(repo([unversioned])))
      .toThrow("require an exact content fingerprint for src/a.ts");
  });
});
