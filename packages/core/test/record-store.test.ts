import { link, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { buildChangeDossier } from "../src/dossier.js";
import { createOutcomeRecord, type OutcomeRecord } from "../src/outcomes.js";
import {
  deleteStoredDossier,
  deleteStoredOutcome,
  pruneStoredOutcomes,
  readStoredDossier,
  readStoredDossiers,
  readStoredOutcome,
  readStoredOutcomes,
  saveStoredDossier,
  saveStoredOutcome
} from "../src/record-store.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 })));
});

async function repo(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fixmap-record-store-"));
  roots.push(root);
  return root;
}

function outcome(id: string, recordedAt = "2026-11-01T00:00:00Z", overrides: Partial<OutcomeRecord> = {}): OutcomeRecord {
  return createOutcomeRecord({
    id,
    taskId: "task-1",
    repositoryIdentity: "fixmap://workspace/local/repository/api",
    planFingerprint: "sha256:0123456789abcdef",
    recordedAt,
    predictedPaths: ["src/a.ts", "src/b.ts"],
    editedPaths: ["src/a.ts", "src/c.ts"],
    testOutcomes: [],
    taskAssessment: { status: "unknown", source: "unassessed", reason: "Not assessed." },
    ...overrides
  });
}

function dossier(id: string) {
  return buildChangeDossier({
    id,
    repositoryIdentity: "fixmap://workspace/local/repository/api",
    createdAt: "2026-11-01T00:00:00Z",
    updatedAt: "2026-11-01T00:00:00Z",
    request: { summary: "Fix login", sourceFingerprint: "sha256:abcdef012345" },
    assumptions: [],
    plan: { reportFingerprint: "sha256:111111111111", graphFingerprint: "sha256:222222222222" },
    decisions: [],
    diff: null,
    tests: [],
    runtimeEvidence: [],
    reviews: [],
    releaseIdentifiers: { pullRequest: "https://github.com/o/r/pull/1" }
  });
}

describe("outcome and dossier store", () => {
  it("reads nothing and creates nothing in a repository without a store", async () => {
    const root = await repo();
    expect(await readStoredOutcomes(root)).toEqual({ records: [], problems: [] });
    expect(await readStoredDossiers(root)).toEqual({ records: [], problems: [] });
    await expect(readStoredOutcome(root, "missing")).rejects.toThrow("No outcome record found: missing");
    expect(await readdir(root)).toEqual([]);
  });

  it("writes one file per record atomically, leaves no temp file, and releases the lock", async () => {
    const root = await repo();
    const saved = await saveStoredOutcome(root, outcome("outcome-1"));
    expect(await readdir(join(root, ".fixmap"))).toEqual(["outcomes"]);
    expect(await readdir(join(root, ".fixmap", "outcomes"))).toEqual(["outcome-1.json"]);
    expect(JSON.parse(await readFile(join(root, ".fixmap", "outcomes", "outcome-1.json"), "utf8"))).toEqual(saved);
    expect(await readStoredOutcome(root, "outcome-1")).toEqual(saved);
    await expect(saveStoredOutcome(root, outcome("outcome-1"))).rejects.toThrow("already exists");
    await saveStoredDossier(root, dossier("dossier-1"));
    expect(await readStoredDossier(root, "dossier-1")).toEqual(dossier("dossier-1"));
    expect((await readdir(join(root, ".fixmap"))).sort()).toEqual(["dossiers", "outcomes"]);
  });

  it("serializes concurrent writers without corrupting or losing a saved record", async () => {
    const root = await repo();
    const ids = Array.from({ length: 12 }, (_, index) => `outcome-${index}`);
    const results = await Promise.allSettled(ids.map((id) => saveStoredOutcome(root, outcome(id))));
    for (const result of results) {
      if (result.status === "rejected") expect(String(result.reason)).toContain("in progress or left a lock");
    }
    const saved = ids.filter((_, index) => results[index]!.status === "fulfilled");
    expect(saved.length).toBeGreaterThan(0);
    const stored = await readStoredOutcomes(root);
    expect(stored.problems).toEqual([]);
    expect(stored.records.map((record) => record.id).sort()).toEqual(saved.sort());
    expect(await readdir(join(root, ".fixmap", "outcomes"))).toHaveLength(saved.length);
    expect(await readdir(join(root, ".fixmap"))).not.toContain("outcomes.lock");
  });

  it("refuses to take over a lock another writer holds, however old", async () => {
    const root = await repo();
    await mkdir(join(root, ".fixmap"));
    const lock = join(root, ".fixmap", "outcomes.lock");
    await writeFile(lock, '{"pid":1}\n');
    await expect(saveStoredOutcome(root, outcome("outcome-1"))).rejects.toThrow("in progress or left a lock");
    await expect(deleteStoredOutcome(root, "outcome-1")).rejects.toThrow("in progress or left a lock");
    expect(await readFile(lock, "utf8")).toBe('{"pid":1}\n');
    expect(await readdir(join(root, ".fixmap", "outcomes"))).toEqual([]);
  });

  it("rejects ids that could traverse out of the store", async () => {
    const root = await repo();
    for (const id of ["../escape", "..", "a/b", "a\\b", "C:evil", "name.", ".hidden", ""]) {
      await expect(readStoredOutcome(root, id)).rejects.toThrow("Invalid outcome record id");
      await expect(deleteStoredDossier(root, id)).rejects.toThrow("Invalid change dossier id");
    }
    await expect(saveStoredOutcome(root, outcome("x:y"))).rejects.toThrow("Invalid outcome record id");
  });

  it("refuses a linked .fixmap directory, a linked store directory, and hardlinked records", async () => {
    const outside = await repo();
    const root = await repo();
    await symlink(outside, join(root, ".fixmap"), process.platform === "win32" ? "junction" : "dir");
    await expect(saveStoredOutcome(root, outcome("outcome-1"))).rejects.toThrow("not a link or junction");
    await expect(readStoredOutcomes(root)).rejects.toThrow("not a link or junction");
    expect(await readdir(outside)).toEqual([]);

    const second = await repo();
    await mkdir(join(second, ".fixmap"));
    await symlink(outside, join(second, ".fixmap", "dossiers"), process.platform === "win32" ? "junction" : "dir");
    await expect(saveStoredDossier(second, dossier("dossier-1"))).rejects.toThrow("not a link or junction");
    expect(await readdir(outside)).toEqual([]);

    const third = await repo();
    await saveStoredOutcome(third, outcome("outcome-1"));
    await link(join(third, ".fixmap", "outcomes", "outcome-1.json"), join(outside, "copy.json"));
    await expect(readStoredOutcome(third, "outcome-1")).rejects.toThrow("regular, unlinked");
    await expect(deleteStoredOutcome(third, "outcome-1")).rejects.toThrow("regular, unlinked");
    expect((await readStoredOutcomes(third)).problems).toEqual([
      { file: ".fixmap/outcomes/outcome-1.json", message: expect.stringContaining("regular, unlinked") }
    ]);
  });

  it("reports malformed stored files without crashing or hiding valid records", async () => {
    const root = await repo();
    await saveStoredOutcome(root, outcome("good"));
    const directory = join(root, ".fixmap", "outcomes");
    await writeFile(join(directory, "broken.json"), "{not json");
    await writeFile(join(directory, "invalid.json"), JSON.stringify({ outcomeRecordVersion: 1, id: "invalid" }));
    await writeFile(join(directory, "renamed.json"), JSON.stringify(outcome("other")));
    await writeFile(join(directory, "notes.txt"), "hello");
    await writeFile(join(directory, ".good.123.tmp"), "partial");
    const stored = await readStoredOutcomes(root);
    expect(stored.records.map((record) => record.id)).toEqual(["good"]);
    expect(stored.problems).toEqual([
      { file: ".fixmap/outcomes/broken.json", message: expect.stringContaining("Not valid JSON") },
      { file: ".fixmap/outcomes/invalid.json", message: "Invalid outcome record envelope." },
      { file: ".fixmap/outcomes/notes.txt", message: "Not a record file (expected <id>.json)." },
      { file: ".fixmap/outcomes/renamed.json", message: expect.stringContaining("does not match") }
    ]);
    const tampered = { ...dossier("dossier-1"), request: { summary: "edited", sourceFingerprint: "sha256:abcdef012345" } };
    await mkdir(join(root, ".fixmap", "dossiers"));
    await writeFile(join(root, ".fixmap", "dossiers", "dossier-1.json"), JSON.stringify(tampered));
    expect((await readStoredDossiers(root)).problems[0]?.message).toContain("fingerprint does not match");
  });

  it("prunes only records older than the cutoff and never deletes malformed files", async () => {
    const root = await repo();
    await saveStoredOutcome(root, outcome("old", "2026-01-01T00:00:00Z"));
    await saveStoredOutcome(root, outcome("edge", "2026-06-01T00:00:00Z"));
    await saveStoredOutcome(root, outcome("new", "2026-11-01T00:00:00Z"));
    await writeFile(join(root, ".fixmap", "outcomes", "broken.json"), "{");
    const result = await pruneStoredOutcomes(root, new Date("2026-06-01T00:00:00Z"));
    expect(result).toMatchObject({ removed: ["old"], kept: 2 });
    expect(result.problems).toHaveLength(1);
    expect((await readdir(join(root, ".fixmap", "outcomes"))).sort()).toEqual(["broken.json", "edge.json", "new.json"]);
    expect(await pruneStoredOutcomes(await repo(), new Date())).toEqual({ removed: [], kept: 0, problems: [] });
  });

  it("removes a record and reports a missing one", async () => {
    const root = await repo();
    await saveStoredDossier(root, dossier("dossier-1"));
    await deleteStoredDossier(root, "dossier-1");
    expect((await readStoredDossiers(root)).records).toEqual([]);
    await expect(deleteStoredDossier(root, "dossier-1")).rejects.toThrow("No change dossier found: dossier-1");
  });
});
