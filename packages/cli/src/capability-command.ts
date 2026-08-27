import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import {
  buildCapabilityMap,
  capabilityStoreFromRepo,
  isFixMapArtifact,
  renderCapabilityMapMarkdown,
  scanRepo,
  validateCapabilityStore,
  type CapabilityDefinition,
  type CapabilityStore,
  type ChangeScopeAnchor,
  type ChangeScopeDirection
} from "@aryam/fixmap-core";

const STORE_PATH = ".fixmap/capabilities.json";
const CAPABILITY_ID = /^[a-z0-9][a-z0-9._-]{0,63}$/;

export const CAPABILITIES_USAGE = `Usage: fixmap capabilities [--repo <path>] [--format markdown|json] [--output <file>] [--no-cache]

Lists the human-owned product capabilities declared in .fixmap/capabilities.json.
`;

export const CAPABILITY_USAGE = `Usage:
  fixmap capability <id> [--repo <path>] [--format markdown|json] [--output <file>] [--no-cache]
  fixmap capability create <id> [--name <name>] --touch <path> [--touch <path> ...] [--add <path> ...] [options]
  fixmap capability update <id> [--name <name>] [--touch <path> ...] [--add <path> ...] [options]
  fixmap capability remove <id> [--repo <path>] [--format markdown|json]

Capabilities persist reviewed names, explicit anchors, and traversal bounds—not generated conclusions.
No LLM, hosted API, account, semantic inference, or network service is used.

Options:
  --name <name>        Human-facing capability name (create/update)
  --touch <path>       Existing implementation anchor (repeatable)
  --add <path>         Planned path anchor; missing paths remain unresolved (repeatable)
  --direction <value>  dependencies, dependents, or both
  --depth <0-8>        Maximum structural traversal depth
  --max-nodes <1-2000> Maximum selected plus affected nodes
  --workspace <id>     Store identity when creating the first capability (default local)
  --repository <id>    Store repository identity when creating it (default checkout name)
  --repo <path>        Local checkout (default current directory)
  --format <value>     markdown (default) or json
  --output <file>      Show/list output file
  --no-cache           Bypass repository scan caches for show/list
  --help, -h           Show this help
`;

type CommandIO = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  writeOutput?: (path: string, contents: string) => Promise<void>;
  now?: () => string;
};

export async function runCapabilitiesCommand(args: string[], io: CommandIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  if (args.includes("--help") || args.includes("-h")) { stdout(CAPABILITIES_USAGE); return 0; }
  let options: ReadOptions;
  try {
    options = parseReadOptions(args);
  } catch (error) {
    stderr(`${message(error)}\n\n${CAPABILITIES_USAGE}`);
    return 1;
  }
  try {
    const loaded = await scanCapabilityStore(options);
    const capabilities = loaded?.store.capabilities ?? [];
    const rendered = options.format === "json"
      ? `${JSON.stringify({ capabilityListVersion: 1, source: loaded?.source ?? null, capabilities }, null, 2)}\n`
      : renderCapabilityList(capabilities, loaded?.source);
    await emit(rendered, options.output, stdout, io.writeOutput);
    return 0;
  } catch (error) {
    stderr(`${message(error)}\n`);
    return 1;
  }
}

export async function runCapabilityCommand(args: string[], io: CommandIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  if (args.includes("--help") || args.includes("-h")) { stdout(CAPABILITY_USAGE); return 0; }
  const action = args[0];
  if (action === "create" || action === "update" || action === "remove") {
    return mutateCapability(action, args.slice(1), { ...io, stdout, stderr });
  }
  const id = args[0];
  if (!id || id.startsWith("--")) {
    stderr(`capability requires an id, or create/update/remove.\n\n${CAPABILITY_USAGE}`);
    return 1;
  }
  if (!CAPABILITY_ID.test(id.toLowerCase())) {
    stderr(`Capability id must use at most 64 lowercase letters, numbers, dots, dashes, or underscores.\n\n${CAPABILITY_USAGE}`);
    return 1;
  }
  let options: ReadOptions;
  try {
    options = parseReadOptions(args.slice(1));
  } catch (error) {
    stderr(`${message(error)}\n\n${CAPABILITY_USAGE}`);
    return 1;
  }
  try {
    const repo = await scanForCapabilities(options);
    const result = buildCapabilityMap(repo, {
      id,
      asOf: (io.now ?? (() => new Date().toISOString()))()
    });
    const rendered = options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderCapabilityMapMarkdown(result);
    await emit(rendered, options.output, stdout, io.writeOutput);
    return 0;
  } catch (error) {
    stderr(`${message(error)}\n`);
    return 1;
  }
}

type ReadOptions = {
  repoRoot: string;
  format: "markdown" | "json";
  noCache: boolean;
  output?: string;
};

async function scanForCapabilities(options: ReadOptions) {
  const repo = await scanRepo({
    repoRoot: options.repoRoot,
    useCache: !options.noCache,
    includeHistory: true
  });
  const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
  if (scanError) throw new Error(scanError.message);
  if (options.output) {
    const outputRelative = relative(options.repoRoot, resolve(options.output));
    const inside = outputRelative && outputRelative !== ".." && !outputRelative.startsWith(`..${sep}`) && !isAbsolute(outputRelative);
    const existing = inside
      ? repo.files.find((file) => file.path === outputRelative.replace(/\\/g, "/"))
      : undefined;
    if (existing && !isFixMapArtifact(existing)) {
      throw new Error(`--output refuses to overwrite repository file ${existing.path}; choose a new path or a prior FixMap capability artifact.`);
    }
  }
  return repo;
}

async function scanCapabilityStore(options: ReadOptions) {
  return capabilityStoreFromRepo(await scanForCapabilities(options));
}

function parseReadOptions(args: string[]): ReadOptions {
  const values = parseFlags(args, new Set(["--repo", "--format", "--output"]), new Set(["--no-cache"]));
  const format = values.single.get("--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json.");
  const repoValue = values.single.get("--repo") ?? process.cwd();
  if (/^https?:\/\//i.test(repoValue)) throw new Error("Capability commands require a local checkout, not a remote URL.");
  const repoRoot = resolve(repoValue);
  const output = values.single.get("--output");
  if (output && samePath(resolve(output), resolve(repoRoot, STORE_PATH))) {
    throw new Error(`--output cannot overwrite the capability definition at ${STORE_PATH}.`);
  }
  return {
    repoRoot,
    format,
    noCache: values.switches.has("--no-cache"),
    ...(output ? { output } : {})
  };
}

type MutationAction = "create" | "update" | "remove";

async function mutateCapability(action: MutationAction, args: string[], io: Required<Pick<CommandIO, "stdout" | "stderr">> & CommandIO): Promise<number> {
  const id = args[0];
  if (!id || id.startsWith("--")) {
    io.stderr(`${action} requires a capability id.\n\n${CAPABILITY_USAGE}`);
    return 1;
  }
  if (!CAPABILITY_ID.test(id.toLowerCase())) {
    io.stderr(`Capability id must use at most 64 lowercase letters, numbers, dots, dashes, or underscores.\n\n${CAPABILITY_USAGE}`);
    return 1;
  }
  let parsed: MutationOptions;
  try {
    parsed = parseMutationOptions(args.slice(1));
    if (action === "create" && parsed.anchors.length === 0) throw new Error("capability create requires at least one --touch or --add anchor.");
    if (action === "update" && parsed.anchors.length === 0 && !parsed.name && !parsed.direction && parsed.depth === undefined && parsed.maxNodes === undefined) {
      throw new Error("capability update requires a name, anchor, direction, depth, or node-bound change.");
    }
    if (action === "remove" && (parsed.anchors.length > 0 || parsed.name || parsed.direction || parsed.depth !== undefined || parsed.maxNodes !== undefined || parsed.workspace || parsed.repository)) {
      throw new Error("capability remove accepts only --repo and --format.");
    }
  } catch (error) {
    io.stderr(`${message(error)}\n\n${CAPABILITY_USAGE}`);
    return 1;
  }
  try {
    const repoRoot = await realRepositoryRoot(parsed.repoRoot);
    const result = await withCapabilityLock(repoRoot, async (directory) => {
      const existingStore = await readStoreFile(directory);
      if (!existingStore && action !== "create") throw new Error(`${STORE_PATH} was not found; create a capability first.`);
      const store = existingStore ?? validateCapabilityStore({
        capabilityStoreVersion: 1,
        workspace: parsed.workspace ?? "local",
        repository: parsed.repository ?? repositoryId(basename(repoRoot)),
        capabilities: []
      });
      if (existingStore && parsed.workspace && parsed.workspace !== store.workspace) {
        throw new Error(`--workspace ${parsed.workspace} conflicts with the store workspace ${store.workspace}.`);
      }
      if (existingStore && parsed.repository && parsed.repository !== store.repository) {
        throw new Error(`--repository ${parsed.repository} conflicts with the store repository ${store.repository}.`);
      }
      const normalizedId = id.toLowerCase();
      const existingIndex = store.capabilities.findIndex((entry) => entry.id === normalizedId);
      if (action === "create" && existingIndex !== -1) throw new Error(`Capability ${normalizedId} already exists; use capability update.`);
      if (action !== "create" && existingIndex === -1) throw new Error(`Capability ${normalizedId} does not exist.`);
      const nextCapabilities = [...store.capabilities];
      if (action === "remove") {
        nextCapabilities.splice(existingIndex, 1);
      } else {
        const existing = existingIndex === -1 ? undefined : nextCapabilities[existingIndex];
        const definition: CapabilityDefinition = {
          id: normalizedId,
          name: parsed.name ?? existing?.name ?? normalizedId,
          anchors: parsed.anchors.length > 0 ? parsed.anchors : existing?.anchors ?? [],
          ...((parsed.direction || parsed.depth !== undefined || parsed.maxNodes !== undefined || existing?.traversal)
            ? { traversal: {
                ...(parsed.direction ? { direction: parsed.direction } : existing?.traversal?.direction ? { direction: existing.traversal.direction } : {}),
                ...(parsed.depth !== undefined ? { maxDepth: parsed.depth } : existing?.traversal?.maxDepth !== undefined ? { maxDepth: existing.traversal.maxDepth } : {}),
                ...(parsed.maxNodes !== undefined ? { maxNodes: parsed.maxNodes } : existing?.traversal?.maxNodes !== undefined ? { maxNodes: existing.traversal.maxNodes } : {})
              } }
            : {})
        };
        if (existingIndex === -1) nextCapabilities.push(definition);
        else nextCapabilities[existingIndex] = definition;
      }
      const next = validateCapabilityStore({ ...store, capabilities: nextCapabilities });
      await writeStoreFile(directory, next);
      return next;
    });
    const rendered = parsed.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : action === "remove"
        ? `Removed capability ${id.toLowerCase()} from ${STORE_PATH}.\n`
        : `${action === "create" ? "Created" : "Updated"} capability ${id.toLowerCase()} in ${STORE_PATH}.\n`;
    io.stdout(rendered);
    return 0;
  } catch (error) {
    io.stderr(`${message(error)}\n`);
    return 1;
  }
}

type MutationOptions = {
  repoRoot: string;
  format: "markdown" | "json";
  anchors: ChangeScopeAnchor[];
  name?: string;
  direction?: ChangeScopeDirection;
  depth?: number;
  maxNodes?: number;
  workspace?: string;
  repository?: string;
};

function parseMutationOptions(args: string[]): MutationOptions {
  const anchors: ChangeScopeAnchor[] = [];
  const singles = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const equals = raw.match(/^(--[a-z-]+)=(.*)$/);
    const flag = equals?.[1] ?? raw;
    const inline = equals?.[2];
    if (!["--name", "--touch", "--add", "--direction", "--depth", "--max-nodes", "--workspace", "--repository", "--repo", "--format"].includes(flag)) {
      throw new Error(`Unknown capability option: ${raw}`);
    }
    const value = inline ?? args[++index];
    if (typeof value !== "string" || !value.trim() || (!equals && value.startsWith("--"))) throw new Error(`${flag} requires a non-blank value.`);
    if (flag === "--touch" || flag === "--add") {
      anchors.push({ operation: flag === "--touch" ? "touch" : "add", path: normalizePath(value) });
    } else {
      if (singles.has(flag)) throw new Error(`Pass ${flag} only once.`);
      singles.set(flag, value.trim());
    }
  }
  const direction = singles.get("--direction");
  if (direction !== undefined && direction !== "dependencies" && direction !== "dependents" && direction !== "both") {
    throw new Error("--direction must be dependencies, dependents, or both.");
  }
  const format = singles.get("--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json.");
  const depth = integer(singles.get("--depth"), "--depth", 0, 8);
  const maxNodes = integer(singles.get("--max-nodes"), "--max-nodes", 1, 2_000);
  const name = singles.get("--name");
  if (name && (name.length > 120 || /[\0-\x1f\x7f]/.test(name))) throw new Error("--name must contain at most 120 printable characters.");
  const repoValue = singles.get("--repo") ?? process.cwd();
  if (/^https?:\/\//i.test(repoValue)) throw new Error("Capability mutation requires a local checkout, not a remote URL.");
  return {
    repoRoot: resolve(repoValue),
    format,
    anchors,
    ...(name ? { name } : {}),
    ...(direction ? { direction } : {}),
    ...(depth !== undefined ? { depth } : {}),
    ...(maxNodes !== undefined ? { maxNodes } : {}),
    ...(singles.get("--workspace") ? { workspace: singles.get("--workspace")! } : {}),
    ...(singles.get("--repository") ? { repository: singles.get("--repository")! } : {})
  };
}

function parseFlags(args: string[], singles: Set<string>, switches: Set<string>) {
  const values = new Map<string, string>();
  const enabled = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    if (switches.has(raw)) {
      if (enabled.has(raw)) throw new Error(`Pass ${raw} only once.`);
      enabled.add(raw);
      continue;
    }
    const equals = raw.match(/^(--[a-z-]+)=(.*)$/);
    const flag = equals?.[1] ?? raw;
    if (!singles.has(flag)) throw new Error(`Unknown capability option: ${raw}`);
    const value = equals?.[2] ?? args[++index];
    if (typeof value !== "string" || !value.trim() || (!equals && value.startsWith("--"))) throw new Error(`${flag} requires a non-blank value.`);
    if (values.has(flag)) throw new Error(`Pass ${flag} only once.`);
    values.set(flag, value.trim());
  }
  return { single: values, switches: enabled };
}

async function realRepositoryRoot(input: string): Promise<string> {
  const root = resolve(input);
  const info = await stat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error(`Capability repository ${JSON.stringify(input)} does not exist or is not a directory.`);
  return realpath(root);
}

async function withCapabilityLock<T>(repoRoot: string, operation: (directory: string) => Promise<T>): Promise<T> {
  const directory = await safeFixMapDirectory(repoRoot);
  const lockPath = resolve(directory, "capabilities.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (!nodeError(error, "EEXIST")) throw error;
    const lockInfo = await stat(lockPath).catch(() => undefined);
    if (!lockInfo || Date.now() - lockInfo.mtimeMs <= 10 * 60 * 1_000) {
      throw new Error("Another FixMap capability update is in progress. Try again after it finishes.");
    }
    await rm(lockPath, { force: true });
    handle = await open(lockPath, "wx", 0o600);
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
    await handle.sync();
    return await operation(directory);
  } finally {
    try { await handle.close(); } finally { await rm(lockPath, { force: true }); }
  }
}

async function safeFixMapDirectory(repoRoot: string): Promise<string> {
  const requested = resolve(repoRoot, ".fixmap");
  await mkdir(requested, { recursive: true });
  const directory = await realpath(requested);
  const inside = relative(repoRoot, directory);
  if (!inside || inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) {
    throw new Error("Refusing to write capabilities because .fixmap resolves outside the repository.");
  }
  return directory;
}

async function readStoreFile(directory: string): Promise<CapabilityStore | undefined> {
  const target = resolve(directory, "capabilities.json");
  try {
    const targetInfo = await lstat(target);
    if (targetInfo.isSymbolicLink()) throw new Error(`Refusing to read symbolic link ${STORE_PATH}.`);
    if (targetInfo.nlink > 1) throw new Error(`Refusing to update hard-linked ${STORE_PATH}.`);
    return validateCapabilityStore(JSON.parse(await readFile(target, "utf8")) as unknown);
  } catch (error) {
    if (nodeError(error, "ENOENT")) return undefined;
    if (error instanceof SyntaxError) throw new Error(`${STORE_PATH} is not valid JSON; repair it before changing capabilities.`);
    throw error;
  }
}

async function writeStoreFile(directory: string, store: CapabilityStore): Promise<void> {
  const target = resolve(directory, "capabilities.json");
  const targetInfo = await lstat(target).catch(() => undefined);
  if (targetInfo?.isSymbolicLink()) throw new Error(`Refusing to overwrite symbolic link ${STORE_PATH}.`);
  if (targetInfo && targetInfo.nlink > 1) throw new Error(`Refusing to overwrite hard-linked ${STORE_PATH}.`);
  const temporary = resolve(directory, `.capabilities.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(validateCapabilityStore(store), null, 2)}\n`, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await rename(temporary, target);
  } catch (error) {
    await rm(temporary, { force: true });
    throw error;
  }
}

function renderCapabilityList(capabilities: CapabilityDefinition[], source?: { path: string; fingerprint: string }): string {
  const lines = ["# FixMap Capabilities", ""];
  if (capabilities.length === 0) lines.push("No capabilities declared.");
  else for (const capability of capabilities) {
    lines.push(`- **${capability.name}** (\`${capability.id}\`): ${capability.anchors.length} explicit ${capability.anchors.length === 1 ? "anchor" : "anchors"}`);
  }
  if (source) lines.push("", `Source: \`${source.path}\` (${source.fingerprint}).`);
  return `${lines.join("\n")}\n`;
}

async function emit(contents: string, output: string | undefined, stdout: (text: string) => void, writer?: (path: string, contents: string) => Promise<void>) {
  if (output) await (writer ?? ((path, value) => writeFile(path, value, "utf8")))(output, contents);
  else stdout(contents);
}

function normalizePath(value: string): string {
  const path = value.trim().replace(/\\/g, "/").replace(/\/+$/, "");
  if (!path || path.length > 1_000 || path.includes("\0") || /^[\/]/.test(path) || /^[A-Za-z]:/.test(path) ||
    path.split("/").some((segment) => !segment || segment === "." || segment === "..")) {
    throw new Error(`Invalid capability anchor path: ${value}`);
  }
  return path;
}

function integer(value: string | undefined, flag: string, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < min || parsed > max) throw new Error(`${flag} must be an integer from ${min} to ${max}.`);
  return parsed;
}

function repositoryId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").slice(0, 64) || "repository";
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function nodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
