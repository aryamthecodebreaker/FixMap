import type { RepoFile } from "./types.js";

const PROJECT_FILE = /\.(?:csproj|fsproj|vbproj)$/i;
const SOLUTION_FILE = /\.sln$/i;
const PROJECT_REFERENCE = /<ProjectReference\b[^>]*\bInclude\s*=\s*(["'])(.*?)\1/gi;
const PROJECT_USING = /<Using\b[^>]*\bInclude\s*=\s*(["'])(.*?)\1/gi;
const SOURCE_GLOBAL_USING = /^\s*global\s+using\s+(?:static\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?([A-Za-z_][A-Za-z0-9_.]*)\s*;/gm;
const SOLUTION_PROJECT = /^\s*Project\("[^"]+"\)\s*=\s*"[^"]+",\s*"([^"]+\.(?:csproj|fsproj|vbproj))",\s*"[^"]+"\s*$/gim;

export type DotnetProject = {
  path: string;
  root: string;
  references: string[];
  globalUsings: string[];
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
  const canonicalPaths = new Map(projectFiles.map((file) => [file.path.toLowerCase(), file.path]));

  const projects = projectFiles.map((file) => {
    const root = directoryOf(file.path);
    const references = new Set<string>();
    PROJECT_REFERENCE.lastIndex = 0;
    for (const match of file.textSample.matchAll(PROJECT_REFERENCE)) {
      const include = match[2]?.trim();
      if (!include || /[$*?]/.test(include) || /^[A-Za-z]:[\\/]|^[\\/]/.test(include)) continue;
      const normalized = normalizeRepositoryPath(root ? `${root}/${include}` : include);
      const canonical = normalized ? canonicalPaths.get(normalized.toLowerCase()) : undefined;
      if (canonical && canonical !== file.path) references.add(canonical);
    }
    const globalUsings = new Set<string>();
    PROJECT_USING.lastIndex = 0;
    for (const match of file.textSample.matchAll(PROJECT_USING)) {
      const namespace = match[2]?.trim();
      if (namespace && validNamespace(namespace)) globalUsings.add(namespace);
    }
    return {
      path: file.path,
      root,
      references: [...references].sort((left, right) => left.localeCompare(right)),
      globalUsings: [...globalUsings].sort((left, right) => left.localeCompare(right)),
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
    const owner = dotnetProjectForPathFromRoots(projectsByRoot, source.path);
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

/** Parse only literal, repository-contained project entries from classic .sln files. */
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
      SOLUTION_PROJECT.lastIndex = 0;
      for (const match of file.textSample.matchAll(SOLUTION_PROJECT)) {
        const include = match[1]?.trim();
        if (!include || /[$*?]/.test(include) || /^[A-Za-z]:[\\/]|^[\\/]/.test(include)) continue;
        const normalized = normalizeRepositoryPath(root ? `${root}/${include}` : include);
        const canonical = normalized ? canonicalProjects.get(normalized.toLowerCase()) : undefined;
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

function validNamespace(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(value) && !/[$*?]/.test(value);
}

/** Deepest unambiguous project root containing the path. */
export function dotnetProjectForPath(projects: DotnetProject[], path: string): DotnetProject | undefined {
  if (PROJECT_FILE.test(path)) return projects.find((project) => project.path === path);
  const matching = projects.filter((project) =>
    project.root ? path.startsWith(`${project.root}/`) : true
  );
  if (matching.length === 0) return undefined;
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
