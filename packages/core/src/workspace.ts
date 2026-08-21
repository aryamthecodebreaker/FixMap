import { extractLanguageImports } from "./language-adapters.js";
import {
  buildIdentityGraph,
  createGraphEdgeIdentity,
  createGraphIdentity
} from "./identity-graph.js";
import type { GraphSourceDerivation, IdentityGraph, IdentityGraphEdge, IdentityGraphNode } from "./identity-graph.js";
import type { RepoFile, RepoMap } from "./types.js";

export type WorkspaceRepositoryInput = {
  id: string;
  repo: RepoMap;
  revision?: string;
  remote?: string;
  relationship?: { kind: "checkout" | "submodule"; parentRepository?: string; path?: string };
};

export type WorkspaceRepository = {
  id: string;
  identity: string;
  root: string;
  revision?: string;
  remote?: string;
  relationship: { kind: "checkout" | "submodule"; parentRepository?: string; path?: string };
  fileCount: number;
};

export type WorkspacePackage = {
  id: string;
  identity: string;
  repository: string;
  ecosystem: "node" | "python" | "maven";
  name: string;
  version?: string;
  manifestPath: string;
  importNamespaces: string[];
};

export type WorkspaceDependencyEvidence = {
  kind: "manifest" | "import";
  path: string;
  detail: string;
};

export type WorkspaceDependency = {
  identity: string;
  consumerRepository: string;
  providerRepository: string;
  package: string;
  ecosystem: WorkspacePackage["ecosystem"];
  requestedVersion?: string;
  evidence: WorkspaceDependencyEvidence[];
};

export type WorkspaceDiagnostic = {
  code: "duplicate-package" | "unresolved-dependency" | "invalid-submodule-parent";
  severity: "info" | "warning";
  message: string;
  repositories: string[];
};

export type WorkspaceMap = {
  workspaceVersion: 1;
  workspace: string;
  repositories: WorkspaceRepository[];
  packages: WorkspacePackage[];
  dependencies: WorkspaceDependency[];
  identityGraph: IdentityGraph;
  diagnostics: WorkspaceDiagnostic[];
};

export type WorkspaceMapOptions = {
  /** Stable caller-owned workspace identity; display names and repository paths are not identities. */
  workspace: string;
  /** Explicit service/contract/runtime/deployment and other identities not discoverable from manifests. */
  identityNodes?: readonly IdentityGraphNode[];
  /** Explicit alias/equivalence and other reviewed relationships. */
  identityEdges?: readonly IdentityGraphEdge[];
};

export type WorkspaceImpact = {
  seeds: string[];
  repositories: Array<{
    repository: string;
    distance: number;
    via: string;
    evidence: WorkspaceDependencyEvidence[];
  }>;
};

const REPOSITORY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

/** Builds a deterministic graph across already-scanned repository snapshots. */
export function buildWorkspaceMap(
  inputs: readonly WorkspaceRepositoryInput[],
  options: WorkspaceMapOptions
): WorkspaceMap {
  validateRepositoryInputs(inputs);
  const ordered = [...inputs].sort((a, b) => a.id.localeCompare(b.id));
  const repositories: WorkspaceRepository[] = ordered.map((input) => ({
    id: input.id,
    identity: createGraphIdentity({ workspace: options.workspace, kind: "repository", key: input.id }),
    root: input.repo.root,
    ...(input.revision ? { revision: input.revision } : {}),
    ...(input.remote ? { remote: input.remote } : {}),
    relationship: input.relationship ?? { kind: "checkout" },
    fileCount: input.repo.files.length
  }));
  const diagnostics: WorkspaceDiagnostic[] = [];
  const repositoryIds = new Set(repositories.map((repository) => repository.id));
  for (const repository of repositories) {
    if (repository.relationship.kind === "submodule" &&
      (!repository.relationship.parentRepository || !repositoryIds.has(repository.relationship.parentRepository))) {
      diagnostics.push({
        code: "invalid-submodule-parent",
        severity: "warning",
        message: `Submodule repository ${repository.id} names a parent that is not in this workspace.`,
        repositories: [repository.id]
      });
    }
  }

  const packages = ordered.flatMap((input) => extractRepositoryPackages(input, options.workspace))
    .sort((a, b) => a.id.localeCompare(b.id));
  const packageIndex = new Map<string, WorkspacePackage[]>();
  for (const pkg of packages) {
    for (const namespace of packageLookupKeys(pkg)) {
      const existing = packageIndex.get(namespace) ?? [];
      existing.push(pkg);
      packageIndex.set(namespace, existing);
    }
  }
  for (const [key, candidates] of packageIndex) {
    const repositoriesForPackage = [...new Set(candidates.map((candidate) => candidate.repository))];
    if (repositoriesForPackage.length > 1 && key.startsWith(`${candidates[0]?.ecosystem}:`)) {
      diagnostics.push({
        code: "duplicate-package",
        severity: "warning",
        message: `Workspace package identity ${key} is provided by multiple repositories; automatic links remain unresolved.`,
        repositories: repositoriesForPackage.sort()
      });
    }
  }

  const edges = new Map<string, WorkspaceDependencyDraft>();
  for (const input of ordered) {
    for (const declaration of extractManifestDependencies(input)) {
      linkDependency(edges, diagnostics, packageIndex, input.id, declaration);
    }
    for (const declaration of extractImportDependencies(input, packages)) {
      linkDependency(edges, diagnostics, packageIndex, input.id, declaration);
    }
  }

  const repositoryIdentityById = new Map(repositories.map((repository) => [repository.id, repository.identity]));
  const packageIdentityByProvider = new Map(packages.map((pkg) => [
    `${pkg.repository}\0${pkg.ecosystem}\0${pkg.name}`,
    pkg.identity
  ]));
  const dependencies: WorkspaceDependency[] = [...edges.values()].map((dependency) => {
    const consumer = repositoryIdentityById.get(dependency.consumerRepository)!;
    const provider = packageIdentityByProvider.get(
      `${dependency.providerRepository}\0${dependency.ecosystem}\0${dependency.package}`
    )!;
    return {
      ...dependency,
      identity: createGraphEdgeIdentity("depends-on", consumer, provider),
      evidence: dependency.evidence.sort((a, b) => a.kind.localeCompare(b.kind) || a.path.localeCompare(b.path))
    };
  }).sort((a, b) =>
    a.consumerRepository.localeCompare(b.consumerRepository) ||
    a.providerRepository.localeCompare(b.providerRepository) ||
    a.package.localeCompare(b.package)
  );
  const identityGraph = buildWorkspaceIdentityGraph(options, ordered, repositories, packages, dependencies);
  return {
    workspaceVersion: 1,
    workspace: options.workspace,
    repositories,
    packages,
    dependencies,
    identityGraph,
    diagnostics: deduplicateDiagnostics(diagnostics)
  };
}

/** Traverses provider-to-consumer edges to show which repositories can be affected. */
export function buildWorkspaceImpact(workspace: WorkspaceMap, seedRepositories: readonly string[]): WorkspaceImpact {
  const known = new Set(workspace.repositories.map((repository) => repository.id));
  const seeds = [...new Set(seedRepositories)].filter((seed) => known.has(seed)).sort();
  const queue = seeds.map((repository) => ({ repository, distance: 0 }));
  const visited = new Set(seeds);
  const impacted: WorkspaceImpact["repositories"] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const edge of workspace.dependencies.filter((candidate) => candidate.providerRepository === current.repository)) {
      if (visited.has(edge.consumerRepository)) continue;
      visited.add(edge.consumerRepository);
      const distance = current.distance + 1;
      impacted.push({
        repository: edge.consumerRepository,
        distance,
        via: `${edge.consumerRepository} depends on ${edge.package} from ${edge.providerRepository}`,
        evidence: edge.evidence
      });
      queue.push({ repository: edge.consumerRepository, distance });
    }
  }
  return {
    seeds,
    repositories: impacted.sort((a, b) => a.distance - b.distance || a.repository.localeCompare(b.repository))
  };
}

type DependencyDeclaration = {
  ecosystem: WorkspacePackage["ecosystem"];
  lookup: string;
  package: string;
  requestedVersion?: string;
  evidence: WorkspaceDependencyEvidence;
};

type WorkspaceDependencyDraft = Omit<WorkspaceDependency, "identity">;

function extractRepositoryPackages(input: WorkspaceRepositoryInput, workspace: string): WorkspacePackage[] {
  const packages: WorkspacePackage[] = [];
  for (const file of input.repo.files) {
    const name = file.path.split("/").at(-1)?.toLowerCase() ?? "";
    if (name === "package.json") {
      const manifest = parseJson(file.textSample);
      if (manifest && typeof manifest.name === "string" && manifest.name.trim()) {
        packages.push(workspacePackage(workspace, input.id, "node", manifest.name.trim(), stringValue(manifest.version), file.path, [manifest.name.trim()]));
      }
    } else if (name === "pyproject.toml") {
      const project = tomlProject(file.textSample);
      if (project.name) {
        const namespaces = pythonNamespaces(input.repo.files, manifestDirectory(file.path));
        packages.push(workspacePackage(workspace, input.id, "python", project.name, project.version, file.path,
          namespaces.length > 0 ? namespaces : [normalizePythonName(project.name)]));
      }
    } else if (name === "pom.xml") {
      const project = mavenProject(file.textSample);
      if (project.artifactId) {
        const identity = project.groupId ? `${project.groupId}:${project.artifactId}` : project.artifactId;
        packages.push(workspacePackage(workspace, input.id, "maven", identity, project.version, file.path,
          javaPackages(input.repo.files, manifestDirectory(file.path))));
      }
    }
  }
  return packages;
}

function workspacePackage(
  workspace: string,
  repository: string,
  ecosystem: WorkspacePackage["ecosystem"],
  name: string,
  version: string | undefined,
  manifestPath: string,
  importNamespaces: string[]
): WorkspacePackage {
  const repositoryIdentity = createGraphIdentity({ workspace, kind: "repository", key: repository });
  return {
    id: `${repository}:${ecosystem}:${name}`,
    identity: createGraphIdentity({
      workspace,
      kind: "package",
      key: `${ecosystem}:${name}`,
      repository,
      parent: repositoryIdentity
    }),
    repository,
    ecosystem,
    name,
    ...(version ? { version } : {}),
    manifestPath,
    importNamespaces: [...new Set(importNamespaces)].sort()
  };
}

function extractManifestDependencies(input: WorkspaceRepositoryInput): DependencyDeclaration[] {
  const declarations: DependencyDeclaration[] = [];
  for (const file of input.repo.files) {
    const name = file.path.split("/").at(-1)?.toLowerCase() ?? "";
    if (name === "package.json") {
      const manifest = parseJson(file.textSample);
      for (const section of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const) {
        const dependencies = manifest?.[section];
        if (!isRecord(dependencies)) continue;
        for (const [dependency, version] of Object.entries(dependencies)) {
          if (typeof version !== "string") continue;
          declarations.push({
            ecosystem: "node",
            lookup: `node:${dependency}`,
            package: dependency,
            requestedVersion: version,
            evidence: { kind: "manifest", path: file.path, detail: `${section} declares ${dependency}@${version}` }
          });
        }
      }
    } else if (name === "pyproject.toml") {
      for (const dependency of tomlDependencies(file.textSample)) declarations.push({
        ecosystem: "python",
        lookup: `python:${normalizePythonName(dependency.name)}`,
        package: dependency.name,
        ...(dependency.version ? { requestedVersion: dependency.version } : {}),
        evidence: { kind: "manifest", path: file.path, detail: `pyproject declares ${dependency.raw}` }
      });
    } else if (name === "pom.xml") {
      for (const dependency of mavenDependencies(file.textSample)) declarations.push({
        ecosystem: "maven",
        lookup: `maven:${dependency.groupId}:${dependency.artifactId}`,
        package: `${dependency.groupId}:${dependency.artifactId}`,
        ...(dependency.version ? { requestedVersion: dependency.version } : {}),
        evidence: { kind: "manifest", path: file.path, detail: `pom dependency declares ${dependency.groupId}:${dependency.artifactId}${dependency.version ? `:${dependency.version}` : ""}` }
      });
    }
  }
  return declarations;
}

function extractImportDependencies(input: WorkspaceRepositoryInput, packages: WorkspacePackage[]): DependencyDeclaration[] {
  const declarations: DependencyDeclaration[] = [];
  for (const file of input.repo.files.filter((candidate) => candidate.isSource && candidate.kind === "code")) {
    for (const imported of extractLanguageImports(file)) {
      if (imported.specifier.startsWith(".")) continue;
      for (const pkg of packages.filter((candidate) => candidate.repository !== input.id)) {
        const namespace = pkg.importNamespaces.find((candidate) => importMatches(pkg.ecosystem, imported.specifier, candidate));
        if (!namespace) continue;
        declarations.push({
          ecosystem: pkg.ecosystem,
          lookup: `${pkg.ecosystem}:${pkg.ecosystem === "python" ? normalizePythonName(namespace) : namespace}`,
          package: pkg.name,
          evidence: { kind: "import", path: file.path, detail: `${file.path} imports ${imported.specifier}` }
        });
      }
    }
  }
  return declarations;
}

function linkDependency(
  edges: Map<string, WorkspaceDependencyDraft>,
  diagnostics: WorkspaceDiagnostic[],
  packageIndex: Map<string, WorkspacePackage[]>,
  consumerRepository: string,
  declaration: DependencyDeclaration
): void {
  const candidates = (packageIndex.get(declaration.lookup) ?? [])
    .filter((candidate) => candidate.repository !== consumerRepository);
  const providers = [...new Map(candidates.map((candidate) => [candidate.repository, candidate])).values()];
  if (providers.length !== 1) {
    if (declaration.evidence.kind === "manifest") diagnostics.push({
      code: "unresolved-dependency",
      severity: "info",
      message: providers.length === 0
        ? `${consumerRepository} declares ${declaration.package}, but no workspace repository provides it.`
        : `${consumerRepository} declares ${declaration.package}, but multiple workspace repositories provide it.`,
      repositories: [consumerRepository, ...providers.map((provider) => provider.repository)].sort()
    });
    return;
  }
  const provider = providers[0]!;
  const key = `${consumerRepository}\0${provider.repository}\0${provider.ecosystem}\0${provider.name}`;
  const existing = edges.get(key);
  if (existing) {
    if (!existing.evidence.some((evidence) => evidence.kind === declaration.evidence.kind && evidence.path === declaration.evidence.path && evidence.detail === declaration.evidence.detail)) {
      existing.evidence.push(declaration.evidence);
    }
    if (!existing.requestedVersion && declaration.requestedVersion) existing.requestedVersion = declaration.requestedVersion;
    return;
  }
  edges.set(key, {
    consumerRepository,
    providerRepository: provider.repository,
    package: provider.name,
    ecosystem: provider.ecosystem,
    ...(declaration.requestedVersion ? { requestedVersion: declaration.requestedVersion } : {}),
    evidence: [declaration.evidence]
  });
}

function buildWorkspaceIdentityGraph(
  options: WorkspaceMapOptions,
  inputs: readonly WorkspaceRepositoryInput[],
  repositories: readonly WorkspaceRepository[],
  packages: readonly WorkspacePackage[],
  dependencies: readonly WorkspaceDependency[]
): IdentityGraph {
  const repositoryById = new Map(repositories.map((repository) => [repository.id, repository]));
  const inputById = new Map(inputs.map((input) => [input.id, input]));
  const packageByProvider = new Map(packages.map((pkg) => [`${pkg.repository}\0${pkg.ecosystem}\0${pkg.name}`, pkg]));
  const nodes: IdentityGraphNode[] = repositories.map((repository) => ({
    id: repository.identity,
    kind: "repository",
    key: repository.id,
    repository: repository.id,
    attributes: {
      ...(repository.revision ? { revision: repository.revision } : {}),
      ...(repository.remote ? { remote: repository.remote } : {}),
      relationship: repository.relationship.kind
    },
    derivedFrom: []
  }));
  const graphEdges: IdentityGraphEdge[] = [];

  for (const pkg of packages) {
    const input = inputById.get(pkg.repository)!;
    const source = workspaceSource(input, pkg.manifestPath);
    nodes.push({
      id: pkg.identity,
      kind: "package",
      key: `${pkg.ecosystem}:${pkg.name}`,
      repository: pkg.repository,
      parent: repositoryById.get(pkg.repository)!.identity,
      label: pkg.name,
      attributes: { ecosystem: pkg.ecosystem, ...(pkg.version ? { version: pkg.version } : {}) },
      derivedFrom: [source]
    });
    graphEdges.push({
      id: createGraphEdgeIdentity("contains", repositoryById.get(pkg.repository)!.identity, pkg.identity),
      kind: "contains",
      from: repositoryById.get(pkg.repository)!.identity,
      to: pkg.identity,
      confidence: "high",
      reason: `${pkg.manifestPath} declares ${pkg.ecosystem} package ${pkg.name}.`,
      derivedFrom: [source]
    });
  }

  for (const repository of repositories) {
    if (repository.relationship.kind !== "submodule" || !repository.relationship.parentRepository) continue;
    const parent = repositoryById.get(repository.relationship.parentRepository);
    if (!parent) continue;
    graphEdges.push({
      id: createGraphEdgeIdentity("contains", parent.identity, repository.identity),
      kind: "contains",
      from: parent.identity,
      to: repository.identity,
      confidence: "high",
      reason: `${repository.id} is checked out as submodule ${repository.relationship.path ?? repository.id}.`,
      derivedFrom: []
    });
  }

  for (const dependency of dependencies) {
    const consumer = repositoryById.get(dependency.consumerRepository)!;
    const provider = packageByProvider.get(`${dependency.providerRepository}\0${dependency.ecosystem}\0${dependency.package}`)!;
    const derivations = dependency.evidence.map((evidence) => workspaceSource(inputById.get(dependency.consumerRepository)!, evidence.path));
    graphEdges.push({
      id: dependency.identity,
      kind: "depends-on",
      from: consumer.identity,
      to: provider.identity,
      confidence: dependency.evidence.some((evidence) => evidence.kind === "manifest") ? "high" : "medium",
      reason: `${dependency.consumerRepository} depends on ${dependency.package} from ${dependency.providerRepository}.`,
      derivedFrom: derivations
    });
  }

  nodes.push(...(options.identityNodes ?? []).map((entry) => ({
    ...entry,
    derivedFrom: entry.derivedFrom.map((derivation) => ({ ...derivation }))
  })));
  graphEdges.push(...(options.identityEdges ?? []).map((entry) => ({
    ...entry,
    derivedFrom: entry.derivedFrom.map((derivation) => ({ ...derivation }))
  })));
  return buildIdentityGraph({ workspace: options.workspace, nodes, edges: graphEdges });
}

function workspaceSource(input: WorkspaceRepositoryInput, path: string): GraphSourceDerivation {
  const file = input.repo.files.find((candidate) => candidate.path === path);
  if (!file) throw new Error(`Workspace evidence references missing file ${input.id}:${path}.`);
  if (!file.contentFingerprint) {
    throw new Error(`Workspace evidence requires an exact content fingerprint for ${input.id}:${path}.`);
  }
  return {
    kind: "source",
    repository: input.id,
    path,
    fingerprint: file.contentFingerprint
  };
}

function packageLookupKeys(pkg: WorkspacePackage): string[] {
  const keys = [`${pkg.ecosystem}:${pkg.ecosystem === "python" ? normalizePythonName(pkg.name) : pkg.name}`];
  for (const namespace of pkg.importNamespaces) {
    keys.push(`${pkg.ecosystem}:${pkg.ecosystem === "python" ? normalizePythonName(namespace) : namespace}`);
  }
  return [...new Set(keys)];
}

function importMatches(ecosystem: WorkspacePackage["ecosystem"], source: string, namespace: string): boolean {
  if (ecosystem === "node") return nodePackageName(source) === namespace;
  if (ecosystem === "python") return normalizePythonName(source.split(".")[0] ?? "") === normalizePythonName(namespace);
  return source === namespace || source.startsWith(`${namespace}.`);
}

function nodePackageName(source: string): string {
  const parts = source.split("/");
  return source.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0] ?? source;
}

function pythonNamespaces(files: RepoFile[], directory: string): string[] {
  const prefix = directory ? `${directory}/` : "";
  return [...new Set(files.flatMap((file) => {
    if (!file.path.startsWith(prefix) || file.extension !== ".py") return [];
    const relative = file.path.slice(prefix.length);
    const first = relative.split("/")[0] ?? "";
    if (!first || ["tests", "test", "scripts"].includes(first)) return [];
    return [first.replace(/\.py$/, "")];
  }))];
}

function javaPackages(files: RepoFile[], directory: string): string[] {
  const prefix = directory ? `${directory}/` : "";
  return [...new Set(files.flatMap((file) => {
    if (!file.path.startsWith(prefix) || file.extension !== ".java") return [];
    const match = file.textSample.match(/\bpackage\s+([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;/);
    return match?.[1] ? [match[1]] : [];
  }))];
}

function tomlProject(text: string): { name?: string; version?: string } {
  const section = sectionText(text, "project") || sectionText(text, "tool.poetry");
  const name = tomlScalar(section, "name");
  const version = tomlScalar(section, "version");
  return { ...(name ? { name } : {}), ...(version ? { version } : {}) };
}

function tomlDependencies(text: string): Array<{ name: string; version?: string; raw: string }> {
  const results: Array<{ name: string; version?: string; raw: string }> = [];
  const project = sectionText(text, "project");
  const array = project.match(/(?:^|\n)\s*dependencies\s*=\s*\[([\s\S]*?)\]/i)?.[1] ?? "";
  for (const match of array.matchAll(/["']([^"']+)["']/g)) {
    const raw = match[1]?.trim();
    if (!raw) continue;
    const parsed = raw.match(/^([A-Za-z0-9_.-]+)(.*)$/);
    if (parsed?.[1]) results.push({ name: parsed[1], ...(parsed[2]?.trim() ? { version: parsed[2].trim() } : {}), raw });
  }
  const poetry = sectionText(text, "tool.poetry.dependencies");
  for (const match of poetry.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=\s*["']([^"']+)["']/gm)) {
    if (match[1]?.toLowerCase() === "python") continue;
    if (match[1] && match[2]) results.push({ name: match[1], version: match[2], raw: `${match[1]} ${match[2]}` });
  }
  return results;
}

function mavenProject(text: string): { groupId?: string; artifactId?: string; version?: string } {
  const withoutDependencies = text.replace(/<dependencies\b[\s\S]*?<\/dependencies>/gi, "");
  const groupId = xmlValue(withoutDependencies, "groupId");
  const artifactId = xmlValue(withoutDependencies, "artifactId");
  const version = xmlValue(withoutDependencies, "version");
  return {
    ...(groupId ? { groupId } : {}),
    ...(artifactId ? { artifactId } : {}),
    ...(version ? { version } : {})
  };
}

function mavenDependencies(text: string): Array<{ groupId: string; artifactId: string; version?: string }> {
  return [...text.matchAll(/<dependency\b[^>]*>([\s\S]*?)<\/dependency>/gi)].flatMap((match) => {
    const groupId = xmlValue(match[1] ?? "", "groupId");
    const artifactId = xmlValue(match[1] ?? "", "artifactId");
    if (!groupId || !artifactId) return [];
    const version = xmlValue(match[1] ?? "", "version");
    return [{ groupId, artifactId, ...(version ? { version } : {}) }];
  });
}

function sectionText(text: string, section: string): string {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.match(new RegExp(`(?:^|\\n)\\s*\\[${escaped}\\]\\s*\\n([\\s\\S]*?)(?=\\n\\s*\\[|$)`, "i"))?.[1] ?? "";
}

function tomlScalar(section: string, key: string): string | undefined {
  return section.match(new RegExp(`(?:^|\\n)\\s*${key}\\s*=\\s*["']([^"']+)["']`, "i"))?.[1]?.trim();
}

function xmlValue(text: string, tag: string): string | undefined {
  return text.match(new RegExp(`<${tag}\\b[^>]*>\\s*([^<]+?)\\s*</${tag}>`, "i"))?.[1]?.trim();
}

function parseJson(text: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizePythonName(name: string): string {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function manifestDirectory(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

function validateRepositoryInputs(inputs: readonly WorkspaceRepositoryInput[]): void {
  const ids = new Set<string>();
  for (const input of inputs) {
    if (!REPOSITORY_ID.test(input.id)) throw new Error(`Invalid workspace repository ID: ${input.id}`);
    if (ids.has(input.id)) throw new Error(`Duplicate workspace repository ID: ${input.id}`);
    ids.add(input.id);
  }
}

function deduplicateDiagnostics(diagnostics: WorkspaceDiagnostic[]): WorkspaceDiagnostic[] {
  const seen = new Set<string>();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.code}\0${diagnostic.message}\0${diagnostic.repositories.join("\0")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.code.localeCompare(b.code) || a.message.localeCompare(b.message));
}

function isRecord(candidate: unknown): candidate is Record<string, unknown> {
  return typeof candidate === "object" && candidate !== null && !Array.isArray(candidate);
}
