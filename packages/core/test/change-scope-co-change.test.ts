import { describe, expect, it } from "vitest";
import { buildChangeScope } from "../src/change-scope.js";
import type { RepoFile, RepoMap } from "../src/types.js";

function file(path: string, textSample: string): RepoFile {
  return {
    path,
    contentFingerprint: `worktree:${(path.length % 16).toString(16).repeat(64)}`,
    extension: path.slice(path.lastIndexOf(".")),
    sizeBytes: textSample.length,
    isTest: false,
    isSource: true,
    kind: "code",
    textSample,
    textSampleComplete: true
  };
}

let clock = 0;
const commit = (...files: string[]) => {
  clock += 1;
  return { hash: clock.toString(16).padStart(40, "0"), committedAt: clock, author: "Dev", files };
};

function repository(commits: ReturnType<typeof commit>[]): RepoMap {
  return {
    root: "/repo",
    files: [
      file("src/a.ts", "import { b } from './b';\nexport const a = b;\n"),
      file("src/b.ts", "export const b = 1;\n"),
      file("src/zeta.ts", "export const zeta = 1;\n"),
      file("lib/server.ts", "export const server = 1;\n"),
      file("lib/once.ts", "export const once = 1;\n")
    ],
    packageScripts: [],
    changedFiles: [],
    diffText: "",
    packageManager: "npm",
    diagnostics: [],
    history: { commits: [...commits].reverse(), inspectedCommits: commits.length, skippedLargeCommits: 0, shallow: false, truncated: false }
  };
}

const scope = (repo: RepoMap, direction?: "both" | "dependencies") => buildChangeScope(repo, {
  workspace: "local",
  repository: "test",
  anchors: [{ operation: "touch", path: "src/a.ts" }],
  asOf: "2026-11-25T00:00:00Z",
  ...(direction ? { direction } : {})
});

describe("change scope co-change evidence", () => {
  it("adds files that changed with the anchor at least twice, strongest first among equal distance", () => {
    const result = scope(repository([
      commit("src/a.ts", "lib/server.ts"), commit("src/a.ts", "lib/server.ts"), commit("src/a.ts", "lib/server.ts"),
      commit("src/a.ts", "src/zeta.ts"), commit("src/a.ts", "src/zeta.ts"),
      commit("src/a.ts", "lib/once.ts")
    ]));
    expect(result.affected.map((entry) => entry.path)).toEqual(["lib/server.ts", "src/zeta.ts", "src/b.ts"]);
    const server = result.affected[0]!.evidence[0]!;
    expect(server).toMatchObject({ kind: "co-change", from: "src/a.ts", to: "lib/server.ts", occurrences: 3 });
    expect(server.reason).toBe("lib/server.ts changed alongside src/a.ts in 3 of its 6 scanned commits.");
  });

  it("adds co-change evidence to an import neighbour that also changes with the anchor", () => {
    const result = scope(repository([commit("src/a.ts", "src/b.ts"), commit("src/a.ts", "src/b.ts")]));
    expect(result.affected.map((entry) => entry.path)).toEqual(["src/b.ts"]);
    expect(result.affected[0]!.evidence.map((entry) => entry.kind).sort()).toEqual(["co-change", "dependency"]);
  });

  it("uses no history when none was scanned or when only one direction is requested", () => {
    const withoutHistory = repository([commit("src/a.ts", "lib/server.ts"), commit("src/a.ts", "lib/server.ts")]);
    expect(scope({ ...withoutHistory, history: undefined }).affected.map((entry) => entry.path)).toEqual(["src/b.ts"]);
    expect(scope(withoutHistory, "dependencies").affected.map((entry) => entry.path)).toEqual(["src/b.ts"]);
  });
});
