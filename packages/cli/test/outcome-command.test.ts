import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import type { FixMapReport, OutcomeRecord } from "@aryam/fixmap-core";
import { runCli } from "../src/cli-runner.js";
import { runDossierCommand, runOutcomeCommand, type RecordCommandIo } from "../src/outcome-command.js";
import { runDossierTool, runOutcomesTool } from "../src/record-tools.js";

const exec = promisify(execFile);
const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

const report: FixMapReport = {
  reportVersion: 1,
  summary: "Ranked.",
  contextFiles: [
    { rank: 1, path: "src/a.ts", score: 9, confidence: "high", reasons: ["named"] },
    { rank: 2, path: "src/b.ts", score: 5, confidence: "medium", reasons: ["imports"] }
  ],
  testRoutes: [],
  risks: [],
  changedFiles: [],
  diagnostics: []
};

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "fixmap-outcome-cli-"));
  roots.push(root);
  const reportPath = join(root, "plan.json");
  await writeFile(reportPath, JSON.stringify(report));
  return { root, reportPath };
}

function io(edited: string[] = [], now = "2026-11-20T10:00:00.000Z") {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const value: RecordCommandIo = {
    stdout: (text) => { stdout.push(text); },
    stderr: (text) => { stderr.push(text); },
    now: () => new Date(now),
    changedFiles: async () => edited
  };
  return { stdout, stderr, io: value, out: () => stdout.join(""), err: () => stderr.join("") };
}

async function storedOutcomes(root: string) {
  const result = io();
  expect(await runOutcomeCommand(["list", `--repo=${root}`, "--format=json"], result.io)).toBe(0);
  return JSON.parse(result.out()) as { records: OutcomeRecord[]; problems: unknown[] };
}

const sha = (text: string) => `sha256:${createHash("sha256").update(text).digest("hex")}`;

describe("fixmap outcome", () => {
  it("records predicted versus edited paths and command results, then shows and removes the record", async () => {
    const { root, reportPath } = await setup();
    const commandPath = join(root, "tests.json");
    await writeFile(commandPath, JSON.stringify([
      { command: "npm test", status: "passed", evidence: "exit 0", relatedPaths: ["test/a.test.ts"] },
      { sandboxResultVersion: 1, executionId: "run-1", image: "node@sha256:abc", command: "npm run lint", status: "failed", exitCode: 1 }
    ]));
    const recorded = io(["src/a.ts", "src/c.ts"]);
    expect(await runOutcomeCommand(["record", "--repo", root, "--report", reportPath, "--working-tree", "--command-result", commandPath,
      "--assessment", "agent", "--status", "succeeded", "--reason", "Tests pass"], recorded.io)).toBe(0);
    expect(recorded.out()).toContain("1 of 2 edited path(s) were predicted; 1 predicted path(s) were not edited.");
    const [record] = (await storedOutcomes(root)).records;
    expect(record).toMatchObject({
      predictedPaths: ["src/a.ts", "src/b.ts"],
      editedPaths: ["src/a.ts", "src/c.ts"],
      recordedAt: "2026-11-20T10:00:00.000Z",
      planFingerprint: sha(JSON.stringify(report)),
      repositoryIdentity: expect.stringMatching(/^fixmap:\/\/workspace\/local\/repository\//),
      taskAssessment: { status: "succeeded", source: "agent", reason: "Tests pass" }
    });
    expect(record!.id).toMatch(/^outcome-20261120T100000Z-[a-f0-9]{8}$/);
    expect(record!.testOutcomes).toEqual([
      { command: "npm run lint", status: "failed", relatedPaths: [], evidence: "sandbox run-1 exit 1 image node@sha256:abc" },
      { command: "npm test", status: "passed", relatedPaths: ["test/a.test.ts"], evidence: "exit 0" }
    ]);

    const shown = io();
    expect(await runOutcomeCommand(["show", record!.id, `--repo=${root}`], shown.io)).toBe(0);
    expect(shown.out()).toContain("## Edited paths\n- src/a.ts\n- src/c.ts");
    const removed = io();
    expect(await runOutcomeCommand(["remove", record!.id, `--repo=${root}`], removed.io)).toBe(0);
    expect((await storedOutcomes(root)).records).toEqual([]);
  });

  it("redacts the assessment reason and command evidence to SHA-256", async () => {
    const { root, reportPath } = await setup();
    const commandPath = join(root, "tests.json");
    await writeFile(commandPath, JSON.stringify({ command: "npm test", status: "passed", evidence: "token=secret in log" }));
    const result = io(["src/a.ts"]);
    expect(await runOutcomeCommand(["record", `--repo=${root}`, `--report=${reportPath}`, "--diff=main...HEAD", `--command-result=${commandPath}`,
      "--assessment=human", "--status=partial", "--reason=Customer ACME complained", "--redact"], result.io)).toBe(0);
    const stored = await readFile(join(root, ".fixmap", "outcomes", (await readdir(join(root, ".fixmap", "outcomes")))[0]!), "utf8");
    expect(stored).not.toContain("ACME");
    expect(stored).not.toContain("secret");
    const [record] = (await storedOutcomes(root)).records;
    expect(record!.taskAssessment.reason).toBe(sha("Customer ACME complained"));
    expect(record!.testOutcomes[0]!.evidence).toBe(sha("token=secret in log"));
  });

  it("calibrates across stored records without changing ranking weights", async () => {
    const { root, reportPath } = await setup();
    // Record 1: predicted a,b; edited a,c → 1 correct, 1 false positive, 1 miss.
    expect(await runOutcomeCommand(["record", `--repo=${root}`, `--report=${reportPath}`, "--working-tree"], io(["src/a.ts", "src/c.ts"]).io)).toBe(0);
    // Record 2: predicted a,b; edited a,b → 2 correct.
    expect(await runOutcomeCommand(["record", `--repo=${root}`, `--report=${reportPath}`, "--working-tree", "--assessment=human", "--status=failed"],
      io(["src/a.ts", "src/b.ts"], "2026-11-21T10:00:00.000Z").io)).toBe(0);
    const json = io();
    expect(await runOutcomeCommand(["calibrate", `--repo=${root}`, "--format", "json"], json.io)).toBe(0);
    const calibration = JSON.parse(json.out());
    expect(calibration).toMatchObject({
      records: 2,
      totals: { predictedPaths: 4, editedPaths: 4, correctlyPredictedEdits: 3, predictedButUnedited: 1, editedButUnpredicted: 1 },
      precision: 0.75,
      recall: 0.75,
      taskAssessments: { failed: 1, unknown: 1, succeeded: 0, partial: 0 },
      automaticWeightChanges: false,
      problems: []
    });
    const markdown = io();
    expect(await runOutcomeCommand(["calibrate", `--repo=${root}`], markdown.io)).toBe(0);
    expect(markdown.out()).toContain("Precision: 75.0% (3 of 4 predicted paths were edited)");
    expect(markdown.out()).toContain("automaticWeightChanges: false");
    const empty = io();
    expect(await runOutcomeCommand(["calibrate", `--repo=${(await setup()).root}`], empty.io)).toBe(0);
    expect(empty.out()).toContain("Precision: n/a");
  });

  it("prunes records older than a number of days", async () => {
    const { root, reportPath } = await setup();
    await runOutcomeCommand(["record", `--repo=${root}`, `--report=${reportPath}`, "--working-tree"], io([], "2026-01-01T00:00:00.000Z").io);
    await runOutcomeCommand(["record", `--repo=${root}`, `--report=${reportPath}`, "--working-tree"], io([], "2026-11-19T00:00:00.000Z").io);
    const pruned = io([], "2026-11-20T00:00:00.000Z");
    expect(await runOutcomeCommand(["prune", `--repo=${root}`, "--older-than", "30"], pruned.io)).toBe(0);
    expect(pruned.out()).toContain("Removed 1 outcome record(s)");
    expect((await storedOutcomes(root)).records.map((record) => record.recordedAt)).toEqual(["2026-11-19T00:00:00.000Z"]);
    expect(await runOutcomeCommand(["prune", `--repo=${root}`, "--older-than", "-1"], io().io)).toBe(1);
  });

  it("lists malformed stored files as problems instead of failing", async () => {
    const { root, reportPath } = await setup();
    await runOutcomeCommand(["record", `--repo=${root}`, `--report=${reportPath}`, "--working-tree"], io(["src/a.ts"]).io);
    await writeFile(join(root, ".fixmap", "outcomes", "broken.json"), "{");
    const listed = io();
    expect(await runOutcomeCommand(["list", `--repo=${root}`], listed.io)).toBe(0);
    expect(listed.out()).toContain("## Unreadable stored files (1)\n\n- .fixmap/outcomes/broken.json: Not valid JSON");
    const calibrated = io();
    expect(await runOutcomeCommand(["calibrate", `--repo=${root}`, "--format=json"], calibrated.io)).toBe(0);
    expect(JSON.parse(calibrated.out())).toMatchObject({ records: 1, problems: [{ file: ".fixmap/outcomes/broken.json" }] });
  });

  it("rejects invalid arguments with a clear message", async () => {
    const { root, reportPath } = await setup();
    const cases: Array<[string[], string]> = [
      [["record", `--report=${reportPath}`], "Provide --diff <spec> or --working-tree"],
      [["record", `--report=${reportPath}`, "--working-tree", "--diff=a..b"], "not both"],
      [["record", `--report=${reportPath}`, "--working-tree", "--assessment=human"], "--status succeeded|failed|partial|unknown is required"],
      [["record", `--report=${reportPath}`, "--working-tree", "--status=succeeded"], "An unassessed outcome can only have --status unknown"],
      [["record", `--report=${join(root, "missing.json")}`, "--working-tree"], "does not exist"],
      [["list", "--older-than=3"], "--older-than does not apply to outcome list"],
      [["show"], "needs exactly one record id"],
      [["show", "../../etc/passwd"], "Invalid outcome record id"],
      [["explode"], "Unknown outcome action: explode"],
      [["list", "--format=xml"], "--format must be markdown or json"]
    ];
    for (const [args, message] of cases) {
      const result = io(["src/a.ts"]);
      expect(await runOutcomeCommand([...args, `--repo=${root}`], result.io), args.join(" ")).toBe(1);
      expect(result.err(), args.join(" ")).toContain(message);
    }
    const markdown = join(root, "plan.md");
    await writeFile(markdown, "# FixMap report");
    const result = io();
    expect(await runOutcomeCommand(["record", `--repo=${root}`, `--report=${markdown}`, "--working-tree"], result.io)).toBe(1);
    expect(result.err()).toContain("is not a JSON FixMap report");
    expect(await readdir(root)).not.toContain(".fixmap");
  });

  it("reads edited paths from a real Git working tree through the CLI", async () => {
    const { root, reportPath } = await setup();
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src", "a.ts"), "export const a = 1;\n");
    await writeFile(join(root, "src", "b.ts"), "export const b = 1;\n");
    await exec("git", ["init", "--quiet"], { cwd: root });
    await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
    await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
    await exec("git", ["add", "src"], { cwd: root });
    await exec("git", ["commit", "--quiet", "-m", "init"], { cwd: root });
    await writeFile(join(root, "src", "a.ts"), "export const a = 2;\n");
    const stdout: string[] = [];
    const stderr: string[] = [];
    expect(await runCli(["outcome", "record", "--repo", root, "--report", reportPath, "--working-tree"], {
      stdout: (text) => { stdout.push(text); }, stderr: (text) => { stderr.push(text); }
    }), stderr.join("")).toBe(0);
    expect((await storedOutcomes(root)).records[0]).toMatchObject({ editedPaths: ["src/a.ts"] });
  });
});

describe("fixmap dossier", () => {
  it("creates, lists, shows, and removes a fingerprinted dossier with diff and release identifiers", async () => {
    const { root, reportPath } = await setup();
    const created = io(["src/a.ts"]);
    expect(await runDossierCommand(["create", `--repo=${root}`, `--report=${reportPath}`, "--task", "Fix login redirect",
      "--diff=main...HEAD", "--pr=https://github.com/o/r/pull/9", "--commit=abc123"], created.io)).toBe(0);
    expect(created.out()).toMatch(/Saved \.fixmap\/dossiers\/dossier-20261120T100000Z-[a-f0-9]{8}\.json \(dossier:[a-f0-9]{16}\)/);
    const listed = io();
    expect(await runDossierCommand(["list", `--repo=${root}`, "--format=json"], listed.io)).toBe(0);
    const [dossier] = JSON.parse(listed.out()).records;
    expect(dossier).toMatchObject({
      request: { summary: "Fix login redirect", sourceFingerprint: sha("Fix login redirect") },
      plan: { reportFingerprint: sha(JSON.stringify(report)), artifactPath: "plan.json" },
      diff: { changedFiles: ["src/a.ts"], base: "main...HEAD" },
      releaseIdentifiers: { pullRequest: "https://github.com/o/r/pull/9", commit: "abc123" }
    });
    const shown = io();
    expect(await runDossierCommand(["show", dossier.id, `--repo=${root}`], shown.io)).toBe(0);
    expect(shown.out()).toContain("- pullRequest: https://github.com/o/r/pull/9");
    expect(await runDossierCommand(["remove", dossier.id, `--repo=${root}`], io().io)).toBe(0);
    expect(await readdir(join(root, ".fixmap", "dossiers"))).toEqual([]);
  });

  it("redacts the task text and allows a dossier without a diff", async () => {
    const { root, reportPath } = await setup();
    expect(await runDossierCommand(["create", `--repo=${root}`, `--report=${reportPath}`, "--task=Patient Jane Doe data leak", "--redact"], io().io)).toBe(0);
    const directory = join(root, ".fixmap", "dossiers");
    const text = await readFile(join(directory, (await readdir(directory))[0]!), "utf8");
    expect(text).not.toContain("Jane");
    expect(JSON.parse(text)).toMatchObject({ request: { summary: sha("Patient Jane Doe data leak") }, diff: null });
    const missingTask = io();
    expect(await runDossierCommand(["create", `--repo=${root}`, `--report=${reportPath}`], missingTask.io)).toBe(1);
    expect(missingTask.err()).toContain("requires --task");
  });
});

describe("read-only MCP record tools", () => {
  it("lists, shows, and calibrates outcomes and dossiers without writing", async () => {
    const { root, reportPath } = await setup();
    await runOutcomeCommand(["record", `--repo=${root}`, `--report=${reportPath}`, "--working-tree"], io(["src/a.ts"]).io);
    await runDossierCommand(["create", `--repo=${root}`, `--report=${reportPath}`, "--task=Fix"], io().io);
    const listed = await runOutcomesTool({ action: "list", repo: root }, root);
    const id = JSON.parse(listed.content[0]!.text).records[0].id as string;
    const shown = await runOutcomesTool({ action: "show", id }, root);
    expect(JSON.parse(shown.content[0]!.text).id).toBe(id);
    const calibration = JSON.parse((await runOutcomesTool({ action: "calibrate", repo: root }, root)).content[0]!.text);
    expect(calibration).toMatchObject({ records: 1, precision: 0.5, recall: 1, automaticWeightChanges: false });
    const dossiers = JSON.parse((await runDossierTool({ action: "list" }, root)).content[0]!.text);
    expect(dossiers.records).toHaveLength(1);

    for (const [tool, args, message] of [
      [runOutcomesTool, { action: "record" }, "action must be"],
      [runOutcomesTool, { action: "remove", id }, "action must be"],
      [runDossierTool, { action: "calibrate" }, "action must be"],
      [runDossierTool, { action: "show" }, "id is required"],
      [runOutcomesTool, { action: "list", id }, "id only applies"],
      [runOutcomesTool, { action: "list", olderThan: "3" }, "not allowed"],
      [runOutcomesTool, { action: "show", id: "--repo=/" }, "cannot begin"],
      [runDossierTool, { action: "list", repo: "https://example.com/r" }, "local directory"]
    ] as const) {
      const result = await tool(args, root);
      expect(result.isError).toBe(true);
      expect(result.content[0]!.text).toContain(message);
    }
    const missing = await runOutcomesTool({ action: "show", id: "outcome-missing" }, root);
    expect(missing.isError).toBe(true);
    expect(missing.content[0]!.text).toContain("No outcome record found");
  });
});
