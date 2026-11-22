import { readFile, mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { materializePinnedRepository } from "./lib/external-cache.mjs";
import { createAnnotation, updateAnnotationStore, addAnnotation, removeAnnotation, buildFixMapReport } from "../packages/core/dist/index.js";

if (process.argv.slice(2).some((arg) => arg !== "--heldout")) throw new Error("Only --heldout is supported.");
const heldout = process.argv.includes("--heldout");
const manifest = JSON.parse(await readFile(new URL(`../benchmarks/annotations/${heldout ? "heldout-cases" : "cases"}.json`, import.meta.url), "utf8"));
const results = [];
const cli = fileURLToPath(new URL("../packages/cli/dist/cli.js", import.meta.url));
const action = fileURLToPath(new URL("../packages/action/dist/index.mjs", import.meta.url));
const environment = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
  ["path", "systemroot", "comspec", "pathext", "temp", "tmp", "home", "userprofile", "localappdata"].includes(key.toLowerCase())));
function interfacePlan(surface, root, issue) {
  const result = spawnSync(process.execPath, surface === "cli"
    ? [cli, "plan", "--repo", root, "--issue", issue, "--format", "json", "--no-cache"] : [action], {
    cwd: root, encoding: "utf8", timeout: 60_000, maxBuffer: 4 * 1024 * 1024,
    env: surface === "cli" ? environment : { ...environment, INPUT_ISSUE: issue, INPUT_FORMAT: "json", INPUT_NO_CACHE: "true" }
  });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `${surface}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}
async function mcpWorkflow(root, path) {
  const transport = new StdioClientTransport({ command: process.execPath, args: [cli, "mcp", "--repo", root], env: environment, stderr: "pipe" });
  const client = new Client({ name: "annotation-acceptance", version: "1.0.0" });
  transport.stderr?.on("data", () => {});
  try {
    await client.connect(transport);
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: { repo: root, ...args } }, undefined, { timeout: 60_000 });
      assert(!result.isError, JSON.stringify(result.content));
      return result;
    };
    const json = (result) => JSON.parse(result.content.find((entry) => entry.type === "text").text);
    await call("fixmap_annotate", { action: "add", target: path, note: "MCP external acceptance", owner: "mcp-owner" });
    const store = json(await call("fixmap_annotate", { action: "list" }));
    assert.equal(store.annotations.length, 1);
    const plan = json(await call("fixmap_plan", { issue: `Review ${path}`, format: "json" }));
    assert.equal(plan.annotations.sourceFingerprint, `worktree:${createHash("sha256").update(await readFile(join(root, ".fixmap/annotations.json"))).digest("hex")}`);
    assert.deepEqual(plan.annotations.entries[0].annotation, store.annotations[0]);
    await call("fixmap_annotate", { action: "remove", id: store.annotations[0].id });
    assert.deepEqual(json(await call("fixmap_annotate", { action: "list" })).annotations, []);
    assert.equal(json(await call("fixmap_plan", { issue: `Review ${path}`, format: "json" })).annotations?.entries.length ?? 0, 0);
  } finally { await client.close(); await transport.close(); }
}
for (const entry of manifest.cases) {
  const root = await mkdtemp(join(tmpdir(), "fixmap-annotation-external-"));
  try {
    const pinned = await materializePinnedRepository(entry);
    await cp(pinned, root, { recursive: true, filter: (path) => basename(path) !== ".git" });
    const source = await readFile(join(root, entry.path));
    const file = createAnnotation({ scope: { kind: "file", path: entry.path }, note: "External annotation acceptance", owner: "acceptance-owner", createdAt: "2026-01-01T00:00:00Z" });
    const service = createAnnotation({ scope: { kind: "service", name: "acceptance-service" }, note: "Explicit service note", createdAt: "2026-01-01T00:00:00Z" });
    await updateAnnotationStore(root, (store) => addAnnotation(addAnnotation(store, file), service));
    const bytes = await readFile(join(root, ".fixmap/annotations.json"));
    const plan = (issueText) => buildFixMapReport({ repoRoot: root, issueText, useCache: false, includeHistory: false });
    const positive = await plan(`Review ${entry.path} acceptance-service`);
    assert.equal(positive.annotations?.sourceFingerprint, `worktree:${createHash("sha256").update(bytes).digest("hex")}`);
    assert(positive.annotations.entries.some((item) => item.annotation.id === file.id));
    assert(positive.annotations.entries.some((item) => item.annotation.id === service.id));
    for (const surface of ["cli", "action"]) {
      const report = interfacePlan(surface, root, `Review ${entry.path} acceptance-service`);
      assert.equal(report.annotations?.sourceFingerprint, positive.annotations.sourceFingerprint, surface);
      assert.deepEqual(report.annotations.entries.map((item) => item.annotation), positive.annotations.entries.map((item) => item.annotation), surface);
    }
    const negative = await plan(`Review ${entry.path}`);
    assert(!negative.annotations?.entries.some((item) => item.annotation.id === service.id));
    await updateAnnotationStore(root, (store) => removeAnnotation(removeAnnotation(store, file.id), service.id));
    assert.deepEqual(JSON.parse(await readFile(join(root, ".fixmap/annotations.json"), "utf8")).annotations, []);
    assert.equal((await plan(`Review ${entry.path} acceptance-service`)).annotations?.entries.length ?? 0, 0);
    for (const surface of ["cli", "action"]) assert.equal(interfacePlan(surface, root, `Review ${entry.path} acceptance-service`).annotations?.entries.length ?? 0, 0, surface);
    await mcpWorkflow(root, entry.path);
    assert.deepEqual(await readFile(join(root, entry.path)), source);
    results.push({ slug: entry.slug, sha: entry.sha, passed: true, surfaces: ["core", "cli", "action", "mcp"] });
  } catch (error) {
    results.push({ slug: entry.slug, sha: entry.sha, passed: false, error: error.message });
  } finally { await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
}
process.stdout.write(`${JSON.stringify({ kind: heldout ? "heldout-annotation-workflow-not-ranking" : "external-workflow-not-heldout-ranking", results }, null, 2)}\n`);
process.exitCode = results.some((result) => !result.passed) ? 1 : 0;
