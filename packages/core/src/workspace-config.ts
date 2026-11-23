import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import { scanRepo } from "./repo-scan.js";
import { buildWorkspaceMap, type WorkspaceAlias, type WorkspaceMap, type WorkspacePackage } from "./workspace.js";
import type { RepoMap } from "./types.js";

const REPOSITORY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const MAX_ALIASES = 256;
const MAX_PACKAGE_NAME = 214;
const MAX_REASON = 500;
const ECOSYSTEMS = new Set<WorkspacePackage["ecosystem"]>(["node", "python", "maven"]);
const ALIAS_KEYS = new Set(["consumer", "ecosystem", "package", "provider", "providerPackage", "reason"]);

export type WorkspaceConfigRepository = {
  id: string;
  path: string;
  relationship?: { kind: "checkout" | "submodule"; parentRepository?: string; path?: string };
};

export type WorkspaceConfig = {
  workspaceConfigVersion: 1;
  workspace: string;
  repositories: WorkspaceConfigRepository[];
  aliases?: WorkspaceAlias[];
};

export type LoadedWorkspace = {
  config: WorkspaceConfig;
  /** Canonical checkout roots, in config order. */
  repositories: Array<{ id: string; root: string }>;
  map: WorkspaceMap;
};

export type LoadWorkspaceOptions = {
  useCache?: boolean;
  scanRepository?: typeof scanRepo;
};

/** Validates a parsed workspace config. Explicit aliases are the only way to link differently named packages. */
export function parseWorkspaceConfig(value: unknown): WorkspaceConfig {
  if (!isRecord(value)) throw new Error("Workspace config must be a JSON object.");
  if (value.workspaceConfigVersion !== 1) {
    throw new Error("Workspace config workspaceConfigVersion must be 1.");
  }
  const workspace = stringField(value.workspace, "workspace");
  if (!Array.isArray(value.repositories) || value.repositories.length < 1 || value.repositories.length > 32) {
    throw new Error("Workspace config repositories must contain 1-32 entries.");
  }
  const repositories = value.repositories.map((entry, index): WorkspaceConfigRepository => {
    if (!isRecord(entry)) throw new Error(`Workspace repository ${index + 1} must be an object.`);
    const id = stringField(entry.id, `repositories[${index}].id`);
    if (!REPOSITORY_ID.test(id)) throw new Error(`Invalid workspace repository ID: ${id}`);
    const path = stringField(entry.path, `repositories[${index}].path`);
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(path)) {
      throw new Error(`Workspace repository ${id} must use a local path, not a URL.`);
    }
    const relationship = parseRelationship(entry.relationship, id);
    return { id, path, ...(relationship ? { relationship } : {}) };
  });
  const aliases = value.aliases === undefined ? undefined : parseAliases(value.aliases, new Set(repositories.map((entry) => entry.id)));
  return { workspaceConfigVersion: 1, workspace, repositories, ...(aliases ? { aliases } : {}) };
}

function parseAliases(value: unknown, repositoryIds: ReadonlySet<string>): WorkspaceAlias[] {
  if (!Array.isArray(value) || value.length > MAX_ALIASES) {
    throw new Error(`Workspace config aliases must be an array of at most ${MAX_ALIASES} entries.`);
  }
  const seen = new Set<string>();
  return value.map((entry, index): WorkspaceAlias => {
    const where = `aliases[${index}]`;
    if (!isRecord(entry)) throw new Error(`Workspace config ${where} must be an object.`);
    const unknown = Object.keys(entry).filter((key) => !ALIAS_KEYS.has(key));
    if (unknown.length > 0) throw new Error(`Workspace config ${where} has unknown field${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`);
    const consumer = stringField(entry.consumer, `${where}.consumer`);
    const provider = stringField(entry.provider, `${where}.provider`);
    for (const [field, id] of [["consumer", consumer], ["provider", provider]] as const) {
      if (!repositoryIds.has(id)) throw new Error(`Workspace config ${where}.${field} names unknown repository ${id}.`);
    }
    if (consumer === provider) throw new Error(`Workspace config ${where} must link two different repositories.`);
    if (typeof entry.ecosystem !== "string" || !ECOSYSTEMS.has(entry.ecosystem as WorkspacePackage["ecosystem"])) {
      throw new Error(`Workspace config ${where}.ecosystem must be node, python, or maven.`);
    }
    const ecosystem = entry.ecosystem as WorkspacePackage["ecosystem"];
    const pkg = packageName(entry.package, `${where}.package`);
    const providerPackage = packageName(entry.providerPackage, `${where}.providerPackage`);
    const reason = stringField(entry.reason, `${where}.reason`);
    if (reason.length > MAX_REASON || /[\u0000-\u001f\u007f]/.test(reason)) {
      throw new Error(`Workspace config ${where}.reason must be one line of at most ${MAX_REASON} characters.`);
    }
    const key = `${consumer}\0${ecosystem}\0${pkg}`;
    if (seen.has(key)) throw new Error(`Workspace config ${where} repeats the alias for ${consumer} ${ecosystem}:${pkg}.`);
    seen.add(key);
    return { consumer, ecosystem, package: pkg, provider, providerPackage, reason };
  });
}

function packageName(value: unknown, name: string): string {
  const text = stringField(value, name);
  if (text.length > MAX_PACKAGE_NAME || /[\s\u0000-\u001f\u007f`\\]/.test(text) || text.includes("..")) {
    throw new Error(`Workspace config ${name} must be a package name of at most ${MAX_PACKAGE_NAME} characters without whitespace, backslashes, or "..".`);
  }
  return text;
}

function parseRelationship(value: unknown, repository: string): WorkspaceConfigRepository["relationship"] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || (value.kind !== "checkout" && value.kind !== "submodule")) {
    throw new Error(`Workspace repository ${repository} relationship.kind must be checkout or submodule.`);
  }
  if (value.kind === "checkout") return { kind: "checkout" };
  const parentRepository = stringField(value.parentRepository, `${repository}.relationship.parentRepository`);
  const path = typeof value.path === "string" && value.path.trim() ? value.path.trim() : undefined;
  return { kind: "submodule", parentRepository, ...(path ? { path } : {}) };
}

/** Resolves each checkout relative to the config file and rejects duplicates and unreadable paths. */
export async function resolveWorkspaceRepositories(
  repositories: readonly WorkspaceConfigRepository[],
  configDirectory: string
): Promise<Array<{ config: WorkspaceConfigRepository; root: string }>> {
  const ids = new Set<string>();
  const roots = new Map<string, string>();
  const resolved = [];
  for (const config of repositories) {
    if (ids.has(config.id)) throw new Error(`Duplicate workspace repository ID: ${config.id}`);
    ids.add(config.id);
    const literal = expandHomePath(config.path);
    const root = resolve(isAbsolute(literal) ? literal : resolve(configDirectory, literal));
    let canonical: string;
    try {
      canonical = await realpath(root);
    } catch (error) {
      const code = (error as { code?: string }).code;
      throw new Error(`Workspace repository ${config.id} could not be opened at "${root}": ${code === "ENOENT" ? "no such file or directory" : error instanceof Error ? error.message : String(error)}`);
    }
    const key = pathKey(canonical);
    const collision = roots.get(key);
    if (collision) throw new Error(`Workspace repositories ${collision} and ${config.id} resolve to the same checkout.`);
    roots.set(key, config.id);
    resolved.push({ config, root: canonical });
  }
  return resolved;
}

/** Reads, validates, resolves, and scans a workspace config into a deterministic workspace map. */
export async function loadWorkspaceConfig(configPath: string, options: LoadWorkspaceOptions = {}): Promise<LoadedWorkspace> {
  let raw: unknown;
  try {
    raw = JSON.parse((await readFile(configPath, "utf8")).replace(/^﻿/, ""));
  } catch (error) {
    throw new Error(`Could not read workspace config "${configPath}": ${error instanceof Error ? error.message : String(error)}`);
  }
  const config = parseWorkspaceConfig(raw);
  const resolved = await resolveWorkspaceRepositories(config.repositories, dirname(resolve(configPath)));
  const scan = options.scanRepository ?? scanRepo;
  const scanned: Array<{ id: string; root: string; repo: RepoMap; relationship: WorkspaceConfigRepository["relationship"] }> = [];
  for (const entry of resolved) {
    const repo = await scan({ repoRoot: entry.root, includeHistory: false, useCache: options.useCache ?? true });
    assertWorkspaceScan(entry.config.id, repo);
    scanned.push({ id: entry.config.id, root: entry.root, repo, relationship: entry.config.relationship });
  }
  const map = buildWorkspaceMap(
    scanned.map((entry) => ({ id: entry.id, repo: entry.repo, relationship: entry.relationship ?? { kind: "checkout" } })),
    { workspace: config.workspace, ...(config.aliases ? { aliases: config.aliases } : {}) }
  );
  return { config, repositories: resolved.map((entry) => ({ id: entry.config.id, root: entry.root })), map };
}

export function assertWorkspaceScan(repository: string, repo: RepoMap): void {
  const error = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (error) throw new Error(`Workspace repository ${repository} could not be scanned: ${error.message}`);
  if (repo.files.length === 0) throw new Error(`Workspace repository ${repository} contains no scannable files.`);
}

/** Finds the workspace repository whose checkout is exactly `repoRoot`; undefined when it is not part of the workspace. */
export async function findWorkspaceRepository(loaded: LoadedWorkspace, repoRoot: string): Promise<string | undefined> {
  let canonical: string;
  try {
    canonical = await realpath(resolve(repoRoot));
  } catch {
    return undefined;
  }
  return loaded.repositories.find((entry) => pathKey(entry.root) === pathKey(canonical))?.id;
}

function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}

function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return value;
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Workspace config ${name} must be a non-blank string.`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
