import { describe, expect, it } from "vitest";
import { createEditorProtocolSnapshot, handleEditorProtocolRequest } from "../src/editor-protocol.js";
import type { FixMapReport, RepoMap } from "../src/types.js";
import { buildChangeScope } from "../src/change-scope.js";

function report(): FixMapReport {
  return {
    reportVersion: 1,
    summary: "Change auth",
    contextFiles: [{ rank: 1, path: "src/auth.ts", score: 10, confidence: "high", reasons: ["task match"] }],
    changedFiles: ["src/auth.ts"],
    impact: { seeds: ["src/auth.ts"], files: [{ path: "src/session.ts", score: 3, confidence: "medium",
      evidence: [{ kind: "imports", seed: "src/auth.ts", reason: "direct import" }] }], inspectionOrder: ["src/session.ts"],
      history: { available: false, eligibleCommits: 0, shallow: false, truncated: false } },
    testRoutes: [{ command: "npm test", kind: "test", reason: "auth", relatedFiles: ["src/auth.ts"] }],
    risks: [{ area: "authentication", reason: "auth path", severity: "high" }],
    diagnostics: [],
    annotations: { asOf: "2026-08-21T10:00:00.000Z", sourcePath: ".fixmap/annotations.json",
      sourceFingerprint: `git:${"a".repeat(40)}`, entries: [] },
    decisions: [{ id: `decision:${"d".repeat(16)}`, path: "docs/adr/1.md", title: "Auth", status: "accepted", decision: "Keep token parsing local.",
      targets: [{ kind: "file", path: "src/auth.ts", evidence: "explicit" }], supersedes: [], sourceFingerprint: `git:${"b".repeat(40)}` }],
    policy: { policyFingerprint: `git:${"c".repeat(40)}`, findings: [{ code: "review-required", severity: "warning",
      ruleId: "auth-review", message: "Auth review", paths: ["src/auth.ts"], evidence: [{ kind: "changed-file", detail: "auth" }] }] }
  };
}

const request = (method: string, params?: Record<string, unknown>) => ({ editorProtocolVersion: 1, id: "req-1", method, ...(params ? { params } : {}) });

describe("editor protocol", () => {
  it("calculates change scope only from an immutable repository-backed snapshot", () => {
    const repo: RepoMap = { root: "/repo", files: [{
      path: "src/auth.ts", extension: ".ts", sizeBytes: 25, isTest: false, isSource: true,
      kind: "code", textSample: "export const auth = true;", textSampleComplete: true,
      contentFingerprint: `worktree:${"a".repeat(64)}`
    }], packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [] };
    const params = { workspace: "workspace", repository: "auth", anchors: [{ operation: "touch" as const, path: "src/auth.ts" }], asOf: "2026-01-01T00:00:00Z" };
    const snapshot = createEditorProtocolSnapshot(report(), repo);
    expect(snapshot.methods).toContain("fixmap/change-scope");
    expect(handleEditorProtocolRequest(snapshot, request("fixmap/change-scope", params)).result).toEqual(buildChangeScope(repo, params));
    repo.files.length = 0;
    expect(snapshot.repository?.files).toHaveLength(1);
    expect(Object.isFrozen(snapshot.repository?.files)).toBe(true);
    const reportOnly = createEditorProtocolSnapshot(report());
    expect(reportOnly.methods).not.toContain("fixmap/change-scope");
    expect(handleEditorProtocolRequest(reportOnly, request("fixmap/change-scope", params)).error?.code).toBe("method-not-found");
    expect(handleEditorProtocolRequest(snapshot, request("fixmap/change-scope", { ...params, command: "run" })).error?.code).toBe("invalid-params");
    expect(handleEditorProtocolRequest(snapshot, request("fixmap/change-scope", { ...params, anchors: [{ operation: "touch", path: "../secret" }] })).error?.code).toBe("invalid-params");
    for (const invalid of [
      { anchors: null }, { anchors: "src/auth.ts" }, { anchors: [null] },
      { anchors: [{ operation: "touch", path: "src/auth.ts", execute: true }] },
      { asOf: 0 }, { workspace: [] }, { maxNodes: "10" }, { direction: ["both"] }
    ]) {
      const rejected = handleEditorProtocolRequest(snapshot, request("fixmap/change-scope", { ...params, ...invalid }));
      expect(rejected.error?.code).toBe("invalid-params");
      expect(rejected.error?.message).not.toMatch(/Cannot read|is not a function/);
    }
    expect(() => handleEditorProtocolRequest({ ...snapshot, repository: repo }, request("fixmap/plan"))).toThrow("mutated");
  });
  it("creates an immutable versioned local-only snapshot", () => {
    const source = report();
    const snapshot = createEditorProtocolSnapshot(source);
    source.summary = "mutated";
    expect(snapshot.report.summary).toBe("Change auth");
    expect(snapshot).toMatchObject({
      editorProtocolVersion: 1, sourceReportVersion: 1,
      privacy: { transport: "local-process", networkRequired: false, sourceUpload: false, mutationSupported: false }
    });
    expect(snapshot.snapshotFingerprint).toMatch(/^editor-snapshot:[a-f0-9]{16}$/);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.report.contextFiles)).toBe(true);
  });

  it("serves plan and capabilities from the same report snapshot", () => {
    const snapshot = createEditorProtocolSnapshot(report());
    const capabilities = handleEditorProtocolRequest(snapshot, request("fixmap/capabilities"));
    const plan = handleEditorProtocolRequest(snapshot, request("fixmap/plan"));
    expect(capabilities.result).toMatchObject({ privacy: { networkRequired: false, sourceUpload: false }, sourceReportVersion: 1 });
    expect(plan.result).toMatchObject({ summary: "Change auth", contextFiles: [{ path: "src/auth.ts" }] });
    expect(plan.snapshotFingerprint).toBe(snapshot.snapshotFingerprint);
  });

  it("joins file context, routes, decisions, and policy without hiding global risks", () => {
    const result = handleEditorProtocolRequest(createEditorProtocolSnapshot(report()), request("fixmap/file", { path: "src\\auth.ts" }));
    expect(result.result).toMatchObject({
      path: "src/auth.ts", context: { rank: 1 }, impactSeed: true,
      testRoutes: [{ command: "npm test" }], decisions: [{ id: `decision:${"d".repeat(16)}` }],
      policyFindings: [{ ruleId: "auth-review" }], repositoryRisks: [{ area: "authentication" }]
    });
  });

  it("returns annotation provenance and makes its read-only boundary explicit", () => {
    const result = handleEditorProtocolRequest(createEditorProtocolSnapshot(report()), request("fixmap/annotations"));
    expect(result.result).toMatchObject({ source: { path: ".fixmap/annotations.json" }, entries: [], mutationSupported: false });
  });

  it("returns stable protocol errors for invalid versions, methods, params, and paths", () => {
    const snapshot = createEditorProtocolSnapshot(report());
    expect(handleEditorProtocolRequest(snapshot, { ...request("fixmap/plan"), editorProtocolVersion: 2 }).error?.code).toBe("unsupported-version");
    expect(handleEditorProtocolRequest(snapshot, request("fixmap/nope")).error?.code).toBe("method-not-found");
    expect(handleEditorProtocolRequest(snapshot, request("fixmap/plan", { extra: true })).error?.code).toBe("invalid-params");
    expect(handleEditorProtocolRequest(snapshot, request("fixmap/file", { path: "../secret.ts" })).error?.code).toBe("invalid-params");
  });

  it("rejects invalid or unversioned report snapshots", () => {
    expect(() => createEditorProtocolSnapshot({ ...report(), reportVersion: undefined })).toThrow("explicit reportVersion 1");
    expect(() => createEditorProtocolSnapshot({ reportVersion: 1, contextFiles: [] })).toThrow("missing or has invalid fields");
    const snapshot = createEditorProtocolSnapshot(report());
    const fabricated = { ...snapshot, report: { ...snapshot.report, summary: "changed" } };
    expect(() => handleEditorProtocolRequest(fabricated, request("fixmap/plan"))).toThrow("mutated editor protocol snapshot");
  });
});
