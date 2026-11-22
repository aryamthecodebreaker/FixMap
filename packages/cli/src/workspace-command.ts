import { realpath, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, resolve } from "node:path";
import {
  buildWorkspaceImpact,
  buildWorkspaceMap,
  scanRepo,
  type RepoMap,
  type WorkspaceImpact,
  type WorkspaceMap,
  type WorkspaceRepositoryInput
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const WORKSPACE_USAGE = `Usage: fixmap workspace --config <workspace.json> [--seed <repository-id>] [--format markdown|json] [--output <file>] [--no-cache]

Builds a deterministic impact graph across 1-32 local repository checkouts. Repository paths are resolved relative to the config file. Repeat --seed to trace provider-to-consumer impact from more than one repository. FixMap scans source and manifests locally and never executes repository code.
`;

const REPOSITORY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

type WorkspaceConfigRepository = {
  id: string;
  path: string;
  relationship?: { kind: "checkout" | "submodule"; parentRepository?: string; path?: string };
};

type WorkspaceConfig = {
  workspaceConfigVersion: 1;
  workspace: string;
  repositories: WorkspaceConfigRepository[];
};

export type WorkspaceCommandReport = WorkspaceMap & { impact?: WorkspaceImpact };

export type WorkspaceCommandDependencies = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  scanRepository?: typeof scanRepo;
  writeOutput?: (path: string, contents: string) => Promise<void>;
};

export async function runWorkspaceCommand(
  args: string[],
  dependencies: WorkspaceCommandDependencies = {}
): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args[0] === "--help" || args[0] === "-h") {
    stdout(WORKSPACE_USAGE);
    return 0;
  }

  const parsed = parseWorkspaceArgs(args);
  if (!parsed.ok) {
    stderr(`${parsed.message}\n\n${WORKSPACE_USAGE}`);
    return 1;
  }
  if (parsed.output && samePath(resolve(parsed.output), resolve(parsed.configPath))) {
    stderr("Workspace --output must not overwrite the input config file.\n");
    return 1;
  }

  let config: WorkspaceConfig;
  try {
    const raw: unknown = JSON.parse(readDecodedTextFile(parsed.configPath));
    config = parseWorkspaceConfig(raw);
  } catch (error) {
    stderr(`Could not read workspace config "${parsed.configPath}": ${describeInputReadError(parsed.configPath, error)}\n`);
    return 1;
  }

  try {
    const configDirectory = dirname(resolve(parsed.configPath));
    const resolvedRepositories = await resolveRepositories(config.repositories, configDirectory);
    const seeds = [...new Set(parsed.seeds)].sort();
    const known = new Set(resolvedRepositories.map((repository) => repository.config.id));
    const unknownSeeds = seeds.filter((seed) => !known.has(seed));
    if (unknownSeeds.length > 0) {
      throw new Error(`Unknown --seed repository ID${unknownSeeds.length === 1 ? "" : "s"}: ${unknownSeeds.join(", ")}.`);
    }

    const scan = dependencies.scanRepository ?? scanRepo;
    const scanned = await mapWithConcurrency(resolvedRepositories, 4, async (repository) => ({
      repository,
      repo: await scan({ repoRoot: repository.root, includeHistory: false, useCache: !parsed.noCache })
    }));
    for (const entry of scanned) assertScanned(entry.repository.config.id, entry.repo);

    const inputs: WorkspaceRepositoryInput[] = scanned.map(({ repository, repo }) => ({
      id: repository.config.id,
      repo,
      relationship: repository.config.relationship ?? { kind: "checkout" }
    }));
    const workspace = buildWorkspaceMap(inputs, { workspace: config.workspace });
    const report: WorkspaceCommandReport = {
      ...workspace,
      ...(seeds.length > 0 ? { impact: buildWorkspaceImpact(workspace, seeds) } : {})
    };
    const rendered = parsed.format === "json"
      ? `${JSON.stringify(report, null, 2)}\n`
      : renderWorkspaceReport(report);
    if (parsed.output) {
      await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    } else {
      stdout(rendered);
    }
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

type WorkspaceArgs = {
  ok: true;
  configPath: string;
  seeds: string[];
  format: "markdown" | "json";
  output?: string;
  noCache: boolean;
} | { ok: false; message: string };

function parseWorkspaceArgs(args: string[]): WorkspaceArgs {
  let configPath: string | undefined;
  const seeds: string[] = [];
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  let noCache = false;
  const singleton = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    if (raw === "--no-cache") {
      if (noCache) return { ok: false, message: "Pass --no-cache only once." };
      noCache = true;
      continue;
    }
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if (!["--config", "--seed", "--format", "--output"].includes(flag)) {
      return { ok: false, message: `Unknown workspace option: ${raw}` };
    }
    if (flag !== "--seed" && singleton.has(flag)) {
      return { ok: false, message: `Pass ${flag} only once.` };
    }
    singleton.add(flag);
    const following = args[index + 1];
    const value = inline ?? (following && !following.startsWith("-") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) return { ok: false, message: `${flag} requires a value.` };

    if (flag === "--config") configPath = expandHomePath(value.trim());
    else if (flag === "--seed") seeds.push(value.trim());
    else if (flag === "--output") output = expandHomePath(value.trim());
    else {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") {
        return { ok: false, message: "--format must be markdown or json." };
      }
      format = normalized;
    }
  }

  if (!configPath) return { ok: false, message: "workspace requires --config <workspace.json>." };
  return { ok: true, configPath, seeds, format, ...(output ? { output } : {}), noCache };
}

function parseWorkspaceConfig(value: unknown): WorkspaceConfig {
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
  return { workspaceConfigVersion: 1, workspace, repositories };
}

function parseRelationship(
  value: unknown,
  repository: string
): WorkspaceConfigRepository["relationship"] | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value) || (value.kind !== "checkout" && value.kind !== "submodule")) {
    throw new Error(`Workspace repository ${repository} relationship.kind must be checkout or submodule.`);
  }
  if (value.kind === "checkout") return { kind: "checkout" };
  const parentRepository = stringField(value.parentRepository, `${repository}.relationship.parentRepository`);
  const path = typeof value.path === "string" && value.path.trim() ? value.path.trim() : undefined;
  return { kind: "submodule", parentRepository, ...(path ? { path } : {}) };
}

async function resolveRepositories(
  repositories: WorkspaceConfigRepository[],
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
      throw new Error(`Workspace repository ${config.id} could not be opened at "${root}": ${describeInputReadError(root, error)}`);
    }
    const key = process.platform === "win32" ? canonical.toLowerCase() : canonical;
    const collision = roots.get(key);
    if (collision) throw new Error(`Workspace repositories ${collision} and ${config.id} resolve to the same checkout.`);
    roots.set(key, config.id);
    resolved.push({ config, root: canonical });
  }
  return resolved;
}

function assertScanned(repository: string, repo: RepoMap): void {
  const error = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (error) throw new Error(`Workspace repository ${repository} could not be scanned: ${error.message}`);
  if (repo.files.length === 0) throw new Error(`Workspace repository ${repository} contains no scannable files.`);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  transform: (value: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await transform(values[index]!);
    }
  };
  const settled = await Promise.allSettled(
    Array.from({ length: Math.min(concurrency, values.length) }, () => worker())
  );
  const failure = settled.find((entry): entry is PromiseRejectedResult => entry.status === "rejected");
  if (failure) throw failure.reason;
  return results;
}

export function renderWorkspaceReport(report: WorkspaceCommandReport): string {
  const lines = [
    "# FixMap workspace impact",
    "",
    `Workspace: ${code(report.workspace)}`,
    `Repositories: ${report.repositories.length} · packages: ${report.packages.length} · cross-repository dependencies: ${report.dependencies.length}`,
    "",
    "## Repositories",
    "",
    ...report.repositories.map((repository) =>
      `- ${code(repository.id)} — ${repository.fileCount.toLocaleString()} files, ${repository.relationship.kind}`
    ),
    "",
    "## Packages",
    "",
    ...(report.packages.length > 0
      ? report.packages.map((pkg) =>
        `- ${code(pkg.repository)} provides ${code(pkg.name)} (${pkg.ecosystem}${pkg.version ? ` ${pkg.version}` : ""}) from ${code(pkg.manifestPath)}`
      )
      : ["No published workspace packages were discovered."]),
    "",
    "## Dependencies",
    "",
    ...(report.dependencies.length > 0
      ? report.dependencies.map((dependency) =>
        `- ${code(dependency.consumerRepository)} depends on ${code(dependency.package)} from ${code(dependency.providerRepository)} via ${dependency.evidence.map((entry) => code(entry.path)).join(", ")}`
      )
      : ["No cross-repository package or import dependency was resolved."])
  ];

  if (report.impact) {
    lines.push(
      "",
      "## Impact from seed repositories",
      "",
      `Seeds: ${report.impact.seeds.map(code).join(", ") || "none"}`,
      ...(report.impact.repositories.length > 0
        ? report.impact.repositories.map((entry) =>
          `- distance ${entry.distance}: ${code(entry.repository)} — ${entry.via}`
        )
        : ["No downstream workspace repository was reached."])
    );
  }

  if (report.diagnostics.length > 0) {
    lines.push(
      "",
      "## Diagnostics",
      "",
      ...report.diagnostics.map((diagnostic) => `- **${diagnostic.severity} ${diagnostic.code}** — ${diagnostic.message}`)
    );
  }
  return `${lines.join("\n")}\n`;
}

function code(value: string): string {
  return `\`${value.replaceAll("`", "'")}\``;
}

function stringField(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`Workspace config ${name} must be a non-blank string.`);
  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return value;
}
