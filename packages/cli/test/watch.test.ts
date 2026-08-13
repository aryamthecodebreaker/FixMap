import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, vi } from "vitest";
import type { FixMapReport, RepoMap } from "@aryam/fixmap-core";
import { fingerprintWorkingTree, renderWatchUpdate, watchRepository } from "../src/watch.js";

const exec = promisify(execFile);

const report: FixMapReport = {
  summary: "One candidate.",
  contextFiles: [{ rank: 1, path: "src/a.ts", score: 5, confidence: "medium", reasons: ["match"] }],
  testRoutes: [],
  risks: [],
  changedFiles: [],
  diagnostics: []
};

const repo = (changedFiles: string[], history = false): RepoMap => ({
  root: "/repo",
  files: [{ path: "src/a.ts", extension: ".ts", sizeBytes: 1, isTest: false, isSource: true, kind: "code", textSample: "a" }],
  trackedFiles: ["src/a.ts"],
  packageScripts: [],
  changedFiles,
  diffText: changedFiles.length > 0 ? "diff" : "",
  packageManager: "npm",
  diagnostics: [],
  ...(history ? { history: { commits: [], eligibleCommits: 0, shallow: false, truncated: false } } : {})
});

describe("working-tree watch", () => {
  it("emits only changed states and reuses the initial history snapshot", async () => {
    const fingerprints = ["a", "a", "b"];
    const scans = [repo([], true), repo(["src/a.ts"])];
    const updates: unknown[] = [];
    const controller = new AbortController();
    const scan = vi.fn(async () => scans.shift()!);

    await watchRepository({
      repoRoot: "/repo",
      report,
      signal: controller.signal,
      fingerprint: async () => fingerprints.shift()!,
      scan,
      wait: async () => { if (fingerprints.length === 0) controller.abort(); },
      onUpdate: (update) => { updates.push(update); }
    });

    expect(updates).toHaveLength(2);
    expect(scan).toHaveBeenCalledTimes(2);
    expect(scan.mock.calls[0]?.[0]).toMatchObject({ includeHistory: true, workingTree: true, useCache: false });
    expect(scan.mock.calls[1]?.[0]).toMatchObject({ includeHistory: false, workingTree: true, useCache: false });
    expect((updates[1] as { verification: { changedFiles: string[] } }).verification.changedFiles).toEqual(["src/a.ts"]);
  });

  it("renders JSON Lines and readable markdown updates", () => {
    const update: Parameters<typeof renderWatchUpdate>[0] = {
      watchVersion: 1,
      sequence: 2,
      observedAt: "2026-08-12T00:00:00.000Z",
      verification: { summary: "No changes to verify.", changedFiles: [], findings: [], diagnostics: [] }
    };
    expect(JSON.parse(renderWatchUpdate(update, "json"))).toMatchObject({ sequence: 2 });
    expect(renderWatchUpdate(update, "markdown")).toContain("Watch update 2");
  });

  it("notices content changes to an existing untracked path", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-watch-untracked-"));
    await exec("git", ["init"], { cwd: root });
    await writeFile(join(root, "draft.ts"), "export const state = 'one';\n");
    const first = await fingerprintWorkingTree(root, true);
    await writeFile(join(root, "draft.ts"), "export const state = 'two';\n");
    const second = await fingerprintWorkingTree(root, true);
    expect(second).not.toBe(first);
  });
});
