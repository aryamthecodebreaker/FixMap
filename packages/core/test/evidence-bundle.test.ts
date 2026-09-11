import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { parseEvidenceProviderBundle, EVIDENCE_BUNDLE_MAX_BYTES } from "../src/evidence-bundle.js";
import { collectEvidence } from "../src/evidence.js";
import type { RepoMap } from "../src/types.js";

const bundle = () => ({ bundleVersion: 1, provider: { id: "local-tool", version: "1" }, result: {
  items: [{ id: "one", kind: "structure", summary: "Observed file", confidence: "low",
    subjects: [{ kind: "file", path: "src/a.ts" }] }]
} });

describe("serialized evidence boundary", () => {
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
  });
});
