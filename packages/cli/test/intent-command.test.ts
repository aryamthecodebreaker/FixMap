import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { runCli } from "../src/cli-runner.js";
import { parseEdit } from "../src/intent-command.js";
import { createFixMapMcpServer } from "../src/mcp.js";

const exec = promisify(execFile);
const TIMEOUT = process.platform === "win32" ? 60_000 : 30_000;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function repository(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-intent-cli-"));
  roots.push(root);
  await writeFile(join(root, "users.ts"), "export const users = [];\n");
  await writeFile(join(root, "teams.ts"), "export const teams = [];\n");
  for (const args of [["init", "--quiet"], ["add", "-A"], ["-c", "user.name=T", "-c", "user.email=t@example.test", "commit", "--quiet", "-m", "base"]]) {
    await exec("git", args, { cwd: root });
  }
  return root;
}

async function cli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await runCli(args, { stdout: (text) => { stdout += text; }, stderr: (text) => { stderr += text; } });
  return { code, stdout, stderr };
}

describe("fixmap intent and conflicts", () => {
  it("parses edit ranges", () => {
    expect(parseEdit("src/a.ts")).toEqual({ path: "src/a.ts" });
    expect(parseEdit("src/a.ts:10-20,40-45")).toEqual({ path: "src/a.ts", ranges: [{ start: 10, end: 20 }, { start: 40, end: 45 }] });
    expect(parseEdit("odd:name.ts")).toEqual({ path: "odd:name.ts" });
  });

  it("records, lists, detects overlap, and releases", async () => {
    const root = await repository();
    const a = await cli(["intent", "record", "--repo", root, "--agent", "agent-a", "--task", "dedupe users", "--edit", "users.ts:1-5", "--id", "a", "--format", "json"]);
    expect(a.code).toBe(0);
    expect(JSON.parse(a.stdout)).toMatchObject({ id: "a", agent: "agent-a", edits: [{ path: "users.ts", ranges: [{ start: 1, end: 5 }] }] });

    expect((await cli(["conflicts", "--repo", root])).code).toBe(0);

    expect((await cli(["intent", "record", "--repo", root, "--agent", "agent-b", "--task", "rename users", "--edit", "users.ts:30-40", "--id", "b"])).code).toBe(0);
    const disjoint = await cli(["conflicts", "--repo", root, "--format", "json"]);
    expect(disjoint.code).toBe(0);
    expect(JSON.parse(disjoint.stdout).analysis.conflicts.map((conflict: { kind: string }) => conflict.kind)).toEqual(["edit-disjoint-ranges"]);

    expect((await cli(["intent", "record", "--repo", root, "--agent", "agent-c", "--task", "rewrite users", "--edit", "users.ts", "--id", "c"])).code).toBe(0);
    const blocking = await cli(["conflicts", "--repo", root]);
    expect(blocking.code).toBe(1);
    expect(blocking.stdout).toContain("**error** edit-edit between `a` and `c`");
    expect(blocking.stdout).toContain("Files: `users.ts`");

    const listing = await cli(["intent", "list", "--repo", root]);
    expect(listing.stdout).toContain("- `a` (agent-a)");
    expect(listing.stdout).toContain("  - `users.ts` lines 1-5");

    expect((await cli(["intent", "release", "c", "--repo", root])).code).toBe(0);
    expect((await cli(["intent", "release", "c", "--repo", root])).code).toBe(1);
    expect((await cli(["conflicts", "--repo", root])).code).toBe(0);
    expect((await cli(["intent", "prune", "--repo", root])).stdout).toBe("No expired intents.\n");
  }, TIMEOUT);

  it("checks a saved plan as a proposal against live intents", async () => {
    const root = await repository();
    const planPath = join(root, "..", `plan-${Date.now()}.json`);
    roots.push(planPath);
    expect((await cli(["plan", "--issue", "users list", "--repo", root, "--format", "json", "--output", planPath, "--no-cache"])).code).toBe(0);
    await cli(["intent", "record", "--repo", root, "--agent", "agent-a", "--task", "users", "--edit", "users.ts", "--id", "a"]);
    const result = await cli(["conflicts", "--repo", root, "--report", planPath, "--agent", "agent-b", "--format", "json"]);
    expect(result.code).toBe(1);
    const report = JSON.parse(result.stdout);
    expect(report.intents.map((intent: { id: string }) => intent.id)).toEqual(["a", "proposed"]);
    expect(report.analysis.conflicts[0]).toMatchObject({ kind: "edit-edit", intents: ["a", "proposed"] });
  }, TIMEOUT);

  it("rejects bad input with usage", async () => {
    const root = await repository();
    const cases: Array<[string[], RegExp]> = [
      [["intent"], /Usage: fixmap intent record/],
      [["intent", "grab"], /Unknown intent action/],
      [["intent", "record", "--repo", root, "--agent", "a"], /needs --agent, --task, and at least one --edit/],
      [["intent", "record", "--repo", root, "--agent", "a", "--task", "t", "--edit", "../x.ts"], /without "\.\."/],
      [["intent", "record", "--repo", root, "--agent", "a", "--task", "t", "--edit", "x.ts", "--ttl", "soon"], /whole number of minutes/],
      [["intent", "record", "--repo", root, "--agent", "a", "--task", "t", "--edit", "x.ts:9-2"], /1 <= start <= end/],
      [["intent", "release", "--repo", root], /Missing the intent id/],
      [["intent", "list", "--agent", "a"], /Unknown option/],
      [["conflicts", "--agent", "a"], /pass both/],
      [["conflicts", "--format", "yaml"], /markdown or json/]
    ];
    for (const [args, message] of cases) {
      const result = await cli(args);
      expect(result.code).toBe(1);
      expect(result.stderr).toMatch(message);
    }
    const noGit = await mkdtemp(join(tmpdir(), "fixmap-intent-nogit-"));
    roots.push(noGit);
    const result = await cli(["intent", "record", "--repo", noGit, "--agent", "a", "--task", "t", "--edit", "x.ts"]);
    expect(result.stderr).toMatch(/no committed HEAD/);
  }, TIMEOUT);

  it("coordinates through MCP fixmap_intent and fixmap_conflicts", async () => {
    const root = await repository();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "fixmap-intent-client", version: "0.0.0" });
    await Promise.all([createFixMapMcpServer().connect(serverTransport), client.connect(clientTransport)]);
    const text = (result: { content?: unknown }) => (result.content as Array<{ text: string }>)[0]!.text;
    try {
      const recorded = await client.callTool({ name: "fixmap_intent", arguments: {
        action: "record", repo: root, agent: "agent-a", task: "users", id: "a", format: "json",
        edits: [{ path: "users.ts", ranges: [{ start: 1, end: 3 }] }], impacts: ["teams.ts"]
      } });
      expect(recorded.isError).toBeFalsy();
      expect(JSON.parse(text(recorded))).toMatchObject({ id: "a", impacts: ["teams.ts"] });
      await client.callTool({ name: "fixmap_intent", arguments: { action: "record", repo: root, agent: "agent-b", task: "teams", id: "b", edits: ["teams.ts"] } });

      const conflicts = await client.callTool({ name: "fixmap_conflicts", arguments: { repo: root, format: "json" } });
      expect(conflicts.isError).toBeFalsy();
      expect(JSON.parse(text(conflicts))).toMatchObject({ blocking: 1, analysis: { conflicts: [expect.objectContaining({ kind: "edit-impact" })] } });

      const listed = await client.callTool({ name: "fixmap_intent", arguments: { action: "list", repo: root } });
      expect(text(listed)).toContain("`b` (agent-b)");
      expect((await client.callTool({ name: "fixmap_intent", arguments: { action: "release", repo: root, id: "b" } })).isError).toBeFalsy();
      const missing = await client.callTool({ name: "fixmap_intent", arguments: { action: "release", repo: root, id: "b" } });
      expect(missing.isError).toBe(true);

      for (const [name, args, message] of [
        ["fixmap_intent", { action: "steal" }, /"action" must be record, list, or release/],
        ["fixmap_intent", { action: "record", agent: "a", task: "t", edits: [] }, /non-empty "edits"/],
        ["fixmap_intent", { action: "record", agent: "a", task: "t", edits: [{ path: "x.ts", ranges: [{ start: "1" }] }] }, /whole numbers/],
        ["fixmap_intent", { action: "list", owner: "x" }, /unknown argument: owner/],
        ["fixmap_conflicts", { report: "" }, /"report" must be a non-blank string/]
      ] as const) {
        const result = await client.callTool({ name, arguments: args as Record<string, unknown> });
        expect(result.isError).toBe(true);
        expect(text(result)).toMatch(message);
      }
    } finally {
      await client.close();
    }
  }, TIMEOUT);
});
