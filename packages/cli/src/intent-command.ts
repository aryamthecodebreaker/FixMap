import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { promisify } from "node:util";
import {
  agentIntentToChangeIntent,
  detectChangeConflicts,
  listAgentIntents,
  pruneAgentIntents,
  recordAgentIntent,
  releaseAgentIntent,
  validateAgentIntent,
  validateFixMapReport,
  type AgentIntent,
  type AgentIntentEdit,
  type ChangeConflictAnalysis,
  type ChangeIntent
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

const exec = promisify(execFile);

export const INTENT_USAGE = `Usage: fixmap intent record --agent <id> --task <text> --edit <path[:start-end[,start-end]]>... [--impact <path>]... [--contract <path>]... [--id <id>] [--ttl <minutes>] [--repo <path>] [--format markdown|json]
       fixmap intent list [--repo <path>] [--format markdown|json]
       fixmap intent release <id> [--repo <path>]
       fixmap intent prune [--repo <path>]

Preview. Agents sharing a checkout record what they plan to edit in .fixmap/intents/ (one file per
intent, written atomically) so others can check for overlap with fixmap conflicts. Intents expire
after --ttl minutes (default 120). Only .fixmap/intents/ is written; source files are never touched.
`;

export const CONFLICTS_USAGE = `Usage: fixmap conflicts [--repo <path>] [--report <plan.json> --agent <id>] [--format markdown|json]

Preview. Compares every live intent in .fixmap/intents/ (and, with --report, a proposed plan's ranked
files and impact) and prints overlapping files and who holds them. Exit 1 when two intents edit the
same file or one edits another's impact or contract zone; disjoint line ranges and different base
commits are warnings and exit 0.
`;

type Io = { stdout: (text: string) => void; stderr: (text: string) => void };

export async function runIntentCommand(args: string[], io: Io, now = new Date()): Promise<number> {
  const action = args[0];
  if (!action || action === "--help" || action === "-h") {
    (action ? io.stdout : io.stderr)(INTENT_USAGE);
    return action ? 0 : 1;
  }
  const parsed = parseFlags(args.slice(1), {
    record: ["--agent", "--task", "--edit", "--impact", "--contract", "--id", "--ttl", "--repo", "--format"],
    list: ["--repo", "--format"],
    release: ["--repo"],
    prune: ["--repo"]
  }[action] ?? [], new Set(["--edit", "--impact", "--contract"]), action === "release" ? 1 : 0);
  if (!["record", "list", "release", "prune"].includes(action)) return usage(io, `Unknown intent action: ${action}. Use record, list, release, or prune.`, INTENT_USAGE);
  if (typeof parsed === "string") return usage(io, parsed, INTENT_USAGE);
  const repo = resolve(parsed.single.get("--repo") ?? process.cwd());
  const format = parsed.single.get("--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") return usage(io, "--format must be markdown or json.", INTENT_USAGE);
  try {
    if (action === "record") {
      const agent = parsed.single.get("--agent");
      const task = parsed.single.get("--task");
      const edits = parsed.multi.get("--edit") ?? [];
      if (!agent || !task || edits.length === 0) return usage(io, "intent record needs --agent, --task, and at least one --edit.", INTENT_USAGE);
      const ttl = parsed.single.get("--ttl");
      if (ttl !== undefined && !/^\d+$/.test(ttl)) return usage(io, "--ttl must be a whole number of minutes.", INTENT_USAGE);
      const intent = await recordAgentIntent(repo, {
        agent,
        task,
        baseCommit: await headCommit(repo),
        edits: edits.map(parseEdit),
        impacts: parsed.multi.get("--impact") ?? [],
        contracts: parsed.multi.get("--contract") ?? [],
        ...(parsed.single.get("--id") ? { id: parsed.single.get("--id")! } : {}),
        ...(ttl !== undefined ? { ttlMinutes: Number(ttl) } : {})
      }, now);
      io.stdout(format === "json" ? `${JSON.stringify(intent, null, 2)}\n` : `Recorded intent ${intent.id} for ${intent.agent} on ${intent.edits.length} file${intent.edits.length === 1 ? "" : "s"}, until ${intent.expiresAt}. Release it with: fixmap intent release ${intent.id}\n`);
      return 0;
    }
    if (action === "list") {
      const listing = await listAgentIntents(repo, now);
      io.stdout(format === "json" ? `${JSON.stringify({ agentIntentListingVersion: 1, ...listing }, null, 2)}\n` : renderListing(listing.intents, listing.expired.length, listing.invalid));
      return 0;
    }
    if (action === "release") {
      const id = parsed.positional[0]!;
      const released = await releaseAgentIntent(repo, id);
      (released ? io.stdout : io.stderr)(released ? `Released intent ${id}.\n` : `No intent ${id} to release.\n`);
      return released ? 0 : 1;
    }
    const removed = await pruneAgentIntents(repo, now);
    io.stdout(removed.length > 0 ? `Removed ${removed.length} expired intent${removed.length === 1 ? "" : "s"}: ${removed.join(", ")}.\n` : "No expired intents.\n");
    return 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export type ConflictsReport = {
  conflictsReportVersion: 1;
  intents: Array<{ id: string; agent: string; task: string; files: string[] }>;
  analysis: ChangeConflictAnalysis;
  blocking: number;
};

/** Loads live intents, optionally adds a proposal from a saved plan, and runs the Core conflict engine. */
export async function buildConflictsReport(repo: string, options: { reportPath?: string; agent?: string } = {}, now = new Date()): Promise<ConflictsReport> {
  const { intents } = await listAgentIntents(repo, now);
  const changeIntents: ChangeIntent[] = intents.map(agentIntentToChangeIntent);
  const summaries = intents.map((intent: AgentIntent) => ({ id: intent.id, agent: intent.agent, task: intent.task, files: intent.edits.map((entry) => entry.path) }));
  if (options.reportPath) {
    const proposal = await proposalFromReport(repo, options.reportPath, options.agent ?? "proposed", now);
    changeIntents.push(agentIntentToChangeIntent(proposal));
    summaries.push({ id: proposal.id, agent: proposal.agent, task: proposal.task, files: proposal.edits.map((entry) => entry.path) });
  }
  const analysis = detectChangeConflicts(changeIntents);
  return {
    conflictsReportVersion: 1,
    intents: summaries.sort((a, b) => a.id.localeCompare(b.id)),
    analysis,
    blocking: analysis.conflicts.filter(isBlocking).length
  };
}

export async function runConflictsCommand(args: string[], io: Io, now = new Date()): Promise<number> {
  if (args[0] === "--help" || args[0] === "-h") {
    io.stdout(CONFLICTS_USAGE);
    return 0;
  }
  const parsed = parseFlags(args, ["--repo", "--report", "--agent", "--format"], new Set(), 0);
  if (typeof parsed === "string") return usage(io, parsed, CONFLICTS_USAGE);
  const format = parsed.single.get("--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") return usage(io, "--format must be markdown or json.", CONFLICTS_USAGE);
  if (parsed.single.has("--agent") && !parsed.single.has("--report")) return usage(io, "--agent names the proposal from --report; pass both.", CONFLICTS_USAGE);
  try {
    const report = await buildConflictsReport(resolve(parsed.single.get("--repo") ?? process.cwd()), {
      ...(parsed.single.get("--report") ? { reportPath: parsed.single.get("--report")! } : {}),
      ...(parsed.single.get("--agent") ? { agent: parsed.single.get("--agent")! } : {})
    }, now);
    io.stdout(format === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderConflicts(report));
    return report.blocking > 0 ? 1 : 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function renderConflicts(report: ConflictsReport): string {
  const lines = ["# FixMap conflicts", "", `${report.intents.length} live intent${report.intents.length === 1 ? "" : "s"}, ${report.analysis.conflicts.length} overlap${report.analysis.conflicts.length === 1 ? "" : "s"} (${report.blocking} blocking).`, ""];
  if (report.intents.length > 0) {
    lines.push("## Intents", "", ...report.intents.map((intent) => `- \`${intent.id}\` (${intent.agent}): ${intent.task}. Files: ${intent.files.slice(0, 6).map((path) => `\`${path}\``).join(", ")}${intent.files.length > 6 ? ", ..." : ""}`), "");
  }
  lines.push("## Overlaps", "");
  if (report.analysis.conflicts.length === 0) lines.push("- None. No two intents claim the same file or zone.");
  for (const conflict of report.analysis.conflicts) {
    const files = conflict.evidence.filter((entry) => entry.identity).map((entry) => decodeFile(entry.identity!));
    lines.push(`- **${conflict.severity}** ${conflict.kind} between \`${conflict.intents[0]}\` and \`${conflict.intents[1]}\`: ${conflict.message}${files.length > 0 ? ` Files: ${[...new Set(files)].map((path) => `\`${path}\``).join(", ")}` : ""}`);
  }
  return `${lines.join("\n")}\n`;
}

export function isBlocking(conflict: ChangeConflictAnalysis["conflicts"][number]): boolean {
  return conflict.kind === "edit-edit" || conflict.kind === "edit-impact" || conflict.kind === "contract-contract";
}

/** A saved plan becomes a short-lived proposal: ranked files as edits, recalculated impact as impact. */
async function proposalFromReport(repo: string, path: string, agent: string, now: Date): Promise<AgentIntent> {
  let raw: unknown;
  try {
    raw = JSON.parse(readDecodedTextFile(path));
  } catch (error) {
    throw new Error(`Could not read plan "${path}": ${describeInputReadError(path, error)}`);
  }
  const loaded = validateFixMapReport(raw, `"${path}"`);
  if (!loaded.success) throw new Error(loaded.message);
  const edits = [...new Set(loaded.report.contextFiles.map((file) => file.path))];
  if (edits.length === 0) throw new Error(`"${path}" ranks no files, so there is nothing to compare.`);
  const editSet = new Set(edits);
  return validateAgentIntent({
    agentIntentVersion: 1,
    id: "proposed",
    agent,
    task: "proposed plan",
    baseCommit: await headCommit(repo),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 60_000).toISOString(),
    edits: edits.map((file) => ({ path: file })),
    impacts: (loaded.report.impact?.files ?? []).map((file) => file.path).filter((file) => !editSet.has(file)),
    contracts: []
  });
}

/** `src/a.ts:10-20,40-45` names line ranges; a plain path claims the whole file. */
export function parseEdit(value: string): AgentIntentEdit {
  const match = /^(.*?):(\d+-\d+(?:,\d+-\d+)*)$/.exec(value);
  if (!match) return { path: value };
  return {
    path: match[1]!,
    ranges: match[2]!.split(",").map((range) => {
      const [start, end] = range.split("-").map(Number);
      return { start: start!, end: end! };
    })
  };
}

async function headCommit(repo: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", "HEAD^{commit}"], { cwd: repo, encoding: "utf8", windowsHide: true });
    return stdout.trim().toLowerCase();
  } catch {
    throw new Error(`"${repo}" has no committed HEAD; intents record the commit they start from.`);
  }
}

function decodeFile(identity: string): string {
  const key = /\/file\/(.+)$/.exec(identity)?.[1] ?? identity;
  try {
    return decodeURIComponent(key);
  } catch {
    return key;
  }
}

function renderListing(intents: AgentIntent[], expired: number, invalid: Array<{ file: string; message: string }>): string {
  const lines = ["# FixMap intents", ""];
  if (intents.length === 0) lines.push("- No live intents.");
  for (const intent of intents) {
    lines.push(`- \`${intent.id}\` (${intent.agent}) until ${intent.expiresAt}: ${intent.task}`);
    for (const entry of intent.edits.slice(0, 10)) {
      lines.push(`  - \`${entry.path}\`${entry.ranges ? ` lines ${entry.ranges.map((range) => `${range.start}-${range.end}`).join(", ")}` : ""}`);
    }
  }
  if (expired > 0) lines.push("", `${expired} expired intent${expired === 1 ? "" : "s"} ignored; remove with fixmap intent prune.`);
  if (invalid.length > 0) lines.push("", "## Unreadable", "", ...invalid.map((entry) => `- \`${entry.file}\`: ${entry.message}`));
  return `${lines.join("\n")}\n`;
}

type ParsedFlags = { single: Map<string, string>; multi: Map<string, string[]>; positional: string[] };

function parseFlags(args: string[], allowed: readonly string[], repeatable: ReadonlySet<string>, positionals: number): ParsedFlags | string {
  const single = new Map<string, string>();
  const multi = new Map<string, string[]>();
  const positional: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    if (!raw.startsWith("--")) {
      if (positional.length >= positionals) return `Unexpected argument: ${raw}`;
      positional.push(raw);
      continue;
    }
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    if (!allowed.includes(flag)) return `Unknown option: ${raw}`;
    const value = separator === -1 ? args[++index] : raw.slice(separator + 1);
    if (value === undefined || !value.trim() || (separator === -1 && value.startsWith("--"))) return `${flag} requires a value.`;
    if (repeatable.has(flag)) multi.set(flag, [...multi.get(flag) ?? [], value.trim()]);
    else if (single.has(flag)) return `Pass ${flag} only once.`;
    else single.set(flag, value.trim());
  }
  if (positional.length < positionals) return "Missing the intent id.";
  return { single, multi, positional };
}

function usage(io: Io, message: string, text: string): number {
  io.stderr(`${message}\n\n${text}`);
  return 1;
}
