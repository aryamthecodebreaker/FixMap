import { describe, expect, it } from "vitest";
import { buildImpactMap } from "../src/impact.js";
import { taskMentionsExpectedPath } from "../src/retrieval.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample = ""): RepoFile {
  return {
    path,
    extension: path.slice(path.lastIndexOf(".")),
    sizeBytes: textSample.length,
    isTest: /(?:^|\/)tests?\//.test(path) || path.includes(".test."),
    isSource: true,
    kind: "code",
    textSample
  };
}

function repository(withHistory = true): RepoMap {
  return {
    root: "/repo",
    files: [
      file("src/auth/reset.ts", "import { token } from './token'; export const reset = token;"),
      file("src/auth/token.ts", "export const token = true;"),
      file("src/api/auth.ts", "import { reset } from '../auth/reset'; export { reset };"),
      file("src/session.ts", "export const session = true;"),
      file("test/auth/reset.test.ts", "import { reset } from '../../src/auth/reset'; test('reset', () => reset);"),
      file("docs/auth.md", "reset documentation")
    ],
    packageScripts: [{ name: "test", command: "vitest run", packageDir: "" }],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: [],
    ...(withHistory ? {
      history: {
        inspectedCommits: 4,
        skippedLargeCommits: 0,
        shallow: false,
        truncated: false,
        commits: [
          { hash: "a".repeat(40), committedAt: 4, files: ["src/auth/reset.ts", "src/session.ts"] },
          { hash: "b".repeat(40), committedAt: 3, files: ["src/auth/reset.ts", "src/session.ts", "docs/auth.md"] },
          { hash: "c".repeat(40), committedAt: 2, files: ["src/auth/reset.ts", "src/session.ts", "docs/auth.md"] },
          { hash: "d".repeat(40), committedAt: 1, files: ["src/api/auth.ts"] }
        ]
      }
    } : {})
  };
}

describe("buildImpactMap", () => {
  it("separates dependents, dependencies, routed tests, and historical companions from seeds", () => {
    const impact = buildImpactMap(repository(), ["src/auth/reset.ts"], [{
      kind: "test",
      command: "npm test",
      reason: "root test script",
      relatedFiles: ["test/auth/reset.test.ts"]
    }]);

    expect(impact.seeds).toEqual(["src/auth/reset.ts"]);
    expect(impact.files.map((entry) => entry.path)).not.toContain("src/auth/reset.ts");
    expect(impact.files.find((entry) => entry.path === "src/auth/token.ts")?.evidence[0]?.kind).toBe("imports");
    expect(impact.files.find((entry) => entry.path === "src/api/auth.ts")?.evidence[0]?.kind).toBe("imported-by");
    expect(impact.files.find((entry) => entry.path === "src/session.ts")?.evidence).toContainEqual(expect.objectContaining({
      kind: "co-change",
      occurrences: 3,
      seedChanges: 3
    }));
    expect(impact.files.find((entry) => entry.path === "test/auth/reset.test.ts")?.evidence.map((entry) => entry.kind))
      .toEqual(expect.arrayContaining(["imported-by", "test-route"]));
    expect(impact.history).toEqual({ available: true, eligibleCommits: 4, shallow: false, truncated: false });
  });

  it("degrades to import and test evidence when history is unavailable", () => {
    const impact = buildImpactMap(repository(false), ["src/auth/reset.ts"]);

    expect(impact.history.available).toBe(false);
    expect(impact.files.some((entry) => entry.evidence.some((evidence) => evidence.kind === "co-change"))).toBe(false);
    expect(impact.files.map((entry) => entry.path)).toEqual(expect.arrayContaining(["src/api/auth.ts", "src/auth/token.ts"]));
  });

  it("requires repeated co-change before reporting a historical relationship", () => {
    const repo = repository();
    repo.history!.commits = [
      { hash: "e".repeat(40), committedAt: 1, files: ["src/auth/reset.ts", "src/session.ts"] }
    ];
    const impact = buildImpactMap(repo, ["src/auth/reset.ts"]);

    expect(impact.files.find((entry) => entry.path === "src/session.ts")).toBeUndefined();
  });
});

describe("repository benchmark path cohorts", () => {
  it("recognizes anchored full paths and multi-segment suffixes but not bare basenames", () => {
    const expected = ["packages/toolkit/src/query/react/buildHooks.ts"];
    expect(taskMentionsExpectedPath("Failure in packages/toolkit/src/query/react/buildHooks.ts:20", expected)).toBe(true);
    expect(taskMentionsExpectedPath("tsc points at src/query/react/buildHooks.ts(20,4)", expected)).toBe(true);
    expect(taskMentionsExpectedPath("buildHooks.ts returns the wrong type", expected)).toBe(false);
    expect(taskMentionsExpectedPath("look at test/packages/toolkit/src/query/react/buildHooks.ts", expected)).toBe(false);
  });

  it("recognizes a repository-root path inside a GitHub permalink", () => {
    expect(taskMentionsExpectedPath(
      "https://github.com/o/r/blob/main/src/auth/reset.ts#L20",
      ["src/auth/reset.ts"]
    )).toBe(true);
  });
});
