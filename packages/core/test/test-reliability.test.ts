import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  analyzeTestReliability,
  assessReliableCoverage,
  validateTestHistoryBundle,
  type TestHistoryBundle
} from "../src/test-reliability.js";
import type { TestRoute } from "../src/types.js";

const commitA = "a".repeat(40);
const commitB = "b".repeat(40);

function bundle(observations: TestHistoryBundle["observations"]): TestHistoryBundle {
  const documentFingerprint = `sha256:${createHash("sha256").update(JSON.stringify(observations)).digest("hex")}`;
  return {
    testHistoryBundleVersion: 1,
    source: { tool: "ci-export", version: "2.1.0", documentFingerprint },
    observations
  };
}

function observation(
  id: string,
  status: TestHistoryBundle["observations"][number]["status"],
  overrides: Partial<TestHistoryBundle["observations"][number]> = {}
): TestHistoryBundle["observations"][number] {
  return {
    id,
    testId: "auth-suite",
    path: "test/auth.test.ts",
    command: "npm test -- auth",
    status,
    commit: commitA,
    environment: "ubuntu-node22",
    observedAt: `2026-08-${String(Number(id.replace(/\D/g, "") || 1)).padStart(2, "0")}T10:00:00.000Z`,
    attempt: 1,
    gates: [],
    ...overrides
  };
}

const route: TestRoute = {
  command: "npm test -- auth",
  kind: "test",
  reason: "auth changed",
  relatedFiles: ["test/auth.test.ts"]
};

describe("historical test reliability", () => {
  it("only calls a test flaky when the same revision and environment disagrees", () => {
    const sameRevision = analyzeTestReliability(bundle([
      observation("obs-1", "passed"),
      observation("obs-2", "failed")
    ]))[0];
    const changedRevision = analyzeTestReliability(bundle([
      observation("obs-1", "failed"),
      observation("obs-2", "passed", { commit: commitB })
    ]))[0];
    expect(sameRevision).toMatchObject({ reliability: "flaky-observed", confidence: "high" });
    expect(changedRevision.reliability).toBe("insufficient");
  });

  it("requires at least five clean passes over two commits and does not claim correctness", () => {
    const assessment = analyzeTestReliability(bundle([
      observation("obs-1", "passed"),
      observation("obs-2", "passed"),
      observation("obs-3", "passed"),
      observation("obs-4", "passed", { commit: commitB }),
      observation("obs-5", "passed", { commit: commitB })
    ]))[0];
    expect(assessment).toMatchObject({ reliability: "reliably-observed", confidence: "medium", observedCommits: 2 });
    expect(assessment.message).toContain("does not prove test correctness");
    expect(analyzeTestReliability(bundle([observation("obs-1", "passed")]))[0].reliability).toBe("insufficient");
  });

  it("keeps quarantine, skips, newest failures, and feature gates visible", () => {
    expect(analyzeTestReliability(bundle([observation("obs-1", "quarantined")]))[0].reliability).toBe("quarantined");
    expect(analyzeTestReliability(bundle([observation("obs-1", "skipped")]))[0].reliability).toBe("skipped-observed");
    expect(analyzeTestReliability(bundle([observation("obs-1", "passed"), observation("obs-2", "timeout", { commit: commitB })]))[0].reliability).toBe("failing-observed");
    const gated = analyzeTestReliability(bundle([
      observation("obs-1", "passed", { gates: ["ENABLE_DATABASE_TESTS"] }),
      observation("obs-2", "passed", { gates: ["ENABLE_DATABASE_TESTS"] }),
      observation("obs-3", "passed", { gates: ["ENABLE_DATABASE_TESTS"] }),
      observation("obs-4", "passed", { gates: ["ENABLE_DATABASE_TESTS"], commit: commitB }),
      observation("obs-5", "passed", { gates: ["ENABLE_DATABASE_TESTS"], commit: commitB })
    ]))[0];
    expect(gated).toMatchObject({ reliability: "insufficient", gates: ["ENABLE_DATABASE_TESTS"] });
    expect(gated.message).toContain("conditionally gated");
  });

  it("distinguishes declared routes from reliably observed running coverage", () => {
    const clean = analyzeTestReliability(bundle([
      observation("obs-1", "passed"), observation("obs-2", "passed"), observation("obs-3", "passed"),
      observation("obs-4", "passed", { commit: commitB }), observation("obs-5", "passed", { commit: commitB })
    ]));
    expect(assessReliableCoverage([route], clean, ["src/auth.ts"])).toMatchObject({
      routes: [{ status: "reliable-observed", reliableTestPaths: ["test/auth.test.ts"] }],
      riskPaths: []
    });
    const flaky = analyzeTestReliability(bundle([observation("obs-1", "passed"), observation("obs-2", "failed")]));
    expect(assessReliableCoverage([route], flaky, ["src/auth.ts"])).toMatchObject({
      routes: [{ status: "unreliable-observed", unreliableTestPaths: ["test/auth.test.ts"] }],
      riskPaths: ["src/auth.ts"]
    });
    expect(assessReliableCoverage([{ ...route, relatedFiles: [] }], clean, ["src/auth.ts"]).routes[0].status).toBe("no-declared-tests");
    expect(assessReliableCoverage([route], [], ["src/auth.ts"]).routes[0].status).toBe("no-history");
  });

  it("treats every test identity sharing a path conservatively", () => {
    const clean = analyzeTestReliability(bundle([
      observation("obs-1", "passed"), observation("obs-2", "passed"), observation("obs-3", "passed"),
      observation("obs-4", "passed", { commit: commitB }), observation("obs-5", "passed", { commit: commitB })
    ]));
    const second = { ...clean[0], testId: "auth-second", reliability: "flaky-observed" as const };
    expect(assessReliableCoverage([route], [...clean, second], ["src/auth.ts"]).routes[0].status).toBe("unreliable-observed");
  });

  it("rejects malformed provenance, duplicate IDs, and unsafe paths", () => {
    expect(() => validateTestHistoryBundle({ ...bundle([]), source: { tool: "ci", version: "1", documentFingerprint: "nope" } })).toThrow("envelope");
    const duplicate = observation("obs-1", "passed");
    expect(() => validateTestHistoryBundle(bundle([duplicate, duplicate]))).toThrow("Duplicate");
    expect(() => validateTestHistoryBundle(bundle([observation("obs-1", "passed", { path: "../secret.test.ts" })]))).toThrow("index 0");
    expect(() => assessReliableCoverage([route], [{
      ...analyzeTestReliability(bundle([observation("obs-1", "passed")]))[0], path: "../secret.test.ts"
    }], ["src/auth.ts"])).toThrow("assessment path");
    expect(() => assessReliableCoverage([route], [], ["C:\\secret.ts"])).toThrow("risk path");
  });
});
