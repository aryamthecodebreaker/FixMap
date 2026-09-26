import { realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { runSandbox, type SandboxRequest, type SandboxResult } from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const SANDBOX_USAGE = `Usage: fixmap sandbox --request <sandbox.json> --execute-declared-command [--allow-sandbox-network] [--format markdown|json] [--output <file>]

Runs exactly one declared command in an already-present digest-pinned Docker image. Source and container root are read-only, network is off by default, and the request file cannot self-authorize execution. Network requires a separate command-line consent flag.
`;

type SandboxRequestFile = Omit<SandboxRequest, "repoRoot" | "consent" | "network"> & {
  sandboxRequestVersion: 1;
  repoRoot: string;
  network?: { enabled: boolean };
};

export async function runSandboxCommand(args: string[], dependencies: {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  writeOutput?: (path: string, contents: string) => Promise<void>;
  execute?: (request: SandboxRequest) => Promise<SandboxResult>;
} = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args[0] === "--help" || args[0] === "-h") { stdout(SANDBOX_USAGE); return 0; }
  const parsed = parseArgs(args);
  if (!parsed.ok) { stderr(`${parsed.message}\n\n${SANDBOX_USAGE}`); return 1; }
  if (parsed.output && samePath(resolve(parsed.output), resolve(parsed.request))) {
    stderr("Sandbox --output must not overwrite the request file.\n");
    return 1;
  }
  try {
    const requestFile = parseRequestFile(JSON.parse(readDecodedTextFile(parsed.request)) as unknown);
    if (requestFile.network?.enabled === true && !parsed.allowNetwork) {
      stderr("Sandbox network access requires the separate --allow-sandbox-network consent flag.\n");
      return 1;
    }
    if (parsed.allowNetwork && requestFile.network?.enabled !== true) {
      stderr("--allow-sandbox-network requires network.enabled true in the reviewed request file.\n");
      return 1;
    }
    const requestedRoot = resolve(expandHomePath(requestFile.repoRoot));
    if (!(await stat(requestedRoot)).isDirectory()) throw new Error("Sandbox repository does not exist or is not a directory.");
    const repoRoot = await realpath(requestedRoot);
    const request: SandboxRequest = {
      executionId: requestFile.executionId,
      repoRoot,
      image: requestFile.image,
      command: requestFile.command,
      declaredCommands: requestFile.declaredCommands,
      consent: "execute-declared-command",
      ...(requestFile.limits ? { limits: requestFile.limits } : {}),
      ...(requestFile.network?.enabled === true
        ? { network: { enabled: true, consent: "allow-sandbox-network" } }
        : { network: { enabled: false } })
    };
    const result = await (dependencies.execute ?? runSandbox)(request);
    const rendered = parsed.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderSandboxMarkdown(result);
    if (parsed.output) await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    else stdout(rendered);
    return result.status === "passed" ? 0 : 1;
  } catch (error) {
    stderr(`Could not run sandbox request from "${parsed.request}": ${describeInputReadError(parsed.request, error)}\n`);
    return 1;
  }
}

export function renderSandboxMarkdown(result: SandboxResult): string {
  return `${[
    "# FixMap sandbox result",
    "",
    `Execution: \`${result.executionId}\``,
    `Status: **${result.status}**${result.exitCode === null ? "" : ` (exit ${result.exitCode})`}`,
    `Image: \`${result.image}\``,
    `Command: \`${result.command.replaceAll("`", "'")}\``,
    `Policy: source read-only; root read-only; network ${result.policy.network}; pull ${result.policy.pull}; user ${result.policy.user}; capabilities ${result.policy.capabilitiesDropped}.`,
    `Limits: ${result.limits.timeoutMs}ms, ${result.limits.cpus} CPU, ${result.limits.memoryMb}MB memory, ${result.limits.pids} PIDs, ${result.limits.outputBytes} output bytes.`,
    "",
    "## Standard output",
    "",
    "```text",
    result.stdout,
    "```",
    "",
    "## Standard error",
    "",
    "```text",
    result.stderr,
    "```",
    ...(result.outputTruncated ? ["", "> Output was truncated at the configured byte limit."] : [])
  ].join("\n")}\n`;
}

function parseRequestFile(value: unknown): SandboxRequestFile {
  if (!isRecord(value) || value.sandboxRequestVersion !== 1 || typeof value.executionId !== "string" || typeof value.repoRoot !== "string" ||
    typeof value.image !== "string" || typeof value.command !== "string" || !Array.isArray(value.declaredCommands) ||
    (value.network !== undefined && (!isRecord(value.network) || typeof value.network.enabled !== "boolean")) ||
    (value.limits !== undefined && !isRecord(value.limits)) || "consent" in value) {
    throw new Error("Invalid sandbox request file; consent must be supplied only on the command line.");
  }
  return value as unknown as SandboxRequestFile;
}

type ParsedArgs = { ok: true; request: string; execute: true; allowNetwork: boolean; format: "markdown" | "json"; output?: string } | { ok: false; message: string };
function parseArgs(args: string[]): ParsedArgs {
  let request: string | undefined;
  let execute = false;
  let allowNetwork = false;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    if (raw === "--execute-declared-command" || raw === "--allow-sandbox-network") {
      if (seen.has(raw)) return { ok: false, message: `Pass ${raw} only once.` };
      seen.add(raw);
      if (raw === "--execute-declared-command") execute = true; else allowNetwork = true;
      continue;
    }
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if (!["--request", "--format", "--output"].includes(flag)) return { ok: false, message: `Unknown sandbox option: ${raw}` };
    if (seen.has(flag)) return { ok: false, message: `Pass ${flag} only once.` };
    seen.add(flag);
    const following = args[index + 1];
    const value = inline ?? (following && !following.startsWith("--") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) return { ok: false, message: `${flag} requires a value.` };
    if (flag === "--request") request = expandHomePath(value.trim());
    else if (flag === "--output") output = expandHomePath(value.trim());
    else {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") return { ok: false, message: "--format must be markdown or json." };
      format = normalized;
    }
  }
  if (!request) return { ok: false, message: "sandbox requires --request <sandbox.json>." };
  if (!execute) return { ok: false, message: "Sandbox execution requires the explicit --execute-declared-command consent flag." };
  return { ok: true, request, execute: true, allowNetwork, format, ...(output ? { output } : {}) };
}
function samePath(left: string, right: string): boolean { return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return value;
}
