import { describe, expect, it } from "vitest";
import { buildChangeDossier, validateChangeDossier, type ChangeDossierInput } from "../src/dossier.js";

function input(): ChangeDossierInput {
  return {
    id: "change-auth-timeout",
    repositoryIdentity: "fixmap://workspace/company/repository/api",
    createdAt: "2026-08-21T10:00:00Z",
    updatedAt: "2026-08-21T12:00:00Z",
    request: { summary: "Increase authentication timeout.", sourceFingerprint: "request:0123456789abcdef" },
    assumptions: [{
      id: "session-owned-here",
      statement: "This repository owns session expiry.",
      status: "confirmed",
      evidenceFingerprints: ["adr:0123456789abcdef"]
    }],
    plan: {
      reportFingerprint: "report:0123456789abcdef",
      graphFingerprint: "graph:0123456789abcdef",
      artifactPath: ".fixmap/plan.json"
    },
    decisions: [{ id: "decision:0123456789abcdef", path: "docs/adr/session.md", sourceFingerprint: "git:0123456789abcdef" }],
    diff: {
      sourceFingerprint: "diff:0123456789abcdef",
      changedFiles: ["src\\auth.ts", "test/auth.test.ts"],
      base: "main",
      head: "HEAD"
    },
    tests: [{
      command: "npm test -- auth",
      status: "passed",
      evidenceFingerprint: "test:0123456789abcdef",
      relatedPaths: ["test/auth.test.ts"]
    }],
    runtimeEvidence: [{
      id: "trace-1",
      kind: "trace",
      classification: "observation",
      sourceFingerprint: "otel:0123456789abcdef",
      observedAt: "2026-08-21T11:30:00Z"
    }],
    reviews: [{ id: "review-1", status: "approved", sourceFingerprint: "review:0123456789abcdef" }],
    releaseIdentifiers: { commit: "0123456789abcdef", pullRequest: "123" }
  };
}

describe("change dossier", () => {
  it("links each lifecycle evidence class in one deterministic versioned artifact", () => {
    const dossier = buildChangeDossier(input());
    expect(dossier.changeDossierVersion).toBe(1);
    expect(dossier.fingerprint).toMatch(/^dossier:[a-f0-9]{16}$/);
    expect(dossier.request.sourceFingerprint).toBe("request:0123456789abcdef");
    expect(dossier.assumptions[0]).toMatchObject({ status: "confirmed", evidenceFingerprints: ["adr:0123456789abcdef"] });
    expect(dossier.plan).toMatchObject({ reportFingerprint: "report:0123456789abcdef", graphFingerprint: "graph:0123456789abcdef" });
    expect(dossier.decisions[0]?.sourceFingerprint).toBe("git:0123456789abcdef");
    expect(dossier.diff?.changedFiles).toEqual(["src/auth.ts", "test/auth.test.ts"]);
    expect(dossier.tests[0]).toMatchObject({ status: "passed", evidenceFingerprint: "test:0123456789abcdef" });
    expect(dossier.runtimeEvidence[0]).toMatchObject({ kind: "trace", classification: "observation" });
    expect(dossier.reviews[0]?.status).toBe("approved");
    expect(dossier.releaseIdentifiers).toEqual({ commit: "0123456789abcdef", pullRequest: "123" });
    expect(validateChangeDossier(dossier)).toEqual(dossier);
  });

  it("remains explicit and valid before diff, runtime, review, or release evidence exists", () => {
    const early = buildChangeDossier({
      ...input(),
      diff: null,
      tests: [{ command: "npm test -- auth", status: "not-run", relatedPaths: ["test/auth.test.ts"] }],
      runtimeEvidence: [],
      reviews: [],
      releaseIdentifiers: {}
    });
    expect(early.diff).toBeNull();
    expect(early.tests[0]).toMatchObject({ status: "not-run" });
    expect(early.tests[0]).not.toHaveProperty("evidenceFingerprint");
    expect(early.releaseIdentifiers).toEqual({});
  });

  it("detects content tampering and rejects unsupported evidence claims", () => {
    const dossier = buildChangeDossier(input());
    expect(() => validateChangeDossier({ ...dossier, request: { ...dossier.request, summary: "Tampered" } }))
      .toThrow("fingerprint does not match");
    expect(() => buildChangeDossier({
      ...input(),
      assumptions: [{ id: "guess", statement: "Unproven", status: "confirmed", evidenceFingerprints: [] }]
    })).toThrow("Invalid dossier assumption");
    expect(() => buildChangeDossier({
      ...input(),
      tests: [{ command: "npm test", status: "passed", relatedPaths: [] }]
    })).toThrow("Invalid dossier test evidence");
  });

  it("is deterministic across section order", () => {
    const source = input();
    source.assumptions.push({ id: "later", statement: "Second assumption.", status: "unverified", evidenceFingerprints: [] });
    source.decisions.push({ id: "decision:fedcba9876543210", path: "docs/adr/other.md", sourceFingerprint: "git:fedcba9876543210" });
    const first = buildChangeDossier(source);
    const second = buildChangeDossier({
      ...source,
      assumptions: [...source.assumptions].reverse(),
      decisions: [...source.decisions].reverse()
    });
    expect(first).toEqual(second);
  });
});
