import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  draftReverseDocumentation,
  type ArchitectureSnapshot,
  type DecisionRecord,
  type RepoMap,
  type ReverseDocumentationDraft,
  type ReverseDocumentationTarget
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const REVERSE_DOCS_USAGE = `Usage: fixmap reverse-docs --input <reverse-docs.json> [--format markdown|json] [--output <file>]

Builds deterministic, review-only documentation drafts from exact file fingerprints, one architecture snapshot, authored decisions, and explicit targets. FixMap never writes a requested destination or overwrites repository documentation.
`;

export type ReverseDocsCommandInput = {
  reverseDocumentationInputVersion: 1;
  repo: Pick<RepoMap, "files">;
  architecture: ArchitectureSnapshot;
  decisions: DecisionRecord[];
  targets: ReverseDocumentationTarget[];
};

export async function runReverseDocsCommand(
  args: string[],
  dependencies: {
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
    writeOutput?: (path: string, contents: string) => Promise<void>;
  } = {}
): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args[0] === "--help" || args[0] === "-h") {
    stdout(REVERSE_DOCS_USAGE);
    return 0;
  }
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    stderr(`${parsed.message}\n\n${REVERSE_DOCS_USAGE}`);
    return 1;
  }
  if (parsed.output && samePath(resolve(parsed.output), resolve(parsed.input))) {
    stderr("Reverse-docs --output must not overwrite the input file.\n");
    return 1;
  }
  try {
    const input = parseReverseDocsInput(JSON.parse(readDecodedTextFile(parsed.input)) as unknown);
    const drafts = draftReverseDocumentation(input.repo, input.architecture, input.decisions, input.targets);
    const rendered = parsed.format === "json" ? `${JSON.stringify(drafts, null, 2)}\n` : renderReverseDocsMarkdown(drafts);
    if (parsed.output) {
      await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    } else {
      stdout(rendered);
    }
    return 0;
  } catch (error) {
    stderr(`Could not build reverse-documentation drafts from "${parsed.input}": ${describeInputReadError(parsed.input, error)}\n`);
    return 1;
  }
}

export function parseReverseDocsInput(value: unknown): ReverseDocsCommandInput {
  if (!isRecord(value) || value.reverseDocumentationInputVersion !== 1) {
    throw new Error("Reverse-documentation input reverseDocumentationInputVersion must be 1.");
  }
  if (!isRecord(value.repo) || !isRecord(value.architecture) || !Array.isArray(value.decisions) || !Array.isArray(value.targets)) {
    throw new Error("Reverse-documentation input requires repo, architecture, decisions, and targets.");
  }
  return {
    reverseDocumentationInputVersion: 1,
    repo: value.repo as unknown as Pick<RepoMap, "files">,
    architecture: value.architecture as unknown as ArchitectureSnapshot,
    decisions: value.decisions as DecisionRecord[],
    targets: value.targets as ReverseDocumentationTarget[]
  };
}

export function renderReverseDocsMarkdown(drafts: readonly ReverseDocumentationDraft[]): string {
  return drafts.map((draft) => [
    `Requested destination: \`${draft.destination.requestedPath.replaceAll("`", "'")}\` (${draft.destination.status}).`,
    "",
    draft.markdown.trimEnd()
  ].join("\n")).join("\n\n---\n\n") + "\n";
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
    if (!["--input", "--format", "--output"].includes(flag)) return { ok: false, message: `Unknown reverse-docs option: ${raw}` };
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
  if (!input) return { ok: false, message: "reverse-docs requires --input <reverse-docs.json>." };
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
