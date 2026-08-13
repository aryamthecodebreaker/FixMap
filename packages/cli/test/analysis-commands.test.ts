import { describe, expect, it, vi } from "vitest";
import { runContextCommand, runGraphCommand } from "../src/analysis-commands.js";
import type { AnalyzedRepository } from "../src/analysis-source.js";

const analysis: AnalyzedRepository = {
  task: "resetPassword emails fail",
  report: {
    reportVersion: 1,
    summary: "one file",
    contextFiles: [{ rank: 1, path: "src/reset.ts", score: 20, confidence: "high", reasons: ["defines resetPassword"] }],
    impact: {
      seeds: ["src/reset.ts"],
      files: [{ path: "test/reset.test.ts", score: 8, confidence: "high", evidence: [{ kind: "test-route", seed: "src/reset.ts", reason: "routed test" }] }],
      inspectionOrder: ["src/reset.ts", "test/reset.test.ts"],
      history: { available: false, eligibleCommits: 0, shallow: false, truncated: false }
    },
    testRoutes: [], risks: [], changedFiles: [], diagnostics: []
  },
  repo: {
    root: "/repo",
    files: [
      { path: "src/reset.ts", extension: ".ts", sizeBytes: 60, isTest: false, isSource: true, kind: "code", textSample: "export function resetPassword() { return true; }\n", textSampleComplete: true },
      { path: "test/reset.test.ts", extension: ".ts", sizeBytes: 40, isTest: true, isSource: true, kind: "code", textSample: "test('resetPassword', () => {});\n", textSampleComplete: true }
    ],
    packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: []
  }
};

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, io: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) } };
}

describe("context and graph commands", () => {
  it("builds a JSON context pack with the requested budget", async () => {
    const output = capture();
    const analyze = vi.fn(async () => analysis);
    expect(await runContextCommand(["--issue", "resetPassword emails fail", "--budget", "512", "--format", "json"], { ...output.io, analyze })).toBe(0);
    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({ issueText: "resetPassword emails fail" }));
    expect(JSON.parse(output.stdout.join(""))).toMatchObject({ contextVersion: 1, budgetTokens: 512 });
  });

  it("exports Mermaid and JSON graphs", async () => {
    const mermaid = capture();
    const json = capture();
    expect(await runGraphCommand(["--issue", "resetPassword"], { ...mermaid.io, analyze: async () => analysis })).toBe(0);
    expect(mermaid.stdout.join("")).toContain("flowchart TD");
    expect(await runGraphCommand(["--issue", "resetPassword", "--format=json"], { ...json.io, analyze: async () => analysis })).toBe(0);
    expect(JSON.parse(json.stdout.join(""))).toMatchObject({ graphVersion: 1 });
  });

  it("rejects missing task signals, command-specific options, local refs, and unsupported formats", async () => {
    const missing = capture();
    const budget = capture();
    const graphBudget = capture();
    const localRef = capture();
    const format = capture();
    expect(await runContextCommand([], missing.io)).toBe(1);
    expect(await runContextCommand(["--issue", "x", "--budget", "255"], budget.io)).toBe(1);
    expect(await runGraphCommand(["--issue", "x", "--budget", "512"], graphBudget.io)).toBe(1);
    expect(graphBudget.stderr.join("")).toContain("Unknown graph option");
    expect(await runContextCommand(["--issue", "x", "--repo", ".", "--ref", "main"], localRef.io)).toBe(1);
    expect(localRef.stderr.join("")).toContain("--ref only applies");
    expect(await runGraphCommand(["--issue", "x", "--format", "dot"], format.io)).toBe(1);
  });
});
