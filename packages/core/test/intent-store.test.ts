import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { detectChangeConflicts } from "../src/change-conflicts.js";
import {
  agentIntentToChangeIntent,
  agentIntentsDirectory,
  listAgentIntents,
  pruneAgentIntents,
  recordAgentIntent,
  releaseAgentIntent,
  validateAgentIntent
} from "../src/intent-store.js";

const COMMIT = "a".repeat(40);
const NOW = new Date("2026-11-24T10:00:00.000Z");
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-intents-"));
  roots.push(root);
  return root;
}

const base = { agent: "agent-a", task: "Dedupe users", baseCommit: COMMIT, edits: [{ path: "src/users.ts" }] };

describe("agent intent store", () => {
  it("records, lists, releases, and prunes intents with expiry", async () => {
    const root = await repo();
    const first = await recordAgentIntent(root, { ...base, id: "a-1", ttlMinutes: 30 }, NOW);
    expect(first).toMatchObject({ id: "a-1", expiresAt: "2026-11-24T10:30:00.000Z", impacts: [], contracts: [] });
    await recordAgentIntent(root, { ...base, id: "b-1", agent: "agent-b", ttlMinutes: 120 }, NOW);

    const later = new Date("2026-11-24T11:00:00.000Z");
    const listing = await listAgentIntents(root, later);
    expect(listing.intents.map((intent) => intent.id)).toEqual(["b-1"]);
    expect(listing.expired.map((intent) => intent.id)).toEqual(["a-1"]);

    expect(await pruneAgentIntents(root, later)).toEqual(["a-1"]);
    expect(await releaseAgentIntent(root, "b-1")).toBe(true);
    expect(await releaseAgentIntent(root, "b-1")).toBe(false);
    expect((await listAgentIntents(root, later)).intents).toEqual([]);
    expect((await readdir(agentIntentsDirectory(root))).filter((name) => !name.startsWith("."))).toEqual([]);
  });

  it("reports unreadable or renamed files instead of using them", async () => {
    const root = await repo();
    await recordAgentIntent(root, { ...base, id: "ok" }, NOW);
    await writeFile(join(agentIntentsDirectory(root), "broken.json"), "{");
    const valid = await recordAgentIntent(root, { ...base, id: "moved" }, NOW);
    await writeFile(join(agentIntentsDirectory(root), "elsewhere.json"), JSON.stringify(valid));
    const listing = await listAgentIntents(root, NOW);
    expect(listing.intents.map((intent) => intent.id)).toEqual(["moved", "ok"]);
    expect(listing.invalid.map((entry) => entry.file)).toEqual(["broken.json", "elsewhere.json"]);
    expect(listing.invalid[1]!.message).toMatch(/does not match id moved/);
    expect(await pruneAgentIntents(root, NOW)).toEqual([]);
  });

  it("rejects traversal, unknown fields, bad ranges, and unbounded input", () => {
    const valid = { agentIntentVersion: 1, id: "x", agent: "a", task: "t", baseCommit: COMMIT, createdAt: NOW.toISOString(), expiresAt: "2026-11-24T11:00:00.000Z", edits: [{ path: "src/a.ts" }], impacts: [], contracts: [] };
    expect(validateAgentIntent(valid).edits).toEqual([{ path: "src/a.ts" }]);
    const bad: Array<[Record<string, unknown>, RegExp]> = [
      [{ edits: [{ path: "../etc/passwd" }] }, /without ".."/],
      [{ edits: [{ path: "/abs/a.ts" }] }, /repository-relative/],
      [{ edits: [{ path: "C:\\a.ts" }] }, /repository-relative/],
      [{ edits: [] }, /1-1000 files/],
      [{ edits: [{ path: "a.ts" }, { path: "a.ts" }] }, /more than once/],
      [{ edits: [{ path: "a.ts", ranges: [{ start: 5, end: 2 }] }] }, /1 <= start <= end/],
      [{ edits: [{ path: "a.ts", ranges: [] }] }, /1-50 line ranges/],
      [{ edits: [{ path: "a.ts", extra: 1 }] }, /unknown field extra/],
      [{ owner: "x" }, /unknown field owner/],
      [{ id: "has:colon" }, /id is invalid/],
      [{ agent: "@someone" }, /agent is invalid/],
      [{ task: "two\nlines" }, /one line/],
      [{ baseCommit: "main" }, /baseCommit is invalid/],
      [{ expiresAt: NOW.toISOString() }, /after createdAt/],
      [{ impacts: Array.from({ length: 1001 }, (_, index) => `f${index}.ts`) }, /at most 1000/]
    ];
    for (const [patch, message] of bad) expect(() => validateAgentIntent({ ...valid, ...patch })).toThrow(message);
  });

  it("rejects bad ttl values and a symlinked intents directory", async () => {
    const root = await repo();
    await expect(recordAgentIntent(root, { ...base, ttlMinutes: 0 })).rejects.toThrow(/ttlMinutes/);
    await expect(recordAgentIntent(root, { ...base, ttlMinutes: 1.5 })).rejects.toThrow(/ttlMinutes/);
    const outside = await repo();
    await mkdir(join(root, ".fixmap"), { recursive: true });
    try {
      await symlink(outside, join(root, ".fixmap", "intents"), "junction");
    } catch {
      return; // Creating links needs privileges on some Windows hosts; the check itself is exercised elsewhere.
    }
    await expect(recordAgentIntent(root, base)).rejects.toThrow(/symbolic link/);
    expect(await readdir(outside)).toEqual([]);
  });

  it("keeps every intent when separate processes record at the same time", async () => {
    const root = await repo();
    const core = pathToFileURL(resolve(__dirname, "..", "dist", "index.js")).href;
    const script = `import { recordAgentIntent } from ${JSON.stringify(core)};
const [root, id] = process.argv.slice(1);
await recordAgentIntent(root, { id, agent: "agent-" + id, task: "parallel", baseCommit: ${JSON.stringify(COMMIT)}, edits: [{ path: "src/shared.ts" }] });`;
    const ids = Array.from({ length: 8 }, (_, index) => `p${index}`);
    await Promise.all(ids.map((id) => new Promise<void>((done, fail) => {
      const child = spawn(process.execPath, ["--input-type=module", "-e", script, root, id], { stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });
      child.on("error", fail);
      child.on("close", (code) => code === 0 ? done() : fail(new Error(`process ${id} exited ${code}: ${stderr}`)));
    })));
    const listing = await listAgentIntents(root);
    expect(listing.intents.map((intent) => intent.id)).toEqual(ids);
    expect(listing.invalid).toEqual([]);
  }, 60_000);
});

describe("conflicts from stored intents", () => {
  const intent = (id: string, edits: Array<{ path: string; ranges?: Array<{ start: number; end: number }> }>, impacts: string[] = []) =>
    agentIntentToChangeIntent(validateAgentIntent({
      agentIntentVersion: 1, id, agent: id, task: "t", baseCommit: COMMIT,
      createdAt: NOW.toISOString(), expiresAt: "2026-11-24T11:00:00.000Z", edits, impacts, contracts: []
    }));

  it("separates overlapping edits, disjoint line ranges, and impact-zone edits", () => {
    const analysis = detectChangeConflicts([
      intent("a", [{ path: "src/shared.ts", ranges: [{ start: 1, end: 20 }] }, { path: "src/both.ts" }]),
      intent("b", [{ path: "src/shared.ts", ranges: [{ start: 40, end: 60 }] }, { path: "src/both.ts" }], ["src/other.ts"]),
      intent("c", [{ path: "src/other.ts" }])
    ]);
    const kinds = analysis.conflicts.map((conflict) => `${conflict.kind}:${conflict.intents.join("+")}`);
    expect(kinds).toEqual(["edit-edit:a+b", "edit-disjoint-ranges:a+b", "edit-impact:b+c"]);
    expect(analysis.conflicts[1]).toMatchObject({ severity: "warning" });
  });

  it("treats overlapping or one-sided ranges as a real conflict", () => {
    const overlap = detectChangeConflicts([
      intent("a", [{ path: "f.ts", ranges: [{ start: 1, end: 20 }] }]),
      intent("b", [{ path: "f.ts", ranges: [{ start: 20, end: 30 }] }])
    ]);
    expect(overlap.conflicts.map((conflict) => conflict.kind)).toEqual(["edit-edit"]);
    const oneSided = detectChangeConflicts([
      intent("a", [{ path: "f.ts", ranges: [{ start: 1, end: 5 }] }]),
      intent("b", [{ path: "f.ts" }])
    ]);
    expect(oneSided.conflicts.map((conflict) => conflict.kind)).toEqual(["edit-edit"]);
  });
});
