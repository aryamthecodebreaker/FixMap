import type { RepoFile } from "./types.js";

export type RustPathDependency = {
  alias: string;
  package?: string;
  root: string;
  evidencePath: string;
};

export type RustProject = {
  path: string;
  root: string;
  name?: string;
  pathDependencies: RustPathDependency[];
};

type ParsedManifest = {
  path: string;
  root: string;
  name?: string;
  direct: RustPathDependency[];
  workspace: RustPathDependency[];
  inherited: string[];
};

/** Parse only literal repository-contained Cargo path evidence; dynamic/workspace metadata stays unknown. */
export function buildRustProjects(files: RepoFile[]): RustProject[] {
  const manifests = files
    .filter((file) => file.path.split("/").pop()?.toLowerCase() === "cargo.toml")
    .sort((left, right) => left.path.localeCompare(right.path));
  const manifestRoots = new Set(manifests.map((file) => directoryOf(file.path)));
  const parsed = manifests.map((manifest) => parseManifest(manifest, manifestRoots));
  return parsed.map((project): RustProject => {
    const inherited = project.inherited.flatMap((alias): RustPathDependency[] => {
      const owner = [...parsed]
        .filter((candidate) => contains(candidate.root, project.root))
        .sort((left, right) => depth(right.root) - depth(left.root) || left.path.localeCompare(right.path))
        .find((candidate) => candidate.workspace.some((dependency) => dependency.alias === alias));
      const dependency = owner?.workspace.find((candidate) => candidate.alias === alias);
      return dependency ? [{ ...dependency }] : [];
    });
    const byAlias = new Map<string, RustPathDependency>();
    for (const dependency of [...project.direct, ...inherited]) byAlias.set(rustIdentifier(dependency.alias), dependency);
    return {
      path: project.path,
      root: project.root,
      ...(project.name ? { name: project.name } : {}),
      pathDependencies: [...byAlias.values()].sort((left, right) => left.alias.localeCompare(right.alias))
    };
  });
}

export function rustProjectForPath(projects: readonly RustProject[], path: string): RustProject | undefined {
  const matching = projects.filter((project) => contains(project.root, directoryOf(path)));
  if (matching.length === 0) return undefined;
  const deepest = Math.max(...matching.map((project) => depth(project.root)));
  const nearest = matching.filter((project) => depth(project.root) === deepest);
  return nearest.length === 1 ? nearest[0] : undefined;
}

export function rustPathDependency(project: RustProject, identifier: string): RustPathDependency | undefined {
  const normalized = rustIdentifier(identifier);
  return project.pathDependencies.find((dependency) => rustIdentifier(dependency.alias) === normalized);
}

function parseManifest(file: RepoFile, manifestRoots: ReadonlySet<string>): ParsedManifest {
  const root = directoryOf(file.path);
  let section = "";
  let name: string | undefined;
  const direct: RustPathDependency[] = [];
  const workspace: RustPathDependency[] = [];
  const inherited: string[] = [];
  for (const raw of file.textSample.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, "").trim();
    const heading = /^\[([^\]]+)\]$/.exec(line)?.[1]?.trim().toLowerCase();
    if (heading) {
      section = heading;
      continue;
    }
    if (section === "package" && !name) {
      name = /^name\s*=\s*["']([^"']+)["']\s*$/.exec(line)?.[1]?.trim();
      continue;
    }
    const dependencySection = section === "dependencies" || section === "dev-dependencies" ||
      section === "build-dependencies" || section.endsWith(".dependencies");
    const workspaceSection = section === "workspace.dependencies";
    if (!dependencySection && !workspaceSection) continue;
    const match = /^([A-Za-z0-9_-]+)\s*=\s*\{([^}]*)\}\s*$/.exec(line);
    if (!match?.[1] || !match[2]) continue;
    const alias = rustIdentifier(match[1]);
    const fields = match[2];
    const packageName = /(?:^|,)\s*package\s*=\s*["']([^"']+)["']/.exec(fields)?.[1]?.trim();
    const rawPath = /(?:^|,)\s*path\s*=\s*["']([^"']+)["']/.exec(fields)?.[1]?.trim();
    if (rawPath) {
      const targetRoot = normalizeRelativeRoot(root, rawPath);
      if (!targetRoot || !manifestRoots.has(targetRoot)) continue;
      const dependency: RustPathDependency = {
        alias,
        ...(packageName ? { package: packageName } : {}),
        root: targetRoot,
        evidencePath: file.path
      };
      (workspaceSection ? workspace : direct).push(dependency);
      continue;
    }
    if (dependencySection && /(?:^|,)\s*workspace\s*=\s*true\s*(?:,|$)/.test(fields)) inherited.push(alias);
  }
  return {
    path: file.path,
    root,
    ...(name ? { name } : {}),
    direct,
    workspace,
    inherited: [...new Set(inherited)].sort()
  };
}

function normalizeRelativeRoot(root: string, value: string): string | undefined {
  if (!value || /^[\\/]/.test(value) || /^[A-Za-z]:/.test(value) || value.includes("\0")) return undefined;
  const output: string[] = root.split("/").filter(Boolean);
  for (const segment of value.replace(/\\/g, "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (output.length === 0) return undefined;
      output.pop();
    } else {
      output.push(segment);
    }
  }
  return output.join("/");
}

function rustIdentifier(value: string): string {
  return value.trim().replace(/-/g, "_");
}

function contains(root: string, path: string): boolean {
  return root ? path === root || path.startsWith(`${root}/`) : true;
}

function directoryOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function depth(path: string): number {
  return path.split("/").filter(Boolean).length;
}
