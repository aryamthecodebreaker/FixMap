import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseArgs, runCli } from "../src/cli-runner.js";
import type { FixMapReport } from "@aryam/fixmap-core";

const report: FixMapReport = {
  summary: "Found one context file.",
  contextFiles: [{ path: "src/index.ts", score: 10, confidence: "medium", reasons: ["path matches task terms"] }],
  testRoutes: [],
  risks: [],
  changedFiles: [],
  diagnostics: []
};

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    dependencies: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text)
    }
  };
}

describe("CLI argument handling", () => {
  it.each([
    ["--version"],
    ["-v"],
    ["version"],
    ["plan", "--version"]
  ])("prints the version for %j", async (...args) => {
    const io = capture();
    const exitCode = await runCli(args, {
      ...io.dependencies,
      readVersion: () => "9.9.9"
    });

    expect(exitCode).toBe(0);
    expect(io.stdout.join("")).toBe("9.9.9\n");
    expect(io.stderr).toEqual([]);
  });

  it("separates invalid values from unknown options and consumes the invalid value", async () => {
    const io = capture();
    const exitCode = await runCli(["plan", "--issue", "test", "--format", "yaml", "--mystery"], io.dependencies);

    expect(exitCode).toBe(1);
    expect(io.stderr.join("")).toContain('--format received "yaml"; expected "markdown" or "json"');
    expect(io.stderr.join("")).toContain("Unknown option(s): --mystery");
    expect(io.stderr.join("")).not.toContain("Unknown option(s): yaml");
  });

  it("reports empty inline values explicitly", () => {
    const parsed = parseArgs(["plan", "--issue=", "--output="]);

    expect(parsed.invalidValues).toEqual([
      "--issue requires non-empty text or a GitHub issue URL",
      "--output requires a non-empty file path"
    ]);
    expect(parsed.unknownArgs).toEqual([]);
  });

  it.each([
    ["plan", "--issue", "reset fails"],
    ["plan", "--issue=reset fails"]
  ])("accepts separated and inline issue values: %j", (...args) => {
    expect(parseArgs(args).issueText).toBe("reset fails");
  });

  it("rejects duplicate issue flags instead of silently taking the last", () => {
    const parsed = parseArgs(["plan", "--issue", "first", "--issue", "second"]);

    expect(parsed.invalidValues).toContain("pass only one --issue value");
    expect(parsed.issueText).toBe("first");
  });

  it("loads task text from --issue-file", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    const exitCode = await runCli(["plan", "--issue-file", "task.md"], {
      ...io.dependencies,
      buildReport,
      readIssueFile: () => "password reset emails fail"
    });

    expect(exitCode).toBe(0);
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      issueText: "password reset emails fail"
    }));
  });

  it("routes a valid plan to the injected report builder and output writer", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);
    const writeReport = vi.fn(async () => undefined);

    const exitCode = await runCli(
      ["plan", "--issue", "reset fails", "--format", "json", "--output", "report.json"],
      { ...io.dependencies, buildReport, writeReport }
    );

    expect(exitCode).toBe(0);
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({ issueText: "reset fails" }));
    expect(writeReport).toHaveBeenCalledWith("report.json", expect.stringContaining('"contextFiles"'));
    // The report itself never reaches stdout when written to a file. Saving a JSON plan
    // does name the command that consumes it, on stderr so the artifact stays clean.
    expect(io.stdout).toEqual([]);
    expect(io.stderr.join("")).toContain("fixmap verify --report report.json");
  });

  it.each([
    ["--repo", ["plan", "--issue", "x", "--repo", ".", "--repo", "examples/tiny-auth-app"]],
    ["--format", ["plan", "--issue", "x", "--format", "markdown", "--format", "json"]],
    ["--diff", ["plan", "--diff", "main...HEAD", "--diff", "HEAD~1...HEAD"]],
    ["--output", ["plan", "--issue", "x", "--output", "a.json", "--output", "b.json"]]
  ])("rejects duplicate %s instead of silently taking the last", (flag, args) => {
    // Silent last-wins is worst here: --repo then scans a different tree than the one the
    // user named first, and --format hands the consumer a contract it did not ask for.
    expect(parseArgs(args).invalidValues).toContain(`pass only one ${flag} value`);
  });

  it("keeps the first value when a flag is repeated", () => {
    const parsed = parseArgs(["plan", "--issue", "x", "--repo", "first", "--repo", "second"]);

    expect(parsed.repo).toBe("first");
  });

  it("writes the verification to --output rather than silently ignoring it", async () => {
    const io = capture();
    const writeReport = vi.fn(async () => undefined);
    const directory = await mkdtemp(join(tmpdir(), "fixmap-verify-"));
    const planPath = join(directory, "plan.json");
    await writeFile(planPath, JSON.stringify(report), "utf8");

    const exitCode = await runCli(
      ["verify", "--report", planPath, "--diff", "HEAD~1...HEAD", "--output", "verify.json"],
      { ...io.dependencies, writeReport }
    );

    expect(exitCode).toBe(0);
    expect(writeReport).toHaveBeenCalledWith("verify.json", expect.any(String));
    // --help documented --output and verify printed to stdout anyway, creating no file.
    expect(io.stdout).toEqual([]);
  });

  it("does not print a placeholder git spec inside a copy-paste command", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);
    const writeReport = vi.fn(async () => undefined);

    await runCli(
      ["plan", "--issue", "reset fails", "--format", "json", "--output", "report.json"],
      { ...io.dependencies, buildReport, writeReport }
    );

    const hint = io.stderr.join("");
    // "<base>...HEAD" is a documentation placeholder, not a git revision. Pasting the
    // suggested line failed.
    expect(hint).not.toContain("<base>");
    expect(hint).toContain("fixmap verify --report report.json");
    expect(hint).toContain("Add --diff");
  });

  it("names the real diff in the verify hint when the plan had one", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);
    const writeReport = vi.fn(async () => undefined);

    await runCli(
      ["plan", "--issue", "reset fails", "--base", "main", "--format", "json", "--output", "report.json"],
      { ...io.dependencies, buildReport, writeReport }
    );

    expect(io.stderr.join("")).toContain("--diff main...HEAD");
  });

  it("requires a task signal before invoking the report builder", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    const exitCode = await runCli(["plan"], { ...io.dependencies, buildReport });

    expect(exitCode).toBe(1);
    expect(buildReport).not.toHaveBeenCalled();
    expect(io.stderr.join("")).toContain("Provide --issue, --diff, or --base/--head");
  });
});
