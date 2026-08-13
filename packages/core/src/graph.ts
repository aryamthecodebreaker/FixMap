import type { FixMapReport, ImpactEvidence } from "./types.js";

export type FixMapGraph = {
  graphVersion: 1;
  nodes: Array<{ id: string; path: string; role: "primary" | "impact"; confidence: "high" | "medium" | "low" }>;
  edges: Array<{ from: string; to: string; kind: ImpactEvidence["kind"]; label: string }>;
};

export function buildFixMapGraph(report: FixMapReport): FixMapGraph {
  const primary = new Map(report.contextFiles.map((file) => [file.path, file.confidence]));
  const paths = [...new Set([
    ...report.contextFiles.map((file) => file.path),
    ...(report.impact?.files.map((file) => file.path) ?? [])
  ])];
  const idByPath = new Map(paths.map((path, index) => [path, `n${index + 1}`]));
  const nodes = paths.map((path) => {
    const impact = report.impact?.files.find((file) => file.path === path);
    return {
      id: idByPath.get(path)!,
      path,
      role: primary.has(path) ? "primary" as const : "impact" as const,
      confidence: primary.get(path) ?? impact?.confidence ?? "low"
    };
  });
  const edges: FixMapGraph["edges"] = [];
  for (const file of report.impact?.files ?? []) {
    for (const evidence of file.evidence) {
      const seedId = idByPath.get(evidence.seed);
      const fileId = idByPath.get(file.path);
      if (!seedId || !fileId) continue;
      const reversed = evidence.kind === "imported-by";
      edges.push({
        from: reversed ? fileId : seedId,
        to: reversed ? seedId : fileId,
        kind: evidence.kind,
        label: graphEdgeLabel(evidence)
      });
    }
  }
  return { graphVersion: 1, nodes, edges };
}

export function renderFixMapGraphMermaid(graph: FixMapGraph): string {
  const lines = ["flowchart TD"];
  for (const node of graph.nodes) {
    lines.push(`  ${node.id}["${escapeMermaid(node.path)}"]:::${node.role}`);
  }
  for (const edge of graph.edges) {
    const connector = edge.kind === "co-change" ? "-.-" : "-->";
    lines.push(`  ${edge.from} ${connector}|"${escapeMermaid(edge.label)}"| ${edge.to}`);
  }
  lines.push(
    "  classDef primary fill:#163d2d,stroke:#74f0ba,color:#ffffff,stroke-width:2px",
    "  classDef impact fill:#17233a,stroke:#7aa2f7,color:#ffffff"
  );
  return `${lines.join("\n")}\n`;
}

function graphEdgeLabel(evidence: ImpactEvidence): string {
  if (evidence.kind === "imports") return "imports";
  if (evidence.kind === "imported-by") return "imports";
  if (evidence.kind === "test-route") return "routed test";
  return evidence.occurrences ? `co-change ×${evidence.occurrences}` : "co-change";
}

function escapeMermaid(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;");
}
