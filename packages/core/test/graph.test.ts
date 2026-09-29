import { describe, expect, it } from "vitest";
import { buildFixMapGraph, renderFixMapGraphMermaid } from "../src/graph.js";
import { buildReportFromRepo } from "../src/report.js";
import { validateFixMapReport } from "../src/validate.js";
import type { FixMapReport, RepoMap } from "../src/types.js";

describe("impact graph export", () => {
  it.each([false, true])("preserves imports among primary files without tests (cycle: %s)", (cycle) => {
    const paths = ["src/a.js", "src/b.js", "src/c.js", "src/d.js", "src/e.js"];
    const repo: RepoMap = {
      root: "/repo", packageScripts: [], changedFiles: [], diffText: "", packageManager: "npm", diagnostics: [],
      files: paths.map((path, index) => ({
        path, extension: ".js", sizeBytes: 100, isSource: true, isTest: false, kind: "code",
        textSample: `${index < 4 || cycle ? `import './${String.fromCharCode(97 + ((index + 1) % 5))}.js';` : ""}\nexport const loginX = ${index};`
      }))
    };
    const report = buildReportFromRepo(repo, { issueText: "loginX broken", limit: 5 });
    expect(report.contextFiles.map((file) => file.path).sort()).toEqual(paths);
    const serialized = JSON.parse(JSON.stringify(report));
    expect(validateFixMapReport(serialized, "report").success).toBe(true);
    for (const primaryImports of [
      [{ from: "../outside.js", to: paths[0] }],
      [{ from: paths[0], to: "src/missing.js" }],
      [{ from: paths[0], to: paths[0] }],
      [{ from: paths[0], to: paths[1] }, { from: paths[0], to: paths[1] }],
      "invalid"
    ]) {
      expect(validateFixMapReport({ ...serialized, impact: { ...serialized.impact, primaryImports } }, "report").success).toBe(false);
    }
    const graph = buildFixMapGraph(serialized);
    const byId = new Map(graph.nodes.map((node) => [node.id, node.path]));
    const pairs = graph.edges.filter((edge) => edge.label === "imports")
      .map((edge) => `${byId.get(edge.from)} -> ${byId.get(edge.to)}`);
    const expected = paths.slice(0, cycle ? 5 : 4).map((path, index) => `${path} -> ${paths[(index + 1) % 5]}`);
    expect([...new Set(pairs)].sort()).toEqual(expected.sort());
    expect(pairs.length).toBe(expected.length);
    expect(renderFixMapGraphMermaid(graph)).toContain('-->|"imports"|');
  });

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
