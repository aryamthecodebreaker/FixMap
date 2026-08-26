import type { RepoFile } from "./types.js";

const PROJECT_FILE = /\.(?:csproj|fsproj|vbproj)$/i;
const PROJECT_REFERENCE = /<ProjectReference\b[^>]*\bInclude\s*=\s*(["'])(.*?)\1/gi;

export type DotnetProject = {
  path: string;
  root: string;
  references: string[];
  test: boolean;
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

  return projectFiles.map((file) => {
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
    return {
      path: file.path,
      root,
      references: [...references].sort((left, right) => left.localeCompare(right)),
      test: isDotnetTestProject(file)
    };
  });
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
