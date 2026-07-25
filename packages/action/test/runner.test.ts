import { describe, expect, it, vi } from "vitest";
import type { FixMapReport } from "@aryam/fixmap-core";
import { fitStepSummary, renderActionOutputs, runAction } from "../src/runner.js";

const report: FixMapReport = {
  summary: "Mapped password reset changes.",
  contextFiles: [{
    path: "src/auth.ts",
    score: 1,
    confidence: "high",
    reasons: ["matches task"]
  }],
  testRoutes: [],
  risks: [],
  changedFiles: [],
  diagnostics: []
};

describe("GitHub Action runner", () => {
  it("writes all outputs in one append with a collision-resistant delimiter", () => {
    expect(renderActionOutputs("report without newline", report, () => "1234-5678")).toBe(
      "report<<fixmap_12345678\n" +
      "report without newline\n" +
      "fixmap_12345678\n" +
      "context-count=1\n" +
      "test-route-count=0\n"
    );
  });

  it("truncates oversized summaries by bytes and retains an explicit notice", () => {
    const summary = fitStepSummary("🙂".repeat(100), 180);
    expect(Buffer.byteLength(summary)).toBeLessThanOrEqual(180);
    expect(summary).not.toContain("�");
    expect(summary).toContain("report truncated");
  });

  it("executes the Action path with injected GitHub files and services", async () => {
    const writes: Array<{ path: string; contents: string }> = [];
    const stdout = vi.fn();
    const buildReport = vi.fn(async () => report);

    await runAction({
      GITHUB_EVENT_PATH: "event.json",
      GITHUB_OUTPUT: "output.txt",
      GITHUB_STEP_SUMMARY: "summary.md",
      INPUT_FORMAT: "json"
    }, {
      appendFile: (path, contents) => writes.push({ path, contents }),
      buildReport,
      cwd: () => "C:/repo",
      readFile: () => JSON.stringify({ pull_request: { number: 7, title: "Fix password reset" } }),
      stdout,
      uuid: () => "stable-id"
    });

    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      repoRoot: "C:/repo",
      issueText: "Fix password reset"
    }));
    expect(writes).toHaveLength(2);
    expect(writes[0]?.path).toBe("summary.md");
    expect(writes[1]?.contents).toContain("report<<fixmap_stableid\n");
    expect(writes[1]?.contents).toContain("\nfixmap_stableid\ncontext-count=1\n");
    expect(stdout).toHaveBeenCalledOnce();
  });
});
