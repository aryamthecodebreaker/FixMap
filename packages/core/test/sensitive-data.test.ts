import { describe, expect, it } from "vitest";
import { collectEvidence } from "../src/evidence.js";
import { sensitiveDataFlowEvidenceProvider } from "../src/sensitive-data.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string, fingerprint = `worktree:${"a".repeat(64)}`): RepoFile {
  return {
    path,
    contentFingerprint: fingerprint,
    extension: ".ts",
    sizeBytes: textSample.length,
    isTest: false,
    isSource: true,
    kind: "code",
    textSample,
    textSampleComplete: true
  };
}

function repo(files: RepoFile[]): RepoMap {
  return { root: "/repo", files, packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [] };
}

describe("sensitive data flow evidence", () => {
  it("reports low-confidence same-file indicators without copying detected values", async () => {
    const literal = "actual-secret-value-must-not-appear";
    const collected = await collectEvidence([sensitiveDataFlowEvidenceProvider], {
      repo: repo([file("src/auth.ts", `const password = ${JSON.stringify(literal)}; console.log(password);`)]),
      issueText: "",
      diffText: ""
    }, { now: "2026-08-21T12:00:00Z" });

    expect(collected.items).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "security",
        confidence: "low",
        subjects: [{ kind: "file", path: "src/auth.ts" }],
        metadata: expect.objectContaining({
          category: "credential",
          matchedRuleIds: "credential-password",
          sourceFingerprint: `worktree:${"a".repeat(64)}`,
          completeness: "not-a-security-proof"
        })
      })
    ]));
    expect(collected.relationships).toContainEqual(expect.objectContaining({
      relation: "same-file-sensitive-signal-and-sink",
      confidence: "low"
    }));
    expect(JSON.stringify(collected)).not.toContain(literal);
    expect(collected.items.find((item) => item.id.endsWith(":scope"))?.summary).toContain("not a complete security");
  });

  it("labels direct import connectivity as structural rather than verified runtime flow", async () => {
    const current = repo([
      file("src/profile.ts", "export const emailAddress = getEmail();"),
      file("src/telemetry.ts", "import { emailAddress } from './profile'; analytics.track(emailAddress);")
    ]);
    const collected = await collectEvidence([sensitiveDataFlowEvidenceProvider], {
      repo: current,
      issueText: "",
      diffText: ""
    }, { now: "2026-08-21T12:00:00Z" });

    expect(collected.relationships).toContainEqual(expect.objectContaining({
      relation: "structurally-connected-sensitive-signal",
      reason: expect.stringContaining("runtime data transfer was not verified")
    }));
  });

  it("skips unversioned and incomplete files while declaring the omitted scope", async () => {
    const incomplete = file("src/large.ts", "password");
    delete incomplete.contentFingerprint;
    incomplete.textSampleComplete = false;
    incomplete.textSampleSkipReason = "too-large";
    const collected = await collectEvidence([sensitiveDataFlowEvidenceProvider], {
      repo: repo([incomplete]), issueText: "", diffText: ""
    }, { now: "2026-08-21T12:00:00Z" });

    expect(collected.items).toHaveLength(1);
    expect(collected.items[0]?.metadata).toMatchObject({ scannedFiles: 0, skippedFiles: 1 });
  });
});
