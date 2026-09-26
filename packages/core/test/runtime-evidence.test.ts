import { describe, expect, it } from "vitest";
import { mapRuntimeEvidence, validateRuntimeEvidenceBundle, type RuntimeEvidenceBundle } from "../src/runtime-evidence.js";
import type { RepoFile } from "../src/types.js";

const file = (path: string, fingerprint?: string): RepoFile => ({
  path, extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "work()",
  ...(fingerprint ? { contentFingerprint: fingerprint } : {})
});

function bundle(records: RuntimeEvidenceBundle["records"]): RuntimeEvidenceBundle {
  return {
    runtimeEvidenceBundleVersion: 1,
    source: {
      format: "opentelemetry", tool: "otel-collector", version: "0.130.0",
      documentFingerprint: `sha256:${"a".repeat(64)}`,
      capturedFrom: "2026-08-21T09:00:00Z", capturedTo: "2026-08-21T10:00:00Z",
      redactionReviewed: true, redactionSummary: "Sensitive attributes removed before export."
    },
    records
  };
}

const code = { repositoryId: "repo:auth", path: "src/auth.ts", symbol: "authenticate", line: 42, evidenceReference: "span.attr.code.filepath" };
const span: RuntimeEvidenceBundle["records"][number] = {
  kind: "span", id: "span-1", traceId: "a".repeat(32), spanId: "b".repeat(16), name: "POST /login",
  serviceName: "auth", startedAt: "2026-08-21T09:01:00Z", durationMs: 24.5, status: "ok", code
};

describe("runtime evidence mapping", () => {
  it("maps explicit repository paths to exact file identities", () => {
    const result = mapRuntimeEvidence(bundle([span]), [{ repositoryId: "repo:auth", files: [file("src/auth.ts", "git:abc123")] }]);
    expect(result.observations[0]).toMatchObject({
      id: "span-1", kind: "span", classification: "observation",
      subject: { repositoryId: "repo:auth", path: "src/auth.ts", contentFingerprint: "git:abc123", symbol: "authenticate", line: 42 },
      measurement: { durationMs: 24.5, status: "ok" }
    });
    expect(result.claims).toEqual({ spanDurationIsCpuTime: false, profileSamplesAreWallClockTime: false, causalImpactInferred: false });
  });

  it("computes profile sample share without labeling samples as elapsed time", () => {
    const records: RuntimeEvidenceBundle["records"] = [
      { kind: "profile-frame", id: "frame-1", profileId: "cpu-1", name: "hash", selfSamples: 30, totalSamples: 70, code },
      { kind: "profile-frame", id: "frame-2", profileId: "cpu-1", name: "parse", selfSamples: 10, totalSamples: 40,
        code: { ...code, path: "src/parse.ts", evidenceReference: "profile.frame.2" } }
    ];
    const result = mapRuntimeEvidence(bundle(records), [{ repositoryId: "repo:auth", files: [
      file("src/auth.ts", "git:auth"), file("src/parse.ts", "git:parse")
    ] }]);
    expect(result.observations[0].measurement).toMatchObject({ selfSamples: 30, totalSamples: 70, sampleShare: 0.75 });
    expect(result.observations[1].measurement).toMatchObject({ sampleShare: 0.25 });
    expect(result.claims.profileSamplesAreWallClockTime).toBe(false);
  });

  it("keeps every unmapped reason visible and never guesses from a symbol", () => {
    const records: RuntimeEvidenceBundle["records"] = [
      { ...span, id: "no-code", code: undefined },
      { ...span, id: "unknown-repo", code: { ...code, repositoryId: "repo:other" } },
      { ...span, id: "missing-file", code: { ...code, path: "src/missing.ts" } },
      { ...span, id: "missing-fingerprint", code }
    ];
    const result = mapRuntimeEvidence(bundle(records), [{ repositoryId: "repo:auth", files: [file("src/auth.ts")] }]);
    expect(result.observations).toEqual([]);
    expect(result.unresolved.map((entry) => entry.reason)).toEqual([
      "file-not-found", "missing-content-fingerprint", "no-code-location", "unknown-repository"
    ]);
    expect(result.diagnostics[0]).toContain("4 of 4 runtime records");
  });

  it("does not conflate the same path label across repositories", () => {
    const result = mapRuntimeEvidence(bundle([span]), [
      { repositoryId: "repo:auth", files: [file("src/auth.ts", "git:auth")] },
      { repositoryId: "repo:payments", files: [file("src/auth.ts", "git:payments")] }
    ]);
    expect(result.observations[0].subject.contentFingerprint).toBe("git:auth");
  });

  it("requires redaction review, timestamps, fingerprints, safe paths, and unique IDs", () => {
    expect(() => validateRuntimeEvidenceBundle({ ...bundle([]), source: { ...bundle([]).source, redactionReviewed: false } })).toThrow("envelope");
    expect(() => validateRuntimeEvidenceBundle({ ...bundle([]), source: { ...bundle([]).source, documentFingerprint: "bad" } })).toThrow("envelope");
    expect(() => validateRuntimeEvidenceBundle({ ...bundle([]), source: {
      ...bundle([]).source, capturedFrom: "2026-08-22", capturedTo: "2026-08-21"
    } })).toThrow("envelope");
    expect(() => validateRuntimeEvidenceBundle(bundle([span, span]))).toThrow("Duplicate runtime record");
    expect(() => validateRuntimeEvidenceBundle(bundle([{ ...span, code: { ...code, path: "../secret.ts" } }]))).toThrow("code location");
    expect(() => mapRuntimeEvidence(bundle([span]), [{ repositoryId: "repo:auth", files: [
      file("src/auth.ts", "git:a"), file("src\\auth.ts", "git:b")
    ] }])).toThrow("Duplicate runtime repository file");
  });
});
