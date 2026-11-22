import { lstat, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, relative, resolve, sep } from "node:path";
import {
  compareContractRefs,
  inventoryWorkingTreeContracts,
  isFixMapArtifact,
  scanRepo,
  type ContractChange,
  type ContractDiagnostic,
  type ContractInventory,
  type ContractRefComparison
} from "@aryam/fixmap-core";

export const CONTRACTS_USAGE = `Usage:
  fixmap contracts [--repo <path>] [--format markdown|json] [--output <file>] [--no-cache]
  fixmap contracts diff <from>..<to> [--repo <path>] [--format markdown|json] [--output <file>]

Lists OpenAPI, AsyncAPI, GraphQL, Protobuf, JSON Schema, and SQL migration contracts in the
working tree, or compares them at two exact Git refs through Git objects without checking out
either ref or changing the worktree. Changes are classified as breaking, unknown, or compatible
with before/after fingerprints. Unreadable or unparseable contracts are reported, never skipped.
`;

type Format = "markdown" | "json";
type CommandIO = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  writeOutput?: (path: string, contents: string) => Promise<void>;
};

export type ContractList = { contractListVersion: 1; inventory: ContractInventory };

export async function runContractsCommand(args: string[], io: CommandIO = {}): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  if (args.includes("--help") || args.includes("-h")) {
    stdout(CONTRACTS_USAGE);
    return 0;
  }
  const isDiff = args[0] === "diff";
  let options: Options;
  try {
    options = parseOptions(isDiff ? args.slice(1) : args, isDiff);
  } catch (error) {
    stderr(`${message(error)}\n\n${CONTRACTS_USAGE}`);
    return 1;
  }
  try {
    const repoRoot = await repositoryRoot(options.repo);
    if (options.output) await assertOutputSafe(repoRoot, options.output);
    let rendered: string;
    if (options.range) {
      const result = await compareContractRefs({ repoRoot, fromRef: options.range.from, toRef: options.range.to });
      rendered = options.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderContractDiffMarkdown(result);
    } else {
      const repo = await scanRepo({ repoRoot, useCache: !options.noCache });
      const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
      if (scanError) throw new Error(scanError.message);
      const list: ContractList = { contractListVersion: 1, inventory: await inventoryWorkingTreeContracts(repo) };
      rendered = options.format === "json" ? `${JSON.stringify(list, null, 2)}\n` : renderContractListMarkdown(list);
    }
    if (options.output) await (io.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(options.output, rendered);
    else stdout(rendered);
    return 0;
  } catch (error) {
    stderr(`${contractsError(options.repo, error)}\n`);
    return 1;
  }
}

export function renderContractListMarkdown(list: ContractList): string {
  const { surfaces, diagnostics } = list.inventory;
  const lines = [
    "# FixMap Contracts",
    "",
    surfaces.length === 0
      ? "No supported contract surfaces were found in the working tree."
      : `${surfaces.length} contract surface${surfaces.length === 1 ? "" : "s"} in the working tree.`,
    "",
    "## Surfaces",
    ""
  ];
  if (surfaces.length === 0) lines.push("- None found.");
  else {
    lines.push("| Path | Kind | Name | Version | Entries | Fingerprint |", "| --- | --- | --- | --- | --- | --- |");
    for (const surface of surfaces) {
      lines.push(`| ${cell(surface.path)} | ${surface.kind} | ${cell(surface.name)} | ${surface.version ? cell(surface.version) : "-"} | ${surface.entries.length} | ${cell(surface.sourceFingerprint)} |`);
    }
  }
  lines.push("", ...diagnosticLines(diagnostics));
  lines.push("> Read-only inventory. FixMap parsed contract text locally and did not execute repository code.");
  return `${lines.join("\n")}\n`;
}

export function renderContractDiffMarkdown(result: ContractRefComparison): string {
  const { comparison } = result;
  const lines = [
    "# FixMap Contract Diff",
    "",
    `From: \`${result.from.requestedRef}\` at \`${result.from.commit}\``,
    `To: \`${result.to.requestedRef}\` at \`${result.to.commit}\``,
    "",
    comparison.summary,
    ""
  ];
  for (const compatibility of ["breaking", "unknown", "compatible"] as const) {
    const changes = comparison.changes.filter((change) => change.compatibility === compatibility);
    lines.push(`## ${compatibility[0]!.toUpperCase()}${compatibility.slice(1)}`, "");
    if (changes.length === 0) lines.push("- None.");
    for (const change of changes) lines.push(changeLine(change));
    lines.push("");
  }
  lines.push(...diagnosticLines(comparison.diagnostics));
  lines.push("> Read-only historical comparison. FixMap read committed Git objects and did not checkout a ref or change the worktree.");
  return `${lines.join("\n")}\n`;
}

function changeLine(change: ContractChange): string {
  const before = change.evidence.beforeFingerprint ? `\`${change.evidence.beforeFingerprint}\`` : "absent";
  const after = change.evidence.afterFingerprint ? `\`${change.evidence.afterFingerprint}\`` : "absent";
  return `- \`${change.path}\` (${change.contractKind}): ${change.reason} Fingerprints: ${before} -> ${after}.`;
}

function diagnosticLines(diagnostics: readonly ContractDiagnostic[]): string[] {
  if (diagnostics.length === 0) return [];
  return ["## Diagnostics", "", ...diagnostics.map((diagnostic) => `- \`${diagnostic.path}\` (${diagnostic.code}): ${diagnostic.message}`), ""];
}

function cell(value: string): string {
  return `\`${value.replace(/[|`\r\n]/g, " ")}\``;
}

type Options = {
  repo: string;
  format: Format;
  noCache: boolean;
  output?: string;
  range?: { from: string; to: string };
};

function parseOptions(args: string[], isDiff: boolean): Options {
  const rest = [...args];
  let rangeText: string | undefined;
  if (isDiff) {
    if (!rest[0] || rest[0].startsWith("--")) throw new Error("contracts diff requires <from>..<to>.");
    rangeText = rest.shift();
  }
  const values = new Map<string, string>();
  let noCache = false;
  for (let index = 0; index < rest.length; index += 1) {
    const raw = rest[index]!;
    if (raw === "--no-cache") {
      if (isDiff) throw new Error("--no-cache does not apply to immutable Git-ref contract diffs.");
      if (noCache) throw new Error("Pass --no-cache only once.");
      noCache = true;
      continue;
    }
    const equals = /^(--[a-z-]+)=(.*)$/s.exec(raw);
    const flag = equals?.[1] ?? raw;
    if (!["--repo", "--format", "--output"].includes(flag)) throw new Error(`Unknown contracts option: ${raw}`);
    if (values.has(flag)) throw new Error(`Pass ${flag} only once.`);
    const value = equals?.[2] ?? rest[++index];
    if (typeof value !== "string" || !value.trim() || (!equals && value.startsWith("--"))) throw new Error(`${flag} requires a value.`);
    if (/[\0\r\n]/.test(value)) throw new Error(`${flag} must be a single-line value.`);
    values.set(flag, value.trim());
  }
  const format = (values.get("--format") ?? "markdown").toLowerCase();
  if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json.");
  const repo = expandHome(values.get("--repo") ?? process.cwd());
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(repo)) throw new Error("contracts requires a local checkout, not a remote URL.");
  const output = values.get("--output");
  return {
    repo,
    format,
    noCache,
    ...(output ? { output: expandHome(output) } : {}),
    ...(rangeText !== undefined ? { range: parseRange(rangeText) } : {})
  };
}

function parseRange(value: string): { from: string; to: string } {
  const index = value.indexOf("..");
  if (value.includes("...")) throw new Error("contracts diff compares two exact refs; use <from>..<to>, not a three-dot merge-base range.");
  if (index <= 0 || index + 2 >= value.length || value.indexOf("..", index + 2) !== -1) throw new Error("contracts diff range must be <from>..<to>.");
  const from = value.slice(0, index).trim();
  const to = value.slice(index + 2).trim();
  if (!from || !to || from.length > 500 || to.length > 500 || /[\0\r\n]/.test(value)) {
    throw new Error("contracts diff refs must be bounded single-line values.");
  }
  if (from.startsWith("-") || to.startsWith("-")) throw new Error("contracts diff refs cannot start with '-'.");
  return { from, to };
}

async function repositoryRoot(input: string): Promise<string> {
  const root = resolve(input);
  const info = await stat(root).catch(() => undefined);
  if (!info?.isDirectory()) throw new Error("not-directory");
  return realpath(root);
}

/** Refuses to overwrite a repository file unless it is a prior FixMap artifact. */
async function assertOutputSafe(repoRoot: string, output: string): Promise<void> {
  // repoRoot is a real path, so the output must be too: otherwise an alias such as macOS
  // /var -> /private/var, a symlinked directory, or a Windows junction looks "outside".
  // Only the directory is resolved, so a symlinked output file itself is still refused below.
  const requested = resolve(output);
  const absolute = resolve(await realOutputPath(dirname(requested)), basename(requested));
  const outputRelative = relative(repoRoot, absolute);
  if (!outputRelative || outputRelative === ".." || outputRelative.startsWith(`..${sep}`) || isAbsolute(outputRelative)) return;
  const info = await lstat(absolute).catch(() => undefined);
  if (!info) return;
  const path = outputRelative.replace(/\\/g, "/");
  if (!info.isFile() || info.isSymbolicLink() || info.nlink > 1 || info.size > 4 * 1024 * 1024 ||
    !isFixMapArtifact({ path, textSample: await readFile(absolute, "utf8"), textSampleComplete: true })) {
    throw new Error(`--output refuses to overwrite repository file ${path}; choose a new path or a prior FixMap contracts artifact.`);
  }
}

/** Resolves the nearest existing ancestor through realpath and keeps the not-yet-existing tail. */
async function realOutputPath(absolute: string): Promise<string> {
  const tail: string[] = [];
  let current = absolute;
  for (;;) {
    try {
      return resolve(await realpath(current), ...tail.reverse());
    } catch {
      const parent = dirname(current);
      if (parent === current) return absolute;
      tail.push(basename(current));
      current = parent;
    }
  }
}

function contractsError(repo: string, error: unknown): string {
  const text = message(error);
  if (text === "not-directory") return `Contracts repository "${repo}" does not exist or is not a directory.`;
  if (text.includes("Could not resolve Git ref")) {
    return `Could not resolve one of the requested Git refs in "${repo}". Confirm both refs exist and the path is a Git checkout.`;
  }
  if (text.startsWith("--output refuses")) return text;
  return `Could not read contracts in "${repo}": ${text.replace(/Command failed:[\s\S]*/i, "Git could not read the requested committed state.")}`;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return value;
}
