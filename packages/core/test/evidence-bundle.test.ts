import { describe, expect, it, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, rm, symlink } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseEvidenceProviderBundle, readEvidenceProviderBundle, EVIDENCE_BUNDLE_MAX_BYTES } from "../src/evidence-bundle.js";
import { collectEvidence } from "../src/evidence.js";
import type { RepoMap } from "../src/types.js";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, lstat: vi.fn(actual.lstat), open: vi.fn(actual.open) };
});

const bundle = () => ({ bundleVersion: 1, provider: { id: "local-tool", version: "1" }, result: {
  items: [{ id: "one", kind: "structure", summary: "Observed file", confidence: "low",
    subjects: [{ kind: "file", path: "src/a.ts" }] }]
} });

describe("serialized evidence boundary", () => {
  it("rejects detected file changes during the bounded read", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-evidence-read-race-"));
    try {
      const path = join(root, "evidence.json");
      await writeFile(path, JSON.stringify(bundle()));
      const handle = await fsPromises.open(path, "r");
      const before = await handle.stat();
      const after = await handle.stat();
      after.mtimeMs += 1;
      const statSpy = vi.spyOn(handle, "stat").mockResolvedValueOnce(before).mockResolvedValueOnce(after);
      const openSpy = vi.spyOn(fsPromises, "open").mockResolvedValueOnce(handle);
      try {
        await expect(readEvidenceProviderBundle(path)).rejects.toThrow("Cannot import evidence bundle");
      } finally {
        openSpy.mockRestore();
        statSpy.mockRestore();
        await handle.close();
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("rejects a changed file identity between inspection and open", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-evidence-race-"));
    try {
      const path = join(root, "evidence.json");
      await writeFile(path, JSON.stringify(bundle()));
      const inspected = await fsPromises.lstat(path);
      inspected.ino = -1;
      const spy = vi.spyOn(fsPromises, "lstat").mockResolvedValueOnce(inspected);
      try {
        await expect(readEvidenceProviderBundle(path)).rejects.toThrow("Cannot import evidence bundle");
      } finally { spy.mockRestore(); }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it.skipIf(process.platform === "win32")("rejects links and FIFOs without waiting for a writer", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-evidence-special-"));
    try {
      const target = join(root, "target.json");
      await writeFile(target, JSON.stringify(bundle()));
      const link = join(root, "link.json");
      await symlink(target, link);
      await expect(readEvidenceProviderBundle(link)).rejects.toThrow("regular UTF-8 JSON file");
      const fifo = join(root, "pipe");
      execFileSync("mkfifo", [fifo], { timeout: 2_000 });
      await expect(readEvidenceProviderBundle(fifo)).rejects.toThrow("regular UTF-8 JSON file");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("imports explicit local UTF-8 files and fails closed on directories, oversized and invalid bytes", async () => {
    const root = await mkdtemp(join(tmpdir(), "fixmap-evidence-file-"));
    try {
      const path = join(root, "evidence.json");
      const json = JSON.stringify(bundle());
      await writeFile(path, json);
      expect((await readEvidenceProviderBundle(path)).documentSha256).toBe(parseEvidenceProviderBundle(json).documentSha256);
      await expect(readEvidenceProviderBundle(root)).rejects.toThrow("regular UTF-8 JSON file");
      await writeFile(path, Buffer.from([0xff, 0xfe, 0x7b, 0]));
      await expect(readEvidenceProviderBundle(path)).rejects.toThrow("regular UTF-8 JSON file");
      await writeFile(path, Buffer.alloc(EVIDENCE_BUNDLE_MAX_BYTES + 1));
      await expect(readEvidenceProviderBundle(path)).rejects.toThrow("at most 1 MiB");
      await expect(readEvidenceProviderBundle(join(root, "missing-private-file"))).rejects.toThrow("Cannot import evidence bundle");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("collects data with exact document provenance and no execution grants", async () => {
    const json = JSON.stringify(bundle());
    const loaded = parseEvidenceProviderBundle(json);
    expect(loaded.documentSha256).toBe(createHash("sha256").update(json).digest("hex"));
    expect(loaded.provider.capabilities).toEqual({ network: "never", executesCode: false });
    const repo: RepoMap = { root: "/repo", files: [], packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [] };
    const result = await collectEvidence([loaded.provider], { repo, issueText: "", diffText: "" }, { now: "2026-09-11T00:00:00Z" });
    expect(result.diagnostics).toEqual([]);
    expect(result.items[0]?.id).toBe("local-tool:one");
    result.items[0]!.summary = "mutated";
    const repeated = await collectEvidence([loaded.provider], { repo, issueText: "", diffText: "" });
    expect(repeated.items[0]?.summary).toBe("Observed file");
  });

  it.each(["null", "[]", "{", '{"secret":"do not echo me"}'])("rejects malformed envelopes without echoing payload: %s", (json) => {
    expect(() => parseEvidenceProviderBundle(json)).toThrow("Invalid evidence provider bundle.");
  });

  it("rejects version drift, capability smuggling, unsafe paths and dangling edges", () => {
    const source = bundle();
    for (const invalid of [
      { ...source, bundleVersion: 2 },
      { ...source, provider: { ...source.provider, executesCode: true } },
      { ...source, result: { items: [{ ...source.result.items[0], subjects: [{ kind: "file", path: "../secret" }] }] } },
      { ...source, result: { ...source.result, relationships: [{ id: "r", from: "one", to: "missing", relation: "imports", reason: "claimed", confidence: "low" }] } }
    ]) expect(() => parseEvidenceProviderBundle(JSON.stringify(invalid))).toThrow("Invalid evidence provider bundle.");
  });

  it("enforces UTF-8 bytes and item limits before result cloning", () => {
    expect(() => parseEvidenceProviderBundle(" ".repeat(EVIDENCE_BUNDLE_MAX_BYTES + 1))).toThrow("1 MiB");
    expect(() => parseEvidenceProviderBundle("😀".repeat(300_000))).toThrow("1 MiB");
    const source = bundle();
    expect(() => parseEvidenceProviderBundle(JSON.stringify({ ...source, result: { items: Array(5_001).fill(null) } }))).toThrow("Invalid evidence provider bundle.");
    expect(() => parseEvidenceProviderBundle(JSON.stringify({ ...source, result: { items: [], relationships: Array(10_001).fill(null) } }))).toThrow("Invalid evidence provider bundle.");
  });

  it("rejects duplicate IDs and preserves relationship provenance through collection", async () => {
    const source = bundle();
    const item = source.result.items[0]!;
    expect(() => parseEvidenceProviderBundle(JSON.stringify({ ...source, result: { items: [item, item] } }))).toThrow("Invalid evidence provider bundle.");
    const edge = { id: "edge", from: "one", to: "two", relation: "imports", reason: "External observation", confidence: "low" };
    const result = { items: [item, { ...item, id: "two" }], relationships: [edge] };
    expect(() => parseEvidenceProviderBundle(JSON.stringify({ ...source, result: { ...result, relationships: [edge, edge] } }))).toThrow("Invalid evidence provider bundle.");
    const loaded = parseEvidenceProviderBundle(JSON.stringify({ ...source, result }));
    const repo: RepoMap = { root: "/repo", files: [], packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [] };
    const context = { repo, issueText: "", diffText: "" };
    const collected = await collectEvidence([loaded.provider], context, { now: "2026-09-11T00:00:00Z" });
    expect(collected.relationships).toEqual([{ ...edge, id: "local-tool:edge", from: "local-tool:one", to: "local-tool:two", provider: { id: "local-tool", version: "1" } }]);
    const bounded = await collectEvidence([loaded.provider], context, { maxItemsPerProvider: 1 });
    expect(bounded.relationships).toEqual([]);
    expect(bounded.diagnostics[0]?.code).toBe("provider-truncated");
  });

  it("fingerprints exact bytes rather than claiming semantic identity or authentication", () => {
    const source = bundle();
    const compact = parseEvidenceProviderBundle(JSON.stringify(source));
    const formatted = parseEvidenceProviderBundle(JSON.stringify(source, null, 2));
    expect(compact.documentSha256).not.toBe(formatted.documentSha256);
    expect(compact.provider.id).toBe(formatted.provider.id);
  });

  it("rejects deeply nested extras before recursive cloning", () => {
    const source = bundle();
    const item = source.result.items[0]!;
    const prefix = JSON.stringify({ ...source, result: { items: [{ ...item, extra: "PLACEHOLDER" }] } });
    const json = prefix.replace('"PLACEHOLDER"', '['.repeat(2_000) + '0' + ']'.repeat(2_000));
    expect(() => parseEvidenceProviderBundle(json)).toThrow("Invalid evidence provider bundle.");
  });
});
