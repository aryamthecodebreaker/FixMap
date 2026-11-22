import { describe, expect, it } from "vitest";
import { rankIncidentSuspects, type IncidentRegressionInput } from "../src/incident.js";
import type { MappedRuntimeEvidence } from "../src/runtime-evidence.js";

const fp = (letter: string) => `sha256:${letter.repeat(64)}`;
const runtime: MappedRuntimeEvidence = {
  runtimeEvidenceVersion: 1,
  source: {
    format: "opentelemetry", tool: "otel", version: "1", documentFingerprint: fp("a"),
    capturedFrom: "2026-08-21T09:00:00.000Z", capturedTo: "2026-08-21T10:00:00.000Z",
    redactionReviewed: true, redactionSummary: "reviewed"
  },
  observations: [{
    id: "span-pay", kind: "span", name: "pay", subject: {
      repositoryId: "repo:payments", path: "src/charge.ts", contentFingerprint: "git:charge"
    }, evidenceReference: "span-1", measurement: { durationMs: 500, status: "error" }, classification: "observation"
  }],
  unresolved: [{ id: "span-x", kind: "span", name: "x", reason: "no-code-location" }],
  diagnostics: [], claims: { spanDurationIsCpuTime: false, profileSamplesAreWallClockTime: false, causalImpactInferred: false }
};

function input(): IncidentRegressionInput {
  return {
    incident: { id: "inc-1", summary: "Payment failures increased", startedAt: "2026-08-21T09:30:00Z",
      detectedAt: "2026-08-21T10:00:00Z", sourceFingerprint: fp("b") },
    deployments: [{
      id: "deploy-1", repositoryId: "repo:payments", commit: "c".repeat(40), previousCommit: "d".repeat(40),
      deployedAt: "2026-08-21T09:20:00Z", sourceFingerprint: fp("c"),
      changedFiles: [
        { path: "src/auth.ts", contentFingerprint: "git:auth" },
        { path: "src/config.ts", contentFingerprint: "git:config" }
      ]
    }],
    errors: [{
      id: "error-1", repositoryId: "repo:payments", path: "src/charge.ts", firstObservedAt: "2026-08-21T09:31:00Z",
      lastObservedAt: "2026-08-21T09:59:00Z", occurrenceCount: 20, messageFingerprint: fp("d"), sourceFingerprint: fp("e")
    }],
    runtimeEvidence: structuredClone(runtime),
    impactLinks: [{
      repositoryId: "repo:payments", changedPath: "src/auth.ts", impactedPath: "src/charge.ts", kind: "import",
      sourceFingerprint: fp("f"), reference: "impact-edge-1"
    }]
  };
}

describe("incident regression ranking", () => {
  it("ranks transparent deployment, error, runtime, and impact evidence without a causal claim", () => {
    const result = rankIncidentSuspects(input());
    expect(result.suspects.map((suspect) => [suspect.path, suspect.score])).toEqual([
      ["src/auth.ts", 5], ["src/config.ts", 1]
    ]);
    expect(result.suspects[0].signals.map((signal) => [signal.ruleId, signal.classification])).toEqual([
      ["recent-deployment", "observation"], ["impact-to-error", "inference"], ["impact-to-runtime", "inference"]
    ]);
    expect(result.suspects[0].causality).toBe("not-established");
    expect(result).toMatchObject({ rankingMethod: "transparent-rule-sum-v1", causalClaim: false });
    expect(result.diagnostics[0]).toContain("has not established causality");
    expect(result.diagnostics[1]).toContain("1 runtime record(s) remained unresolved");
  });

  it("uses exact same-file error and runtime locations as observations", () => {
    const changed = input();
    changed.deployments[0].changedFiles = [{ path: "src/charge.ts", contentFingerprint: "git:charge" }];
    const result = rankIncidentSuspects(changed);
    expect(result.suspects[0].score).toBe(8);
    expect(result.suspects[0].signals.map((signal) => signal.ruleId)).toEqual([
      "recent-deployment", "error-location-match", "runtime-location-match"
    ]);
  });

  it("does not let duplicate exporter records multiply a rule's weight", () => {
    const changed = input();
    changed.deployments[0].changedFiles = [{ path: "src/charge.ts", contentFingerprint: "git:charge" }];
    changed.errors.push({ ...changed.errors[0], id: "error-2", messageFingerprint: fp("1") });
    changed.runtimeEvidence!.observations.push({ ...changed.runtimeEvidence!.observations[0], id: "span-pay-2", evidenceReference: "span-2" });
    const suspect = rankIncidentSuspects(changed).suspects[0];
    expect(suspect.score).toBe(8);
    expect(suspect.signals.find((signal) => signal.ruleId === "error-location-match")?.references).toEqual(["error-1", "error-2"]);
    expect(suspect.signals.find((signal) => signal.ruleId === "runtime-location-match")?.references).toEqual(["span-1", "span-2"]);
  });

  it("does not use an error stream that ended before the deployment", () => {
    const changed = input();
    changed.deployments[0].changedFiles = [{ path: "src/charge.ts", contentFingerprint: "git:charge" }];
    changed.errors[0].firstObservedAt = "2026-08-21T08:00:00Z";
    changed.errors[0].lastObservedAt = "2026-08-21T09:00:00Z";
    const suspect = rankIncidentSuspects(changed).suspects[0];
    expect(suspect.score).toBe(4);
    expect(suspect.signals.map((signal) => signal.ruleId)).toEqual(["recent-deployment", "runtime-location-match"]);
  });

  it("excludes deployments after detection or outside the declared lookback", () => {
    const value = input();
    value.lookbackHours = 24;
    value.deployments.push(
      { ...value.deployments[0], id: "deploy-after", deployedAt: "2026-08-21T11:00:00Z" },
      { ...value.deployments[0], id: "deploy-old", deployedAt: "2026-08-19T09:00:00Z" }
    );
    expect(rankIncidentSuspects(value).excludedDeployments).toEqual([
      { id: "deploy-after", reason: "after-incident-detection" },
      { id: "deploy-old", reason: "outside-lookback-window" }
    ]);
  });

  it("keeps equal paths in different repositories distinct", () => {
    const value = input();
    value.deployments.push({ ...value.deployments[0], id: "deploy-auth", repositoryId: "repo:auth",
      changedFiles: [{ path: "src/auth.ts", contentFingerprint: "git:other" }] });
    const suspects = rankIncidentSuspects(value).suspects.filter((suspect) => suspect.path === "src/auth.ts");
    expect(suspects.map((suspect) => suspect.repositoryId).sort()).toEqual(["repo:auth", "repo:payments"]);
  });

  it("rejects unsafe or contradictory incident evidence", () => {
    expect(() => rankIncidentSuspects({ ...input(), incident: { ...input().incident,
      startedAt: "2026-08-22", detectedAt: "2026-08-21" } })).toThrow("envelope");
    const unsafe = input();
    unsafe.deployments[0].changedFiles[0].path = "../secret.ts";
    expect(() => rankIncidentSuspects(unsafe)).toThrow("deployment file");
    const duplicate = input();
    duplicate.deployments.push({ ...duplicate.deployments[0] });
    expect(() => rankIncidentSuspects(duplicate)).toThrow("Duplicate incident deployment");
    const invalidRuntime = input();
    invalidRuntime.runtimeEvidence = { ...runtime, claims: { ...runtime.claims, causalImpactInferred: true as false } };
    expect(() => rankIncidentSuspects(invalidRuntime)).toThrow("mapped runtime evidence");
  });
});
