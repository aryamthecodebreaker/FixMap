import { extractLanguageDefinitions, extractLanguageImports, languageAdapterForFile, type LanguageImport } from "./language-adapters.js";
import { buildComposerProjects, resolveComposerSymbol, type ComposerProject } from "./composer-projects.js";
import { buildDotnetProjects, dotnetReferenceClosure, type DotnetProject } from "./dotnet-projects.js";
import { buildRustProjects, rustPathDependency, rustProjectForPath, type RustProject } from "./rust-projects.js";
import { buildGoModules, buildGoWorkspaces, goModuleForPath, goWorkspaceForModules, type GoModule, type GoWorkspace } from "./go-projects.js";
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

type ResolverIndex = {
  repoPaths: Set<string>;
  suffixPaths: Map<string, string[]>;
  javaPackagePaths: Map<string, string[]>;
  directoryPaths: Map<string, string[]>;
  goModules: GoModule[];
  goWorkspaces: GoWorkspace[];
  rustProjects: RustProject[];
  phpSymbols: Map<string, string[]>;
  phpNamespaces: Map<string, string[]>;
  dotnetNamespaces: Map<string, string[]>;
  dotnetProjects: DotnetProject[];
  dotnetProjectByFile: Map<string, DotnetProject>;
  dotnetReferenceClosures: Map<string, Set<string>>;
  dotnetGlobalTargetsByProject: Map<string, Map<string, string[]>>;
  composerProjectByFile: Map<string, ComposerProject>;
};

export function buildImportGraph(files: RepoFile[]): ImportGraph {
  const allParseable = files.filter((file) => languageAdapterForFile(file) && file.textSample.length > 0);
  const parseable = allParseable.slice(0, MAX_GRAPH_FILES);
  const dotnetProjects = buildDotnetProjects(files);
  const composerProjects = buildComposerProjects(files);
  const rustProjects = buildRustProjects(files);
  const goModules = buildGoModules(files);
  const goWorkspaces = buildGoWorkspaces(files, goModules);
  const resolverIndex = buildResolverIndex(files, dotnetProjects, composerProjects, rustProjects, goModules, goWorkspaces);
  const aliases = buildAliases(files);
  const workspacePackages = buildWorkspacePackages(files);
  const imports = new Map<string, Set<string>>();
  const importedBy = new Map<string, Set<string>>();
  let truncatedEdges = 0;

  for (const file of parseable) {
    let edges = 0;
    for (const imported of extractLanguageImports(file)) {
      for (const target of resolveLanguageImport(file.path, imported, resolverIndex, aliases, workspacePackages)) {
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
    const dotnetProject = resolverIndex.dotnetProjectByFile.get(file.path);
    if (dotnetProject && file.path.toLowerCase().endsWith(".cs")) {
      const identifiers = new Set(file.textSample.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) ?? []);
      const targetsBySymbol = resolverIndex.dotnetGlobalTargetsByProject.get(dotnetProject.path);
      for (const identifier of identifiers) {
        for (const target of targetsBySymbol?.get(identifier) ?? []) {
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
  }

  for (const project of dotnetProjects) {
    for (const reference of project.references.slice(0, MAX_EDGES_PER_FILE)) {
      addEdge(imports, project.path, reference);
      addEdge(importedBy, reference, project.path);
    }
    truncatedEdges += Math.max(0, project.references.length - MAX_EDGES_PER_FILE);
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
  resolverIndex: ResolverIndex,
  aliases: Alias[],
  workspacePackages: Map<string, string[]>
): string[] {
  if (imported.adapter === "python") {
    return resolvePythonImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "java") {
    return resolveJavaImport(imported, resolverIndex);
  }
  if (imported.adapter === "go") {
    return resolveGoImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "rust") {
    return resolveRustImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "ruby") {
    return resolveRubyImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "php") {
    return resolvePhpImport(fromPath, imported, resolverIndex);
  }
  if (imported.adapter === "dotnet") {
    return resolveDotnetImport(fromPath, imported, resolverIndex);
  }
  const target = resolveSpecifier(fromPath, imported.specifier, resolverIndex.repoPaths, aliases, workspacePackages);
  return target ? [target] : [];
}

function resolvePythonImport(fromPath: string, imported: LanguageImport, resolverIndex: ResolverIndex): string[] {
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
    for (const candidate of pythonCandidates(root, resolverIndex, !relativeMatch)) {
      targets.add(candidate);
    }
  }
  return [...targets].sort((a, b) => a.localeCompare(b));
}

function pythonCandidates(root: string, resolverIndex: ResolverIndex, allowSuffix: boolean): string[] {
  if (!root) return [];
  const suffixes = [`${root}.py`, `${root}.pyi`, `${root}/__init__.py`, `${root}/__init__.pyi`];
  const exact = suffixes.filter((candidate) => resolverIndex.repoPaths.has(candidate));
  if (exact.length > 0 || !allowSuffix) return exact;
  return [...new Set(suffixes.flatMap((suffix) => resolverIndex.suffixPaths.get(suffix) ?? []))]
    .sort(shortestPathFirst)
    .slice(0, 8);
}

function resolveJavaImport(imported: LanguageImport, resolverIndex: ResolverIndex): string[] {
  const modulePath = imported.specifier.replace(/\./g, "/");
  if (imported.wildcard) {
    return [...(resolverIndex.javaPackagePaths.get(modulePath) ?? [])].sort(shortestPathFirst);
  }
  const suffix = `${modulePath}.java`;
  const exact = resolverIndex.repoPaths.has(suffix) ? [suffix] : [];
  return [...exact, ...(resolverIndex.suffixPaths.get(suffix) ?? [])]
    .sort(shortestPathFirst)
    .slice(0, 1);
}

function resolveGoImport(fromPath: string, imported: LanguageImport, resolverIndex: ResolverIndex): string[] {
  const sourceModule = goModuleForPath(resolverIndex.goModules, fromPath);
  const candidates = resolverIndex.goModules
    .filter((entry) => imported.specifier === entry.name || imported.specifier.startsWith(`${entry.name}/`))
    .sort((left, right) => right.name.length - left.name.length || left.path.localeCompare(right.path));
  const longest = candidates[0]?.name.length;
  const equallySpecific = candidates.filter((candidate) => candidate.name.length === longest);
  const reachable = sourceModule
    ? equallySpecific.filter((candidate) => candidate.path === sourceModule.path ||
      goWorkspaceForModules(resolverIndex.goWorkspaces, sourceModule.root, candidate.root) !== undefined)
    : equallySpecific;
  const module = reachable.length === 1 ? reachable[0] : undefined;
  if (!module) return [];
  const suffix = imported.specifier === module.name ? "" : imported.specifier.slice(module.name.length + 1);
  const directory = [module.root, suffix].filter(Boolean).join("/");
  return (resolverIndex.directoryPaths.get(directory) ?? [])
    .filter((path) => path.endsWith(".go") && !path.endsWith("_test.go"))
    .sort(shortestPathFirst)
    .slice(0, 20);
}

function resolveRustImport(fromPath: string, imported: LanguageImport, resolverIndex: ResolverIndex): string[] {
  if (imported.specifier.startsWith("file:")) {
    const raw = imported.specifier.slice("file:".length);
    const target = normalizeSegments(`${fromPath.split("/").slice(0, -1).join("/")}/${raw}`);
    if (!target) return [];
    return resolverIndex.repoPaths.has(target) ? [target] : resolverIndex.repoPaths.has(`${target}.rs`) ? [`${target}.rs`] : [];
  }
  const cargoRoot = nearestManifestDirectory(fromPath, "Cargo.toml", resolverIndex.repoPaths);
  const sourceRoot = cargoRoot ? `${cargoRoot}/src`.replace(/^\//, "") : fromPath.startsWith("src/") ? "src" : "";
  const segments = imported.specifier.replace(/::\*$/, "").split("::").filter(Boolean);
  const head = segments.shift();
  let base: string;
  let externalRoot: string | undefined;
  if (head === "crate") {
    base = sourceRoot;
  } else if (head === "self" || head === "super") {
    const pathSegments = fromPath.split("/");
    const fileName = pathSegments.pop() ?? "";
    const stem = fileName.replace(/\.rs$/i, "");
    const isRootModule = ["lib", "main", "mod"].includes(stem);
    const moduleSegments = isRootModule ? pathSegments : [...pathSegments, stem];
    if (head === "super") moduleSegments.pop();
    base = moduleSegments.join("/");
  } else if (head) {
    const project = rustProjectForPath(resolverIndex.rustProjects, fromPath);
    const dependency = project ? rustPathDependency(project, head) : undefined;
    if (!dependency) return [];
    base = [dependency.root, "src"].filter(Boolean).join("/");
    externalRoot = [`${base}/lib.rs`, `${base}/main.rs`, `${base}/mod.rs`]
      .find((candidate) => resolverIndex.repoPaths.has(candidate));
    if (segments.length === 0) {
      return externalRoot ? [externalRoot] : [];
    }
  } else {
    return [];
  }
  for (let length = segments.length; length >= 1; length -= 1) {
    const root = [base, ...segments.slice(0, length)].filter(Boolean).join("/");
    const match = [`${root}.rs`, `${root}/mod.rs`].find((candidate) => resolverIndex.repoPaths.has(candidate));
    if (match) return [match];
  }
  return externalRoot ? [externalRoot] : [];
}

function resolveRubyImport(fromPath: string, imported: LanguageImport, resolverIndex: ResolverIndex): string[] {
  const separator = imported.specifier.indexOf(":");
  const mode = separator === -1 ? "" : imported.specifier.slice(0, separator);
  const raw = separator === -1 ? imported.specifier : imported.specifier.slice(separator + 1);
  const normalized = raw.replace(/\.rb$/i, "");
  const roots = mode === "relative"
    ? [normalizeSegments(`${fromPath.split("/").slice(0, -1).join("/")}/${normalized}`)].filter((value): value is string => Boolean(value))
    : [normalized, `lib/${normalized}`, `app/${normalized}`];
  for (const root of roots) {
    const match = [`${root}.rb`, `${root}/init.rb`].find((candidate) => resolverIndex.repoPaths.has(candidate));
    if (match) return [match];
  }
  return [];
}

function resolvePhpImport(fromPath: string, imported: LanguageImport, resolverIndex: ResolverIndex): string[] {
  if (imported.specifier.startsWith("file:")) {
    const raw = imported.specifier.slice("file:".length);
    const root = normalizeSegments(`${fromPath.split("/").slice(0, -1).join("/")}/${raw}`);
    if (!root) return [];
    return resolverIndex.repoPaths.has(root) ? [root] : resolverIndex.repoPaths.has(`${root}.php`) ? [`${root}.php`] : [];
  }
  const symbol = imported.specifier.replace(/^\\+/, "").toLowerCase();
  const exact = resolverIndex.phpSymbols.get(symbol);
  const sourceProject = resolverIndex.composerProjectByFile.get(fromPath);
  if (exact?.length) {
    const scoped = sourceProject
      ? exact.filter((path) => resolverIndex.composerProjectByFile.get(path)?.path === sourceProject.path)
      : exact;
    if (scoped.length > 0) return [...scoped].sort(shortestPathFirst).slice(0, 1);
  }
  if (sourceProject) {
    const mapped = resolveComposerSymbol(sourceProject, imported.specifier.replace(/^\\+/, ""), resolverIndex.repoPaths, resolverIndex.suffixPaths);
    if (mapped.length > 0) return mapped;
  }
  const namespace = symbol.split("\\").slice(0, -1).join("\\");
  const namespacePaths = resolverIndex.phpNamespaces.get(namespace) ?? [];
  return (sourceProject
    ? namespacePaths.filter((path) => resolverIndex.composerProjectByFile.get(path)?.path === sourceProject.path)
    : namespacePaths)
    .sort(shortestPathFirst)
    .slice(0, 20);
}

function resolveDotnetImport(fromPath: string, imported: LanguageImport, resolverIndex: ResolverIndex): string[] {
  const namespace = imported.specifier.toLowerCase();
  const exact = resolverIndex.dotnetNamespaces.get(namespace) ?? [];
  // C# namespace names are dotted but not hierarchical imports: `using A.B`
  // does not make symbols declared in `A.B.C` available. Exact lookup is both
  // the correct model and avoids scanning every namespace for every using.
  const sourceProject = resolverIndex.dotnetProjectByFile.get(fromPath);
  if (!sourceProject) return exact.slice(0, 20);
  let reachableProjects = resolverIndex.dotnetReferenceClosures.get(sourceProject.path);
  if (!reachableProjects) {
    reachableProjects = dotnetReferenceClosure(resolverIndex.dotnetProjects, sourceProject.path);
    resolverIndex.dotnetReferenceClosures.set(sourceProject.path, reachableProjects);
  }
  return exact
    .filter((path) => {
      const targetProject = resolverIndex.dotnetProjectByFile.get(path);
      return targetProject !== undefined && reachableProjects.has(targetProject.path);
    })
    .slice(0, 20);
}

/** Build once per graph instead of walking every repository path for every Python or Java
 * import. Each source path contributes its directory suffixes, preserving the old
 * path.endsWith() resolution semantics while changing repeated lookup from O(files) to O(1). */
function buildResolverIndex(
  files: RepoFile[],
  dotnetProjects: DotnetProject[],
  composerProjects: ComposerProject[],
  rustProjects: RustProject[],
  goModules: GoModule[],
  goWorkspaces: GoWorkspace[]
): ResolverIndex {
  const repoPaths = new Set(files.map((file) => file.path));
  const suffixPaths = new Map<string, string[]>();
  const javaPackagePaths = new Map<string, string[]>();
  const directoryPaths = new Map<string, string[]>();
  const phpSymbols = new Map<string, string[]>();
  const phpNamespaces = new Map<string, string[]>();
  const dotnetNamespaces = new Map<string, string[]>();
  const dotnetSymbolsByFile = new Map<string, string[]>();
  const dotnetProjectByFile = new Map<string, DotnetProject>();
  const composerProjectByFile = new Map<string, ComposerProject>();
  const dotnetProjectsByPath = new Map(dotnetProjects.map((project) => [project.path, project]));
  const dotnetProjectsByRoot = new Map<string, DotnetProject[]>();
  for (const project of dotnetProjects) {
    const existing = dotnetProjectsByRoot.get(project.root);
    if (existing) existing.push(project);
    else dotnetProjectsByRoot.set(project.root, [project]);
  }
  const composerProjectsByRoot = new Map<string, ComposerProject[]>();
  for (const project of composerProjects) {
    const existing = composerProjectsByRoot.get(project.root);
    if (existing) existing.push(project);
    else composerProjectsByRoot.set(project.root, [project]);
  }

  for (const file of files) {
    const segments = file.path.split("/");
    addIndexedPath(directoryPaths, segments.slice(0, -1).join("/"), file.path);
    if (/\.(?:py|pyi|java|php)$/i.test(file.path)) {
      for (let start = 1; start < segments.length; start += 1) {
        addIndexedPath(suffixPaths, segments.slice(start).join("/"), file.path);
      }
    }
    if (file.path.toLowerCase().endsWith(".java")) {
      const directories = segments.slice(0, -1);
      for (let start = 0; start < directories.length; start += 1) {
        addIndexedPath(javaPackagePaths, directories.slice(start).join("/"), file.path);
      }
    }
    if (file.path.toLowerCase().endsWith(".php")) {
      const owner = projectForSourcePath(file.path, composerProjectsByRoot);
      if (owner) composerProjectByFile.set(file.path, owner);
      const namespace = /^\s*namespace\s+([^;{\n]+)\s*[;{]/m.exec(file.textSample)?.[1]?.trim().replace(/^\\+|\\+$/g, "");
      if (namespace) {
        const normalizedNamespace = namespace.toLowerCase();
        addIndexedPath(phpNamespaces, normalizedNamespace, file.path);
        for (const definition of extractLanguageDefinitions(file)) {
          if (["class", "interface", "type"].includes(definition.kind)) {
            addIndexedPath(phpSymbols, `${normalizedNamespace}\\${definition.name.toLowerCase()}`, file.path);
          }
        }
      }
    }
    if (file.path.toLowerCase().endsWith(".cs")) {
      const namespace = /\bnamespace\s+([A-Za-z_][A-Za-z0-9_.]*)\s*(?:;|\{)/m.exec(file.textSample)?.[1]?.toLowerCase();
      if (namespace) addIndexedPath(dotnetNamespaces, namespace, file.path);
      const symbols = [...new Set(extractLanguageDefinitions(file)
        .filter((definition) => definition.kind !== "method")
        .map((definition) => definition.name))];
      if (symbols.length > 0) dotnetSymbolsByFile.set(file.path, symbols);
      const owner = projectForSourcePath(file.path, dotnetProjectsByRoot);
      if (owner) dotnetProjectByFile.set(file.path, owner);
    }
  }

  goModules.sort((a, b) => b.name.length - a.name.length || a.name.localeCompare(b.name));
  // A large namespace such as `System` can be referenced by thousands of C# files.
  // Sort each namespace once instead of sorting the same candidate list per `using`.
  for (const paths of dotnetNamespaces.values()) paths.sort(shortestPathFirst);
  const dotnetReferenceClosures = new Map<string, Set<string>>();
  const dotnetGlobalTargetsByProject = new Map<string, Map<string, string[]>>();
  for (const project of dotnetProjects) {
    if (project.globalUsings.length === 0) continue;
    const reachable = dotnetReferenceClosureFromIndex(dotnetProjectsByPath, project.path);
    dotnetReferenceClosures.set(project.path, reachable);
    const targetsBySymbol = new Map<string, Set<string>>();
    for (const namespace of project.globalUsings) {
      for (const path of dotnetNamespaces.get(namespace.toLowerCase()) ?? []) {
        const owner = dotnetProjectByFile.get(path);
        const symbols = dotnetSymbolsByFile.get(path) ?? [];
        if (!owner || !reachable.has(owner.path)) continue;
        for (const symbol of symbols) {
          const targets = targetsBySymbol.get(symbol);
          if (targets) targets.add(path);
          else targetsBySymbol.set(symbol, new Set([path]));
        }
      }
    }
    dotnetGlobalTargetsByProject.set(project.path, new Map(
      [...targetsBySymbol.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([symbol, targets]) => [symbol, [...targets].sort(shortestPathFirst)])
    ));
  }
  return {
    repoPaths,
    suffixPaths,
    javaPackagePaths,
    directoryPaths,
    goModules,
    goWorkspaces,
    rustProjects,
    phpSymbols,
    phpNamespaces,
    dotnetNamespaces,
    dotnetProjects,
    dotnetProjectByFile,
    dotnetReferenceClosures,
    dotnetGlobalTargetsByProject,
    composerProjectByFile
  };
}

function dotnetReferenceClosureFromIndex(projectsByPath: ReadonlyMap<string, DotnetProject>, projectPath: string): Set<string> {
  const reachable = new Set<string>();
  const pending = [projectPath];
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const reference of projectsByPath.get(current)?.references ?? []) {
      if (!reachable.has(reference)) pending.push(reference);
    }
  }
  return reachable;
}

function projectForSourcePath<T extends { root: string }>(
  path: string,
  projectsByRoot: ReadonlyMap<string, T[]>
): T | undefined {
  const directories = path.split("/").slice(0, -1);
  for (let length = directories.length; length >= 0; length -= 1) {
    const root = directories.slice(0, length).join("/");
    const projects = projectsByRoot.get(root) ?? [];
    if (projects.length > 0) return projects.length === 1 ? projects[0] : undefined;
  }
  return undefined;
}

function nearestManifestDirectory(fromPath: string, manifest: string, repoPaths: ReadonlySet<string>): string | undefined {
  const directories = fromPath.split("/").slice(0, -1);
  for (let length = directories.length; length >= 0; length -= 1) {
    const directory = directories.slice(0, length).join("/");
    const candidate = directory ? `${directory}/${manifest}` : manifest;
    if (repoPaths.has(candidate)) return directory;
  }
  return undefined;
}

function addIndexedPath(index: Map<string, string[]>, key: string, path: string): void {
  const existing = index.get(key);
  if (existing) existing.push(path);
  else index.set(key, [path]);
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
