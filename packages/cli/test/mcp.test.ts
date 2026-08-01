import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createFixMapMcpServer, parsePlanArguments } from "../src/mcp.js";
import type { RepositorySourceDependencies } from "../src/repository-source.js";

const exec = promisify(execFile);

async function createAuthFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-mcp-"));
  await mkdir(join(root, "src", "auth"), { recursive: true });
  await mkdir(join(root, "test", "auth"), { recursive: true });
  await writeFile(join(root, "package.json"), JSON.stringify({ scripts: { test: "vitest run" } }));
  await writeFile(
    join(root, "src", "auth", "reset-password.ts"),
    "export function sendResetEmail(email: string) { return email; }\n"
  );
  await writeFile(join(root, "test", "auth", "reset-password.test.ts"), "import '../../src/auth/reset-password';\n");
  return root;
}

async function connectClient(repositorySourceDependencies: RepositorySourceDependencies = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createFixMapMcpServer(repositorySourceDependencies);
  const client = new Client({ name: "fixmap-test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("fixmap mcp server", () => {
  it("rejects malformed runtime arguments before repository work begins", () => {
    expect(parsePlanArguments({ issue: 42 })).toEqual({
      success: false,
      message: '"issue" must be a string.'
    });
    expect(parsePlanArguments({ issue: "task", format: "yaml" })).toEqual({
      success: false,
      message: '"format" must be either "markdown" or "json".'
    });
    expect(parsePlanArguments({ issue: "task", surprise: true })).toEqual({
      success: false,
      message: "unknown argument: surprise."
    });
    expect(parsePlanArguments(["task"])).toEqual({
      success: false,
      message: "tool arguments must be an object."
    });
    expect(parsePlanArguments({ issue: "   " })).toEqual({ success: false, message: '"issue" must not be blank.' });
  });

  it("explains why a file was left out, without a shell", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();

    // MCP-only agents could not ask this before: --explain was CLI-only, so the answer to
    // "why is my file missing" was to re-invent the ranking.
    const result = await client.callTool({
      name: "fixmap_explain",
      arguments: {
        path: "src/auth/reset-password.ts",
        issue: "password reset emails fail",
        repo: root,
        format: "json"
      }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
    const explanation = JSON.parse(text) as { path: string; status: string };
    expect(explanation.path).toBe("src/auth/reset-password.ts");
    expect(explanation.status).toBe("ranked");
  });

  it("explains a file the exclusions removed as excluded", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_explain",
      arguments: {
        path: "src/auth/reset-password.ts",
        issue: "password reset emails fail",
        repo: root,
        exclude: ["src/auth"],
        format: "json"
      }
    });

    expect((JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { status: string }).status)
      .toBe("excluded");
  });

  it("refuses to explain against a remote repository", async () => {
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_explain",
      arguments: { path: "src/index.ts", repo: "https://github.com/colinhacks/zod" }
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain("local checkout");
  });

  it("validates limit and exclude before doing repository work", () => {
    expect(parsePlanArguments({ issue: "task", limit: 0 }).success).toBe(false);
    expect(parsePlanArguments({ issue: "task", limit: 21 }).success).toBe(false);
    expect(parsePlanArguments({ issue: "task", limit: 2.5 }).success).toBe(false);
    expect(parsePlanArguments({ issue: "task", exclude: "apps/web" }).success).toBe(false);
    expect(parsePlanArguments({ issue: "task", limit: 3, exclude: ["apps/web"] })).toEqual({
      success: true,
      value: { issue: "task", limit: 3, exclude: ["apps/web"] }
    });
  });

  it("caps the reported context files through MCP", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: { issue: "password reset emails fail", repo: root, limit: 1, format: "json" }
    });

    const report = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      contextFiles: unknown[];
    };
    expect(report.contextFiles).toHaveLength(1);
  });

  it("advertises the complete plan, explain, compare, verify, and doctor workflow", async () => {
    const client = await connectClient();

    const tools = await client.listTools();

    const plan = tools.tools.find((tool) => tool.name === "fixmap_plan");
    const verify = tools.tools.find((tool) => tool.name === "fixmap_verify");
    expect(plan).toBeDefined();
    expect(plan?.description).toContain("test commands");
    expect(Object.keys(plan?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["issue", "diff", "base", "head", "repo", "format"])
    );
    expect(plan?.inputSchema.properties?.repo?.description).toContain("public GitHub HTTPS");
    expect(plan?.inputSchema.properties?.issue?.description).toContain("GitHub issue URL");
    expect(verify).toBeDefined();
    expect(Object.keys(verify?.inputSchema.properties ?? {})).toContain("report");
    const explain = tools.tools.find((tool) => tool.name === "fixmap_explain");
    expect(explain).toBeDefined();
    expect(Object.keys(explain?.inputSchema.properties ?? {})).toContain("path");
    expect(explain?.inputSchema.required).toContain("path");
    expect(tools.tools.find((tool) => tool.name === "fixmap_compare")).toBeDefined();
    expect(tools.tools.find((tool) => tool.name === "fixmap_doctor")).toBeDefined();
  });

  it("compares two reports through MCP", async () => {
    const client = await connectClient();
    const base = { summary: "", testRoutes: [], risks: [], changedFiles: [], diagnostics: [] };
    const result = await client.callTool({
      name: "fixmap_compare",
      arguments: {
        previous: { ...base, contextFiles: [{ rank: 1, path: "a.ts", score: 10, confidence: "medium", reasons: [] }] },
        current: { ...base, contextFiles: [{ rank: 1, path: "a.ts", score: 10, confidence: "high", reasons: [] }] },
        format: "JSON"
      }
    });
    expect(result.isError).not.toBe(true);
    const comparison = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { confidenceChanged: unknown[] };
    expect(comparison.confidenceChanged).toHaveLength(1);
  });

  it("verifies a plan against a local diff through MCP", async () => {
    const root = await createAuthFixture();
    await exec("git", ["init"], { cwd: root });
    await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
    await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "fixture"], { cwd: root });
    await writeFile(
      join(root, "src", "auth", "reset-password.ts"),
      "export function sendResetEmail(email: string) { return email.trim(); }\n"
    );
    const client = await connectClient();
    const plan = {
      summary: "",
      contextFiles: [{
        path: "src/auth/reset-password.ts",
        score: 20,
        confidence: "high",
        reasons: ["path matches task terms"]
      }],
      testRoutes: [],
      risks: [],
      changedFiles: [],
      diagnostics: []
    };

    const result = await client.callTool({
      name: "fixmap_verify",
      arguments: { report: plan, repo: root, diff: "HEAD", format: "json" }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const verification = JSON.parse(text) as { changedFiles: string[] };
    expect(verification.changedFiles).toContain("src/auth/reset-password.ts");
  });

  it("accepts a report file path the way the CLI --report flag does", async () => {
    const root = await createAuthFixture();
    await exec("git", ["init"], { cwd: root });
    await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
    await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
    await exec("git", ["add", "."], { cwd: root });
    await exec("git", ["commit", "-m", "fixture"], { cwd: root });
    await writeFile(
      join(root, "src", "auth", "reset-password.ts"),
      "export function sendResetEmail(email: string) { return email.trim(); }\n"
    );
    const planPath = join(root, "plan.json");
    await writeFile(planPath, JSON.stringify({
      summary: "",
      contextFiles: [{
        path: "src/auth/reset-password.ts",
        score: 20,
        confidence: "high",
        reasons: ["path matches task terms"]
      }],
      testRoutes: [],
      risks: [],
      changedFiles: [],
      diagnostics: []
    }));
    const client = await connectClient();

    // Agents that used the CLI first pass a path. Requiring the object form also made the
    // model re-embed an entire plan in the tool call, which is easy to truncate.
    const result = await client.callTool({
      name: "fixmap_verify",
      arguments: { report: planPath, repo: root, diff: "HEAD", format: "json" }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect((JSON.parse(text) as { changedFiles: string[] }).changedFiles)
      .toContain("src/auth/reset-password.ts");
  });

  it("says why a report path did not work instead of only naming the object shape", async () => {
    const client = await connectClient();

    const missing = await client.callTool({
      name: "fixmap_verify",
      arguments: { report: join(tmpdir(), "fixmap-does-not-exist.json"), diff: "HEAD" }
    });

    expect(missing.isError).toBe(true);
    expect((missing.content as Array<{ text: string }>)[0]?.text).toContain("could not be read");
  });

  it("returns a markdown report for an issue", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: { issue: "password reset emails fail", repo: root }
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(result.isError).toBeFalsy();
    expect(text).toContain("## Context Files");
    expect(text).toContain("src/auth/reset-password.ts");
    expect(text).toContain("npm run test");
  });

  it("returns a JSON report when asked", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: { issue: "password reset emails fail", repo: root, format: "json" }
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const report = JSON.parse(text) as { contextFiles: Array<{ path: string }> };
    expect(report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
  });

  it("analyzes a public GitHub URL through an isolated temporary checkout", async () => {
    const client = await connectClient({
      clonePublicRepository: async (_url, destination) => {
        await mkdir(join(destination, "src", "auth"), { recursive: true });
        await writeFile(
          join(destination, "package.json"),
          JSON.stringify({ scripts: { test: "vitest run" } })
        );
        await writeFile(
          join(destination, "src", "auth", "reset-password.ts"),
          "export function sendResetEmail(email: string) { return email; }\n"
        );
        return {
          ref: "main",
          revision: "0123456789abcdef0123456789abcdef01234567"
        };
      }
    });

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: {
        issue: "password reset emails fail",
        repo: "https://github.com/owner/repository",
        format: "json"
      }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const report = JSON.parse(text) as {
      contextFiles: Array<{ path: string }>;
      diagnostics: Array<{ code: string; severity: string }>;
    };
    expect(report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
    expect(report.diagnostics[0]).toMatchObject({
      code: "remote-repo-fetched",
      severity: "info"
    });
  });

  it("fetches a GitHub issue URL and infers the repository when repo is omitted", async () => {
    const client = await connectClient({
      fetchPublicIssue: async () => ({
        title: "Reset emails fail",
        body: "Users cannot reset their passwords."
      }),
      clonePublicRepository: async (url, destination) => {
        expect(url).toBe("https://github.com/owner/repository.git");
        await mkdir(join(destination, "src", "auth"), { recursive: true });
        await writeFile(
          join(destination, "package.json"),
          JSON.stringify({ scripts: { test: "vitest run" } })
        );
        await writeFile(
          join(destination, "src", "auth", "reset-password.ts"),
          "export function sendResetEmail(email: string) { return email; }\n"
        );
        return {
          ref: "main",
          revision: "0123456789abcdef0123456789abcdef01234567"
        };
      }
    });

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: {
        issue: "https://github.com/owner/repository/issues/123",
        format: "json"
      }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const report = JSON.parse(text) as {
      contextFiles: Array<{ path: string }>;
      diagnostics: Array<{ code: string }>;
    };
    expect(report.contextFiles[0]?.path).toBe("src/auth/reset-password.ts");
    expect(report.diagnostics.slice(0, 2).map((diagnostic) => diagnostic.code)).toEqual([
      "remote-issue-fetched",
      "remote-repo-fetched"
    ]);
  });

  it("rejects diff options for GitHub URLs before attempting a clone", async () => {
    let cloneCalled = false;
    const client = await connectClient({
      clonePublicRepository: async () => {
        cloneCalled = true;
        throw new Error("should not clone");
      }
    });

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: {
        issue: "password reset emails fail",
        diff: "main...HEAD",
        repo: "https://github.com/owner/repository"
      }
    });

    expect(result.isError).toBe(true);
    expect(cloneCalled).toBe(false);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("Git diff options are not supported");
  });

  it("returns a sanitized error when a public repository cannot be fetched", async () => {
    const client = await connectClient({
      clonePublicRepository: async () => {
        throw new Error("repository not found");
      }
    });

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: {
        issue: "password reset emails fail",
        repo: "https://github.com/owner/missing"
      }
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("Could not fetch public GitHub repository");
    expect(text).toContain("repository was not found or is not publicly accessible");
  });

  it("rejects a nonexistent repo path instead of returning an empty report", async () => {
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: { issue: "chat fails", repo: join(tmpdir(), "fixmap-mcp-missing-root") }
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("does not exist");
  });

  it("rejects an unresolvable diff when no issue text can serve as a fallback", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: { diff: "does-not-exist...HEAD", repo: root }
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("Could not resolve git diff");
  });

  it("rejects calls without a task signal instead of guessing", async () => {
    const client = await connectClient();

    const result = await client.callTool({ name: "fixmap_plan", arguments: {} });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("task signal");
  });
});
