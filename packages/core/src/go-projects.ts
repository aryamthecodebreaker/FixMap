import type { RepoFile } from "./types.js";

export type GoModule = {
  path: string;
  root: string;
  name: string;
  replacements: GoReplacement[];
  /** Package import paths listed in this module's literal vendor/modules.txt. */
  vendoredPackages: string[];
};

export type GoReplacement = {
  module: string;
  targetRoot: string;
};

export type GoWorkspace = {
  path: string;
  root: string;
  moduleRoots: string[];
};

export function buildGoModules(files: readonly RepoFile[]): GoModule[] {
  const manifests = files.flatMap((file): Array<{ file: RepoFile; path: string; root: string; name: string }> => {
    if (file.path.split("/").pop()?.toLowerCase() !== "go.mod") return [];
    const name = /^\s*module\s+([^\s]+)\s*$/m.exec(file.textSample)?.[1]?.trim();
    if (!name || /[\0\r\n]/.test(name)) return [];
    return [{ file, path: file.path, root: directoryOf(file.path), name }];
  });
  const moduleRoots = new Set(manifests.map((manifest) => manifest.root));
  const byPath = new Map(files.map((file) => [file.path, file]));
  return manifests.map((manifest): GoModule => {
    const replacementsByModule = new Map<string, string[]>();
    for (const replacement of parseReplaceClauses(manifest.file.textSample)) {
      const targetRoot = normalizeRelativeRoot(manifest.root, replacement.target);
      if (targetRoot === undefined || !moduleRoots.has(targetRoot)) continue;
      const targets = replacementsByModule.get(replacement.module);
      if (targets) targets.push(targetRoot);
      else replacementsByModule.set(replacement.module, [targetRoot]);
    }
    const replacements = [...replacementsByModule.entries()].flatMap(([module, targets]): GoReplacement[] =>
      targets.length === 1 ? [{ module, targetRoot: targets[0]! }] : []
    ).sort((left, right) => right.module.length - left.module.length || left.module.localeCompare(right.module));
    const vendorManifest = byPath.get(manifest.root ? `${manifest.root}/vendor/modules.txt` : "vendor/modules.txt");
    return { path: manifest.path, root: manifest.root, name: manifest.name, replacements, vendoredPackages: vendorManifest ? parseVendoredPackages(vendorManifest.textSample) : [] };
  }).sort((left, right) => left.root.localeCompare(right.root) || left.name.localeCompare(right.name));
}

/** Parse only literal go.work use paths that resolve to scanned module roots. */
export function buildGoWorkspaces(files: readonly RepoFile[], modules = buildGoModules(files)): GoWorkspace[] {
  const moduleRoots = new Set(modules.map((module) => module.root));
  return files.flatMap((file): GoWorkspace[] => {
    if (file.path.split("/").pop()?.toLowerCase() !== "go.work") return [];
    const root = directoryOf(file.path);
    const uses = parseUsePaths(file.textSample).flatMap((value): string[] => {
      const target = normalizeRelativeRoot(root, value);
      return target !== undefined && moduleRoots.has(target) ? [target] : [];
    });
    return [{ path: file.path, root, moduleRoots: [...new Set(uses)].sort() }];
  }).sort((left, right) => left.root.localeCompare(right.root));
}

export function goModuleForPath(modules: readonly GoModule[], path: string): GoModule | undefined {
  const directory = directoryOf(path);
  const matching = modules.filter((module) => contains(module.root, directory));
  if (matching.length === 0) return undefined;
  const deepest = Math.max(...matching.map((module) => depth(module.root)));
  const nearest = matching.filter((module) => depth(module.root) === deepest);
  return nearest.length === 1 ? nearest[0] : undefined;
}

export function goWorkspaceForModules(
  workspaces: readonly GoWorkspace[],
  leftRoot: string,
  rightRoot: string
): GoWorkspace | undefined {
  return [...workspaces]
    .filter((workspace) => workspace.moduleRoots.includes(leftRoot) && workspace.moduleRoots.includes(rightRoot))
    .sort((left, right) => depth(right.root) - depth(left.root) || left.path.localeCompare(right.path))[0];
}

export function goReplacementForImport(module: GoModule, specifier: string): GoReplacement | undefined {
  const matching = module.replacements.filter((replacement) =>
    specifier === replacement.module || specifier.startsWith(`${replacement.module}/`));
  if (matching.length === 0) return undefined;
  const longest = matching[0]!.module.length;
  const equallySpecific = matching.filter((replacement) => replacement.module.length === longest);
  return equallySpecific.length === 1 ? equallySpecific[0] : undefined;
}

/**
 * The package a vendored import resolves to: `<module root>/vendor/<import path>`, only when
 * the module's vendor/modules.txt lists that exact package (the go command's own rule for
 * vendor mode). Workspace, local-module and replace resolution are tried first by callers.
 */
export function goVendoredDirectory(module: GoModule, specifier: string): string | undefined {
  if (!module.vendoredPackages.includes(specifier)) return undefined;
  return [module.root, "vendor", specifier].filter(Boolean).join("/");
}

// The text before the package clause holds Go's file-level directives.
function goHeader(text: string): string {
  const packageClause = /^\s*package\s+[A-Za-z_]/m.exec(text);
  return packageClause ? text.slice(0, packageClause.index) : "";
}

/**
 * A file excluded from every build by `//go:build ignore` (or the legacy `// +build ignore`).
 * These are standalone programs such as code generators, not members of the directory's package.
 */
export function isGoBuildIgnored(file: Pick<RepoFile, "path" | "textSample">): boolean {
  if (!file.path.endsWith(".go")) return false;
  const header = goHeader(file.textSample);
  return /^\/\/go:build\s+ignore\s*$/m.test(header) || /^\/\/\s*\+build\s+ignore\s*$/m.test(header);
}

/** Go's generated-code convention: a `// Code generated ... DO NOT EDIT.` line before the package clause. */
export function isGoGeneratedSource(file: Pick<RepoFile, "path" | "textSample">): boolean {
  return file.path.endsWith(".go") && /^\/\/ Code generated .* DO NOT EDIT\.$/m.test(goHeader(file.textSample));
}

function parseVendoredPackages(text: string): string[] {
  const packages = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    // "# module version" and "## explicit" lines describe modules; bare lines are packages.
    if (!line || line.startsWith("#") || /[\s*?\0]/.test(line) || line.startsWith(".") || line.startsWith("/")) continue;
    packages.add(line);
  }
  return [...packages].sort();
}

function parseUsePaths(text: string): string[] {
  const uses: string[] = [];
  for (const match of text.matchAll(/^\s*use\s+([^\s(][^\s]*)\s*(?:\/\/.*)?$/gm)) {
    if (match[1]) uses.push(match[1]);
  }
  for (const block of text.matchAll(/^\s*use\s*\(\s*$([\s\S]*?)^\s*\)\s*(?:\/\/.*)?$/gm)) {
    for (const raw of (block[1] ?? "").split(/\r?\n/)) {
      const value = raw.replace(/\/\/.*$/, "").trim().split(/\s+/)[0];
      if (value) uses.push(value);
    }
  }
  return uses;
}

function parseReplaceClauses(text: string): Array<{ module: string; target: string }> {
  const clauses: string[] = [];
  let inBlock = false;
  let blockClauses: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    if (/^replace\s*\($/.test(line)) {
      inBlock = true;
      blockClauses = [];
      continue;
    }
    if (inBlock && line === ")") {
      inBlock = false;
      clauses.push(...blockClauses);
      blockClauses = [];
      continue;
    }
    if (inBlock) blockClauses.push(line);
    else if (line.startsWith("replace ")) clauses.push(line.slice("replace ".length).trim());
  }
  return clauses.flatMap((clause) => {
    const sides = clause.split(/\s*=>\s*/);
    if (sides.length !== 2) return [];
    const left = (sides[0] ?? "").trim().split(/\s+/);
    const right = (sides[1] ?? "").trim().split(/\s+/);
    const module = left[0] ?? "";
    const target = right[0] ?? "";
    if (left.length > 2 || (left.length === 2 && !/^v\S+$/.test(left[1] ?? "")) || right.length !== 1) return [];
    if (!module || module.startsWith(".") || /^[\\/]|^[A-Za-z]:/.test(module) || /[*?\[\]\0]/.test(module)) return [];
    if (!target.startsWith(".") || /[*?\[\]\0]/.test(target)) return [];
    return [{ module, target }];
  });
}

function normalizeRelativeRoot(root: string, value: string): string | undefined {
  if (!value || /^[\\/]/.test(value) || /^[A-Za-z]:/.test(value) || value.includes("\0") || /[*?\[]/.test(value)) return undefined;
  const output = root.split("/").filter(Boolean);
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

function contains(root: string, path: string): boolean {
  return root ? path === root || path.startsWith(`${root}/`) : true;
}

function directoryOf(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function depth(path: string): number {
  return path.split("/").filter(Boolean).length;
}
