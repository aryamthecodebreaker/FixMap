import type { RepoFile } from "./types.js";

export type GoModule = {
  path: string;
  root: string;
  name: string;
  replacements: GoReplacement[];
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
    return { path: manifest.path, root: manifest.root, name: manifest.name, replacements };
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
