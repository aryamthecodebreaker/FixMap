import { describe, expect, it } from "vitest";
import { collectEvidence, type EvidenceProvider } from "../src/evidence.js";
import type { RepoMap } from "../src/types.js";

const repo: RepoMap = {
  root: "/repo",
  files: [],
  packageScripts: [],
  changedFiles: [],
  diffText: "",
  packageManager: "npm",
  diagnostics: []
};

function provider(id: string, collect: EvidenceProvider["collect"], overrides: Partial<EvidenceProvider> = {}): EvidenceProvider {
  return {
    id,
    version: "1.0.0",
    capabilities: { network: "never", executesCode: false },
    collect,
    ...overrides
  };
}

describe("collectEvidence", () => {
  it("orders providers deterministically and namespaces evidence with provenance", async () => {
    const make = (id: string, path: string) => provider(id, ({ now }) => ({
      items: [{
        id: "decision",
        kind: "human-intent",
        summary: `Decision for ${path}`,
        confidence: "high",
        subjects: [{ kind: "file", path }],
        observedAt: now
      }]
    }));

    const collected = await collectEvidence(
      [make("zeta", "src/z.ts"), make("alpha", "src/a.ts")],
      { repo, issueText: "change auth", diffText: "" },
      { now: "2026-08-21T12:00:00Z" }
    );

    expect(collected.items.map((item) => item.id)).toEqual(["alpha:decision", "zeta:decision"]);
    expect(collected.items[0]?.provider).toEqual({ id: "alpha", version: "1.0.0" });
    expect(collected.collectedAt).toBe("2026-08-21T12:00:00.000Z");
  });

  it("namespaces relationships and keeps only references to selected items", async () => {
    const collected = await collectEvidence([provider("graph", () => ({
      items: [
        { id: "a", kind: "structure", summary: "A", confidence: "high", subjects: [{ kind: "file", path: "a.ts" }] },
        { id: "b", kind: "structure", summary: "B", confidence: "medium", subjects: [{ kind: "file", path: "b.ts" }] }
      ],
      relationships: [{ id: "a-b", from: "a", to: "b", relation: "imports", reason: "A imports B", confidence: "high" }]
    }))], { repo, issueText: "", diffText: "" }, { now: "2026-08-21T12:00:00Z" });

    expect(collected.relationships[0]).toMatchObject({
      id: "graph:a-b",
      from: "graph:a",
      to: "graph:b",
      provider: { id: "graph", version: "1.0.0" }
    });
  });

  it("requires explicit permission for network and execution providers", async () => {
    let calls = 0;
    const blocked = [
      provider("network", () => { calls += 1; return { items: [] }; }, { capabilities: { network: "required", executesCode: false } }),
      provider("executor", () => { calls += 1; return { items: [] }; }, { capabilities: { network: "never", executesCode: true } })
    ];

    const collected = await collectEvidence(blocked, { repo, issueText: "", diffText: "" });

    expect(calls).toBe(0);
    expect(collected.diagnostics.map((entry) => entry.code)).toEqual(["provider-disallowed", "provider-disallowed"]);
  });

  it("passes explicit grants to providers with optional capabilities", async () => {
    const grants: Array<{ network: boolean; codeExecution: boolean }> = [];
    const optional = provider("optional", ({ permissions }) => {
      grants.push(permissions);
      return { items: [] };
    }, { capabilities: { network: "optional", executesCode: false } });

    await collectEvidence([optional], { repo, issueText: "", diffText: "" });
    await collectEvidence([optional], { repo, issueText: "", diffText: "" }, { allowNetwork: true });

    expect(grants).toEqual([
      { network: false, codeExecution: false },
      { network: true, codeExecution: false }
    ]);
  });

  it("contains provider failures and rejects unsafe repository paths", async () => {
    const collected = await collectEvidence([
      provider("broken", () => { throw new Error("provider exploded"); }),
      provider("unsafe", () => ({
        items: [{ id: "escape", kind: "custom", summary: "Unsafe", confidence: "low", subjects: [{ kind: "file", path: "../secret" }] }]
      }))
    ], { repo, issueText: "", diffText: "" });

    expect(collected.items).toEqual([]);
    expect(collected.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ provider: "broken", code: "provider-failed" }),
      expect.objectContaining({ provider: "unsafe", code: "provider-invalid" })
    ]));
  });

  it("bounds provider output and drops relationships whose endpoints were truncated", async () => {
    const collected = await collectEvidence([provider("bounded", () => ({
      items: [
        { id: "a", kind: "custom", summary: "A", confidence: "low", subjects: [{ kind: "runtime", name: "a" }] },
        { id: "b", kind: "custom", summary: "B", confidence: "low", subjects: [{ kind: "runtime", name: "b" }] }
      ],
      relationships: [{ id: "edge", from: "a", to: "b", relation: "calls", reason: "A calls B", confidence: "low" }]
    }))], { repo, issueText: "", diffText: "" }, { maxItemsPerProvider: 1 });

    expect(collected.items.map((item) => item.id)).toEqual(["bounded:a"]);
    expect(collected.relationships).toEqual([]);
    expect(collected.diagnostics).toContainEqual(expect.objectContaining({ code: "provider-truncated" }));
  });
});
