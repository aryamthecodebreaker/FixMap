import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const cli = fileURLToPath(new URL("../packages/cli/dist/cli.js", import.meta.url));
const action = fileURLToPath(new URL("../packages/action/dist/index.mjs", import.meta.url));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ["path", "systemroot", "comspec", "pathext", "temp", "tmp", "home", "userprofile", "localappdata"].includes(key.toLowerCase())));
const root = await mkdtemp(join(tmpdir(), "fixmap-decision-surfaces-"));
const run = (command, args, extraEnv = {}) => {
  const result = spawnSync(command, args, { cwd: root, env: { ...env, ...extraEnv }, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
let client;
let transport;
try {
  run("git", ["init", "--quiet"]);
  await mkdir(join(root, "docs", "decisions"), { recursive: true });
  await writeFile(join(root, "index.ts"), "export const value = 1;\n");
  const adr = "---\nfixmap-applies-to: service:checkout-intent\nstatus: on hold\n---\n# Decision record\n## Decision\nPreserve the authored boundary.\n";
  const pr = JSON.stringify({ title: "Decision record", body: "Keep the partner contract.\n", url: "https://github.com/acme/shop/pull/42", fixmapAppliesTo: "service:checkout-intent" });
  await writeFile(join(root, "docs/decisions/1.md"), adr);
  await writeFile(join(root, "docs/decisions/2.json"), pr);
  await writeFile(join(root, "docs/decisions/bad.json"), "{broken");
  transport = new StdioClientTransport({ command: process.execPath, args: [cli, "mcp", "--repo", root], env, stderr: "pipe" });
  client = new Client({ name: "decision-acceptance", version: "1.0.0" });
  await client.connect(transport);
  const plans = {
    cli: async (issue) => JSON.parse(run(process.execPath, [cli, "plan", "--repo", root, "--issue", issue, "--format", "json", "--no-cache"])),
    action: async (issue) => JSON.parse(run(process.execPath, [action], { INPUT_ISSUE: issue, INPUT_FORMAT: "json", INPUT_NO_CACHE: "true" })),
    mcp: async (issue) => {
      const result = await client.callTool({ name: "fixmap_plan", arguments: { repo: root, issue, format: "json" } }, undefined, { timeout: 60_000 });
      assert(!result.isError, JSON.stringify(result.content));
      return JSON.parse(result.content.find((entry) => entry.type === "text").text);
    }
  };
  let expected;
  for (const [surface, plan] of Object.entries(plans)) {
    const positive = await plan("Review checkout-intent");
    assert.equal(positive.decisions?.length, 2, surface);
    assert.equal(positive.decisions.find((entry) => entry.path.endsWith("1.md"))?.authoredStatus, "on hold", surface);
    assert.equal(positive.decisions.find((entry) => entry.path.endsWith("1.md"))?.status, "unknown", surface);
    assert(positive.diagnostics.some((entry) => entry.code === "decision-parse-failed"), surface);
    assert.equal(positive.decisions.find((entry) => entry.source)?.source.verification, "unverified-local-attribution", surface);
    if (expected) assert.deepEqual(positive.decisions, expected, surface);
    expected = positive.decisions;
    const negative = await plan("Review unrelated-subsystem");
    assert.equal(negative.decisions?.length ?? 0, 0, surface);
    process.stdout.write(`${surface}: positive, unrelated-task, malformed-document checks passed\n`);
  }
  assert.equal(await readFile(join(root, "docs/decisions/1.md"), "utf8"), adr);
  assert.equal(await readFile(join(root, "docs/decisions/2.json"), "utf8"), pr);
} finally {
  await client?.close();
  await transport?.close();
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
