import { constants } from "node:fs";
import { access, mkdir, open, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isAbsolute, relative, resolve } from "node:path";
import {
  addAnnotation,
  createAnnotation,
  emptyAnnotationStore,
  removeAnnotation,
  validateAnnotationStore,
  type AnnotationScope,
  type AnnotationStore
} from "@aryam/fixmap-core";

export const ANNOTATE_USAGE = `Usage:
  fixmap annotate <file> --note <text> [--owner <name>] [--expires <ISO-date>] [--repo <path>]
  fixmap annotate <file> --symbol <name> --note <text> [--repo <path>]
  fixmap annotate --service <name> --note <text> [--repo <path>]
  fixmap annotate [<file>] --contract <name> --note <text> [--repo <path>]
  fixmap annotate --list [--format markdown|json] [--repo <path>]
  fixmap annotate --remove <annotation:id> [--repo <path>]

Writes a reviewable .fixmap/annotations.json store. File targets must exist inside the repository.
`;

type AnnotationCommandIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  now?: () => Date;
};

type ParsedAnnotationCommand = {
  action: "add" | "list" | "remove";
  repoRoot: string;
  target?: string;
  note?: string;
  owner?: string;
  expiresAt?: string;
  symbol?: string;
  service?: string;
  contract?: string;
  removeId?: string;
  format: "markdown" | "json";
};

export async function runAnnotateCommand(args: string[], io: AnnotationCommandIo): Promise<number> {
  if (args[0] === "--help" || args[0] === "-h") { io.stdout(ANNOTATE_USAGE); return 0; }
  const parsed = parseAnnotationArgs(args, io.stderr);
  if (!parsed) return 1;
  try {
    const repoRoot = await realpath(parsed.repoRoot);
    const rootStat = await stat(repoRoot);
    if (!rootStat.isDirectory()) throw new Error(`Annotation repository is not a directory: ${parsed.repoRoot}`);
    if (parsed.action === "list") {
      const store = await readStore(repoRoot);
      io.stdout(renderAnnotations(store, parsed.format));
      return 0;
    }
    return await withStoreLock(repoRoot, async () => {
      const store = await readStore(repoRoot);
      if (parsed.action === "remove") {
        const updated = removeAnnotation(store, parsed.removeId!);
        await writeStore(repoRoot, updated);
        io.stdout(`Removed ${parsed.removeId} from .fixmap/annotations.json.\n`);
        return 0;
      }
      const scope = await buildScope(repoRoot, parsed);
      const annotation = createAnnotation({
        scope,
        note: parsed.note!,
        ...(parsed.owner ? { owner: parsed.owner } : {}),
        createdAt: (io.now?.() ?? new Date()).toISOString(),
        ...(parsed.expiresAt ? { expiresAt: parsed.expiresAt } : {})
      });
      const updated = addAnnotation(store, annotation);
      await writeStore(repoRoot, updated);
      io.stdout(`Added ${annotation.id} to .fixmap/annotations.json (${describeScope(annotation.scope)}).\n`);
      return 0;
    });
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function parseAnnotationArgs(args: string[], stderr: (text: string) => void): ParsedAnnotationCommand | undefined {
  const values = new Map<string, string>();
  const booleanFlags = new Set<string>();
  let target: string | undefined;
  const valueFlags = new Set(["--note", "--owner", "--expires", "--repo", "--symbol", "--service", "--contract", "--remove", "--format"]);
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    if (raw === "--list") {
      if (booleanFlags.has(raw)) return annotationArgError(stderr, "Pass --list only once.");
      booleanFlags.add(raw);
      continue;
    }
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    if (flag.startsWith("--")) {
      if (!valueFlags.has(flag)) return annotationArgError(stderr, `Unknown annotate option: ${raw}`);
      if (values.has(flag)) return annotationArgError(stderr, `Pass ${flag} only once.`);
      const inline = separator === -1 ? undefined : raw.slice(separator + 1);
      const following = args[index + 1];
      const value = inline ?? (following && !following.startsWith("--") ? following : undefined);
      if (inline === undefined && value !== undefined) index += 1;
      if (!value?.trim()) return annotationArgError(stderr, `${flag} requires a non-blank value.`);
      values.set(flag, value.trim());
      continue;
    }
    if (target) return annotationArgError(stderr, "Annotate accepts at most one file target.");
    target = raw;
  }

  const formatValue = values.get("--format")?.toLowerCase() ?? "markdown";
  if (formatValue !== "markdown" && formatValue !== "json") return annotationArgError(stderr, "--format must be markdown or json.");
  const repoRoot = resolve(values.get("--repo") ?? process.cwd());
  if (booleanFlags.has("--list")) {
    if (target || values.has("--note") || values.has("--remove") || values.has("--symbol") || values.has("--service") || values.has("--contract")) {
      return annotationArgError(stderr, "--list cannot be combined with an annotation target, note, scope, or --remove.");
    }
    return { action: "list", repoRoot, format: formatValue };
  }
  if (values.has("--remove")) {
    if (target || values.has("--note") || values.has("--symbol") || values.has("--service") || values.has("--contract")) {
      return annotationArgError(stderr, "--remove cannot be combined with an annotation target, note, or scope.");
    }
    return { action: "remove", repoRoot, removeId: values.get("--remove")!, format: formatValue };
  }
  if (!values.has("--note")) return annotationArgError(stderr, "Adding an annotation requires --note <text>.");
  const scopeCount = [values.has("--symbol"), values.has("--service"), values.has("--contract")].filter(Boolean).length;
  if (scopeCount > 1) return annotationArgError(stderr, "Choose only one of --symbol, --service, or --contract.");
  if (values.has("--service") && target) return annotationArgError(stderr, "A service annotation does not take a file target.");
  if (values.has("--symbol") && !target) return annotationArgError(stderr, "A symbol annotation requires its file target.");
  if (!target && !values.has("--service") && !values.has("--contract")) return annotationArgError(stderr, "Add a file target, --service, or --contract.");
  return {
    action: "add",
    repoRoot,
    ...(target ? { target } : {}),
    note: values.get("--note")!,
    ...(values.has("--owner") ? { owner: values.get("--owner")! } : {}),
    ...(values.has("--expires") ? { expiresAt: values.get("--expires")! } : {}),
    ...(values.has("--symbol") ? { symbol: values.get("--symbol")! } : {}),
    ...(values.has("--service") ? { service: values.get("--service")! } : {}),
    ...(values.has("--contract") ? { contract: values.get("--contract")! } : {}),
    format: formatValue
  };
}

function annotationArgError(stderr: (text: string) => void, message: string): undefined {
  stderr(`${message}\n\n${ANNOTATE_USAGE}`);
  return undefined;
}

async function buildScope(repoRoot: string, options: ParsedAnnotationCommand): Promise<AnnotationScope> {
  if (options.service) return { kind: "service", name: options.service };
  if (options.contract && !options.target) return { kind: "contract", name: options.contract };
  const path = await containedFile(repoRoot, options.target!);
  if (options.symbol) return { kind: "symbol", path, symbol: options.symbol };
  if (options.contract) return { kind: "contract", name: options.contract, path };
  return { kind: "file", path };
}

async function containedFile(repoRoot: string, target: string): Promise<string> {
  const absolute = resolve(repoRoot, target);
  const lexical = relative(repoRoot, absolute);
  if (!lexical || lexical === ".." || lexical.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(lexical)) {
    throw new Error(`Annotation target must be a file inside the repository: ${target}`);
  }
  await access(absolute, constants.R_OK);
  const targetStat = await stat(absolute);
  if (!targetStat.isFile()) throw new Error(`Annotation target is not a file: ${target}`);
  const realTarget = await realpath(absolute);
  const realRelative = relative(repoRoot, realTarget);
  if (!realRelative || realRelative === ".." || realRelative.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) || isAbsolute(realRelative)) {
    throw new Error(`Annotation target resolves outside the repository: ${target}`);
  }
  return lexical.replace(/\\/g, "/");
}

async function readStore(repoRoot: string): Promise<AnnotationStore> {
  const path = resolve(repoRoot, ".fixmap", "annotations.json");
  try {
    return validateAnnotationStore(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return emptyAnnotationStore();
    if (error instanceof SyntaxError) throw new Error(`${path} is not valid JSON; repair it before adding annotations.`);
    throw error;
  }
}

async function writeStore(repoRoot: string, store: AnnotationStore): Promise<void> {
  const directory = resolve(repoRoot, ".fixmap");
  await mkdir(directory, { recursive: true });
  const target = resolve(directory, "annotations.json");
  const temporary = resolve(directory, `.annotations.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(validateAnnotationStore(store), null, 2)}\n`, "utf8");
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

async function withStoreLock<T>(repoRoot: string, operation: () => Promise<T>): Promise<T> {
  const directory = resolve(repoRoot, ".fixmap");
  await mkdir(directory, { recursive: true });
  const lockPath = resolve(directory, "annotations.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) throw error;
    const lockStat = await stat(lockPath).catch(() => undefined);
    if (!lockStat || Date.now() - lockStat.mtimeMs <= 10 * 60 * 1000) {
      throw new Error("Another FixMap annotation update is in progress. Try again after it finishes.");
    }
    await rm(lockPath, { force: true });
    handle = await open(lockPath, "wx", 0o600);
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
    await handle.sync();
    return await operation();
  } finally {
    try {
      await handle.close();
    } finally {
      await rm(lockPath, { force: true });
    }
  }
}

function renderAnnotations(store: AnnotationStore, format: "markdown" | "json"): string {
  if (format === "json") return `${JSON.stringify(store, null, 2)}\n`;
  if (store.annotations.length === 0) return "# FixMap Annotations\n\nNo annotations found.\n";
  const lines = ["# FixMap Annotations", ""];
  for (const annotation of store.annotations) {
    lines.push(`- ${annotation.id} (${describeScope(annotation.scope)}): ${annotation.note}`);
  }
  return `${lines.join("\n")}\n`;
}

function describeScope(scope: AnnotationScope): string {
  if (scope.kind === "file") return `file ${scope.path}`;
  if (scope.kind === "symbol") return `symbol ${scope.symbol} in ${scope.path}`;
  if (scope.kind === "service") return `service ${scope.name}`;
  return `contract ${scope.name}${scope.path ? ` in ${scope.path}` : ""}`;
}

function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
