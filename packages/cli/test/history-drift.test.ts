import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";
import { createFixMapMcpServer, parsePlanArguments } from "../src/mcp.js";

const exec = promisify(execFile);
const TIMEOUT = process.platform === "win32" ? 60_000 : 30_000;
const ODD = "space dir/ünïcode/deep/er/still";
const roots: string[] = [];
let previousCacheDir: string | undefined;
let cacheDir: string;

beforeEach(async () => {
  previousCacheDir = process.env.FIXMAP_CACHE_DIR;
  cacheDir = await mkdtemp(join(tmpdir(), "fixmap-cli-arch-cache-"));
  roots.push(cacheDir);
  process.env.FIXMAP_CACHE_DIR = cacheDir;
});

afterEach(async () => {
  if (previousCacheDir === undefined) delete process.env.FIXMAP_CACHE_DIR;
  else process.env.FIXMAP_CACHE_DIR = previousCacheDir;
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 })));
});

async function put(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content, "utf8");
}

async function commit(root: string, message: string): Promise<string> {
  await exec("git", ["add", "-A"], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", message], { cwd: root });
  return (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
}

async function fixture(): Promise<{ root: string; before: string; after: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-cli-drift-"));
  roots.push(root);
  await exec("git", ["init", "--quiet"], { cwd: root });
  await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
  await put(root, "src/api/handler.ts", "export const handler = 1;\n");
  await put(root, `${ODD}/legacy.ts`, "export const legacy = 1;\n");
  await put(root, "docs/adr/0007-api-no-legacy.md",
    `---\nstatus: accepted\nfixmap-deny-imports:\n  - "src/api/** -> space dir/**"\n---\n# API never imports legacy\n\n## Decision\n\nThe API stays independent.\n`);
  const before = await commit(root, "before");
  await put(root, "src/api/handler.ts", `import { legacy } from '../../${ODD}/legacy';\nexport const handler = legacy;\n`);
  await put(root, "src/api/password-reset.ts", "export function passwordReset() { return 'reset'; }\n");
  const after = await commit(root, "after");
  return { root, before, after };
}

async function gitState(root: string): Promise<{ head: string; status: string }> {
  return {
    head: (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim(),
    status: (await exec("git", ["status", "--porcelain=v1", "--untracked-files=all"], { cwd: root })).stdout
  };
}

function capture() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return { stdout, stderr, dependencies: { stdout: (text: string) => stdout.push(text), stderr: (text: string) => stderr.push(text) } };
}

describe("fixmap history drift and decision disagreements", () => {
  it("renders decision disagreements in Markdown and JSON with exact commits", async () => {
    const { root, before, after } = await fixture();
    const state = await gitState(root);
    const markdown = capture();
    const json = capture();

    expect(await runCli(["history", "--repo", root, "--from", before, "--to", after], markdown.dependencies)).toBe(0);
    const text = markdown.stdout.join("");
    expect(text).toContain(`at \`${before}\``);
    expect(text).toContain(`at \`${after}\``);
    expect(text).toContain("## Decision disagreements");
    expect(text).toContain(`\`docs/adr/0007-api-no-legacy.md\` (API never imports legacy) denies \`src/api/**\` -> \`space dir/**\`; \`src/api/handler.ts\` -> \`${ODD}/legacy.ts\` was introduced in this range`);
    expect((await readdir(cacheDir)).filter((name) => name.startsWith("architecture-"))).toHaveLength(2);

    expect(await runCli(["history", "--repo", root, "--from", before, "--to", after, "--format", "json", "--no-cache"], json.dependencies)).toBe(0);
    const result = JSON.parse(json.stdout.join(""));
    expect(result.decisionDisagreements).toEqual([expect.objectContaining({
      decisionPath: "docs/adr/0007-api-no-legacy.md",
      edge: { from: "src/api/handler.ts", to: `${ODD}/legacy.ts` },
      introduced: true
    })]);
    expect(result.drift.addedEdges).toContainEqual({ from: "src/api/handler.ts", to: `${ODD}/legacy.ts` });
    expect(await gitState(root)).toEqual(state);
  }, TIMEOUT);

  it("rejects a repeated --no-cache and unknown refs cleanly", async () => {
    const { root, before } = await fixture();
    const repeated = capture();
    const unknown = capture();
    expect(await runCli(["history", "--repo", root, "--from", before, "--to", "HEAD", "--no-cache", "--no-cache"], repeated.dependencies)).toBe(1);
    expect(repeated.stderr.join("")).toContain("Pass --no-cache only once.");
    expect(await runCli(["history", "--repo", root, "--from", before, "--to", "does-not-exist"], unknown.dependencies)).toBe(1);
    expect(unknown.stderr.join("")).toContain("Could not resolve one of the requested Git refs");
    expect(unknown.stderr.join("")).not.toContain("rev-parse");
  }, TIMEOUT);
});

describe("fixmap plan --at", () => {
  it("ranks the committed state at the ref and leaves HEAD and status unchanged", async () => {
    const { root, before, after } = await fixture();
    const state = await gitState(root);
    const atBefore = capture();
    const atAfter = capture();

    expect(await runCli(["plan", "--issue", "password reset", "--repo", root, "--at", before, "--format", "json"], atBefore.dependencies)).toBe(0);
    const old = JSON.parse(atBefore.stdout.join(""));
    expect(old.contextFiles.map((file: { path: string }) => file.path)).not.toContain("src/api/password-reset.ts");
    expect(old.diagnostics.find((entry: { code: string }) => entry.code === "historical-plan").message).toContain(before);

    expect(await runCli(["plan", "--issue", "password reset", "--repo", root, `--at=${after}`, "--format", "json"], atAfter.dependencies)).toBe(0);
    expect(JSON.parse(atAfter.stdout.join("")).contextFiles[0].path).toBe("src/api/password-reset.ts");
    expect(await gitState(root)).toEqual(state);
  }, TIMEOUT);

  it("rejects --at with diffs, the working tree, verify, or no task", async () => {
    const { root } = await fixture();
    for (const [args, message] of [
      [["plan", "--issue", "x", "--repo", root, "--at", "HEAD", "--working-tree"], "cannot be combined with --working-tree"],
      [["plan", "--issue", "x", "--repo", root, "--at", "HEAD", "--diff", "HEAD~1...HEAD"], "cannot be combined with --diff/--base/--head"],
      [["plan", "--repo", root, "--at", "HEAD", "--explain", "src/api/handler.ts"], "cannot be combined with --explain"],
      [["plan", "--repo", root, "--at", "HEAD", "--diff", "HEAD~1"], "cannot be combined"],
      [["plan", "--issue", "x", "--repo", root, "--at", "--working-tree"], "--at requires a bounded single-line Git ref"],
      [["verify", "--report", "plan.json", "--at", "HEAD"], "--at"]
    ] as const) {
      const io = capture();
      expect(await runCli([...args], io.dependencies)).toBe(1);
      expect(io.stderr.join("")).toContain(message);
    }
    const unknown = capture();
    expect(await runCli(["plan", "--issue", "x", "--repo", root, "--at", "nope-ref"], unknown.dependencies)).toBe(1);
    expect(unknown.stderr.join("")).toContain("Could not resolve Git ref");
  }, TIMEOUT);
});

describe("MCP history drift and historical plans", () => {
  it("returns decision disagreements from fixmap_history and ranks fixmap_plan at a ref", async () => {
    const { root, before, after } = await fixture();
    const state = await gitState(root);
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createFixMapMcpServer({}, root);
    const client = new Client({ name: "fixmap-test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

    const history = await client.callTool({ name: "fixmap_history", arguments: { from: before, to: after, format: "json", noCache: true } });
    expect(history.isError).toBeFalsy();
    const result = JSON.parse((history.content as Array<{ text: string }>)[0]!.text);
    expect(result.to.commit).toBe(after);
    expect(result.decisionDisagreements).toHaveLength(1);
    const badCache = await client.callTool({ name: "fixmap_history", arguments: { from: before, to: after, noCache: "yes" } });
    expect(badCache.isError).toBe(true);

    const plan = await client.callTool({ name: "fixmap_plan", arguments: { issue: "password reset", repo: root, at: before, format: "json" } });
    expect(plan.isError).toBeFalsy();
    const report = JSON.parse((plan.content as Array<{ text: string }>)[0]!.text);
    expect(report.diagnostics.some((entry: { code: string }) => entry.code === "historical-plan")).toBe(true);
    expect(report.contextFiles.map((file: { path: string }) => file.path)).not.toContain("src/api/password-reset.ts");
    expect(await gitState(root)).toEqual(state);
    await client.close();
  }, TIMEOUT);

  it("validates the at argument", () => {
    expect(parsePlanArguments({ issue: "x", at: "v1" })).toEqual({ success: true, value: { issue: "x", at: "v1" } });
    expect(parsePlanArguments({ issue: "x", at: "" })).toMatchObject({ success: false });
    expect(parsePlanArguments({ issue: "x", at: "a\nb" })).toMatchObject({ success: false });
    expect(parsePlanArguments({ issue: "x", at: 3 })).toMatchObject({ success: false });
    expect(parsePlanArguments({ at: "v1", diff: "main...HEAD" })).toMatchObject({ success: false, message: expect.stringContaining("cannot be combined") });
    expect(parsePlanArguments({ at: "v1" })).toMatchObject({ success: false, message: expect.stringContaining("needs \"issue\"") });
    expect(parsePlanArguments({ issue: "x", at: "v1", repo: "https://github.com/a/b" })).toMatchObject({ success: false, message: expect.stringContaining("local repository") });
  });
});
