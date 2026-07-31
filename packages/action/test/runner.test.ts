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

  it("accepts case-insensitive format input", async () => {
    const stdout = vi.fn();
    await runAction({ INPUT_ISSUE: "password reset", INPUT_FORMAT: "JSON" }, {
      buildReport: vi.fn(async () => structuredClone(report)),
      stdout
    });

    expect(stdout.mock.calls[0]?.[0]).toContain('"contextFiles"');
  });

  it("fetches same-repository GitHub issue URLs before ranking", async () => {
    const buildReport = vi.fn(async () => structuredClone(report));
    await runAction({
      GITHUB_REPOSITORY: "owner/repository",
      INPUT_ISSUE: "https://github.com/owner/repository/issues/123"
    }, {
      buildReport,
      fetchIssue: async () => ({ title: "Reset emails fail", body: "Password reset is broken" }),
      stdout: vi.fn()
    });

    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      issueText: "Reset emails fail\n\nPassword reset is broken"
    }));
  });

  it("fetches a pull request URL and names it as one", async () => {
    const buildReport = vi.fn(async () => structuredClone(report));
    const stdout = vi.fn();

    await runAction({
      GITHUB_REPOSITORY: "owner/repository",
      INPUT_ISSUE: "https://github.com/owner/repository/pull/123"
    }, {
      buildReport,
      fetchIssue: async () => ({ title: "Fix reset emails", body: "Rewrites the mailer." }),
      stdout
    });

    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      issueText: "Fix reset emails\n\nRewrites the mailer."
    }));
    expect(stdout.mock.calls[0]?.[0]).toContain("/pull/123");
  });

  it("verifies a saved plan against the diff in verify mode", async () => {
    const stdout = vi.fn();
    const writes: Array<{ path: string; contents: string }> = [];

    await runAction({
      INPUT_MODE: "verify",
      INPUT_REPORT_PATH: "plan.json",
      INPUT_DIFF: "main...HEAD",
      GITHUB_OUTPUT: "/tmp/output"
    }, {
      readFile: () => JSON.stringify(report),
      appendFile: (path, contents) => writes.push({ path, contents }),
      scanRepo: async () => scannedRepo(["src/auth.ts"]),
      uuid: () => "stable-id",
      stdout
    });

    expect(stdout.mock.calls[0]?.[0]).toContain("# FixMap Verification");
    expect(writes[0]?.contents).toContain("changed-file-count=1");
  });

  it("says what verify mode needs when report-path is missing", async () => {
    await expect(runAction({ INPUT_MODE: "verify", INPUT_DIFF: "main...HEAD" }, { stdout: vi.fn() }))
      .rejects.toThrow("report-path");
  });

  it("rejects an unknown mode rather than silently planning", async () => {
    await expect(runAction({ INPUT_MODE: "audit", INPUT_ISSUE: "x" }, { stdout: vi.fn() }))
      .rejects.toThrow("expected plan or verify");
  });

  it("fails the step when verification finds an edit the build discards", async () => {
    // The one finding that is wrong regardless of the task, so it must not be scrolled past.
    await expect(runAction({
      INPUT_MODE: "verify",
      INPUT_REPORT_PATH: "plan.json",
      INPUT_DIFF: "main...HEAD"
    }, {
      readFile: () => JSON.stringify(report),
      scanRepo: async () => scannedRepo(["dist/auth.js"]),
      stdout: vi.fn()
    })).rejects.toThrow("generated or retired location");
  });
});

function scannedRepo(changedFiles: string[]) {
  return {
    root: "/repo",
    files: [{
      path: "src/auth.ts",
      extension: ".ts",
      sizeBytes: 10,
      isSource: true,
      isTest: false,
      kind: "code" as const,
      textSample: ""
    }],
    packageScripts: [],
    changedFiles,
    diffText: "",
    packageManager: "npm" as const,
    diagnostics: []
  };
}
