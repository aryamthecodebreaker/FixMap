import { writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import {
  buildChangeScope,
  isFixMapArtifact,
  renderChangeScopeMarkdown,
  scanRepo,
  type ChangeScopeAnchor,
  type ChangeScopeDirection
} from "@aryam/fixmap-core";

export const CHANGE_SCOPE_USAGE = `Usage: fixmap change-scope --touch <path> [--touch <path> ...] [--add <path> ...] [options]

Expands explicit planned repository surfaces over deterministic import/dependent evidence.
It does not interpret product requirements, call an API, use an LLM, or require an account.

Options:
  --touch <path>       Existing file or directory you intend to change (repeatable)
  --add <path>         Planned file/directory surface; missing paths remain unresolved (repeatable)
  --direction <value>  dependencies, dependents, or both (default both)
  --depth <0-8>        Maximum structural traversal depth (default 2)
  --max-nodes <1-2000> Maximum selected plus affected nodes (default 200)
  --workspace <id>     Stable workspace identity for this result (default local)
  --repository <id>    Stable repository identity (default sanitized checkout name)
  --repo <path>        Local checkout to scan (default current directory)
  --no-cache           Bypass repository scan caches
  --format <value>     markdown (default) or json
  --output <file>      Write output to a file instead of stdout
  --help, -h           Show this help
`;

export async function runChangeScopeCommand(
  args: string[],
  io: {
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
    writeOutput?: (path: string, contents: string) => Promise<void>;
    now?: () => string;
  } = {}
): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  if (args.includes("--help") || args.includes("-h")) {
    stdout(CHANGE_SCOPE_USAGE);
    return 0;
  }
  let parsed: ParsedChangeScope;
  try {
    parsed = parseChangeScopeArgs(args);
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n\n${CHANGE_SCOPE_USAGE}`);
    return 1;
  }
  try {
    const repoRoot = resolve(parsed.repo ?? process.cwd());
    const repo = await scanRepo({
      repoRoot,
      useCache: !parsed.noCache,
      includeHistory: true
    });
    const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (scanError) throw new Error(scanError.message);
    if (parsed.output) {
      const outputRelative = relative(repoRoot, resolve(parsed.output));
      const inside = outputRelative && outputRelative !== ".." && !outputRelative.startsWith(`..${sep}`) && !isAbsolute(outputRelative);
      const existing = inside
        ? repo.files.find((file) => file.path === outputRelative.replace(/\\/g, "/"))
        : undefined;
      if (existing && !isFixMapArtifact(existing)) {
        throw new Error(`--output refuses to overwrite repository file ${existing.path}; choose a new path or a prior FixMap scope artifact.`);
      }
    }
    const result = buildChangeScope(repo, {
      workspace: parsed.workspace ?? "local",
      repository: parsed.repository ?? repositoryId(basename(repoRoot)),
      anchors: parsed.anchors,
      asOf: (io.now ?? (() => new Date().toISOString()))(),
      ...(parsed.direction ? { direction: parsed.direction } : {}),
      ...(parsed.depth !== undefined ? { maxDepth: parsed.depth } : {}),
      ...(parsed.maxNodes !== undefined ? { maxNodes: parsed.maxNodes } : {})
    });
    const rendered = parsed.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : renderChangeScopeMarkdown(result);
    if (parsed.output) {
      await (io.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    } else {
      stdout(rendered);
    }
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

type ParsedChangeScope = {
  anchors: ChangeScopeAnchor[];
  direction?: ChangeScopeDirection;
  depth?: number;
  maxNodes?: number;
  workspace?: string;
  repository?: string;
  repo?: string;
  noCache: boolean;
  format: "markdown" | "json";
  output?: string;
};

function parseChangeScopeArgs(args: string[]): ParsedChangeScope {
  const anchors: ChangeScopeAnchor[] = [];
  const singles = new Map<string, string>();
  let noCache = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--no-cache") {
      if (noCache) throw new Error("Pass --no-cache only once.");
      noCache = true;
      continue;
    }
    const equals = arg.match(/^(--[a-z-]+)=(.*)$/);
    const flag = equals?.[1] ?? arg;
    const inline = equals?.[2];
    if (!["--touch", "--add", "--direction", "--depth", "--max-nodes", "--workspace", "--repository", "--repo", "--format", "--output"].includes(flag)) {
      throw new Error(`Unknown change-scope option: ${arg}`);
    }
    const value = inline ?? args[++index];
    if (typeof value !== "string" || !value.trim() || (!equals && value.startsWith("--"))) {
      throw new Error(`${flag} requires a non-blank value.`);
    }
    if (flag === "--touch" || flag === "--add") {
      anchors.push({ operation: flag === "--touch" ? "touch" : "add", path: normalizeAnchorPath(value) });
      continue;
    }
    if (singles.has(flag)) throw new Error(`Pass ${flag} only once.`);
    singles.set(flag, value.trim());
  }
  if (anchors.length === 0) throw new Error("change-scope requires at least one --touch or --add anchor.");
  const direction = singles.get("--direction");
  if (direction !== undefined && direction !== "dependencies" && direction !== "dependents" && direction !== "both") {
    throw new Error("--direction must be dependencies, dependents, or both.");
  }
  const depth = boundedInteger(singles.get("--depth"), "--depth", 0, 8);
  const maxNodes = boundedInteger(singles.get("--max-nodes"), "--max-nodes", 1, 2_000);
  const format = singles.get("--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json.");
  const workspace = singles.get("--workspace");
  const repository = singles.get("--repository");
  const repo = singles.get("--repo");
  const output = singles.get("--output");
  return {
    anchors,
    ...(direction ? { direction } : {}),
    ...(depth !== undefined ? { depth } : {}),
    ...(maxNodes !== undefined ? { maxNodes } : {}),
    ...(workspace ? { workspace } : {}),
    ...(repository ? { repository } : {}),
    ...(repo ? { repo } : {}),
    noCache,
    format,
    ...(output ? { output } : {})
  };
}

function boundedInteger(value: string | undefined, flag: string, minimum: number, maximum: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be an integer from ${minimum} to ${maximum}.`);
  }
  return parsed;
}

function repositoryId(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "");
  return normalized.slice(0, 64) || "repository";
}

function normalizeAnchorPath(value: string): string {
  const path = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path.length > 1_000 || path.includes("\0") || /^[\/]/.test(path) || /^[A-Za-z]:/.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid change-scope path: ${value}`);
  }
  return path;
}
