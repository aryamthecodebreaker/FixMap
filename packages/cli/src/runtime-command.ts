import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { mapRuntimeEvidence, type MappedRuntimeEvidence, type RuntimeRepositorySnapshot } from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const RUNTIME_USAGE = `Usage: fixmap runtime --input <runtime.json> [--format markdown|json] [--output <file>]

Maps a redaction-reviewed OpenTelemetry, normalized APM, Speedscope, or pprof bundle to caller-supplied exact repository file fingerprints. Labels and symbols alone never establish identity or causality.
`;

type RuntimeInput = { runtimeInputVersion: 1; bundle: unknown; snapshots: RuntimeRepositorySnapshot[] };

export async function runRuntimeCommand(args: string[], dependencies: {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  writeOutput?: (path: string, contents: string) => Promise<void>;
} = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args[0] === "--help" || args[0] === "-h") { stdout(RUNTIME_USAGE); return 0; }
  const parsed = parseArgs(args);
  if (!parsed.ok) { stderr(`${parsed.message}\n\n${RUNTIME_USAGE}`); return 1; }
  if (parsed.output && samePath(resolve(parsed.output), resolve(parsed.input))) {
    stderr("Runtime --output must not overwrite the input file.\n");
    return 1;
  }
  try {
    const input = parseRuntimeInput(JSON.parse(readDecodedTextFile(parsed.input)) as unknown);
    const mapped = mapRuntimeEvidence(input.bundle, input.snapshots);
    const rendered = parsed.format === "json" ? `${JSON.stringify(mapped, null, 2)}\n` : renderRuntimeMarkdown(mapped);
    if (parsed.output) await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    else stdout(rendered);
    return 0;
  } catch (error) {
    stderr(`Could not map runtime evidence from "${parsed.input}": ${describeInputReadError(parsed.input, error)}\n`);
    return 1;
  }
}

export function parseRuntimeInput(value: unknown): RuntimeInput {
  if (!isRecord(value) || value.runtimeInputVersion !== 1 || !isRecord(value.bundle) || !Array.isArray(value.snapshots)) {
    throw new Error("Runtime input requires runtimeInputVersion 1, bundle, and snapshots.");
  }
  return { runtimeInputVersion: 1, bundle: value.bundle, snapshots: value.snapshots as RuntimeRepositorySnapshot[] };
}

export function renderRuntimeMarkdown(mapped: MappedRuntimeEvidence): string {
  return `${[
    "# FixMap runtime evidence",
    "",
    `Source: \`${mapped.source.format}\` from \`${mapped.source.tool}\` \`${mapped.source.version}\` at \`${mapped.source.documentFingerprint}\``,
    `Capture: ${mapped.source.capturedFrom} to ${mapped.source.capturedTo}`,
    `Redaction review: ${mapped.source.redactionSummary}`,
    "",
    "## Mapped observations",
    "",
    ...(mapped.observations.length > 0 ? mapped.observations.map((observation) => {
      const location = `\`${observation.subject.repositoryId}:${observation.subject.path}\` at \`${observation.subject.contentFingerprint}\``;
      const measurement = "durationMs" in observation.measurement
        ? `${observation.measurement.durationMs} ms span (${observation.measurement.status})`
        : `${observation.measurement.selfSamples}/${observation.measurement.totalSamples} samples; ${(observation.measurement.sampleShare * 100).toFixed(2)}% self-sample share`;
      return `- ${observation.kind} \`${observation.id}\` ${location}: ${measurement}; evidence \`${observation.evidenceReference}\``;
    }) : ["- No records mapped to exact file fingerprints."]),
    "",
    "## Unresolved",
    "",
    ...(mapped.unresolved.length > 0 ? mapped.unresolved.map((entry) => `- \`${entry.id}\`: ${entry.reason}${entry.repositoryId ? ` at \`${entry.repositoryId}:${entry.path ?? ""}\`` : ""}`) : ["- None."]),
    "",
    "> Observations only. Span duration is not CPU time, profile samples are not wall-clock time, and correlation does not establish causality."
  ].join("\n")}\n`;
}

type ParsedArgs = { ok: true; input: string; format: "markdown" | "json"; output?: string } | { ok: false; message: string };
function parseArgs(args: string[]): ParsedArgs {
  let input: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if (!["--input", "--format", "--output"].includes(flag)) return { ok: false, message: `Unknown runtime option: ${raw}` };
    if (seen.has(flag)) return { ok: false, message: `Pass ${flag} only once.` };
    seen.add(flag);
    const following = args[index + 1];
    const value = inline ?? (following && !following.startsWith("--") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) return { ok: false, message: `${flag} requires a value.` };
    if (flag === "--input") input = expandHomePath(value.trim());
    else if (flag === "--output") output = expandHomePath(value.trim());
    else {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") return { ok: false, message: "--format must be markdown or json." };
      format = normalized;
    }
  }
  if (!input) return { ok: false, message: "runtime requires --input <runtime.json>." };
  return { ok: true, input, format, ...(output ? { output } : {}) };
}
function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return value;
}
