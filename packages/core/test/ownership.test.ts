import { describe, expect, it } from "vitest";
import { addAnnotation, createAnnotation, emptyAnnotationStore } from "../src/annotations.js";
import { routeReviewers } from "../src/ownership.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string, fingerprint = `worktree:${"a".repeat(64)}`): RepoFile {
  return {
    path, contentFingerprint: fingerprint, extension: path.includes(".") ? `.${path.split(".").at(-1)}` : "",
    sizeBytes: textSample.length, isTest: false, isSource: true,
    kind: path.endsWith(".ts") ? "code" : "config", textSample, textSampleComplete: true
  };
}

function repo(files: RepoFile[]): RepoMap {
  return {
    root: "/repo", files, packageScripts: [], changedFiles: ["src/auth.ts"], diffText: "", packageManager: "npm", diagnostics: [],
    history: {
      commits: [
        { hash: "1".repeat(40), committedAt: 100, author: "Alice Example", files: ["src/auth.ts"] },
        { hash: "2".repeat(40), committedAt: 200, author: "Alice Example", files: ["src/auth.ts"] },
        { hash: "3".repeat(40), committedAt: 300, author: "Bob Example", files: ["src/auth.ts"] }
      ],
      inspectedCommits: 3, skippedLargeCommits: 0, shallow: false, truncated: false
    }
  };
}

describe("review routing", () => {
  it("combines CODEOWNERS, active annotations, policy, and bounded history with provenance", () => {
    const annotation = createAnnotation({
      scope: { kind: "file", path: "src/auth.ts" }, note: "Auth specialist", owner: "Aryam",
      createdAt: "2026-08-20T00:00:00Z"
    });
    const annotations = JSON.stringify(addAnnotation(emptyAnnotationStore(), annotation));
    const policy = JSON.stringify({
      architecturePolicyVersion: 1,
      requiredReviews: [{ id: "auth-review", paths: ["src/auth.ts"], reviewers: ["platform-team"], reason: "Auth boundary." }]
    });
    const current = repo([
      file("src/auth.ts", "export const auth = true;"),
      file(".github/CODEOWNERS", "* @all\n/src/auth.ts @security\n", `git:${"b".repeat(40)}`),
      file(".fixmap/annotations.json", annotations, `worktree:${"c".repeat(64)}`),
      file(".fixmap/policy.json", policy, `git:${"d".repeat(40)}`)
    ]);
    const result = routeReviewers(current, { now: "2026-08-21T00:00:00Z" });

    expect(result.suggestions).toEqual(expect.arrayContaining([
      expect.objectContaining({ reviewer: "@security", confidence: "high", availabilityInferred: false }),
      expect.objectContaining({ reviewer: "Aryam", confidence: "high", availabilityInferred: false }),
      expect.objectContaining({ reviewer: "platform-team", confidence: "high", availabilityInferred: false }),
      expect.objectContaining({ reviewer: "Alice Example", confidence: "low", availabilityInferred: false }),
      expect.objectContaining({ reviewer: "Bob Example", confidence: "low", availabilityInferred: false })
    ]));
    expect(result.suggestions.find((entry) => entry.reviewer === "@security")?.evidence[0]).toMatchObject({
      kind: "codeowners", sourceFingerprint: `git:${"b".repeat(40)}`, path: ".github/CODEOWNERS", line: 2
    });
    expect(result.suggestions.find((entry) => entry.reviewer === "Alice Example")?.evidence[0]?.detail)
      .toContain("availability or employment is not inferred");
  });

  it("uses only the highest-precedence CODEOWNERS file and last matching rule", () => {
    const current = repo([
      file("src/auth.ts", "code"),
      file(".github/CODEOWNERS", "* @global\n/src/** @src\n/src/auth.ts @auth\n"),
      file("CODEOWNERS", "* @ignored-root\n")
    ]);
    current.history = undefined;
    const reviewers = routeReviewers(current, { now: "2026-08-21T00:00:00Z" }).suggestions.map((entry) => entry.reviewer);
    expect(reviewers).toEqual(["@auth"]);
  });

  it("does not route expired annotations or infer author availability", () => {
    const annotation = createAnnotation({
      scope: { kind: "file", path: "src/auth.ts" }, note: "Temporary owner", owner: "Former Owner",
      createdAt: "2026-08-01T00:00:00Z", expiresAt: "2026-08-02T00:00:00Z"
    });
    const current = repo([
      file("src/auth.ts", "code"),
      file(".fixmap/annotations.json", JSON.stringify(addAnnotation(emptyAnnotationStore(), annotation)))
    ]);
    const result = routeReviewers(current, { now: "2026-08-21T00:00:00Z" });
    expect(result.suggestions.map((entry) => entry.reviewer)).not.toContain("Former Owner");
    expect(result.suggestions.every((entry) => entry.availabilityInferred === false)).toBe(true);
  });

  it("fails unsafe requested paths and diagnoses incomplete declared sources", () => {
    const current = repo([file("src/auth.ts", "code"), file(".github/CODEOWNERS", "* @all")]);
    current.files[1]!.textSampleComplete = false;
    expect(routeReviewers(current, { now: "2026-08-21T00:00:00Z" }).diagnostics[0]?.message).toContain("routing was skipped");
    expect(() => routeReviewers(current, { changedPaths: ["../outside"], now: "2026-08-21T00:00:00Z" }))
      .toThrow("Invalid review-routing path");
  });
});
