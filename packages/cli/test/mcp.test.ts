import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createFixMapMcpServer } from "../src/mcp.js";

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

async function connectClient() {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createFixMapMcpServer();
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

  it("rejects calls without a task signal instead of guessing", async () => {
    const client = await connectClient();

    const result = await client.callTool({ name: "fixmap_plan", arguments: {} });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(text).toContain("task signal");
  });
});
