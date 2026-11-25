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
  /** The crate's build script: `[package] build = "..."`, or `build.rs` beside the manifest unless `build = false`. */
  buildScript?: string;
};

type ParsedManifest = {
  path: string;
  root: string;
  name?: string;
  buildScript?: string;
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
  const repoPaths = new Set(files.map((file) => file.path));
  const parsed = manifests.map((manifest) => parseManifest(manifest, manifestRoots, repoPaths));
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
      ...(project.buildScript ? { buildScript: project.buildScript } : {}),
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

// Dependency tables Cargo reads: [dependencies], [dev-dependencies], [build-dependencies],
// [target.<cfg>.dependencies] (every target is kept: FixMap selects no platform), and
// [workspace.dependencies]; plus the table form [dependencies.<name>].
const DEPENDENCY_HEADING = /^(workspace\.)?(?:target\..+\.)?(?:dev-|build-)?dependencies(?:\.([A-Za-z0-9_-]+|"[A-Za-z0-9_-]+"))?$/;

function parseManifest(file: RepoFile, manifestRoots: ReadonlySet<string>, repoPaths: ReadonlySet<string>): ParsedManifest {
  const root = directoryOf(file.path);
  let section = "";
  let tableDependency: { alias: string; workspace: boolean; fields: string[] } | undefined;
  let name: string | undefined;
  let build: string | false | undefined;
  const direct: RustPathDependency[] = [];
  const workspace: RustPathDependency[] = [];
  const inherited: string[] = [];
  // Per dependency alias: the key/value fields gathered from inline tables, dotted keys,
  // or a [dependencies.<alias>] table.
  const entries: Array<{ alias: string; workspace: boolean; fields: string }> = [];
  const flushTable = () => {
    if (tableDependency) entries.push({ alias: tableDependency.alias, workspace: tableDependency.workspace, fields: tableDependency.fields.join(",") });
    tableDependency = undefined;
  };
  const dotted = new Map<string, { workspace: boolean; fields: string[] }>();

  let pending = "";
  for (const raw of file.textSample.split(/\r?\n/)) {
    let line = stripComment(raw).trim();
    // TOML 1.1 lets an inline table span lines; join until its braces balance.
    if (pending) {
      pending += " " + line;
      if (braceDepth(pending) > 0) continue;
      line = pending.trim();
      pending = "";
    } else if (braceDepth(line) > 0) {
      pending = line;
      continue;
    }
    if (!line) continue;
    const heading = /^\[([^\[\]]+)\]$/.exec(line)?.[1]?.trim().replace(/\s*\.\s*/g, ".");
    if (heading) {
      flushTable();
      section = heading.toLowerCase();
      const dependencyHeading = DEPENDENCY_HEADING.exec(heading);
      if (dependencyHeading?.[2]) {
        tableDependency = { alias: rustIdentifier(dependencyHeading[2].replace(/"/g, "")), workspace: Boolean(dependencyHeading[1]), fields: [] };
      }
      continue;
    }
    if (tableDependency) {
      tableDependency.fields.push(line);
      continue;
    }
    if (section === "package") {
      if (!name) name = /^name\s*=\s*["']([^"']+)["']\s*$/.exec(line)?.[1]?.trim() ?? name;
      const buildValue = /^build\s*=\s*(?:["']([^"']+)["']|(false|true))\s*$/.exec(line);
      if (buildValue) build = buildValue[2] === "false" ? false : buildValue[1] ?? "build.rs";
      continue;
    }
    const dependencyHeading = DEPENDENCY_HEADING.exec(section);
    if (!dependencyHeading || dependencyHeading[2]) continue;
    const isWorkspace = Boolean(dependencyHeading[1]);
    const inline = /^([A-Za-z0-9_-]+)\s*=\s*\{(.*)\}\s*$/.exec(line);
    if (inline?.[1]) {
      entries.push({ alias: rustIdentifier(inline[1]), workspace: isWorkspace, fields: inline[2] ?? "" });
      continue;
    }
    const dottedKey = /^([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\s*=\s*(.+)$/.exec(line);
    if (dottedKey?.[1] && dottedKey[2]) {
      const alias = rustIdentifier(dottedKey[1]);
      const entry = dotted.get(alias) ?? { workspace: isWorkspace, fields: [] };
      entry.fields.push(`${dottedKey[2]} = ${dottedKey[3]}`);
      dotted.set(alias, entry);
    }
  }
  flushTable();
  for (const [alias, entry] of dotted) entries.push({ alias, workspace: entry.workspace, fields: entry.fields.join(",") });

  for (const entry of entries) {
    const fields = entry.fields;
    const packageName = /(?:^|,)\s*package\s*=\s*["']([^"']+)["']/.exec(fields)?.[1]?.trim();
    const rawPath = /(?:^|,)\s*path\s*=\s*["']([^"']+)["']/.exec(fields)?.[1]?.trim();
    if (rawPath) {
      const targetRoot = normalizeRelativeRoot(root, rawPath);
      if (!targetRoot || !manifestRoots.has(targetRoot)) continue;
      const dependency: RustPathDependency = {
        alias: entry.alias,
        ...(packageName ? { package: packageName } : {}),
        root: targetRoot,
        evidencePath: file.path
      };
      (entry.workspace ? workspace : direct).push(dependency);
      continue;
    }
    // Registry and git dependencies live outside the repository and stay unresolved.
    if (!entry.workspace && /(?:^|,)\s*workspace\s*=\s*true\s*(?:,|$)/.test(fields)) inherited.push(entry.alias);
  }

  const buildRelative = build === false ? undefined : build ?? "build.rs";
  const buildPath = buildRelative === undefined ? undefined : normalizeRelativeRoot(root, buildRelative);
  const buildScript = buildPath && repoPaths.has(buildPath) && buildPath.endsWith(".rs") ? buildPath : undefined;
  return {
    path: file.path,
    root,
    ...(name ? { name } : {}),
    ...(buildScript ? { buildScript } : {}),
    direct,
    workspace,
    inherited: [...new Set(inherited)].sort()
  };
}

// A '#' starts a comment only outside a string.
function stripComment(line: string): string {
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quote) {
      if (character === "\\" && quote === "\"") index += 1;
      else if (character === quote) quote = undefined;
    } else if (character === "\"" || character === "'") quote = character;
    else if (character === "#") return line.slice(0, index);
  }
  return line;
}

function braceDepth(line: string): number {
  let depth = 0;
  let quote: string | undefined;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index]!;
    if (quote) {
      if (character === "\\" && quote === "\"") index += 1;
      else if (character === quote) quote = undefined;
    } else if (character === "\"" || character === "'") quote = character;
    else if (character === "{") depth += 1;
    else if (character === "}") depth -= 1;
  }
  return depth;
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
