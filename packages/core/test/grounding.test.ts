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

    expect(tokens).toContain("cach");
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
