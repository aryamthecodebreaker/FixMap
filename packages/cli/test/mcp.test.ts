import { execFile } from "node:child_process";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { buildIdentityGraph, createGraphIdentity } from "@aryam/fixmap-core";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage, MessageExtraInfo } from "@modelcontextprotocol/sdk/types.js";
import { createFixMapMcpServer, InitializationGuardTransport, parseExplainArguments, parsePlanArguments, parseVerifyArguments } from "../src/mcp.js";
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

async function createWorkspaceFixture(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-mcp-workspace-"));
  await mkdir(join(root, "auth", "src"), { recursive: true });
  await mkdir(join(root, "payments", "src"), { recursive: true });
  await writeFile(join(root, "auth", "package.json"), JSON.stringify({ name: "@acme/auth", version: "1.2.0" }));
  await writeFile(join(root, "auth", "src", "index.ts"), "export const authenticate = true;\n");
  await writeFile(join(root, "payments", "package.json"), JSON.stringify({
    name: "@acme/payments", dependencies: { "@acme/auth": "^1.2.0" }
  }));
  await writeFile(join(root, "payments", "src", "index.ts"), "import '@acme/auth';\n");
  const config = join(root, "workspace.json");
  await writeFile(config, JSON.stringify({
    workspaceConfigVersion: 1,
    workspace: "acme",
    repositories: [{ id: "auth", path: "auth" }, { id: "payments", path: "payments" }]
  }));
  return config;
}

async function createHistoryFixture(): Promise<{ root: string; before: string; after: string }> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-mcp-history-"));
  await exec("git", ["init", "--quiet"], { cwd: root });
  await exec("git", ["config", "user.email", "fixmap@example.test"], { cwd: root });
  await exec("git", ["config", "user.name", "FixMap Test"], { cwd: root });
  await writeFile(join(root, "a.ts"), "export const a = true;\n");
  await writeFile(join(root, "b.ts"), "export const b = true;\n");
  await exec("git", ["add", "a.ts", "b.ts"], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", "before"], { cwd: root });
  const before = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await writeFile(join(root, "a.ts"), "import { b } from './b'; export const a = b;\n");
  await exec("git", ["add", "a.ts"], { cwd: root });
  await exec("git", ["commit", "--quiet", "-m", "after"], { cwd: root });
  const after = (await exec("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  return { root, before, after };
}

async function connectClient(repositorySourceDependencies: RepositorySourceDependencies = {}) {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createFixMapMcpServer(repositorySourceDependencies);
  const client = new Client({ name: "fixmap-test-client", version: "0.0.0" });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return client;
}

describe("fixmap mcp server", () => {
  it("requires initialization and answers malformed stdio JSON with protocol errors", async () => {
    class FakeTransport implements Transport {
      onclose?: () => void;
      onerror?: (error: Error) => void;
      onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
      sent: JSONRPCMessage[] = [];
      async start() {}
      async send(message: JSONRPCMessage) { this.sent.push(message); }
      async close() { this.onclose?.(); }
    }
    const inner = new FakeTransport();
    const guarded = new InitializationGuardTransport(inner);
    const delivered: JSONRPCMessage[] = [];
    guarded.onmessage = (message) => delivered.push(message);
    await guarded.start();

    inner.onmessage?.({ jsonrpc: "2.0", id: 9, method: "tools/list" });
    await Promise.resolve();
    expect(inner.sent).toContainEqual({
      jsonrpc: "2.0",
      id: 9,
      error: { code: -32002, message: "Server not initialized" }
    });
    expect(delivered).toEqual([]);

    inner.onerror?.(new SyntaxError("Unexpected token"));
    await Promise.resolve();
    expect(inner.sent).toContainEqual({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32700, message: "Parse error" }
    });

    inner.onmessage?.({ jsonrpc: "2.0", method: "notifications/initialized" });
    inner.onmessage?.({ jsonrpc: "2.0", id: 10, method: "tools/list" });
    await Promise.resolve();
    expect(inner.sent).toContainEqual(expect.objectContaining({
      id: 10,
      error: { code: -32002, message: "Server not initialized" }
    }));

    inner.onmessage?.({
      jsonrpc: "2.0",
      id: 11,
      method: "initialize",
      params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } }
    });
    inner.onmessage?.({ jsonrpc: "2.0", method: "notifications/initialized" });
    inner.onmessage?.({ jsonrpc: "2.0", id: 10, method: "tools/list" });
    expect(delivered).toContainEqual({ jsonrpc: "2.0", id: 10, method: "tools/list" });
  });

  it("rejects malformed runtime arguments before repository work begins", () => {
    expect(parsePlanArguments({ issue: 42 })).toEqual({
      success: false,
      message: '"issue" must be a string.'
    });
    expect(parsePlanArguments({ issue: "task", format: "yaml" })).toEqual({
      success: false,
      message: '"format" must be "markdown", "json", or "agent".'
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
    expect(parsePlanArguments({ issue: "task", semanticModel: "  C:\\models\\embed  " })).toEqual({
      success: true,
      value: { issue: "task", semanticModel: "C:\\models\\embed" }
    });
    expect(parsePlanArguments({ issue: "task", semanticModel: " " }).success).toBe(false);
  });

  it("bypasses the repository cache when an MCP caller requests a fresh scan", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: { issue: "password reset fails", repo: root, noCache: true, format: "json" }
    });

    expect(result.isError).toBeFalsy();
    const report = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      diagnostics: Array<{ code: string }>;
    };
    expect(report.diagnostics.map((diagnostic) => diagnostic.code)).toContain("cache-bypass");
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

  it("advertises the complete plan, context, graph, workspace, ask, migrate, reverse-docs, history, supply-chain, runtime, explain, compare, verify, and doctor workflow", async () => {
    const client = await connectClient();

    const tools = await client.listTools();

    expect(tools.tools.map((tool) => tool.name)).toEqual([
      "fixmap_plan", "fixmap_context", "fixmap_graph", "fixmap_workspace", "fixmap_ask", "fixmap_migrate", "fixmap_reverse_docs", "fixmap_history", "fixmap_supply_chain", "fixmap_runtime", "fixmap_verify", "fixmap_explain", "fixmap_compare", "fixmap_doctor"
    ]);
    const plan = tools.tools.find((tool) => tool.name === "fixmap_plan");
    const verify = tools.tools.find((tool) => tool.name === "fixmap_verify");
    expect(plan).toBeDefined();
    expect(plan?.description).toContain("test commands");
    expect(Object.keys(plan?.inputSchema.properties ?? {}).sort()).toEqual(
      ["issue", "diff", "base", "head", "repo", "ref", "format", "limit", "exclude", "workingTree", "includeUntracked", "noCache", "semanticModel"].sort()
    );
    expect(plan?.inputSchema.additionalProperties).toBe(false);
    expect(plan?.inputSchema.properties?.repo?.description).toContain("public GitHub HTTPS");
    expect(plan?.inputSchema.properties?.issue?.description).toContain("GitHub issue URL");
    const context = tools.tools.find((tool) => tool.name === "fixmap_context");
    expect(context?.inputSchema.properties?.budget).toBeDefined();
    expect(context?.inputSchema.additionalProperties).toBe(false);
    const graph = tools.tools.find((tool) => tool.name === "fixmap_graph");
    expect(graph?.inputSchema.properties?.format?.description).toContain("mermaid");
    expect(graph?.inputSchema.additionalProperties).toBe(false);
    const workspace = tools.tools.find((tool) => tool.name === "fixmap_workspace");
    expect(Object.keys(workspace?.inputSchema.properties ?? {}).sort()).toEqual(["config", "seeds", "format", "noCache"].sort());
    expect(workspace?.inputSchema.required).toEqual(["config"]);
    expect(workspace?.inputSchema.additionalProperties).toBe(false);
    const ask = tools.tools.find((tool) => tool.name === "fixmap_ask");
    expect(Object.keys(ask?.inputSchema.properties ?? {}).sort()).toEqual(["report", "question", "format"].sort());
    expect(ask?.inputSchema.required).toEqual(["report", "question"]);
    expect(ask?.inputSchema.additionalProperties).toBe(false);
    const migrate = tools.tools.find((tool) => tool.name === "fixmap_migrate");
    expect(Object.keys(migrate?.inputSchema.properties ?? {}).sort()).toEqual(["input", "format"].sort());
    expect(migrate?.inputSchema.required).toEqual(["input"]);
    expect(migrate?.inputSchema.additionalProperties).toBe(false);
    const reverseDocs = tools.tools.find((tool) => tool.name === "fixmap_reverse_docs");
    expect(Object.keys(reverseDocs?.inputSchema.properties ?? {}).sort()).toEqual(["input", "format"].sort());
    expect(reverseDocs?.inputSchema.required).toEqual(["input"]);
    expect(reverseDocs?.inputSchema.additionalProperties).toBe(false);
    const history = tools.tools.find((tool) => tool.name === "fixmap_history");
    expect(Object.keys(history?.inputSchema.properties ?? {}).sort()).toEqual(["repo", "from", "to", "couplingDelta", "applyPolicy", "format"].sort());
    expect(history?.inputSchema.required).toEqual(["from", "to"]);
    expect(history?.inputSchema.additionalProperties).toBe(false);
    const supplyChain = tools.tools.find((tool) => tool.name === "fixmap_supply_chain");
    expect(Object.keys(supplyChain?.inputSchema.properties ?? {}).sort()).toEqual(["input", "format"].sort());
    expect(supplyChain?.inputSchema.required).toEqual(["input"]);
    expect(supplyChain?.inputSchema.additionalProperties).toBe(false);
    const runtime = tools.tools.find((tool) => tool.name === "fixmap_runtime");
    expect(Object.keys(runtime?.inputSchema.properties ?? {}).sort()).toEqual(["input", "format"].sort());
    expect(runtime?.inputSchema.required).toEqual(["input"]);
    expect(runtime?.inputSchema.additionalProperties).toBe(false);
    expect(verify).toBeDefined();
    expect(Object.keys(verify?.inputSchema.properties ?? {}).sort()).toEqual(
      ["report", "diff", "base", "head", "repo", "workingTree", "includeUntracked", "format", "noCache"].sort()
    );
    expect(verify?.inputSchema.required).toEqual(["report"]);
    expect(verify?.inputSchema.additionalProperties).toBe(false);
    const explain = tools.tools.find((tool) => tool.name === "fixmap_explain");
    expect(explain).toBeDefined();
    expect(Object.keys(explain?.inputSchema.properties ?? {}).sort()).toEqual(
      ["path", "issue", "diff", "base", "head", "workingTree", "includeUntracked", "repo", "exclude", "limit", "format", "noCache"].sort()
    );
    expect(explain?.inputSchema.required).toEqual(["path"]);
    expect(explain?.inputSchema.additionalProperties).toBe(false);
    const compare = tools.tools.find((tool) => tool.name === "fixmap_compare");
    expect(Object.keys(compare?.inputSchema.properties ?? {}).sort()).toEqual(["previous", "current", "format"].sort());
    expect(compare?.inputSchema.required).toEqual(["previous", "current"]);
    expect(compare?.inputSchema.additionalProperties).toBe(false);
    const doctor = tools.tools.find((tool) => tool.name === "fixmap_doctor");
    expect(Object.keys(doctor?.inputSchema.properties ?? {})).toEqual(["format"]);
    expect(doctor?.inputSchema.additionalProperties).toBe(false);
  });

  it("returns bounded Context Packs and Mermaid graphs through MCP", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();
    const context = await client.callTool({
      name: "fixmap_context",
      arguments: { issue: "password reset emails fail", repo: root, budget: 512, format: "json" }
    });
    expect(context.isError).toBeFalsy();
    expect(JSON.parse((context.content as Array<{ text: string }>)[0]!.text)).toMatchObject({ contextVersion: 1, budgetTokens: 512 });

    const graph = await client.callTool({
      name: "fixmap_graph",
      arguments: { issue: "password reset emails fail", repo: root, format: "mermaid" }
    });
    expect(graph.isError).toBeFalsy();
    expect((graph.content as Array<{ text: string }>)[0]!.text).toContain("flowchart TD");
  });

  it("maps cross-repository impact through MCP", async () => {
    const config = await createWorkspaceFixture();
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_workspace",
      arguments: { config, seeds: ["auth"], format: "json", noCache: true }
    });
    expect(result.isError).toBeFalsy();
    const report = JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as {
      dependencies: Array<{ consumerRepository: string; providerRepository: string }>;
      impact: { repositories: Array<{ repository: string }> };
    };
    expect(report.dependencies).toContainEqual(expect.objectContaining({
      consumerRepository: "payments", providerRepository: "auth"
    }));
    expect(report.impact.repositories).toContainEqual(expect.objectContaining({ repository: "payments" }));
  });

  it("answers report-only structural questions through MCP with citations", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_ask",
      arguments: {
        report: {
          reportVersion: 1,
          summary: "Authentication context",
          contextFiles: [{
            rank: 1,
            path: "src/auth/reset-password.ts",
            score: 20,
            confidence: "high",
            reasons: ["defines resetPassword"]
          }],
          testRoutes: [{
            command: "npm run test:auth",
            kind: "test",
            reason: "package script",
            relatedFiles: ["test/auth/reset-password.test.ts"]
          }],
          risks: [],
          changedFiles: [],
          diagnostics: []
        },
        question: "Which test should I run?",
        format: "json"
      }
    });
    expect(result.isError).toBeFalsy();
    const answer = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(answer).toMatchObject({
      fixMapAnswerVersion: 1,
      mode: "deterministic-structural",
      claimsVerified: false
    });
    expect(answer.citations).toContainEqual(expect.objectContaining({ kind: "test" }));
  });

  it("builds dependency-ordered review-only migrations through MCP", async () => {
    const repository = createGraphIdentity({ workspace: "acme", kind: "repository", key: "users" });
    const schema = createGraphIdentity({ workspace: "acme", kind: "file", parent: repository, key: "db/schema.sql" });
    const service = createGraphIdentity({ workspace: "acme", kind: "file", parent: repository, key: "src/users.ts" });
    const graph = buildIdentityGraph({
      workspace: "acme",
      nodes: [
        { id: repository, kind: "repository", key: "users", derivedFrom: [] },
        { id: schema, kind: "file", key: "db/schema.sql", repository: "users", parent: repository, derivedFrom: [] },
        { id: service, kind: "file", key: "src/users.ts", repository: "users", parent: repository, derivedFrom: [] }
      ],
      edges: []
    });
    const migrationStep = (id: string, dependsOn: string[], edits: string[]) => ({
      id,
      summary: `Perform ${id}`,
      dependsOn,
      edits,
      impacts: [],
      contracts: [],
      compatibility: { mode: "not-required" as const, reason: "Internal-only atomic change." },
      tests: [{ command: `npm test -- ${id}`, reason: `Verify ${id}.` }],
      rollback: { trigger: `${id} verification fails.`, action: `Revert ${id}.` }
    });
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_migrate",
      arguments: {
        input: {
          migrationInputVersion: 1,
          graph,
          steps: [migrationStep("contract", ["expand"], [service]), migrationStep("expand", [], [schema])]
        },
        format: "json"
      }
    });

    expect(result.isError).toBeFalsy();
    const plan = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(plan).toMatchObject({ migrationPlanVersion: 1, graphFingerprint: graph.version.fingerprint });
    expect(plan.phases.map((phase: { stepIds: string[] }) => phase.stepIds)).toEqual([["expand"], ["contract"]]);
  });

  it("drafts review-only reverse documentation through MCP", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_reverse_docs",
      arguments: {
        input: {
          reverseDocumentationInputVersion: 1,
          repo: { files: [
            { path: "src/auth.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "auth", contentFingerprint: "git:auth" },
            { path: "src/session.ts", extension: ".ts", sizeBytes: 10, isSource: true, isTest: false, kind: "code", textSample: "session", contentFingerprint: "git:session" }
          ] },
          architecture: {
            architectureSnapshotVersion: 1,
            fingerprint: "architecture:abc",
            sourceFingerprint: "repo:abc",
            edges: [{ from: "src/session.ts", to: "src/auth.ts" }],
            cycles: [],
            coupling: [
              { path: "src/auth.ts", incoming: 1, outgoing: 0, total: 1 },
              { path: "src/session.ts", incoming: 0, outgoing: 1, total: 1 }
            ],
            boundaryViolations: [],
            truncated: { files: 0, edges: 0 }
          },
          decisions: [],
          targets: [{
            id: "auth-module",
            title: "Authentication module",
            kind: "module",
            paths: ["src/auth.ts", "src/session.ts"],
            requestedPath: "docs/generated/auth.md"
          }]
        },
        format: "json"
      }
    });

    expect(result.isError).toBeFalsy();
    const drafts = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(drafts[0]).toMatchObject({
      reverseDocumentationVersion: 1,
      reviewRequired: true,
      writeAuthorized: false,
      overwriteAuthorized: false,
      destination: { status: "available" }
    });
  });

  it("compares committed architecture history through MCP without checkout", async () => {
    const { root, before, after } = await createHistoryFixture();
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_history",
      arguments: { repo: root, from: before, to: after, couplingDelta: 1, format: "json" }
    });

    expect(result.isError).toBeFalsy();
    const comparison = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(comparison.from.commit).toBe(before);
    expect(comparison.to.commit).toBe(after);
    expect(comparison.drift.addedEdges).toContainEqual({ from: "a.ts", to: "b.ts" });
  }, 20_000);

  it("imports normalized supply-chain evidence through MCP", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_supply_chain",
      arguments: {
        input: {
          supplyChainBundleVersion: 1,
          generatedAt: "2026-08-21T12:00:00Z",
          source: { tool: "external-scanner", toolVersion: "4.2.0", documentFingerprint: `sha256:${"a".repeat(64)}` },
          components: [{ id: "npm-example-1", name: "example", version: "1.0.0", licenses: ["MIT"], paths: ["package-lock.json"] }],
          findings: [{
            id: "scanner-advisory-1", kind: "vulnerability", severity: "high", confidence: "high",
            componentId: "npm-example-1", summary: "External scanner matched an advisory.", advisoryId: "EXTERNAL-1"
          }]
        },
        format: "json"
      }
    });
    expect(result.isError).toBeFalsy();
    const report = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(report.claims).toMatchObject({ externalEvidenceOnly: true, fixMapExecutedScanner: false, remediationAuthorized: false });
    expect(report.evidence.items).toContainEqual(expect.objectContaining({ id: "fixmap-supply-chain:finding:scanner-advisory-1" }));
  });

  it("maps redaction-reviewed runtime evidence through MCP", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_runtime",
      arguments: {
        input: {
          runtimeInputVersion: 1,
          bundle: {
            runtimeEvidenceBundleVersion: 1,
            source: {
              format: "opentelemetry", tool: "otel-collector", version: "0.130.0", documentFingerprint: `sha256:${"a".repeat(64)}`,
              capturedFrom: "2026-08-21T09:00:00Z", capturedTo: "2026-08-21T10:00:00Z", redactionReviewed: true,
              redactionSummary: "Sensitive attributes removed before export."
            },
            records: [{
              kind: "span", id: "span-1", traceId: "a".repeat(32), spanId: "b".repeat(16), name: "POST /login", serviceName: "auth",
              startedAt: "2026-08-21T09:01:00Z", durationMs: 24.5, status: "ok",
              code: { repositoryId: "repo:auth", path: "src/auth.ts", evidenceReference: "span.attr.code.filepath" }
            }]
          },
          snapshots: [{ repositoryId: "repo:auth", files: [{ path: "src/auth.ts", contentFingerprint: "git:abc123" }] }]
        },
        format: "json"
      }
    });
    expect(result.isError).toBeFalsy();
    const mapped = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(mapped.observations[0].subject).toMatchObject({ repositoryId: "repo:auth", path: "src/auth.ts", contentFingerprint: "git:abc123" });
    expect(mapped.claims.causalImpactInferred).toBe(false);
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

  it("rejects a contextFiles-only empty object instead of treating it as a report", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_compare",
      arguments: {
        previous: { contextFiles: [] },
        current: { contextFiles: [] },
        format: "json"
      }
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain("complete FixMap report envelope");
  });

  it("still accepts complete reports that legitimately have no context files", async () => {
    const client = await connectClient();
    const empty = { summary: "No matches", contextFiles: [], testRoutes: [], risks: [], changedFiles: [], diagnostics: [] };
    const result = await client.callTool({
      name: "fixmap_compare",
      arguments: { previous: empty, current: empty, format: "json" }
    });

    expect(result.isError).not.toBe(true);
    expect(JSON.parse((result.content as Array<{ text: string }>)[0]!.text).unchanged).toEqual([]);
  });

  it.each([
    [{ path: "" }, "path"],
    [{ path: "a.ts", rank: 0 }, "rank"],
    [{ path: "a.ts", score: "ten" }, "score"],
    [{ path: "a.ts", confidence: "certain" }, "confidence"]
  ])("rejects malformed optional comparison fields in %j", async (entry, expectedField) => {
    const client = await connectClient();
    const envelope = { summary: "", testRoutes: [], risks: [], changedFiles: [], diagnostics: [] };
    const result = await client.callTool({
      name: "fixmap_compare",
      arguments: {
        previous: { ...envelope, contextFiles: [entry] },
        current: { ...envelope, contextFiles: [{ path: "a.ts" }] }
      }
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain(expectedField);
  });

  it("compares report file paths through MCP like the CLI", async () => {
    const client = await connectClient();
    const directory = await mkdtemp(join(tmpdir(), "fixmap-mcp-compare-"));
    const base = { summary: "", testRoutes: [], risks: [], changedFiles: [], diagnostics: [] };
    const previousPath = join(directory, "previous.json");
    const currentPath = join(directory, "current.json");
    await writeFile(previousPath, JSON.stringify({
      ...base,
      contextFiles: [{ rank: 1, path: "a.ts", score: 10, confidence: "medium", reasons: [] }]
    }));
    await writeFile(currentPath, JSON.stringify({
      ...base,
      contextFiles: [{ rank: 1, path: "a.ts", score: 10, confidence: "high", reasons: [] }]
    }));

    const result = await client.callTool({
      name: "fixmap_compare",
      arguments: { previous: previousPath, current: currentPath, format: "json" }
    });

    expect(result.isError).not.toBe(true);
    expect((JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as { confidenceChanged: unknown[] }).confidenceChanged)
      .toHaveLength(1);
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
    await writeFile(planPath, `\uFEFF${JSON.stringify({
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
    })}`);
    const client = await connectClient();

    // Agents that used the CLI first pass a path. Requiring the object form also made the
    // model re-embed an entire plan in the tool call, which is easy to truncate.
    const result = await client.callTool({
      name: "fixmap_verify",
      arguments: { report: planPath, repo: root, diff: "HEAD", format: "json" }
    });

    expect(result.isError).toBeFalsy();
    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    const changedFiles = (JSON.parse(text) as { changedFiles: string[] }).changedFiles;
    expect(changedFiles).toContain("src/auth/reset-password.ts");
    expect(changedFiles).not.toContain("plan.json");
  }, 15_000);

  it("rejects a truncated non-empty verify report with a structural error", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_verify",
      arguments: {
        report: { reportVersion: 1, contextFiles: [{ path: "src/auth/reset-password.ts" }] },
        diff: "HEAD"
      }
    });

    expect(result.isError).toBe(true);
    const text = (result.content as Array<{ text: string }>)[0]?.text ?? "";
    expect(text).toContain("complete FixMap report envelope");
    expect(text).not.toContain("Cannot read properties");
  });

  it("accepts a UTF-16 report path from PowerShell clients", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-mcp-report-utf16-"));
    const path = join(root, "plan.json");
    const plan = { summary: "", contextFiles: [], testRoutes: [], risks: [], changedFiles: [], diagnostics: [] };
    await writeFile(path, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(JSON.stringify(plan), "utf16le")]));

    expect(parseVerifyArguments({ report: path, workingTree: true })).toEqual({
      success: true,
      value: { report: plan, reportPath: path, workingTree: true }
    });
  });

  it("rejects incomplete marked version 1 entries before verify scans", async () => {
    const client = await connectClient();
    const result = await client.callTool({
      name: "fixmap_verify",
      arguments: {
        report: {
          reportVersion: 1,
          summary: "Incomplete versioned report",
          contextFiles: [{ path: "src/auth/reset-password.ts" }],
          testRoutes: [],
          risks: [],
          changedFiles: [],
          diagnostics: []
        },
        diff: "HEAD"
      }
    });

    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain("version 1 requires");
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
  }, 15_000);

  it("returns compact agent output when asked", async () => {
    const root = await createAuthFixture();
    const client = await connectClient();

    const result = await client.callTool({
      name: "fixmap_plan",
      arguments: { issue: "password reset emails fail", repo: root, format: "agent" }
    });

    const text = (result.content as Array<{ type: string; text: string }>)[0]?.text ?? "";
    expect(result.isError).toBeFalsy();
    expect(text).toContain("EDIT CANDIDATE:");
    expect(text).toContain("INSPECT:");
    expect(text).toContain("src/auth/reset-password.ts");
  });

  it("analyzes a public GitHub URL through an isolated temporary checkout", async () => {
    const client = await connectClient({
      clonePublicRepository: async (_url, destination, _hooks, ref) => {
        expect(ref).toBe("release-2.x");
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
        ref: "release-2.x",
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
    expect(text).toContain("need a local checkout");
    expect(text).toContain("shallow clone");
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

describe("MCP surface parity", () => {
  // #328: an agent could not explain the ranking of the working-tree plan it had just run.
  it("accepts the plan scan options on explain", () => {
    expect(parseExplainArguments({ path: "a.ts", workingTree: true, includeUntracked: true }).success).toBe(true);
    expect(parseExplainArguments({ path: "a.ts", base: "main", head: "HEAD" }).success).toBe(true);

    const wrong = parseExplainArguments({ path: "a.ts", workingTree: "yes" });
    expect(wrong.success).toBe(false);
    expect(wrong.success === false && wrong.message).toContain('"workingTree" must be a boolean');
  });

  it("rejects contradictory explain scan options instead of silently changing their meaning", () => {
    expect(parseExplainArguments({ path: "a.ts", includeUntracked: true }).success).toBe(false);
    expect(parseExplainArguments({ path: "a.ts", workingTree: true, diff: "HEAD" }).success).toBe(false);
    expect(parseExplainArguments({ path: "a.ts", diff: "main...HEAD", base: "main" }).success).toBe(false);
    expect(parseExplainArguments({ path: "a.ts", head: "HEAD" }).success).toBe(false);
  });

  // #278: a four-literal enum rejected `Markdown` in strict clients before normalization ran.
  it.each(["markdown", "JSON", "Markdown", "JsOn", " JSON\n"])("accepts %j as a format", (format) => {
    expect(parsePlanArguments({ issue: "x", format }).success).toBe(true);
  });

  it("normalizes fresh-scan and whitespace inputs consistently across MCP tools", () => {
    const report = { summary: "No matches", contextFiles: [], testRoutes: [], risks: [], changedFiles: [], diagnostics: [] };
    expect(parsePlanArguments({ issue: " x ", format: " JSON ", noCache: true })).toEqual({
      success: true,
      value: { issue: "x", format: "json", noCache: true }
    });
    expect(parseExplainArguments({ path: " a.ts ", issue: " x ", format: " Markdown ", noCache: true })).toEqual({
      success: true,
      value: { path: "a.ts", issue: "x", noCache: true, format: "markdown" }
    });
    expect(parseVerifyArguments({ report, diff: " HEAD ", format: " JSON ", noCache: true })).toEqual({
      success: true,
      value: { report, diff: "HEAD", noCache: true, format: "json" }
    });
  });

  it("states that verify report is required when it is omitted", () => {
    expect(parseVerifyArguments({ workingTree: true })).toEqual({
      success: false,
      message: '"report" is required and must be a FixMap report object or a path to a FixMap JSON report.'
    });
  });

  it("rejects unsafe remote refs before cloning", () => {
    expect(parsePlanArguments({ issue: "x", repo: "https://github.com/o/r", ref: "feature//oops" })).toEqual({
      success: false,
      message: '"ref" must be a safe branch or tag name.'
    });
    expect(parsePlanArguments({ issue: "x", repo: "https://github.com/o/r", ref: "release-2.x" })).toEqual({
      success: true,
      value: { issue: "x", repo: "https://github.com/o/r", ref: "release-2.x" }
    });
  });

  it("rejects unknown compare arguments at the request handler", async () => {
    const client = await connectClient();
    const report = { summary: "No matches", contextFiles: [], testRoutes: [], risks: [], changedFiles: [], diagnostics: [] };
    const result = await client.callTool({
      name: "fixmap_compare",
      arguments: { previous: report, current: report, surprise: true }
    });
    expect(result.isError).toBe(true);
    expect((result.content as Array<{ text: string }>)[0]?.text).toContain("unknown argument: surprise");
  });

  // #369: the throwing parser surfaced an uncaught exception instead of Invalid arguments.
  it("reports a non-canonical issue URL as invalid rather than throwing", () => {
    expect(() => parsePlanArguments({ issue: "https://github.com/o/r/issues/274?plain=1" })).not.toThrow();
    expect(parsePlanArguments({ issue: "https://github.com/o/r/issues/274?plain=1" }).success).toBe(true);
    expect(parsePlanArguments({ issue: "https://github.com/o/r/pull/158.patch" }).success).toBe(false);
  });
});
