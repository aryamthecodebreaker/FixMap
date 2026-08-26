import type { RepoFile } from "./types.js";

export type ComposerProject = {
  path: string;
  root: string;
  psr4: Array<{ prefix: string; roots: string[] }>;
  classmap: string[];
  testScript: boolean;
  phpunitDependency: boolean;
  phpunitConfig?: string;
};

export function buildComposerProjects(files: RepoFile[]): ComposerProject[] {
  const canonicalPaths = new Map(files.map((file) => [file.path.toLowerCase(), file.path]));
  return files
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
      const phpunitConfig = ["phpunit.xml", "phpunit.xml.dist"]
        .map((name) => root ? `${root}/${name}` : name)
        .map((path) => canonicalPaths.get(path.toLowerCase()))
        .find((path): path is string => path !== undefined);
      return [{
        path: file.path,
        root,
        psr4: [...autoload.psr4, ...autoloadDev.psr4]
          .sort((left, right) => right.prefix.length - left.prefix.length || left.prefix.localeCompare(right.prefix)),
        classmap: [...new Set([...autoload.classmap, ...autoloadDev.classmap])].sort((left, right) => left.localeCompare(right)),
        testScript,
        phpunitDependency:
          (typeof requireDev["phpunit/phpunit"] === "string" && requireDev["phpunit/phpunit"].trim().length > 0) ||
          (typeof required["phpunit/phpunit"] === "string" && required["phpunit/phpunit"].trim().length > 0),
        ...(phpunitConfig ? { phpunitConfig } : {})
      }];
    });
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
