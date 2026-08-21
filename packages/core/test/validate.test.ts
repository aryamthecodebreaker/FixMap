import { describe, expect, it } from "vitest";
import { validateFixMapReport } from "../src/validate.js";
import { createAnnotation } from "../src/annotations.js";

const envelope = {
  reportVersion: 1,
  summary: "No matches.",
  contextFiles: [],
  testRoutes: [],
  risks: [],
  changedFiles: [],
  diagnostics: []
};

const rankedContext = {
  rank: 1,
  path: "src/reset.ts",
  score: 12,
  confidence: "high",
  reasons: ["path matches task terms: reset"]
} as const;

describe("validateFixMapReport", () => {
  it("accepts a complete empty report and legacy reports without a marker", () => {
    expect(validateFixMapReport(envelope, "report").success).toBe(true);
    const legacy = {
      ...Object.fromEntries(Object.entries(envelope).filter(([key]) => key !== "reportVersion")),
      contextFiles: [{ path: "src/reset.ts" }],
      testRoutes: [{ command: "npm test", relatedFiles: [] }],
      risks: [{ area: "authentication" }]
    };
    expect(validateFixMapReport(legacy, "report").success).toBe(true);
  });

  it("validates additive annotation assessments", () => {
    const annotation = createAnnotation({
      scope: { kind: "file", path: "src/reset.ts" },
      note: "Keep stable",
      createdAt: "2026-08-21T10:00:00Z"
    });
    expect(validateFixMapReport({
      ...envelope,
      annotations: {
        asOf: "2026-08-22T00:00:00Z",
        sourcePath: ".fixmap/annotations.json",
        sourceFingerprint: `worktree:${"a".repeat(64)}`,
        entries: [{ annotation, status: "active", message: `Annotation ${annotation.id} is active.` }]
      }
    }, "report").success).toBe(true);
    const invalid = validateFixMapReport({
      ...envelope,
      annotations: { asOf: "not-a-date", entries: [] }
    }, "report");
    expect(invalid.success).toBe(false);
  });

  it("validates authored decision records", () => {
    const valid = validateFixMapReport({
      ...envelope,
      decisions: [{
        id: "decision:0123456789abcdef",
        path: "docs/adr/auth.md",
        title: "Keep auth stable",
        status: "accepted",
        decision: "Preserve the external contract.",
        targets: [{ kind: "file", path: "src/reset.ts", evidence: "explicit" }],
        supersedes: [],
        sourceFingerprint: `git:${"a".repeat(40)}`
      }]
    }, "report");
    expect(valid.success).toBe(true);
    const invalid = validateFixMapReport({
      ...envelope,
      decisions: [{ id: "decision:bad", path: "../adr.md" }]
    }, "report");
    expect(invalid.success).toBe(false);
  });

  it("validates architecture policy findings and their evidence", () => {
    const valid = validateFixMapReport({
      ...envelope,
      policy: {
        policyFingerprint: `git:${"d".repeat(40)}`,
        findings: [{
          code: "boundary-violation",
          severity: "error",
          ruleId: "ui-no-data",
          message: "UI imports data.",
          paths: ["src/ui/view.ts", "src/data/query.ts"],
          evidence: [{
            kind: "import",
            path: "src/ui/view.ts",
            relatedPath: "src/data/query.ts",
            detail: "src/ui/view.ts imports src/data/query.ts."
          }]
        }]
      }
    }, "report");
    expect(valid.success).toBe(true);
    const invalid = validateFixMapReport({
      ...envelope,
      policy: { policyFingerprint: "approximate", findings: [] }
    }, "report");
    expect(invalid.success).toBe(false);
  });

  it("requires all existing version 1 entry fields while leaving legacy entries compatible", () => {
    const result = validateFixMapReport({
      ...envelope,
      contextFiles: [{ path: "src/reset.ts" }],
      testRoutes: [{ command: "npm test", relatedFiles: [] }],
      risks: [{ area: "authentication" }]
    }, "report");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("version 1 requires");
  });

  it("rejects duplicate paths and version 1 ranks that disagree with array order", () => {
    const duplicate = validateFixMapReport({
      ...envelope,
      contextFiles: [rankedContext, { ...rankedContext, rank: 2 }]
    }, "report");
    const outOfOrder = validateFixMapReport({
      ...envelope,
      contextFiles: [{ ...rankedContext, rank: 2 }]
    }, "report");

    expect(duplicate.success).toBe(false);
    if (!duplicate.success) expect(duplicate.message).toContain("duplicate contextFiles path");
    expect(outOfOrder.success).toBe(false);
    if (!outOfOrder.success) expect(outOfOrder.message).toContain("out-of-order contextFiles rank");
  });

  it.each([
    ["POSIX traversal", "../outside.ts"],
    ["Windows traversal", "..\\outside.ts"],
    ["POSIX absolute", "/etc/passwd"],
    ["Windows absolute", "C:\\outside.ts"],
    ["Windows drive-relative", "C:outside.ts"],
    ["UNC", "\\\\server\\share\\outside.ts"]
  ])("rejects %s report paths on every host", (_label, path) => {
    const result = validateFixMapReport({
      ...envelope,
      contextFiles: [{ ...rankedContext, path }]
    }, "report");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("invalid contextFiles entry");
  });

  it("rejects unsupported report versions", () => {
    const result = validateFixMapReport({ ...envelope, reportVersion: 2 }, "report");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("unsupported reportVersion 2");
  });

  it("rejects truncated empty report-shaped objects", () => {
    const result = validateFixMapReport({ reportVersion: 1, contextFiles: [] }, "report");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("complete FixMap report envelope");
  });

  it("rejects a non-empty context list when the rest of the report envelope is truncated", () => {
    const result = validateFixMapReport({
      reportVersion: 1,
      contextFiles: [{ path: "src/reset.ts" }]
    }, "report");

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain("complete FixMap report envelope");
      expect(result.message).toContain("testRoutes");
      expect(result.message).toContain("risks");
    }
  });

  it.each([
    [{ ...envelope, contextFiles: [rankedContext], testRoutes: [null] }, "testRoutes entry"],
    [{ ...envelope, contextFiles: [rankedContext], testRoutes: [{ command: "npm test" }] }, "relatedFiles"],
    [{ ...envelope, contextFiles: [{ ...rankedContext, reasons: [42] }] }, "contextFiles entry"],
    [{ ...envelope, contextFiles: [rankedContext], testRoutes: [{ command: " ", kind: "test", reason: "tests", relatedFiles: [] }] }, "testRoutes entry"],
    [{ ...envelope, contextFiles: [rankedContext], testRoutes: [{ command: "npm test", kind: "check", reason: "tests", relatedFiles: [] }] }, "testRoutes entry"],
    [{ ...envelope, contextFiles: [rankedContext], testRoutes: [{ command: "npm test", relatedFiles: [] }] }, "testRoutes entry"],
    [{ ...envelope, contextFiles: [rankedContext], risks: [null] }, "risks entry"],
    [{ ...envelope, contextFiles: [rankedContext], risks: [{ area: " ", reason: "risk", severity: "low" }] }, "risks entry"],
    [{ ...envelope, contextFiles: [rankedContext], risks: [{ area: "auth", reason: "risk", severity: "critical" }] }, "risks entry"],
    [{ ...envelope, contextFiles: [rankedContext], risks: [{ area: "auth" }] }, "risks entry"],
    [{ ...envelope, contextFiles: [rankedContext], changedFiles: [42] }, "changedFiles"],
    [{ ...envelope, contextFiles: [rankedContext], changedFiles: [" "] }, "changedFiles"],
    [{ ...envelope, contextFiles: [rankedContext], diagnostics: [null] }, "diagnostics entry"],
    [{ ...envelope, contextFiles: [rankedContext], diagnostics: [{ code: "x", message: "x", severity: "warning", paths: [""] }] }, "diagnostics entry"],
    [{ ...envelope, contextFiles: [rankedContext], analysis: {} }, "analysis.grounding.specificity"],
    [{ ...envelope, contextFiles: [rankedContext], analysis: { grounding: { specificity: "anchored" } } }, "incomplete or invalid analysis"]
  ])("rejects consumer-unsafe nested report data: %s", (candidate, message) => {
    const result = validateFixMapReport(candidate, "report");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain(message);
  });

  it("accepts a complete analysis while leaving additive fields alone", () => {
    const result = validateFixMapReport({
      ...envelope,
      futureField: { remains: "allowed" },
      analysis: {
        grounding: {
          specificity: "anchored",
          identifiers: [{ identifier: "sendMail", status: "exact-definition", matchedFiles: ["src/mail.ts"] }],
          unresolvedIdentifiers: [],
          partiallyResolvedIdentifiers: [],
          unverifiedIdentifiers: [],
          scanComplete: true
        },
        ranking: { topScore: 20, runnerUpScore: null, topGap: null, clustered: false },
        nextAction: "Inspect src/mail.ts."
      }
    }, "report");

    expect(result.success).toBe(true);
  });

  it("accepts a valid additive impact graph and rejects unsafe impact paths", () => {
    const impact = {
      seeds: ["src/reset.ts"],
      files: [{
        path: "src/session.ts",
        score: 8,
        confidence: "high",
        evidence: [{
          kind: "co-change",
          seed: "src/reset.ts",
          reason: "changed alongside src/reset.ts in 3 of its 4 eligible changes",
          occurrences: 3,
          seedChanges: 4
        }]
      }],
      inspectionOrder: ["src/reset.ts", "src/session.ts"],
      history: { available: true, eligibleCommits: 20, shallow: false, truncated: false }
    };

    expect(validateFixMapReport({ ...envelope, impact }, "report").success).toBe(true);
    const invalid = validateFixMapReport({
      ...envelope,
      impact: { ...impact, files: [{ ...impact.files[0], path: "../outside.ts" }] }
    }, "report");
    expect(invalid.success).toBe(false);
    if (!invalid.success) expect(invalid.message).toContain("impact.files entry");
  });

  it("rejects an unknown identifier grounding status", () => {
    const result = validateFixMapReport({
      ...envelope,
      analysis: {
        grounding: {
          specificity: "anchored",
          identifiers: [{ identifier: "sendMail", status: "future-status", matchedFiles: ["src/mail.ts"] }],
          unresolvedIdentifiers: [],
          partiallyResolvedIdentifiers: [],
          unverifiedIdentifiers: [],
          scanComplete: true
        },
        ranking: { topScore: 20, runnerUpScore: null, topGap: null, clustered: false },
        nextAction: "Inspect src/mail.ts."
      }
    }, "report");

    expect(result.success).toBe(false);
    if (!result.success) expect(result.message).toContain("analysis.grounding.identifiers entry");
  });
});
