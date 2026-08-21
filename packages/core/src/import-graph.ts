import { extractLanguageImports, languageAdapterForFile, type LanguageImport } from "./language-adapters.js";
import type { RepoFile } from "./types.js";

const RESOLVE_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte"];
const COMPILED_TO_SOURCE: Record<string, string[]> = {
  ".js": [".ts", ".tsx"],
  ".mjs": [".mts"],
  ".cjs": [".cts"]
};
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
  const allParseable = files.filter((file) => languageAdapterForFile(file) && file.textSample.length > 0);
  const parseable = allParseable.slice(0, MAX_GRAPH_FILES);
  const repoPaths = new Set(files.map((file) => file.path));
  const aliases = buildAliases(files);
  const workspacePackages = buildWorkspacePackages(files);
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();
  let truncatedEdges = 0;

  for (const file of parseable) {
    let edges = 0;
    for (const imported of extractLanguageImports(file)) {
      for (const target of resolveLanguageImport(file.path, imported, repoPaths, aliases, workspacePackages)) {
        if (edges >= MAX_EDGES_PER_FILE) {
          truncatedEdges += 1;
          break;
        }
        if (target === file.path || imports.get(file.path)?.has(target)) continue;
        addEdge(imports, file.path, target);
        addEdge(importedBy, target, file.path);
        edges += 1;
      }
      if (edges >= MAX_EDGES_PER_FILE) break;
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

type Alias = { prefix: string; suffix: string; targets: string[] };

function resolveLanguageImport(
  fromPath: string,
  imported: LanguageImport,
  repoPaths: Set<string>,
  aliases: Alias[],
  workspacePackages: Map<string, string[]>
): string[] {
  if (imported.adapter === "python") {
    return resolvePythonImport(fromPath, imported, repoPaths);
  }
  if (imported.adapter === "java") {
    return resolveJavaImport(imported, repoPaths);
  }
  const target = resolveSpecifier(fromPath, imported.specifier, repoPaths, aliases, workspacePackages);
  return target ? [target] : [];
}

function resolvePythonImport(fromPath: string, imported: LanguageImport, repoPaths: Set<string>): string[] {
  const relativeMatch = /^(\.+)(.*)$/.exec(imported.specifier);
  let roots: string[];
  if (relativeMatch?.[1] !== undefined) {
    const base = fromPath.split("/").slice(0, -1);
    const parentLevels = Math.max(0, relativeMatch[1].length - 1);
    if (parentLevels > base.length) return [];
    const packageRoot = base.slice(0, base.length - parentLevels);
    const moduleSegments = (relativeMatch[2] ?? "").split(".").filter(Boolean);
    roots = [[...packageRoot, ...moduleSegments].join("/")];
  } else {
    const modulePath = imported.specifier.replace(/\./g, "/");
    roots = [modulePath, `src/${modulePath}`];
  }

  const memberRoots = imported.importedNames
    .filter((name) => name !== "*")
    .flatMap((name) => roots.map((root) => root ? `${root}/${name}` : name));
  const targets = new Set<string>();
  for (const root of [...memberRoots, ...roots]) {
    for (const candidate of pythonCandidates(root, repoPaths, !relativeMatch)) {
      targets.add(candidate);
    }
  }
  return [...targets].sort((a, b) => a.localeCompare(b));
}

function pythonCandidates(root: string, repoPaths: Set<string>, allowSuffix: boolean): string[] {
  if (!root) return [];
  const suffixes = [`${root}.py`, `${root}.pyi`, `${root}/__init__.py`, `${root}/__init__.pyi`];
  const exact = suffixes.filter((candidate) => repoPaths.has(candidate));
  if (exact.length > 0 || !allowSuffix) return exact;
  return [...repoPaths]
    .filter((path) => suffixes.some((suffix) => path.endsWith(`/${suffix}`)))
    .sort(shortestPathFirst)
    .slice(0, 8);
}

function resolveJavaImport(imported: LanguageImport, repoPaths: Set<string>): string[] {
  const modulePath = imported.specifier.replace(/\./g, "/");
  if (imported.wildcard) {
    return [...repoPaths]
      .filter((path) => {
        const marker = `/${modulePath}/`;
        const index = `/${path}`.lastIndexOf(marker);
        if (index === -1 || !path.endsWith(".java")) return false;
        return `/${path}`.slice(index + marker.length).split("/").length === 1;
      })
      .sort(shortestPathFirst);
  }
  const suffix = `${modulePath}.java`;
  return [...repoPaths]
    .filter((path) => path === suffix || path.endsWith(`/${suffix}`))
    .sort(shortestPathFirst)
    .slice(0, 1);
}

function shortestPathFirst(left: string, right: string): number {
  return left.split("/").length - right.split("/").length || left.localeCompare(right);
}

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
