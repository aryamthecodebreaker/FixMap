import { describe, expect, it } from "vitest";
import {
  analyzeTaskGrounding,
  buildGroundedTaskTokens
} from "../src/grounding.js";
import { rankContextFiles } from "../src/rank.js";
import type { RepoMap } from "../src/types.js";

function createRepo(): RepoMap {
  return {
    root: "/repo",
    packageScripts: [],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: [],
    files: [
      {
        path: "src/cache/state.ts",
        extension: ".ts",
        sizeBytes: 100,
        isSource: true,
        isTest: false,
        kind: "code",
        textSample: "export function transitionCacheState() { return 'ready'; }"
      }
    ]
  };
}

describe("task grounding", () => {
  it("distinguishes exact definitions from unresolved identifiers", () => {
    const repo = createRepo();
    const grounding = analyzeTaskGrounding(repo, {
      issueText:
        "transitionCacheState throws InvalidTransitionState in experimentalHoudiniPartialPrerenderScheduler"
    });

    expect(grounding.identifiers).toContainEqual({
      identifier: "transitionCacheState",
      status: "exact-definition",
      matchedFiles: ["src/cache/state.ts"]
    });
    expect(grounding.unresolvedIdentifiers).toEqual([
      "InvalidTransitionState",
      "experimentalHoudiniPartialPrerenderScheduler"
    ]);
    expect(grounding.specificity).toBe("anchored");
  });

  it("batches multiple identifiers without collapsing definition, text, and missing states", () => {
    const repo = createRepo();
    repo.files.push({
      path: "src/cache/caller.ts",
      extension: ".ts",
      sizeBytes: 100,
      isSource: true,
      isTest: false,
      kind: "code",
      textSample: "invokeCacheHook();"
    });

    const grounding = analyzeTaskGrounding(repo, {
      issueText: "transitionCacheState invokeCacheHook MissingCacheHook"
    });

    expect(grounding.identifiers).toEqual([
      { identifier: "transitionCacheState", status: "exact-definition", matchedFiles: ["src/cache/state.ts"] },
      { identifier: "invokeCacheHook", status: "exact-text", matchedFiles: ["src/cache/caller.ts"] },
      { identifier: "MissingCacheHook", status: "not-found", matchedFiles: [] }
    ]);
  });

  it("grounds a Java method through the language adapter instead of treating its call sites as definitions", () => {
    const repo = createRepo();
    repo.files = [
      {
        path: "src/main/java/com/acme/auth/PasswordResetService.java",
        extension: ".java",
        sizeBytes: 100,
        isSource: true,
        isTest: false,
        kind: "code",
        textSample: "public final class PasswordResetService { public User resetPassword(User user) { return user; } }"
      },
      {
        path: "src/main/java/com/acme/api/ResetController.java",
        extension: ".java",
        sizeBytes: 100,
        isSource: true,
        isTest: false,
        kind: "code",
        textSample: "return service.resetPassword(user);"
      }
    ];

    const grounding = analyzeTaskGrounding(repo, { issueText: "resetPassword rejects a valid recovery token" });

    expect(grounding.identifiers).toContainEqual({
      identifier: "resetPassword",
      status: "exact-definition",
      matchedFiles: ["src/main/java/com/acme/auth/PasswordResetService.java"]
    });
  });

  it("removes component words that occur only inside unresolved identifiers", () => {
    const repo = createRepo();
    const issueText =
      "experimentalHoudiniPartialPrerenderScheduler throws InvalidTransitionState when the cache threshold is crossed";
    const grounding = analyzeTaskGrounding(repo, { issueText });
    const tokens = buildGroundedTaskTokens(grounding, { issueText });

    expect(tokens).toContain("cache");
    expect(tokens).toContain("threshold");
    expect(tokens).not.toContain("houdini");
    expect(tokens).not.toContain("partial");
    expect(tokens).not.toContain("scheduler");
    expect(tokens).not.toContain("transition");
    expect(tokens).not.toContain("invalid");
  });

  it("marks broad tasks without repository anchors as vague", () => {
    const grounding = analyzeTaskGrounding(createRepo(), {
      issueText: "improve developer experience when errors happen"
    });

    expect(grounding.specificity).toBe("vague");
  });

  it("marks a wordy request as vague when nothing survives its generic language", () => {
    // Length is not the signal. This sentence is longer than the one above and
    // just as unroutable, because every term in it is generic-improvement
    // vocabulary rather than a description of anything in the repository.
    const grounding = analyzeTaskGrounding(createRepo(), {
      issueText: "clean this up and make the general performance better overall"
    });

    expect(grounding.specificity).toBe("vague");
  });

  it("rejects generic improve-the-codebase wording as vague", () => {
    const grounding = analyzeTaskGrounding(createRepo(), {
      issueText: "improve the codebase quality and make things better overall please"
    });

    expect(grounding.specificity).toBe("vague");
  });

  it("does not call a concrete task vague merely because it asks for an improvement", () => {
    const grounding = analyzeTaskGrounding(createRepo(), {
      issueText:
        "improve the retry backoff so a 503 from the upstream billing host stops the client hammering it every 200ms"
    });

    expect(grounding.specificity).not.toBe("vague");
  });

  it.each([
    "please fix CSV export failures",
    "fix performance regression in cache state transitions",
    "repair reliability errors in the retry scheduler",
    "refactor broke cache state transitions"
  ])("keeps an ordinary concrete bug report descriptive: %s", (issueText) => {
    const grounding = analyzeTaskGrounding(createRepo(), { issueText });

    expect(grounding.specificity).toBe("descriptive");
  });

  it("leaves a specific symptom descriptive when it carries no improvement language", () => {
    const grounding = analyzeTaskGrounding(createRepo(), {
      issueText:
        "output is sometimes interleaved and out of order under heavy concurrency on slower machines"
    });

    expect(grounding.specificity).toBe("descriptive");
  });

  it("retains useful terms for a paraphrased camelCase identifier", () => {
    const repo = createRepo();
    repo.files = [{
      path: "src/auth/reset-password.ts",
      extension: ".ts",
      sizeBytes: 100,
      isSource: true,
      isTest: false,
      kind: "code",
      textSample: "export function sendResetPasswordEmail() { return true; }"
    }];
    const issueText = "resetPassword fails to send email";
    const grounding = analyzeTaskGrounding(repo, { issueText });
    const tokens = buildGroundedTaskTokens(grounding, { issueText });
    const ranked = rankContextFiles(repo, { issueText });

    expect(grounding.identifiers).toContainEqual({
      identifier: "resetPassword",
      status: "partial-definition",
      matchedFiles: ["src/auth/reset-password.ts"]
    });
    expect(grounding.unresolvedIdentifiers).toEqual([]);
    expect(grounding.partiallyResolvedIdentifiers).toEqual(["resetPassword"]);
    expect(tokens).toContain("reset");
    expect(tokens).toContain("password");
    expect(ranked[0]?.path).toBe("src/auth/reset-password.ts");
    expect(ranked[0]?.confidence).toBe("medium");
  });
});
