import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FixMapReport } from "@aryam/fixmap-core";
import { runAskCommand } from "../src/ask-command.js";
import { runCli } from "../src/cli-runner.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, {
    recursive: true, force: true, maxRetries: 5, retryDelay: 50
  })));
});

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) } };
}

const report: FixMapReport = {
  reportVersion: 1,
  summary: "Authentication reset context was ranked.",
  contextFiles: [{
    rank: 1,
    path: "src/auth/reset.ts",
    score: 42,
    confidence: "high",
    reasons: ["defines resetPassword"]
  }],
  impact: {
    seeds: ["src/auth/reset.ts"],
    files: [{
      path: "src/session.ts",
      score: 10,
      confidence: "medium",
      evidence: [{ kind: "imports", seed: "src/auth/reset.ts", reason: "imports resetPassword" }]
    }],
    inspectionOrder: ["src/auth/reset.ts", "src/session.ts"],
    history: { available: false, eligibleCommits: 0, shallow: false, truncated: false }
  },
  testRoutes: [{
    command: "npm run test:auth",
    kind: "test",
    reason: "package script",
    relatedFiles: ["test/auth/reset.test.ts"]
  }],
  risks: [{ area: "authentication", severity: "high", reason: "authentication code is ranked" }],
  changedFiles: [],
  diagnostics: []
};

async function fixture(): Promise<{ root: string; path: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-ask-command-"));
  roots.push(root);
  const path = join(root, "plan.json");
  await writeFile(path, JSON.stringify(report));
  return { root, path };
}

describe("fixmap ask", () => {
  it("answers from report evidence with citations and explicit claim limits", async () => {
    const { path } = await fixture();
    const capture = output();
    expect(await runAskCommand([
      "--report", path, "--question", "Which tests should I run?", "--format", "json"
    ], capture.io)).toBe(0);
    const answer = JSON.parse(capture.stdout.join(""));
    expect(answer).toMatchObject({
      fixMapAnswerVersion: 1,
      mode: "deterministic-structural",
      evidenceScope: "report-only-no-source-content",
      claimsVerified: false
    });
    expect(answer.answer).toContain("npm run test:auth");
    expect(answer.citations).toContainEqual(expect.objectContaining({ kind: "test" }));
  });

  it("dispatches through the public CLI and renders unknown rationale honestly", async () => {
    const { path } = await fixture();
    const capture = output();
    expect(await runCli(["ask", "--report", path, "--question", "Why does this code exist?"], capture.io)).toBe(0);
    expect(capture.stdout.join("")).toContain("# FixMap answer");
    expect(capture.stdout.join("")).toContain("no authored decision record or annotation");
    expect(capture.stdout.join("")).toContain("FixMap will not invent one");
    expect(capture.stdout.join("")).toContain("Claims verified: no");
  });

  it("does not overwrite its report and renders directory failures without raw EISDIR", async () => {
    const { root, path } = await fixture();
    const before = await readFile(path, "utf8");
    const collision = output();
    expect(await runAskCommand([
      "--report", path, "--question", "What changed?", "--output", path
    ], collision.io)).toBe(1);
    expect(await readFile(path, "utf8")).toBe(before);

    const directory = join(root, "report-directory");
    await mkdir(directory);
    const invalid = output();
    expect(await runAskCommand(["--report", directory, "--question", "What changed?"], invalid.io)).toBe(1);
    expect(invalid.stderr.join("")).toContain("is a directory; provide a file path");
    expect(invalid.stderr.join("")).not.toMatch(/EISDIR|errno|illegal operation/i);
  });
});
