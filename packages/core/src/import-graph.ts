import type { RepoFile } from "./types.js";

const JS_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".ts", ".tsx"]);
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const COMPILED_TO_SOURCE: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
const SPECIFIER_PATTERNS = [
  /\bimport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
  /\bimport\s*["']([^"'\n]+)["']/g,
  /\bexport\s+[^'"()]*?from\s*["']([^"'\n]+)["']/g,
  /\brequire\s*\(\s*["']([^"'\n]+)["']\s*\)/g,
  /\bimport\s*\(\s*["']([^"'\n]+)["']\s*\)/g
];
const MAX_GRAPH_FILES = 5_000;
const MAX_EDGES_PER_FILE = 200;

export type ImportGraph = {
  imports: Map<string, Set<string>>;
  importedBy: Map<string, Set<string>>;
};

export type ImportProximity = {
  distance: 1 | 2;
  seed: string;
  direction: "imports" | "imported-by";
};

export function buildImportGraph(files: RepoFile[]): ImportGraph {
  const parseable = files
    .filter((file) => JS_EXTENSIONS.has(file.extension) && file.textSample.length > 0)
    .slice(0, MAX_GRAPH_FILES);
  const repoPaths = new Set(files.map((file) => file.path));
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();

  for (const file of parseable) {
    let edges = 0;
    for (const specifier of extractSpecifiers(file.textSample)) {
      if (edges >= MAX_EDGES_PER_FILE) {
        break;
      }
      const target = resolveSpecifier(file.path, specifier, repoPaths);
      if (!target || target === file.path) {
        continue;
      }
      addEdge(imports, file.path, target);
      addEdge(importedBy, target, file.path);
      edges += 1;
    }
  }

  return { imports, importedBy };
}

export function findImportProximity(graph: ImportGraph, seedPaths: string[]): Map<string, ImportProximity> {
  const seeds = new Set(seedPaths);
  const proximity = new Map<string, ImportProximity>();
  const orderedSeeds = [...seeds];

  for (const seed of orderedSeeds) {
    for (const neighbor of neighborsOf(graph, seed)) {
      if (!seeds.has(neighbor.path) && !proximity.has(neighbor.path)) {
        proximity.set(neighbor.path, { distance: 1, seed, direction: neighbor.direction });
      }
    }
  }

  const firstHop = [...proximity.keys()];
  for (const mid of firstHop) {
    const seed = proximity.get(mid)?.seed ?? mid;
    for (const neighbor of neighborsOf(graph, mid)) {
      if (!seeds.has(neighbor.path) && !proximity.has(neighbor.path)) {
        proximity.set(neighbor.path, { distance: 2, seed, direction: neighbor.direction });
      }
    }
  }

  return proximity;
}

function neighborsOf(graph: ImportGraph, path: string): { path: string; direction: ImportProximity["direction"] }[] {
  const neighbors: { path: string; direction: ImportProximity["direction"] }[] = [];
  for (const imported of [...(graph.imports.get(path) ?? [])].sort((a, b) => a.localeCompare(b))) {
    neighbors.push({ path: imported, direction: "imported-by" });
  }
  for (const importer of [...(graph.importedBy.get(path) ?? [])].sort((a, b) => a.localeCompare(b))) {
    neighbors.push({ path: importer, direction: "imports" });
  }
  return neighbors;
}

function extractSpecifiers(textSample: string): Set<string> {
  const specifiers = new Set<string>();
  for (const pattern of SPECIFIER_PATTERNS) {
    for (const match of textSample.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier && specifier.startsWith(".")) {
        specifiers.add(specifier);
      }
    }
  }
  return specifiers;
}

function resolveSpecifier(fromPath: string, specifier: string, repoPaths: Set<string>): string | undefined {
  const baseDir = fromPath.split("/").slice(0, -1).join("/");
  const joined = normalizeSegments(baseDir ? `${baseDir}/${specifier}` : specifier);
  if (joined === undefined || joined === "") {
    return undefined;
  }

  const candidates = [joined];
  const lastSegment = joined.split("/").pop() ?? "";
  const dot = lastSegment.lastIndexOf(".");
  const extension = dot > 0 ? lastSegment.slice(dot) : "";

  for (const sourceExtension of COMPILED_TO_SOURCE[extension] ?? []) {
    candidates.push(`${joined.slice(0, -extension.length)}${sourceExtension}`);
  }
  if (!extension) {
    for (const resolveExtension of RESOLVE_EXTENSIONS) {
      candidates.push(`${joined}${resolveExtension}`);
    }
  }
  for (const resolveExtension of RESOLVE_EXTENSIONS) {
    candidates.push(`${joined}/index${resolveExtension}`);
  }

  return candidates.find((candidate) => repoPaths.has(candidate));
}

function normalizeSegments(path: string): string | undefined {
  const segments: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") {
      continue;
    }
    if (segment === "..") {
      if (segments.length === 0) {
        return undefined;
      }
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

function addEdge(edges: Map<string, Set<string>>, from: string, to: string): void {
  const existing = edges.get(from);
  if (existing) {
    existing.add(to);
  } else {
    edges.set(from, new Set([to]));
  }
}
