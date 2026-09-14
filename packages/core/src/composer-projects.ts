import type { RepoFile } from "./types.js";

export type ComposerProject = {
  path: string;
  root: string;
  name?: string;
  psr4: Array<{ prefix: string; roots: string[] }>;
  classmap: string[];
  requiredPackages: string[];
  pathRepositoryPatterns: string[];
  pathDependencies: Array<{ package: string; projectPath: string; root: string }>;
  testScript: boolean;
  pestDependency: boolean;
  pestConfig?: string;
  phpunitDependency: boolean;
  phpunitConfig?: string;
};

export function buildComposerProjects(files: RepoFile[]): ComposerProject[] {
  const canonicalPaths = new Map(files.map((file) => [file.path.toLowerCase(), file.path]));
  const projects = files
    .filter((file) => file.path === "composer.json" || file.path.endsWith("/composer.json"))
    .sort((left, right) => left.path.localeCompare(right.path))
    .flatMap((file): ComposerProject[] => {
      let manifest: Record<string, unknown>;
      try {
        const parsed = JSON.parse(file.textSample) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
        manifest = parsed as Record<string, unknown>;
      } catch {
        return [];
      }
      const root = directoryOf(file.path);
      const autoload = collectAutoload(manifest.autoload, root);
      const autoloadDev = collectAutoload(manifest["autoload-dev"], root);
      const scripts = isRecord(manifest.scripts) ? manifest.scripts : {};
      const testScript = (typeof scripts.test === "string" && scripts.test.trim().length > 0) ||
        (Array.isArray(scripts.test) && scripts.test.length > 0 &&
          scripts.test.every((entry) => typeof entry === "string" && entry.trim().length > 0));
      const requireDev = isRecord(manifest["require-dev"]) ? manifest["require-dev"] : {};
      const required = isRecord(manifest.require) ? manifest.require : {};
      const name = typeof manifest.name === "string" && /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(manifest.name)
        ? manifest.name
        : undefined;
      const requiredPackages = [...new Set([...Object.entries(required), ...Object.entries(requireDev)]
        .filter(([entry, constraint]) => /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/.test(entry) &&
          typeof constraint === "string" && constraint.trim().length > 0)
        .map(([entry]) => entry))].sort();
      const pathRepositoryPatterns = collectPathRepositoryPatterns(manifest.repositories, root);
      const phpunitConfig = ["phpunit.xml", "phpunit.xml.dist"]
        .map((name) => root ? `${root}/${name}` : name)
        .map((path) => canonicalPaths.get(path.toLowerCase()))
        .find((path): path is string => path !== undefined);
      const pestConfig = ["tests/Pest.php", "Pest.php"]
        .map((name) => root ? `${root}/${name}` : name)
        .map((path) => canonicalPaths.get(path.toLowerCase()))
        .find((path): path is string => path !== undefined);
      return [{
        path: file.path,
        root,
        ...(name ? { name } : {}),
        psr4: [...autoload.psr4, ...autoloadDev.psr4]
          .sort((left, right) => right.prefix.length - left.prefix.length || left.prefix.localeCompare(right.prefix)),
        classmap: [...new Set([...autoload.classmap, ...autoloadDev.classmap])].sort((left, right) => left.localeCompare(right)),
        requiredPackages,
        pathRepositoryPatterns,
        pathDependencies: [],
        testScript,
        pestDependency:
          (typeof requireDev["pestphp/pest"] === "string" && requireDev["pestphp/pest"].trim().length > 0) ||
          (typeof required["pestphp/pest"] === "string" && required["pestphp/pest"].trim().length > 0),
        phpunitDependency:
          (typeof requireDev["phpunit/phpunit"] === "string" && requireDev["phpunit/phpunit"].trim().length > 0) ||
          (typeof required["phpunit/phpunit"] === "string" && required["phpunit/phpunit"].trim().length > 0),
        ...(pestConfig ? { pestConfig } : {}),
        ...(phpunitConfig ? { phpunitConfig } : {})
      }];
    });
  for (const project of projects) {
    const dependencies: ComposerProject["pathDependencies"] = [];
    for (const packageName of project.requiredPackages) {
      const candidates = projects.filter((candidate) => candidate.path !== project.path && candidate.name === packageName &&
        project.pathRepositoryPatterns.some((pattern) => matchesRepositoryPattern(pattern, candidate.root)));
      if (candidates.length === 1) {
        const target = candidates[0]!;
        dependencies.push({ package: packageName, projectPath: target.path, root: target.root });
      }
    }
    project.pathDependencies = dependencies.sort((left, right) =>
      left.package.localeCompare(right.package) || left.projectPath.localeCompare(right.projectPath));
  }
  return projects;
}

export function composerDependencyClosure(projects: ComposerProject[], projectPath: string): Set<string> {
  const byPath = new Map(projects.map((project) => [project.path, project]));
  const reachable = new Set<string>();
  const pending = [projectPath];
  while (pending.length > 0) {
    const current = pending.shift()!;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const dependency of byPath.get(current)?.pathDependencies ?? []) {
      if (!reachable.has(dependency.projectPath)) pending.push(dependency.projectPath);
    }
  }
  return reachable;
}

export function composerProjectForPath(projects: ComposerProject[], path: string): ComposerProject | undefined {
  const matching = projects.filter((project) => project.root ? path.startsWith(`${project.root}/`) : true);
  if (matching.length === 0) return undefined;
  const deepest = Math.max(...matching.map((project) => depth(project.root)));
  const nearest = matching.filter((project) => depth(project.root) === deepest);
  return nearest.length === 1 ? nearest[0] : undefined;
}

export function resolveComposerSymbol(
  project: ComposerProject,
  symbol: string,
  repoPaths: ReadonlySet<string>,
  suffixPaths: ReadonlyMap<string, string[]>
): string[] {
  const targets = new Set<string>();
  for (const mapping of project.psr4) {
    if (!symbol.startsWith(mapping.prefix)) continue;
    const relative = symbol.slice(mapping.prefix.length).replace(/\\/g, "/");
    if (!relative) continue;
    for (const root of mapping.roots) {
      const candidate = [root, `${relative}.php`].filter(Boolean).join("/");
      if (repoPaths.has(candidate)) targets.add(candidate);
    }
  }
  const shortName = symbol.split("\\").pop();
  if (shortName) {
    const suffix = `${shortName}.php`;
    for (const classmapRoot of project.classmap) {
      if (classmapRoot.toLowerCase().endsWith(".php")) continue;
      for (const candidate of suffixPaths.get(suffix) ?? []) {
        if (!classmapRoot || candidate.startsWith(`${classmapRoot}/`)) targets.add(candidate);
      }
    }
  }
  return [...targets].sort((left, right) => left.localeCompare(right)).slice(0, 20);
}

export function composerTestCommandForProject(
  project: ComposerProject
): { command: string; reason: string; scopeDir?: string } | undefined {
  if (project.testScript) {
    return {
      command: project.root ? `composer --working-dir ${project.root} test` : "composer test",
      reason: `${project.path} explicitly declares the Composer test script`,
      scopeDir: project.root
    };
  }
  if (project.pestDependency) {
    const executable = project.root ? `${project.root}/vendor/bin/pest` : "vendor/bin/pest";
    return {
      command: executable,
      reason: project.pestConfig
        ? `${project.path} declares pestphp/pest and ${project.pestConfig} configures the suite`
        : `${project.path} declares pestphp/pest in its dependencies`,
      scopeDir: project.root
    };
  }
  if (project.phpunitConfig || project.phpunitDependency) {
    const executable = project.phpunitDependency
      ? project.root ? `${project.root}/vendor/bin/phpunit` : "vendor/bin/phpunit"
      : "phpunit";
    return {
      command: `${executable}${project.phpunitConfig ? ` -c ${project.phpunitConfig}` : ""}`,
      reason: project.phpunitConfig
        ? `${project.phpunitConfig} explicitly configures PHPUnit`
        : `${project.path} declares phpunit/phpunit in require-dev`,
      scopeDir: project.root
    };
  }
  return undefined;
}

function collectAutoload(value: unknown, root: string): {
  psr4: Array<{ prefix: string; roots: string[] }>;
  classmap: string[];
} {
  if (!isRecord(value)) return { psr4: [], classmap: [] };
  const rawPsr4 = isRecord(value["psr-4"]) ? value["psr-4"] : {};
  const psr4 = Object.entries(rawPsr4).flatMap(([prefix, rawRoots]) => {
    const roots = (typeof rawRoots === "string" ? [rawRoots] : Array.isArray(rawRoots) ? rawRoots : [])
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => resolveManifestPath(root, entry))
      .filter((entry): entry is string => entry !== undefined);
    return prefix && roots.length > 0 ? [{ prefix, roots: [...new Set(roots)] }] : [];
  });
  const classmap = (Array.isArray(value.classmap) ? value.classmap : [])
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => resolveManifestPath(root, entry))
    .filter((entry): entry is string => entry !== undefined);
  return { psr4, classmap };
}

function collectPathRepositoryPatterns(value: unknown, root: string): string[] {
  const entries = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
  const patterns = entries.flatMap((entry): string[] => {
    if (!isRecord(entry) || entry.type !== "path" || typeof entry.url !== "string") return [];
    const pattern = resolveManifestPattern(root, entry.url);
    return pattern ? [pattern] : [];
  });
  return [...new Set(patterns)].sort((left, right) => left.localeCompare(right));
}

function resolveManifestPattern(root: string, value: string): string | undefined {
  const trimmed = value.trim().replace(/\\/g, "/").replace(/\/$/, "");
  if (!trimmed || trimmed === "." || /[$?\[\]\0]/.test(trimmed) || /^[A-Za-z]:[\/]|^[\/]/.test(trimmed)) return undefined;
  const segments: string[] = root.split("/").filter(Boolean);
  for (const segment of trimmed.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) return undefined;
      segments.pop();
      continue;
    }
    if (segment !== "*" && segment.includes("*")) return undefined;
    segments.push(segment);
  }
  return segments.join("/");
}

function matchesRepositoryPattern(pattern: string, root: string): boolean {
  const expected = pattern.split("/");
  const actual = root.split("/").filter(Boolean);
  if (expected.length !== actual.length) return false;
  return expected.every((segment, index) => segment === "*" || segment === actual[index]);
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
  return segments.join("/").replace(/\/$/, "");
}

function resolveManifestPath(root: string, value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === ".") return root;
  if (/[$*?]/.test(trimmed) || /^[A-Za-z]:[\\/]|^[\\/]/.test(trimmed)) return undefined;
  return normalizeRepositoryPath(root ? `${root}/${trimmed}` : trimmed);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function directoryOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function depth(path: string): number {
  return path.split("/").filter(Boolean).length;
}
