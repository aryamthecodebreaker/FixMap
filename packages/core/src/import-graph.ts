import type { RepoFile } from "./types.js";

// Single-file components import and are imported like any other module, and their script
// block is what gets sampled — so leaving them out meant proximity never helped a Vue or
// Svelte app even once those extensions could rank at all.
const JS_EXTENSIONS = new Set([".cjs", ".cts", ".js", ".jsx", ".mjs", ".mts", ".svelte", ".ts", ".tsx", ".vue"]);
const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"];
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
  truncatedFiles: number;
  truncatedEdges: number;
};

export type ImportProximity = {
  distance: 1 | 2;
  seed: string;
  direction: "imports" | "imported-by";
};

export function buildImportGraph(files: RepoFile[]): ImportGraph {
  const allParseable = files.filter((file) => JS_EXTENSIONS.has(file.extension) && file.textSample.length > 0);
  const parseable = allParseable.slice(0, MAX_GRAPH_FILES);
  const repoPaths = new Set(files.map((file) => file.path));
  const aliases = buildAliases(files);
  const workspacePackages = buildWorkspacePackages(files);
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();
  let truncatedEdges = 0;

  for (const file of parseable) {
    let edges = 0;
    for (const specifier of extractSpecifiers(file.textSample)) {
      if (edges >= MAX_EDGES_PER_FILE) {
        truncatedEdges += 1;
        break;
      }
      const target = resolveSpecifier(file.path, specifier, repoPaths, aliases, workspacePackages);
      if (!target || target === file.path) {
        continue;
      }
      addEdge(imports, file.path, target);
      addEdge(importedBy, target, file.path);
      edges += 1;
    }
  }

  return {
    imports,
    importedBy,
    truncatedFiles: Math.max(0, allParseable.length - parseable.length),
    truncatedEdges
  };
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
      if (specifier) {
        specifiers.add(specifier);
      }
    }
  }
  return specifiers;
}

type Alias = { prefix: string; suffix: string; targets: string[] };

function resolveSpecifier(
  fromPath: string,
  specifier: string,
  repoPaths: Set<string>,
  aliases: Alias[],
  workspacePackages: Map<string, string[]>
): string | undefined {
  const baseDir = fromPath.split("/").slice(0, -1).join("/");
  const roots: string[] = [];
  if (specifier.startsWith(".")) {
    const joined = normalizeSegments(baseDir ? `${baseDir}/${specifier}` : specifier);
    if (joined) roots.push(joined);
  } else {
    roots.push(...(workspacePackages.get(specifier) ?? []));
    for (const alias of aliases) {
      if (!specifier.startsWith(alias.prefix) || !specifier.endsWith(alias.suffix)) continue;
      const middle = specifier.slice(alias.prefix.length, specifier.length - alias.suffix.length || undefined);
      roots.push(...alias.targets.map((target) => target.replace("*", middle)));
    }
  }
  for (const root of roots) {
    const resolved = resolveCandidate(root, repoPaths);
    if (resolved) return resolved;
  }
  return undefined;
}

function resolveCandidate(joined: string, repoPaths: Set<string>): string | undefined {

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

function buildWorkspacePackages(files: RepoFile[]): Map<string, string[]> {
  const packages = new Map<string, string[]>();
  for (const file of files.filter((entry) => entry.path === "package.json" || entry.path.endsWith("/package.json"))) {
    try {
      const manifest = JSON.parse(file.textSample) as { name?: unknown; source?: unknown; module?: unknown; main?: unknown; types?: unknown };
      if (typeof manifest.name !== "string" || !manifest.name.trim()) continue;
      const dir = file.path.split("/").slice(0, -1).join("/");
      const declared = [manifest.source, manifest.module, manifest.main, manifest.types]
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => normalizeSegments(dir ? `${dir}/${entry}` : entry))
        .filter((entry): entry is string => Boolean(entry));
      packages.set(manifest.name, [
        ...declared,
        ...(dir ? [`${dir}/src/index`, `${dir}/index`] : ["src/index", "index"])
      ]);
    } catch { /* A malformed manifest is reported by the scanner, not the graph. */ }
  }
  return packages;
}

function buildAliases(files: RepoFile[]): Alias[] {
  const aliases: Alias[] = [];
  for (const file of files.filter((entry) => /(^|\/)(?:tsconfig|jsconfig)(?:\.[^/]*)?\.json$/i.test(entry.path))) {
    try {
      const config = JSON.parse(file.textSample) as { compilerOptions?: { baseUrl?: unknown; paths?: unknown } };
      const paths = config.compilerOptions?.paths;
      if (!paths || typeof paths !== "object" || Array.isArray(paths)) continue;
      const dir = file.path.split("/").slice(0, -1).join("/");
      const baseUrl = typeof config.compilerOptions?.baseUrl === "string" ? config.compilerOptions.baseUrl : ".";
      const base = normalizeSegments(dir ? `${dir}/${baseUrl}` : baseUrl) ?? "";
      for (const [pattern, rawTargets] of Object.entries(paths)) {
        if (!Array.isArray(rawTargets) || !rawTargets.every((entry) => typeof entry === "string")) continue;
        const star = pattern.indexOf("*");
        aliases.push({
          prefix: star === -1 ? pattern : pattern.slice(0, star),
          suffix: star === -1 ? "" : pattern.slice(star + 1),
          targets: rawTargets.map((target) => normalizeSegments(base ? `${base}/${target}` : target)).filter((target): target is string => Boolean(target))
        });
      }
    } catch { /* Ignore configs that are not strict JSON. */ }
  }
  return aliases;
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
