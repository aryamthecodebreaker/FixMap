import type { RepoFile } from "./types.js";

const PROJECT_FILE = /\.(?:csproj|fsproj|vbproj)$/i;
const SOLUTION_FILE = /\.slnx?$/i;
const PROJECT_REFERENCE = /<ProjectReference\b[^>]*\bInclude\s*=\s*(["'])(.*?)\1/gi;
const USING_ITEM = /<Using\b([^>]*)>/gi;
const COMPILE_ITEM = /<Compile\b[^>]*\bInclude\s*=\s*(["'])(.*?)\1/gi;
const IMPLICIT_USINGS = /<ImplicitUsings>\s*([^<\s]+)\s*<\/ImplicitUsings>/gi;
const IMPORT_ITEM = /<Import\b[^>]*\bProject\s*=\s*(["'])(.*?)\1/gi;
const PROJECT_SDK = /<Project\b[^>]*\bSdk\s*=\s*(["'])(.*?)\1/i;
const SOURCE_GLOBAL_USING = /^\s*global\s+using\s+(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm;
const SOLUTION_PROJECT = /^\s*Project\("[^"]+"\)\s*=\s*"[^"]+",\s*"([^"]+\.(?:csproj|fsproj|vbproj))",\s*"[^"]+"\s*$/gim;
const SLNX_PROJECT = /<Project\b[^>]*\bPath\s*=\s*(["'])(.*?)\1/gi;
// `$([MSBuild]::GetPathOfFileAbove('Directory.Build.props', '$(MSBuildThisFileDirectory)../'))`,
// the documented way for a nested Directory.Build file to chain to the one above it.
const IMPORT_FILE_ABOVE = /^\$\(\[MSBuild\]::GetPathOfFileAbove\(\s*'(Directory\.Build\.(?:props|targets))'\s*,\s*'\$\(MSBuildThisFileDirectory\)\.\.\/?'\s*\)\)$/i;
const MAX_IMPORT_DEPTH = 8;

/**
 * Namespaces the .NET SDK adds as global usings when `ImplicitUsings` is enabled
 * (Microsoft.NET.Sdk and the Web and Worker SDKs, C# projects only).
 */
const SDK_IMPLICIT_USINGS: Readonly<Record<string, readonly string[]>> = {
  "microsoft.net.sdk": ["System", "System.Collections.Generic", "System.IO", "System.Linq", "System.Net.Http", "System.Threading", "System.Threading.Tasks"],
  "microsoft.net.sdk.web": [
    "System", "System.Collections.Generic", "System.IO", "System.Linq", "System.Net.Http", "System.Net.Http.Json", "System.Threading", "System.Threading.Tasks",
    "Microsoft.AspNetCore.Builder", "Microsoft.AspNetCore.Hosting", "Microsoft.AspNetCore.Http", "Microsoft.AspNetCore.Routing",
    "Microsoft.Extensions.Configuration", "Microsoft.Extensions.DependencyInjection", "Microsoft.Extensions.Hosting", "Microsoft.Extensions.Logging"
  ],
  "microsoft.net.sdk.worker": [
    "System", "System.Collections.Generic", "System.IO", "System.Linq", "System.Net.Http", "System.Threading", "System.Threading.Tasks",
    "Microsoft.Extensions.Configuration", "Microsoft.Extensions.DependencyInjection", "Microsoft.Extensions.Hosting", "Microsoft.Extensions.Logging"
  ]
};

export type DotnetProject = {
  path: string;
  root: string;
  references: string[];
  globalUsings: string[];
  /** Source files outside the project directory compiled in through literal `<Compile Include>` items. */
  linkedSources: string[];
  /** Directory.Build.props/targets files (and their literal imports) that apply to this project, in evaluation order. */
  buildFiles: string[];
  test: boolean;
};

export type DotnetSolution = {
  path: string;
  root: string;
  projects: string[];
};

/**
 * Parse only literal, repository-contained project references. MSBuild expressions,
 * wildcards, absolute paths, and references escaping the repository remain unresolved
 * instead of being guessed from names.
 */
export function buildDotnetProjects(files: RepoFile[]): DotnetProject[] {
  const projectFiles = files
    .filter((file) => PROJECT_FILE.test(file.path))
    .sort((left, right) => left.path.localeCompare(right.path));
  const canonicalPaths = new Map(files.map((file) => [file.path.toLowerCase(), file]));
  const resolve = (from: string, include: string): RepoFile | undefined => {
    const target = literalContainedPath(from, include);
    return target ? canonicalPaths.get(target.toLowerCase()) : undefined;
  };
  const projectTargets = new Map(projectFiles.map((file) => [file.path.toLowerCase(), file.path]));

  const projects = projectFiles.map((file) => {
    const root = directoryOf(file.path);
    const references = new Set<string>();
    PROJECT_REFERENCE.lastIndex = 0;
    for (const match of file.textSample.matchAll(PROJECT_REFERENCE)) {
      const target = literalContainedPath(root, match[2] ?? "");
      const canonical = target ? projectTargets.get(target.toLowerCase()) : undefined;
      if (canonical && canonical !== file.path) references.add(canonical);
    }

    // MSBuild evaluates the nearest Directory.Build.props, then the project, then the
    // nearest Directory.Build.targets; later `<Using>` items and properties win.
    const before = buildFileChain(canonicalPaths, root, "Directory.Build.props");
    const after = buildFileChain(canonicalPaths, root, "Directory.Build.targets");
    const evaluated = [...before, file, ...after];
    const usings = new Set<string>();
    const removed = new Set<string>();
    let implicitUsings = false;
    for (const document of evaluated) {
      IMPLICIT_USINGS.lastIndex = 0;
      for (const match of document.textSample.matchAll(IMPLICIT_USINGS)) {
        implicitUsings = /^(?:enable|true)$/i.test(match[1] ?? "");
      }
      USING_ITEM.lastIndex = 0;
      for (const match of document.textSample.matchAll(USING_ITEM)) {
        const attributes = match[1] ?? "";
        const include = attribute(attributes, "Include");
        const remove = attribute(attributes, "Remove");
        if (include && validNamespace(include)) { usings.add(include); removed.delete(include); }
        if (remove && validNamespace(remove)) { removed.add(remove); usings.delete(remove); }
      }
    }
    if (implicitUsings && /\.csproj$/i.test(file.path)) {
      const sdk = PROJECT_SDK.exec(file.textSample)?.[2]?.split("/")[0]?.trim().toLowerCase() ?? "";
      for (const namespace of SDK_IMPLICIT_USINGS[sdk] ?? []) {
        if (!removed.has(namespace)) usings.add(namespace);
      }
    }

    const linkedSources = new Set<string>();
    COMPILE_ITEM.lastIndex = 0;
    for (const match of file.textSample.matchAll(COMPILE_ITEM)) {
      const target = resolve(root, match[2] ?? "");
      if (target && /\.(?:cs|fs|vb)$/i.test(target.path) && !(root === "" || target.path.startsWith(`${root}/`))) {
        linkedSources.add(target.path);
      }
    }
    return {
      path: file.path,
      root,
      references: [...references].sort((left, right) => left.localeCompare(right)),
      globalUsings: [...usings].sort((left, right) => left.localeCompare(right)),
      linkedSources: [...linkedSources].sort((left, right) => left.localeCompare(right)),
      buildFiles: [...before, ...after].map((document) => document.path),
      test: isDotnetTestProject(file)
    };
  });
  const projectsByRoot = new Map<string, DotnetProject[]>();
  for (const project of projects) {
    const existing = projectsByRoot.get(project.root);
    if (existing) existing.push(project);
    else projectsByRoot.set(project.root, [project]);
  }
  for (const source of files.filter((file) => file.path.toLowerCase().endsWith(".cs"))) {
    const owner = dotnetProjectForPathFromRoots(projectsByRoot, source.path) ?? dotnetLinkingProject(projects, source.path);
    if (!owner) continue;
    SOURCE_GLOBAL_USING.lastIndex = 0;
    for (const match of source.textSample.matchAll(SOURCE_GLOBAL_USING)) {
      const namespace = match[1]?.trim();
      if (namespace && validNamespace(namespace) && !owner.globalUsings.includes(namespace)) owner.globalUsings.push(namespace);
    }
  }
  for (const project of projects) project.globalUsings.sort((left, right) => left.localeCompare(right));
  return projects;
}

/**
 * The nearest `name` at or above `directory`, followed through literal or documented
 * `GetPathOfFileAbove` imports. Anything else (other MSBuild expressions, absolute or
 * escaping paths, missing files) is not followed.
 */
function buildFileChain(files: ReadonlyMap<string, RepoFile>, directory: string, name: string): RepoFile[] {
  const start = nearestFileAbove(files, directory, name);
  if (!start) return [];
  const ordered: RepoFile[] = [];
  const visiting = new Set<string>();
  const visit = (file: RepoFile, depth: number): void => {
    if (depth > MAX_IMPORT_DEPTH || visiting.has(file.path)) return;
    visiting.add(file.path);
    const root = directoryOf(file.path);
    IMPORT_ITEM.lastIndex = 0;
    // Imports are evaluated where they appear; importing first keeps parents before children
    // for the usual chain-to-parent placement at the top of the file.
    for (const match of [...file.textSample.matchAll(IMPORT_ITEM)]) {
      const project = (match[2] ?? "").trim();
      const above = IMPORT_FILE_ABOVE.exec(project);
      let target: RepoFile | undefined;
      if (above) {
        // At the repository root there is no directory above to search.
        target = root ? nearestFileAbove(files, directoryOf(root), above[1]!) : undefined;
      } else {
        const include = project.replace(/^\$\(MSBuildThisFileDirectory\)/i, "");
        const path = literalContainedPath(root, include);
        target = path ? files.get(path.toLowerCase()) : undefined;
      }
      if (target && /\.(?:props|targets)$/i.test(target.path)) visit(target, depth + 1);
    }
    ordered.push(file);
  };
  visit(start, 0);
  return ordered;
}

function nearestFileAbove(files: ReadonlyMap<string, RepoFile>, directory: string, name: string): RepoFile | undefined {
  const segments = directory ? directory.split("/") : [];
  for (let length = segments.length; length >= 0; length -= 1) {
    const prefix = segments.slice(0, length).join("/");
    const found = files.get((prefix ? `${prefix}/${name}` : name).toLowerCase());
    if (found) return found;
  }
  return undefined;
}

/** Parse only literal, repository-contained project entries from classic .sln and XML .slnx files. */
export function buildDotnetSolutions(
  files: RepoFile[],
  projects: DotnetProject[] = buildDotnetProjects(files)
): DotnetSolution[] {
  const canonicalProjects = new Map(projects.map((project) => [project.path.toLowerCase(), project.path]));
  return files
    .filter((file) => SOLUTION_FILE.test(file.path))
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => {
      const root = directoryOf(file.path);
      const members = new Set<string>();
      const pattern = /\.slnx$/i.test(file.path) ? SLNX_PROJECT : SOLUTION_PROJECT;
      const group = pattern === SLNX_PROJECT ? 2 : 1;
      pattern.lastIndex = 0;
      for (const match of file.textSample.matchAll(pattern)) {
        const target = literalContainedPath(root, match[group] ?? "");
        const canonical = target ? canonicalProjects.get(target.toLowerCase()) : undefined;
        if (canonical) members.add(canonical);
      }
      return {
        path: file.path,
        root,
        projects: [...members].sort((left, right) => left.localeCompare(right))
      };
    });
}

export function dotnetSolutionsContaining(
  solutions: DotnetSolution[],
  projectPaths: string[]
): DotnetSolution[] {
  const required = new Set(projectPaths);
  return solutions.filter((solution) => {
    const members = new Set(solution.projects);
    return [...required].every((path) => members.has(path));
  });
}

function dotnetProjectForPathFromRoots(
  projectsByRoot: ReadonlyMap<string, DotnetProject[]>,
  path: string
): DotnetProject | undefined {
  const directories = path.split("/").slice(0, -1);
  for (let length = directories.length; length >= 0; length -= 1) {
    const projects = projectsByRoot.get(directories.slice(0, length).join("/")) ?? [];
    if (projects.length > 0) return projects.length === 1 ? projects[0] : undefined;
  }
  return undefined;
}

/** The one project that links `path` in through a `<Compile Include>` item; none when zero or several do. */
export function dotnetLinkingProject(projects: DotnetProject[], path: string): DotnetProject | undefined {
  const linking = projects.filter((project) => project.linkedSources.includes(path));
  return linking.length === 1 ? linking[0] : undefined;
}

function validNamespace(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value) && !/[$*?]/.test(value);
}

/**
 * Deepest unambiguous project root containing the path; for a source outside every
 * project directory, the single project that links it in.
 */
export function dotnetProjectForPath(projects: DotnetProject[], path: string): DotnetProject | undefined {
  if (PROJECT_FILE.test(path)) return projects.find((project) => project.path === path);
  const matching = projects.filter((project) =>
    project.root ? path.startsWith(`${project.root}/`) : true
  );
  if (matching.length === 0) return dotnetLinkingProject(projects, path);
  const deepest = Math.max(...matching.map((project) => project.root.split("/").filter(Boolean).length));
  const nearest = matching.filter((project) => project.root.split("/").filter(Boolean).length === deepest);
  return nearest.length === 1 ? nearest[0] : undefined;
}

export function dotnetReferenceClosure(projects: DotnetProject[], projectPath: string): Set<string> {
  const byPath = new Map(projects.map((project) => [project.path, project]));
  const reachable = new Set<string>();
  const pending = [projectPath];
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const reference of byPath.get(current)?.references ?? []) {
      if (!reachable.has(reference)) pending.push(reference);
    }
  }
  return reachable;
}

export function referencingDotnetTestProjects(projects: DotnetProject[], projectPath: string): DotnetProject[] {
  return projects
    .filter((project) => project.test && dotnetReferenceClosure(projects, project.path).has(projectPath))
    .sort((left, right) =>
      left.path.split("/").length - right.path.split("/").length || left.path.localeCompare(right.path));
}

function isDotnetTestProject(file: RepoFile): boolean {
  return /<IsTestProject>\s*true\s*<\/IsTestProject>/i.test(file.textSample) ||
    /<ProjectCapability\b[^>]*\bInclude\s*=\s*["'][^"']*\bTestContainer\b/i.test(file.textSample) ||
    /<PackageReference\b[^>]*\bInclude\s*=\s*["']Microsoft\.NET\.Test\.Sdk["']/i.test(file.textSample) ||
    /(?:^|\/)(?:test|tests)(?:\/|$)/i.test(file.path) ||
    /(?:^|[._-])tests?\.(?:csproj|fsproj|vbproj)$/i.test(file.path.split("/").pop() ?? "");
}

function attribute(attributes: string, name: string): string | undefined {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i").exec(attributes);
  return match?.[2]?.trim() || undefined;
}

/** A literal include resolved against `root`; undefined for expressions, wildcards, absolute or escaping paths. */
function literalContainedPath(root: string, include: string): string | undefined {
  const value = include.trim();
  if (!value || /[$*?%]/.test(value) || /^[A-Za-z]:[\\/]|^[\\/]/.test(value)) return undefined;
  return normalizeRepositoryPath(root ? `${root}/${value}` : value);
}

function directoryOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function normalizeRepositoryPath(path: string): string | undefined {
  const segments: string[] = [];
  for (const segment of path.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return undefined;
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/");
}
