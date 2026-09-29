import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  answerFixMapQuestion,
  type FixMapAnswer
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const ASK_USAGE = `Usage: fixmap ask --report <plan.json> --question <text> [--format markdown|json] [--output <file>]

Answers structural questions from a saved report's ranked context, impact, tests, risks, diagnostics, annotations, ADRs, and architecture policy. The deterministic CLI mode reads no source content, calls no model, and preserves citations and unknowns instead of guessing.
`;

export type AskCommandDependencies = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  writeOutput?: (path: string, contents: string) => Promise<void>;
};

export async function runAskCommand(args: string[], dependencies: AskCommandDependencies = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args[0] === "--help" || args[0] === "-h") {
    stdout(ASK_USAGE);
    return 0;
  }
  const parsed = parseAskArgs(args);
  if (!parsed.ok) {
    stderr(`${parsed.message}\n\n${ASK_USAGE}`);
    return 1;
  }
  if (parsed.output && samePath(resolve(parsed.output), resolve(parsed.report))) {
    stderr("Ask --output must not overwrite the input report.\n");
    return 1;
  }

  try {
    const report: unknown = JSON.parse(readDecodedTextFile(parsed.report));
    const answer = await answerFixMapQuestion(report, parsed.question);
    const rendered = parsed.format === "json"
      ? `${JSON.stringify(answer, null, 2)}\n`
      : renderAskMarkdown(answer);
    if (parsed.output) {
      await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    } else {
      stdout(rendered);
    }
    return 0;
  } catch (error) {
    stderr(`Could not answer from "${parsed.report}": ${describeInputReadError(parsed.report, error)}\n`);
    return 1;
  }
}

type AskArgs = {
  ok: true;
  report: string;
  question: string;
  format: "markdown" | "json";
  output?: string;
} | { ok: false; message: string };

function parseAskArgs(args: string[]): AskArgs {
  let report: string | undefined;
  let question: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  const seen = new Set<string>();

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if (!["--report", "--question", "--format", "--output"].includes(flag)) {
      return { ok: false, message: `Unknown ask option: ${raw}` };
    }
    if (seen.has(flag)) return { ok: false, message: `Pass ${flag} only once.` };
    seen.add(flag);
    const following = args[index + 1];
    const value = inline ?? (following && !following.startsWith("--") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) return { ok: false, message: `${flag} requires a value.` };

    if (flag === "--report") report = expandHomePath(value.trim());
    else if (flag === "--question") question = value.trim();
    else if (flag === "--output") output = expandHomePath(value.trim());
    else {
      const normalized = value.trim().toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") {
        return { ok: false, message: "--format must be markdown or json." };
      }
      format = normalized;
    }
  }

  if (!report) return { ok: false, message: "ask requires --report <plan.json>." };
  if (!question) return { ok: false, message: "ask requires --question <text>." };
  if (question.length > 5_000 || question.includes("\0")) {
    return { ok: false, message: "--question must contain at most 5,000 characters and no null bytes." };
  }
  return { ok: true, report, question, format, ...(output ? { output } : {}) };
}

export function renderAskMarkdown(answer: FixMapAnswer): string {
  const lines = [
    "# FixMap answer",
    "",
    `Question: ${answer.question}`,
    "",
    answer.answer,
    "",
    "## Evidence",
    "",
    ...(answer.citations.length > 0
      ? answer.citations.map((citation) =>
        `- ${code(citation.id)} **${citation.kind}**${citation.path ? ` ${code(citation.path)}` : ""} — ${citation.detail}`
      )
      : ["No report evidence answered this question."]),
    "",
    "## Unknowns",
    "",
    ...(answer.unknowns.length > 0 ? answer.unknowns.map((unknown) => `- ${unknown}`) : ["No additional unknown was recorded."]),
    "",
    ...answer.diagnostics.map((diagnostic) => `> ${diagnostic}`),
    "> Claims verified: no. Evidence scope: report only; no source content."
  ];
  return `${lines.join("\n")}\n`;
}

function code(value: string): string {
  return `\`${value.replaceAll("`", "'")}\``;
}

function samePath(left: string, right: string): boolean {
  return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right;
}

function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return value;
}
