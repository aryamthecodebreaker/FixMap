import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { runCli } from "../src/cli-runner.js";
import { runWorkspaceCommand } from "../src/workspace-command.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createFixMapMcpServer, parseVerifyArguments } from "../src/mcp.js";

const exec = promisify(execFile);
const TIMEOUT = process.platform === "win32" ? 60_000 : 30_000;
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

function output() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    io: {
      stdout: (text: string) => stdout.push(text),
      stderr: (text: string) => stderr.push(text),
      writeReport: async (path: string, contents: string) => writeFile(path, contents, "utf8")
    }
  };
}

async function git(cwd: string, ...args: string[]): Promise<void> {
  await exec("git", args, { cwd });
}

/** auth publishes `@acme/auth-sdk`; payments declares it as `acme-auth`, linked only by a reviewed alias. */
async function fixture(): Promise<{ root: string; config: string; auth: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-verify-workspace-"));
  roots.push(root);
  const auth = join(root, "auth");
  await mkdir(join(auth, "src"), { recursive: true });
  await mkdir(join(root, "payments", "src"), { recursive: true });
  await writeFile(join(auth, "package.json"), JSON.stringify({ name: "@acme/auth-sdk", version: "2.4.0" }));
  await writeFile(join(auth, "src", "token.ts"), "export function validateToken(token: string) { return token.length > 0; }\n");
  await writeFile(join(root, "payments", "package.json"), JSON.stringify({ name: "@acme/payments", dependencies: { "acme-auth": "^2.4.0" } }));
  await writeFile(join(root, "payments", "src", "checkout.ts"), "export const checkout = true;\n");
  await git(auth, "init", "--quiet");
  await git(auth, "config", "user.email", "fixmap@example.test");
  await git(auth, "config", "user.name", "FixMap Test");
  await git(auth, "add", ".");
  await git(auth, "commit", "--quiet", "-m", "initial");
  await writeFile(join(auth, "src", "token.ts"), "export function validateToken(token: string) { return token.trim().length > 0; }\n");
  await git(auth, "commit", "--quiet", "-am", "trim tokens");
  const config = join(root, "workspace.json");
  await writeFile(config, JSON.stringify({
    workspaceConfigVersion: 1,
    workspace: "acme",
    repositories: [{ id: "auth", path: "auth" }, { id: "payments", path: "payments" }],
    aliases: [{
      consumer: "payments",
      ecosystem: "node",
      package: "acme-auth",
      provider: "auth",
      providerPackage: "@acme/auth-sdk",
      reason: "acme-auth is the internal registry name of the auth SDK."
    }]
  }));
  return { root, config, auth };
}

async function plan(auth: string, root: string): Promise<string> {
  const path = join(root, "plan.json");
  const capture = output();
  expect(await runCli(["plan", "--issue", "validate tokens", "--repo", auth, "--format", "json", "--output", path, "--no-cache"], capture.io)).toBe(0);
  return path;
}

describe("fixmap verify --workspace", () => {
  it("names the checkout that consumes the changed package, through a reviewed alias", async () => {
    const { root, config, auth } = await fixture();
    const report = await plan(auth, root);
    const capture = output();
    expect(await runCli([
      "verify", "--report", report, "--repo", auth, "--diff", "HEAD~1...HEAD", "--workspace", config, "--format", "json", "--no-cache"
    ], capture.io)).toBe(0);
    const result = JSON.parse(capture.stdout.join(""));
    const statement = result.narrative.find((entry: { evidence: Array<{ kind: string }> }) =>
      entry.evidence.some((evidence) => evidence.kind === "cross-repository"));
    expect(statement).toMatchObject({
      classification: "observation",
      text: "payments depends on @acme/auth-sdk (declared as acme-auth), and this diff changes 1 file in it: src/token.ts."
    });
    expect(result.narrative.indexOf(statement)).toBe(1);

    const markdown = output();
    expect(await runCli([
      "verify", "--report", report, "--repo", auth, "--diff", "HEAD~1...HEAD", "--workspace", config, "--no-cache"
    ], markdown.io)).toBe(0);
    expect(markdown.stdout.join("")).toContain("payments depends on @acme/auth-sdk");
  }, TIMEOUT);

  it("leaves verify output unchanged without --workspace", async () => {
    const { root, auth } = await fixture();
    const report = await plan(auth, root);
    const capture = output();
    expect(await runCli(["verify", "--report", report, "--repo", auth, "--diff", "HEAD~1...HEAD", "--format", "json", "--no-cache"], capture.io)).toBe(0);
    const result = JSON.parse(capture.stdout.join(""));
    expect(JSON.stringify(result.narrative)).not.toContain("cross-repository");
  }, TIMEOUT);

  it("rejects a checkout outside the workspace, a missing config, repeats, and use with plan", async () => {
    const { root, config, auth } = await fixture();
    const report = await plan(auth, root);
    const outside = output();
    expect(await runCli(["verify", "--report", report, "--repo", join(root, "payments", "src"), "--diff", "HEAD~1...HEAD", "--workspace", config, "--no-cache"], outside.io)).toBe(1);
    expect(outside.stderr.join("")).toMatch(/not one of the repositories/);

    const missing = output();
    expect(await runCli(["verify", "--report", report, "--repo", auth, "--diff", "HEAD~1...HEAD", "--workspace", join(root, "nope.json")], missing.io)).toBe(1);
    expect(missing.stderr.join("")).toMatch(/Could not read workspace config/);

    const repeated = output();
    expect(await runCli(["verify", "--report", report, "--workspace", config, "--workspace", config], repeated.io)).toBe(1);
    expect(repeated.stderr.join("")).toMatch(/only one --workspace value/);

    const withPlan = output();
    expect(await runCli(["plan", "--issue", "x", "--repo", auth, "--workspace", config], withPlan.io)).toBe(1);
    expect(withPlan.stderr.join("")).toMatch(/--workspace is a verify option/);
  }, TIMEOUT);

  it("shows the reviewed alias in the workspace report", async () => {
    const { config } = await fixture();
    const capture = output();
    expect(await runWorkspaceCommand(["--config", config, "--no-cache"], capture.io)).toBe(0);
    expect(capture.stdout.join("")).toContain("(reviewed alias: declared as `acme-auth`)");
  }, TIMEOUT);

  it("adds the same narration through MCP fixmap_verify and validates the argument", async () => {
    const { root, config, auth } = await fixture();
    const report = await plan(auth, root);
    expect(parseVerifyArguments({ report, diff: "HEAD~1...HEAD", workspace: "" })).toMatchObject({ success: false, message: expect.stringContaining("\"workspace\"") });
    expect(parseVerifyArguments({ report, diff: "HEAD~1...HEAD", workspace: 3 })).toMatchObject({ success: false });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createFixMapMcpServer();
    const client = new Client({ name: "fixmap-test-client", version: "0.0.0" });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      const result = await client.callTool({ name: "fixmap_verify", arguments: {
        report, repo: auth, diff: "HEAD~1...HEAD", workspace: config, format: "json", noCache: true
      } });
      expect(result.isError).toBeFalsy();
      const text = (result.content as Array<{ text: string }>)[0]!.text;
      expect(text).toContain("payments depends on @acme/auth-sdk (declared as acme-auth)");
      const outside = await client.callTool({ name: "fixmap_verify", arguments: {
        report, repo: join(root, "payments", "src"), diff: "HEAD~1...HEAD", workspace: config
      } });
      expect(outside.isError).toBe(true);
      expect((outside.content as Array<{ text: string }>)[0]!.text).toMatch(/not one of the repositories/);
    } finally {
      await client.close();
    }
  }, TIMEOUT);
});
