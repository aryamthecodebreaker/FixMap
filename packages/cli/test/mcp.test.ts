import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createFixMapMcpServer } from "../src/mcp.js";
import type { RepositorySourceDependencies } from "../src/repository-source.js";

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
  it("advertises the fixmap_plan tool", async () => {
    const client = await connectClient();

    const tools = await client.listTools();

    const plan = tools.tools.find((tool) => tool.name === "fixmap_plan");
    expect(plan).toBeDefined();
    expect(plan?.description).toContain("test commands");
    expect(Object.keys(plan?.inputSchema.properties ?? {})).toEqual(
      expect.arrayContaining(["issue", "diff", "base", "head", "repo", "format"])
    );
    expect(plan?.inputSchema.properties?.repo?.description).toContain("public GitHub HTTPS");
    expect(plan?.inputSchema.properties?.issue?.description).toContain("GitHub issue URL");
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
