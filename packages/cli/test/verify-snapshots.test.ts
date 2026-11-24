import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { checkVerifyNarrative, type VerifyResult } from "@aryam/fixmap-core";
import { runCli } from "../src/cli-runner.js";
import { createFixMapMcpServer } from "../src/mcp.js";
import { createVerifyScenarios, VERIFY_SCENARIOS, type VerifyScenario, type VerifyScenarioFixture } from "./fixtures/verify-scenarios.js";

const TIMEOUT = process.platform === "win32" ? 120_000 : 60_000;
const scenarios = Object.keys(VERIFY_SCENARIOS) as VerifyScenario[];
let fixture: VerifyScenarioFixture;
let client: Client;

beforeAll(async () => {
  fixture = await createVerifyScenarios();
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  client = new Client({ name: "fixmap-snapshot-client", version: "0.0.0" });
  await Promise.all([createFixMapMcpServer().connect(serverTransport), client.connect(clientTransport)]);
}, TIMEOUT);

afterAll(async () => {
  await client?.close();
  await fixture?.cleanup();
});

async function cli(args: string[]): Promise<{ code: number; stdout: string }> {
  let stdout = "";
  const code = await runCli(args, { stdout: (text) => { stdout += text; }, stderr: () => undefined });
  return { code, stdout: fixture.normalize(stdout) };
}

async function mcp(format: "markdown" | "json"): Promise<string> {
  const result = await client.callTool({ name: "fixmap_verify", arguments: {
    report: fixture.planPath, repo: fixture.root, diff: "main...HEAD", format, noCache: true
  } });
  expect(result.isError).toBeFalsy();
  return fixture.normalize((result.content as Array<{ text: string }>)[0]!.text);
}

/** The narrated part of a result: what reviewers read, without scan bookkeeping. */
function narrated(result: VerifyResult) {
  return { summary: result.summary, findings: result.findings, narrative: result.narrative ?? [] };
}

describe("Verify narration snapshots", () => {
  for (const scenario of scenarios) {
    it(`${scenario}: CLI Markdown and JSON match the snapshot, MCP matches the CLI, and the narration passes the quality check`, async () => {
      await fixture.checkout(scenario);
      const args = ["verify", "--report", fixture.planPath, "--repo", fixture.root, "--diff", "main...HEAD", "--no-cache"];
      const markdown = await cli(args);
      const json = await cli([...args, "--format", "json"]);
      expect(markdown.code).toBe(json.code);
      const result = JSON.parse(json.stdout) as VerifyResult;

      await expect(markdown.stdout).toMatchFileSnapshot(`__snapshots__/verify-${scenario}.md`);
      await expect(`${JSON.stringify(narrated(result), null, 2)}\n`).toMatchFileSnapshot(`__snapshots__/verify-${scenario}.json`);
      expect(await mcp("markdown")).toBe(markdown.stdout);
      expect(narrated(JSON.parse(await mcp("json")) as VerifyResult)).toEqual(narrated(result));
      expect(checkVerifyNarrative(result.narrative ?? [])).toEqual([]);
    }, TIMEOUT);
  }

  it("the quality check rejects unsupported, duplicate, unbounded, or evidence-free statements", () => {
    const statement = { classification: "observation" as const, text: "One file changed.", evidence: [{ kind: "changed-file" as const, path: "a.ts", detail: "In the diff." }] };
    expect(checkVerifyNarrative([statement])).toEqual([]);
    expect(checkVerifyNarrative([statement, statement])).toEqual(["statement 2 repeats an earlier statement."]);
    expect(checkVerifyNarrative([{ ...statement, evidence: [] }])).toEqual(["statement 1 cites no evidence."]);
    expect(checkVerifyNarrative([{ ...statement, text: "no ending" }])).toEqual(["statement 1 does not end as a sentence."]);
    expect(checkVerifyNarrative([{ ...statement, text: `${"x".repeat(801)}.` }])).toEqual(["statement 1 is 802 characters; the bound is 800."]);
    expect(checkVerifyNarrative([{ ...statement, evidence: [{ kind: "risk-rule", detail: " " }] }])).toEqual(["statement 1 evidence 1 has no detail."]);
    expect(checkVerifyNarrative(Array.from({ length: 17 }, (_, index) => ({ ...statement, text: `Statement ${index}.` }))))
      .toEqual(["narrative has 17 statements; the bound is 16."]);
  });
});
