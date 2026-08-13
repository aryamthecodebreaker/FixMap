import { describe, expect, it } from "vitest";
import { buildFixMapGraph, renderFixMapGraphMermaid } from "../src/graph.js";
import type { FixMapReport } from "../src/types.js";

describe("impact graph export", () => {
  it("preserves relationship direction and renders deterministic Mermaid", () => {
    const report: FixMapReport = {
      summary: "graph",
      contextFiles: [{ rank: 1, path: "src/a.ts", score: 10, confidence: "high", reasons: ["match"] }],
      impact: {
        seeds: ["src/a.ts"],
        files: [
          { path: "src/b.ts", score: 8, confidence: "medium", evidence: [{ kind: "imports", seed: "src/a.ts", reason: "a imports b" }] },
          { path: "src/c.ts", score: 7, confidence: "medium", evidence: [{ kind: "imported-by", seed: "src/a.ts", reason: "c imports a" }] }
        ],
        inspectionOrder: ["src/a.ts", "src/b.ts", "src/c.ts"],
        history: { available: false, eligibleCommits: 0, shallow: false, truncated: false }
      },
      testRoutes: [], risks: [], changedFiles: [], diagnostics: []
    };
    const graph = buildFixMapGraph(report);
    expect(graph.edges).toEqual([
      { from: "n1", to: "n2", kind: "imports", label: "imports" },
      { from: "n3", to: "n1", kind: "imported-by", label: "imports" }
    ]);
    const mermaid = renderFixMapGraphMermaid(graph);
    expect(mermaid).toContain('n1["src/a.ts"]:::primary');
    expect(mermaid).toContain('n3 -->|"imports"| n1');
  });

  it("escapes line breaks in Mermaid labels", () => {
    const mermaid = renderFixMapGraphMermaid({
      graphVersion: 1,
      nodes: [{ id: "n1", path: "src/a\nfile.ts", role: "primary", confidence: "high" }],
      edges: []
    });
    expect(mermaid).toContain("src/a&#10;file.ts");
    expect(mermaid).not.toContain("src/a\nfile.ts");
  });
});
