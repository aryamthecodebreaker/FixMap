import { link, mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { parseArgs, runCli } from "../src/cli-runner.js";
import type { FixMapReport } from "@aryam/fixmap-core";

const report: FixMapReport = {
  summary: "Found one context file.",
  contextFiles: [{ rank: 1, path: "README.md", score: 10, confidence: "medium", reasons: ["path matches task terms"] }],
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
  it.each(["--help", "-h"])("shows command help for plan %s", async (flag) => {
    const io = capture();
    const exitCode = await runCli(["plan", flag], io.dependencies);

    expect(exitCode).toBe(0);
    expect(io.stdout.join("")).toContain("fixmap owner/repository#123");
    expect(io.stderr).toEqual([]);
  });

  it.each(["--help", "-h"])("shows help when %s follows other plan arguments", async (flag) => {
    const io = capture();
    const exitCode = await runCli(["plan", "--issue", "reset fails", flag], io.dependencies);

    expect(exitCode).toBe(0);
    expect(io.stdout.join("")).toContain("fixmap plan --issue");
    expect(io.stderr).toEqual([]);
  });

  it("expands the compact GitHub issue shorthand into a normal plan", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    const exitCode = await runCli(["owner/repository#123"], { ...io.dependencies, buildReport });

    expect(exitCode).toBe(0);
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      issueText: "https://github.com/owner/repository/issues/123"
    }));
  });

  it("accepts a canonical GitHub issue URL without plan --issue", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);
    const url = "https://github.com/owner/repository/issues/123";

    expect(await runCli([url], { ...io.dependencies, buildReport })).toBe(0);
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({ issueText: url }));
  });

  it.each([
    ["--version"],
    ["-v"],
    ["version"]
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

  it("lists the complete feature catalog for slash-command discovery", async () => {
    const io = capture();

    expect(await runCli(["features"], io.dependencies)).toBe(0);
    for (const feature of ["Plan", "Explain", "Compare", "Verify", "Validate", "Doctor", "MCP", "Focus", "Live changes", "Fresh scan"]) {
      expect(io.stdout.join("")).toContain(`**${feature}**`);
    }
    expect(io.stdout.join("")).toContain("fixmap setup");
  });

  it("documents the features subcommand directly", async () => {
    const io = capture();
    expect(await runCli(["features", "--help"], io.dependencies)).toBe(0);
    expect(io.stdout.join("")).toContain("Usage: fixmap features [--format markdown|json]");
  });

  it("keeps the npm package README aligned with the complete public feature catalog", async () => {
    const npmReadme = await readFile(new URL("../README.md", import.meta.url), "utf8");
    for (const feature of [
      "Plan", "Explain", "Compare", "Verify", "Validate", "Doctor", "MCP",
      "Focus controls", "Live changes", "Exact-state cache", "Slash-command discovery"
    ]) {
      expect(npmReadme).toContain(`**${feature}**`);
    }
    for (const command of ["fixmap setup", "fixmap features", "fixmap validate", "--no-cache"]) {
      expect(npmReadme).toContain(command);
    }
  });

  it("installs an idempotent /fixmap command for a selected agent", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-agent-setup-"));
    const first = capture();
    const second = capture();

    expect(await runCli(["setup", "--repo", root, "--agent", "cursor"], first.dependencies)).toBe(0);
    const installed = await readFile(join(root, ".cursor", "commands", "fixmap.md"), "utf8");
    expect(installed).toContain("fixmap features");
    expect(first.stdout.join("")).toContain("created: .cursor/commands/fixmap.md");

    expect(await runCli(["setup", "--repo", root, "--agent", "cursor"], second.dependencies)).toBe(0);
    expect(second.stdout.join("")).toContain("unchanged: .cursor/commands/fixmap.md");
  });

  it("accepts equals syntax for setup and rejects a missing repository value", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-agent-setup-equals-"));
    const installed = capture();
    const invalid = capture();

    expect(await runCli(["setup", `--repo=${root}`, "--agent=claude"], installed.dependencies)).toBe(0);
    expect(await readFile(join(root, ".claude", "skills", "fixmap", "SKILL.md"), "utf8")).toContain("fixmap features");
    expect(await runCli(["setup", "--repo", "--agent", "cursor"], invalid.dependencies)).toBe(1);
    expect(invalid.stderr.join("")).toContain("--repo requires a directory");
  });

  it("rejects repeated setup destinations instead of silently choosing the last one", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-agent-setup-repeat-"));
    const repeatedRepo = capture();
    const repeatedAgent = capture();

    expect(await runCli(["setup", "--repo", root, `--repo=${root}`], repeatedRepo.dependencies)).toBe(1);
    expect(repeatedRepo.stderr.join("")).toContain("Pass --repo only once");
    expect(await runCli(["setup", "--agent", "all", "--agent=cursor"], repeatedAgent.dependencies)).toBe(1);
    expect(repeatedAgent.stderr.join("")).toContain("Pass --agent only once");
  });

  it("preflights every setup target before creating files", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-agent-setup-atomic-"));
    await mkdir(join(root, ".cursor", "commands"), { recursive: true });
    await writeFile(join(root, ".cursor", "commands", "fixmap.md"), "custom command\n");
    const io = capture();

    expect(await runCli(["setup", "--repo", root, "--agent", "all"], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("Refusing to overwrite existing .cursor/commands/fixmap.md");
    await expect(readFile(join(root, ".claude", "skills", "fixmap", "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses setup paths whose parent link escapes the repository", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-agent-setup-link-"));
    const outside = await mkdtemp(join(tmpdir(), "fixmap-agent-setup-outside-"));
    await symlink(outside, join(root, ".claude"), process.platform === "win32" ? "junction" : "dir");
    const io = capture();

    expect(await runCli(["setup", "--repo", root, "--agent", "claude"], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("resolves outside the setup repository");
    await expect(readFile(join(outside, "skills", "fixmap", "SKILL.md"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("refuses to overwrite a hard-linked setup target", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-agent-setup-hardlink-"));
    const outside = join(root, "outside-command.md");
    const target = join(root, ".cursor", "commands", "fixmap.md");
    await mkdir(join(root, ".cursor", "commands"), { recursive: true });
    await writeFile(outside, "custom command\n");
    await link(outside, target);
    const io = capture();

    expect(await runCli(["setup", "--repo", root, "--agent", "cursor", "--force"], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("hard-linked");
    expect(await readFile(outside, "utf8")).toBe("custom command\n");
  });

  it("validates a saved report with a Windows byte-order mark without custom JavaScript", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-validate-"));
    const path = join(root, "report.json");
    await writeFile(path, `\uFEFF${JSON.stringify(report)}`);
    const io = capture();

    expect(await runCli(["validate", path, "--format", "json"], io.dependencies)).toBe(0);
    expect(JSON.parse(io.stdout.join(""))).toMatchObject({ valid: true, path, contextFiles: 1 });
  });

  it("rejects duplicate validate formats instead of silently choosing the last one", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-validate-format-"));
    const path = join(root, "report.json");
    await writeFile(path, JSON.stringify(report));
    const io = capture();

    expect(await runCli(["validate", path, "--format", "json", "--format=markdown"], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("Pass --format only once");
  });

  it("rejects a truncated non-empty report before validate or verify can crash", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-truncated-report-"));
    const path = join(root, "report.json");
    await writeFile(path, JSON.stringify({
      reportVersion: 1,
      contextFiles: [{ path: "src/reset.ts" }]
    }));
    const validateIo = capture();
    const verifyIo = capture();

    expect(await runCli(["validate", path], validateIo.dependencies)).toBe(1);
    expect(validateIo.stderr.join("")).toContain("complete FixMap report envelope");
    expect(await runCli(["verify", "--report", path, "--working-tree"], verifyIo.dependencies)).toBe(1);
    expect(verifyIo.stderr.join("")).toContain("complete FixMap report envelope");
    expect(verifyIo.stderr.join("")).not.toContain("Cannot read properties");
  });

  it("does not let a nested version flag short-circuit the requested command", async () => {
    const io = capture();
    const exitCode = await runCli(["plan", "--version"], io.dependencies);
    expect(exitCode).toBe(1);
    expect(io.stderr.join("")).toContain("Unknown option(s): --version");
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

  it("trims accidental whitespace around a format value", () => {
    expect(parseArgs(["plan", "--issue", "x", "--format", " JSON\n"]).format).toBe("json");
  });

  it("trims accidental whitespace around git refs", () => {
    const parsed = parseArgs([
      "plan", "--issue", "x", "--diff", " HEAD~1...HEAD\n", "--base", " main ", "--head", " feature "
    ]);
    expect(parsed.diffSpec).toBe("HEAD~1...HEAD");
    expect(parsed.baseRef).toBe("main");
    expect(parsed.headRef).toBe("feature");
  });

  it("expands the home directory consistently for path options", () => {
    const parsed = parseArgs([
      "plan", "--issue", "x", "--repo", "~", "--output", "~/plan.json", "--compare", "~\\before.json"
    ]);

    expect(parsed.repo).toBe(homedir());
    expect(parsed.output).toBe(join(homedir(), "plan.json"));
    expect(parsed.comparePath).toBe(join(homedir(), "before.json"));
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

  it("treats a leading @ as literal issue text unless --issue-file is explicit", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);
    const readIssueFile = vi.fn(() => "wrong task");

    expect(await runCli(["plan", "--issue", "@amy fix the reset flow"], {
      ...io.dependencies,
      buildReport,
      readIssueFile
    })).toBe(0);
    expect(readIssueFile).not.toHaveBeenCalled();
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      issueText: "@amy fix the reset flow"
    }));
  });

  it.each([
    ["UTF-8 BOM", Buffer.from([0xef, 0xbb, 0xbf, ...Buffer.from("password reset")])],
    ["UTF-16 LE", Buffer.from([0xff, 0xfe, ...Buffer.from("password reset", "utf16le")])],
    ["UTF-16 BE", Buffer.from([0xfe, 0xff, 0x00, 0x70, 0x00, 0x61, 0x00, 0x73, 0x00, 0x73])]
  ])("decodes %s issue files", async (_label, contents) => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    expect(await runCli(["plan", "--issue-file", "task.txt"], {
      ...io.dependencies,
      buildReport,
      readIssueFile: () => contents
    })).toBe(0);
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      issueText: expect.stringMatching(/^pass/)
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

  it("rejects --report in plan mode and points to --output", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    expect(await runCli(["plan", "--issue", "reset fails", "--report", "plan.json"], {
      ...io.dependencies,
      buildReport
    })).toBe(1);
    expect(buildReport).not.toHaveBeenCalled();
    expect(io.stderr.join("")).toContain("--report is a verify option");
    expect(io.stderr.join("")).toContain("--output");
  });

  it("passes --no-cache through as an explicit scan bypass", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    expect(await runCli(["plan", "--issue", "reset fails", "--no-cache"], {
      ...io.dependencies,
      buildReport
    })).toBe(0);
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({ useCache: false }));
  });

  it("applies --no-cache to the current scan in compare mode", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-compare-no-cache-"));
    const previousPath = join(root, "previous.json");
    await writeFile(previousPath, JSON.stringify(report));
    const buildReport = vi.fn(async () => report);
    const io = capture();

    expect(await runCli([
      "plan", "--issue", "reset fails", "--compare", previousPath, "--no-cache"
    ], { ...io.dependencies, buildReport })).toBe(0);
    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({ useCache: false }));
  });

  it("keeps its issue input and output report from ranking themselves", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-artifact-ranking-"));
    await mkdir(join(root, "src"), { recursive: true });
    const issuePath = join(root, "task.md");
    const outputPath = join(root, "plan.json");
    await writeFile(join(root, "src", "reset.ts"), "export function artifactShieldSignal() { return true; }\n");
    await writeFile(issuePath, "artifactShieldSignal fails during password reset\n");
    await writeFile(outputPath, JSON.stringify({ repeated: "artifactShieldSignal ".repeat(20) }));
    const writes: string[] = [];
    const io = capture();

    expect(await runCli([
      "plan", "--issue-file", issuePath, "--repo", root, "--format", "json", "--output", outputPath
    ], {
      ...io.dependencies,
      writeReport: async (_path, contents) => { writes.push(contents); }
    })).toBe(0);

    const rendered = JSON.parse(writes[0]!) as FixMapReport;
    expect(rendered.contextFiles.map((file) => file.path)).toContain("src/reset.ts");
    expect(rendered.contextFiles.map((file) => file.path)).not.toContain("task.md");
    expect(rendered.contextFiles.map((file) => file.path)).not.toContain("plan.json");
    expect(rendered.diagnostics.map((entry) => entry.code)).not.toContain("paths-excluded");
  });

  it("passes every in-repository workflow artifact as an internal exclusion", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-artifact-inputs-"));
    const issuePath = join(root, "task.md");
    const baselinePath = join(root, "baseline.json");
    const outputPath = join(root, "comparison.json");
    await writeFile(issuePath, "reset fails\n");
    await writeFile(baselinePath, JSON.stringify(report));
    const buildReport = vi.fn(async () => report);
    const io = capture();

    expect(await runCli([
      "plan", "--issue-file", issuePath, "--repo", root,
      "--compare", baselinePath, "--format", "json", "--output", outputPath
    ], {
      ...io.dependencies,
      buildReport,
      writeReport: vi.fn(async () => undefined)
    })).toBe(0);

    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      internalExclude: expect.arrayContaining([issuePath, baselinePath, outputPath])
    }));
  });

  it("writes an explanation to --output instead of silently printing it", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-explain-output-"));
    const outputPath = join(root, "explanation.json");
    await writeFile(join(root, "reset.ts"), "export function sendPasswordReset() { return true; }\n");
    const writeReport = vi.fn(async () => undefined);
    const io = capture();

    expect(await runCli([
      "plan", "--issue", "password reset fails", "--repo", root,
      "--explain", "reset.ts", "--format", "json", "--output", outputPath
    ], { ...io.dependencies, writeReport })).toBe(0);

    expect(io.stdout).toEqual([]);
    expect(writeReport).toHaveBeenCalledWith(outputPath, expect.stringContaining('"status": "ranked"'));
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

  it("keeps working-tree mode in the copy-paste verify hint", async () => {
    const io = capture();
    const writeReport = vi.fn(async () => undefined);

    await runCli(
      ["plan", "--issue", "reset fails", "--working-tree", "--include-untracked", "--format", "json", "--output", "report.json"],
      { ...io.dependencies, buildReport: vi.fn(async () => report), writeReport }
    );

    expect(io.stderr.join(""))
      .toContain("fixmap verify --report report.json --working-tree --include-untracked");
  });

  it("names both missing verify inputs when neither was provided", async () => {
    const io = capture();

    expect(await runCli(["verify"], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("Provide --report");
    expect(io.stderr.join("")).toContain("Also provide --diff, --base/--head, or --working-tree");
  });

  it("recognizes a comparison JSON passed where verify needs a plan", async () => {
    const io = capture();
    const directory = await mkdtemp(join(tmpdir(), "fixmap-comparison-as-plan-"));
    const comparisonPath = join(directory, "comparison.json");
    await writeFile(comparisonPath, JSON.stringify({
      summary: "same",
      entered: [],
      left: [],
      moved: [],
      confidenceChanged: [],
      unchanged: [],
      groundingChanged: false
    }));

    expect(await runCli(["verify", "--report", comparisonPath, "--diff", "HEAD"], io.dependencies)).toBe(1);
    expect(io.stderr.join("")).toContain("comparison result, not a plan report");
  });

  it.each([
    ["--limit", ["plan", "--issue", "x", "--limit", "0"]],
    ["--limit", ["plan", "--issue", "x", "--limit", "21"]],
    ["--limit", ["plan", "--issue", "x", "--limit", "three"]]
  ])("rejects an out-of-range %s", (_flag, args) => {
    expect(parseArgs(args).invalidValues.join(" ")).toContain("--limit received");
  });

  it("accumulates --exclude rather than rejecting the second one", () => {
    // The one repeatable flag: naming several directories to leave out is the normal use.
    const parsed = parseArgs(["plan", "--issue", "x", "--exclude", "apps/web", "--exclude", "docs/**"]);

    expect(parsed.exclude).toEqual(["apps/web", "docs/**"]);
    expect(parsed.invalidValues).toEqual([]);
  });

  it("passes limit and exclusions through to the report builder", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    await runCli(
      ["plan", "--issue", "reset fails", "--limit", "3", "--exclude", "apps/web"],
      { ...io.dependencies, buildReport }
    );

    expect(buildReport).toHaveBeenCalledWith(expect.objectContaining({
      limit: 3,
      exclude: ["apps/web"]
    }));
  });

  it("refuses --working-tree together with an explicit diff", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    const exitCode = await runCli(
      ["plan", "--issue", "x", "--working-tree", "--diff", "main...HEAD"],
      { ...io.dependencies, buildReport }
    );

    expect(exitCode).toBe(1);
    expect(buildReport).not.toHaveBeenCalled();
    expect(io.stderr.join("")).toContain("not both");
  });

  it("refuses --include-untracked without --working-tree", async () => {
    const io = capture();

    const exitCode = await runCli(["plan", "--issue", "x", "--include-untracked"], io.dependencies);

    expect(exitCode).toBe(1);
    expect(io.stderr.join("")).toContain("only applies with --working-tree");
  });

  it("compares a plan against an earlier report", async () => {
    const io = capture();
    const directory = await mkdtemp(join(tmpdir(), "fixmap-compare-"));
    const previousPath = join(directory, "previous.json");
    await writeFile(previousPath, JSON.stringify({
      ...report,
      contextFiles: [
        { rank: 1, path: "src/other.ts", score: 12, confidence: "medium", reasons: [] },
        { rank: 2, path: "src/index.ts", score: 10, confidence: "low", reasons: [] }
      ]
    }), "utf8");

    const exitCode = await runCli(
      ["plan", "--issue", "reset fails", "--compare", previousPath],
      { ...io.dependencies, buildReport: vi.fn(async () => report) }
    );

    expect(exitCode).toBe(0);
    const output = io.stdout.join("");
    expect(output).toContain("# FixMap Plan Comparison");
    expect(output).toContain("src/other.ts");
    // The delta is the answer; the full report is what the previous run already gave.
    expect(output).not.toContain("## Test Route");
  });

  it("fails with guidance when the comparison target is not a report", async () => {
    const io = capture();
    const directory = await mkdtemp(join(tmpdir(), "fixmap-compare-bad-"));
    const badPath = join(directory, "notes.json");
    await writeFile(badPath, JSON.stringify({ hello: "world" }), "utf8");

    const exitCode = await runCli(
      ["plan", "--issue", "reset fails", "--compare", badPath],
      { ...io.dependencies, buildReport: vi.fn(async () => report) }
    );

    expect(exitCode).toBe(1);
    expect(io.stderr.join("")).toContain("no contextFiles array");
  });

  it("does not compare when the requested diff failed to resolve", async () => {
    const io = capture();
    const directory = await mkdtemp(join(tmpdir(), "fixmap-compare-diff-failure-"));
    const previousPath = join(directory, "plan.json");
    await writeFile(previousPath, JSON.stringify(report), "utf8");
    const failed = structuredClone(report);
    failed.diagnostics = [{ code: "diff-unavailable", severity: "warning", message: "missing ref" }];

    expect(await runCli([
      "plan", "--issue", "reset fails", "--diff", "missing...HEAD", "--compare", previousPath
    ], {
      ...io.dependencies,
      buildReport: vi.fn(async () => failed)
    })).toBe(1);
    expect(io.stdout).toEqual([]);
    expect(io.stderr.join("")).toContain("was not compared");
  });

  it("reports a healthy install and exits zero", async () => {
    const io = capture();

    const exitCode = await runCli(["doctor"], {
      ...io.dependencies,
      runDoctor: async () => ({
        healthy: true,
        findings: [{ label: "Running version", value: "0.8.0", ok: true }]
      })
    });

    expect(exitCode).toBe(0);
    expect(io.stdout.join("")).toContain("No install problems detected");
  });

  it("exits non-zero when doctor finds a shadowing install", async () => {
    const io = capture();

    // The #103 footgun: npx asked for 0.7.3 and got 0.3.1, so verify "did not exist".
    const exitCode = await runCli(["doctor"], {
      ...io.dependencies,
      runDoctor: async () => ({
        healthy: false,
        findings: [{
          label: "Global install",
          value: "0.3.1 (this process is 0.8.0)",
          ok: false,
          advice: "Run `npm uninstall -g @aryam/fixmap`."
        }]
      })
    });

    expect(exitCode).toBe(1);
    expect(io.stdout.join("")).toContain("PROBLEM");
    expect(io.stdout.join("")).toContain("npm uninstall -g");
  });

  it("requires a task signal before invoking the report builder", async () => {
    const io = capture();
    const buildReport = vi.fn(async () => report);

    const exitCode = await runCli(["plan"], { ...io.dependencies, buildReport });

    expect(exitCode).toBe(1);
    expect(buildReport).not.toHaveBeenCalled();
    expect(io.stderr.join("")).toContain("Provide --issue, --diff, --base/--head, or --working-tree");
  });
});
