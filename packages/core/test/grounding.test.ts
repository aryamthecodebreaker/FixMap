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
