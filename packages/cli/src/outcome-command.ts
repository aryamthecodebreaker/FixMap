import { createHash, randomBytes } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve } from "node:path";
import {
  buildChangeDossier,
  createGraphIdentity,
  createOutcomeRecord,
  deleteStoredDossier,
  deleteStoredOutcome,
  pruneStoredOutcomes,
  readStoredDossier,
  readStoredDossiers,
  readStoredOutcome,
  readStoredOutcomes,
  saveStoredDossier,
  saveStoredOutcome,
  scanRepo,
  summarizeOutcomeCalibration,
  validateFixMapReport,
  type ChangeDossier,
  type ChangeDossierInput,
  type FixMapReport,
  type OutcomeCalibration,
  type OutcomeRecord,
  type StoredRecordProblem,
  type TestOutcomeStatus
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const OUTCOME_USAGE = `Usage:
  fixmap outcome record --report <plan.json> (--diff <spec> | --working-tree [--include-untracked])
                        [--command-result <file> ...] [--assessment human|agent|external|unassessed]
                        [--status succeeded|failed|partial|unknown] [--reason <text>] [--task-id <id>] [--redact]
  fixmap outcome list [--format markdown|json]
  fixmap outcome show <id> [--format markdown|json]
  fixmap outcome remove <id>
  fixmap outcome calibrate [--format markdown|json]
  fixmap outcome prune --older-than <days>

Saves what a plan predicted next to what was actually edited, one file per record under
.fixmap/outcomes/. Calibration is a visible report only: it never changes ranking weights.
--redact stores the SHA-256 of the assessment reason and command evidence instead of their text.
Every command also accepts --repo <path> (default current directory).
`;

export const DOSSIER_USAGE = `Usage:
  fixmap dossier create --report <plan.json> --task <text> [--diff <spec> | --working-tree [--include-untracked]]
                        [--command-result <file> ...] [--pr <url>] [--commit <sha>] [--redact]
  fixmap dossier list [--format markdown|json]
  fixmap dossier show <id> [--format markdown|json]
  fixmap dossier remove <id>

Saves a fingerprinted change dossier (request, plan and graph references, ADRs, diff, command
results, commit/PR identifiers) under .fixmap/dossiers/. --redact stores the task text as its SHA-256.
Every command also accepts --repo <path> (default current directory).
`;

/** --command-result accepts one object or an array: a FixMap sandbox result, or {command, status, evidence?, relatedPaths?}. */
type CommandResult = { command: string; status: TestOutcomeStatus; evidence: string; relatedPaths: string[] };

export type RecordCommandIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  now?: () => Date;
  /** Test seam: resolve changed paths without scanning. */
  changedFiles?: (repoRoot: string, change: ChangeSource) => Promise<string[]>;
};

type ChangeSource = { diffSpec?: string; workingTree?: boolean; includeUntracked?: boolean };
type Parsed = { action: string; positional: string[]; values: Map<string, string[]>; flags: Set<string> };

const VALUE_FLAGS = new Set(["--repo", "--report", "--diff", "--command-result", "--assessment", "--status", "--reason",
  "--task-id", "--task", "--pr", "--commit", "--format", "--older-than"]);
const BOOLEAN_FLAGS = new Set(["--working-tree", "--include-untracked", "--redact"]);
const REPEATABLE = new Set(["--command-result"]);
const ACTION_OPTIONS: Record<string, readonly string[]> = {
  "outcome record": ["--repo", "--report", "--diff", "--working-tree", "--include-untracked", "--command-result", "--assessment", "--status", "--reason", "--task-id", "--redact"],
  "outcome list": ["--repo", "--format"],
  "outcome show": ["--repo", "--format"],
  "outcome remove": ["--repo"],
  "outcome calibrate": ["--repo", "--format"],
  "outcome prune": ["--repo", "--older-than"],
  "dossier create": ["--repo", "--report", "--task", "--diff", "--working-tree", "--include-untracked", "--command-result", "--pr", "--commit", "--redact"],
  "dossier list": ["--repo", "--format"],
  "dossier show": ["--repo", "--format"],
  "dossier remove": ["--repo"]
};
const ASSESSMENT_SOURCE = { human: "human", agent: "agent", external: "external-system", unassessed: "unassessed" } as const;
const STATUSES = ["passed", "failed", "timeout", "crashed", "unavailable"] as const;

export function runOutcomeCommand(args: string[], io: RecordCommandIo): Promise<number> { return run("outcome", OUTCOME_USAGE, args, io); }
export function runDossierCommand(args: string[], io: RecordCommandIo): Promise<number> { return run("dossier", DOSSIER_USAGE, args, io); }

async function run(group: "outcome" | "dossier", usage: string, args: string[], io: RecordCommandIo): Promise<number> {
  if (args.length === 0 || args[0] === "--help" || args[0] === "-h" || args.includes("--help") || args.includes("-h")) {
    io.stdout(usage);
    return args.length === 0 ? 1 : 0;
  }
  const fail = (message: string) => { io.stderr(`${message}\n\n${usage}`); return 1; };
  const parsed = parseArgs(args);
  if (typeof parsed === "string") return fail(parsed);
  const allowed = ACTION_OPTIONS[`${group} ${parsed.action}`];
  if (!allowed) return fail(`Unknown ${group} action: ${parsed.action}`);
  for (const flag of [...parsed.values.keys(), ...parsed.flags]) {
    if (!allowed.includes(flag)) return fail(`${flag} does not apply to ${group} ${parsed.action}.`);
  }
  const takesId = parsed.action === "show" || parsed.action === "remove";
  if (takesId ? parsed.positional.length !== 1 : parsed.positional.length > 0) {
    return fail(takesId ? `${group} ${parsed.action} needs exactly one record id.` : `Unexpected argument: ${parsed.positional[0]}`);
  }
  const format = one(parsed, "--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") return fail("--format must be markdown or json.");
  try {
    const repoRoot = await realpath(resolve(one(parsed, "--repo") ?? process.cwd()));
    const id = parsed.positional[0]!;
    if (group === "outcome") {
      switch (parsed.action) {
        case "record": return await recordOutcome(repoRoot, parsed, io, fail);
        case "list": return print(io, format, await readStoredOutcomes(repoRoot), renderOutcomeList);
        case "show": return show(io, format, await readStoredOutcome(repoRoot, id), renderOutcome);
        case "remove": await deleteStoredOutcome(repoRoot, id); io.stdout(`Removed .fixmap/outcomes/${id}.json.\n`); return 0;
        case "calibrate": return calibrate(io, format, await readStoredOutcomes(repoRoot));
        default: return await prune(repoRoot, parsed, io, fail);
      }
    }
    switch (parsed.action) {
      case "create": return await createDossier(repoRoot, parsed, io, fail);
      case "list": return print(io, format, await readStoredDossiers(repoRoot), renderDossierList);
      case "show": return show(io, format, await readStoredDossier(repoRoot, id), renderDossier);
      default: await deleteStoredDossier(repoRoot, id); io.stdout(`Removed .fixmap/dossiers/${id}.json.\n`); return 0;
    }
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

async function recordOutcome(repoRoot: string, parsed: Parsed, io: RecordCommandIo, fail: (message: string) => number): Promise<number> {
  const assessmentName = one(parsed, "--assessment") ?? "unassessed";
  if (!(assessmentName in ASSESSMENT_SOURCE)) return fail("--assessment must be human, agent, external, or unassessed.");
  const source = ASSESSMENT_SOURCE[assessmentName as keyof typeof ASSESSMENT_SOURCE];
  const status = one(parsed, "--status") ?? (source === "unassessed" ? "unknown" : undefined);
  if (!status) return fail("--status succeeded|failed|partial|unknown is required with an assessment source.");
  if (!["succeeded", "failed", "partial", "unknown"].includes(status)) return fail("--status must be succeeded, failed, partial, or unknown.");
  if (source === "unassessed" && status !== "unknown") return fail("An unassessed outcome can only have --status unknown.");
  const change = changeSource(parsed, true);
  if (typeof change === "string") return fail(change);
  const plan = loadReport(one(parsed, "--report"));
  if (typeof plan === "string") return fail(plan);
  const redact = parsed.flags.has("--redact");
  const commands = loadCommandResults(parsed.values.get("--command-result") ?? []);
  const now = io.now?.() ?? new Date();
  const reason = one(parsed, "--reason") ?? (source === "unassessed" ? "Not assessed." : `Assessed by ${assessmentName}.`);
  const record = createOutcomeRecord({
    id: newId("outcome", now),
    taskId: one(parsed, "--task-id") ?? `plan-${plan.hash.slice(0, 16)}`,
    repositoryIdentity: repositoryIdentity(repoRoot),
    planFingerprint: `sha256:${plan.hash}`,
    recordedAt: now.toISOString(),
    predictedPaths: plan.report.contextFiles.map((file) => file.path),
    editedPaths: await resolveChangedFiles(repoRoot, change!, io),
    testOutcomes: commands.map((entry) => ({
      command: entry.command,
      status: entry.status,
      relatedPaths: entry.relatedPaths,
      evidence: redact ? sha256Text(entry.evidence) : entry.evidence
    })),
    taskAssessment: { status: status as OutcomeRecord["taskAssessment"]["status"], source, reason: redact ? sha256Text(reason) : reason }
  });
  await saveStoredOutcome(repoRoot, record);
  const calibration = summarizeOutcomeCalibration({ outcomeStoreVersion: 1, records: [record] }).perRecord[0]!;
  io.stdout(`Saved .fixmap/outcomes/${record.id}.json: ${calibration.correctlyPredicted.length} of ${record.editedPaths.length} edited ` +
    `path(s) were predicted; ${calibration.predictedButUnedited.length} predicted path(s) were not edited.${redact ? " Free text was redacted to SHA-256." : ""}\n`);
  return 0;
}

async function createDossier(repoRoot: string, parsed: Parsed, io: RecordCommandIo, fail: (message: string) => number): Promise<number> {
  const task = one(parsed, "--task");
  if (!task) return fail("dossier create requires --task <text> describing the request.");
  const change = changeSource(parsed, false);
  if (typeof change === "string") return fail(change);
  const reportPath = one(parsed, "--report");
  const plan = loadReport(reportPath);
  if (typeof plan === "string") return fail(plan);
  const redact = parsed.flags.has("--redact");
  const commands = loadCommandResults(parsed.values.get("--command-result") ?? []);
  const now = (io.now?.() ?? new Date()).toISOString();
  const commit = one(parsed, "--commit");
  const pullRequest = one(parsed, "--pr");
  let diff: ChangeDossierInput["diff"] = null;
  if (change) {
    const changedFiles = await resolveChangedFiles(repoRoot, change, io);
    diff = {
      sourceFingerprint: `sha256:${sha256(JSON.stringify({ change, changedFiles }))}`,
      changedFiles,
      ...(change.diffSpec ? { base: change.diffSpec } : { base: "HEAD", head: "working-tree" })
    };
  }
  const artifact = relative(repoRoot, resolve(reportPath!)).replace(/\\/g, "/");
  const dossier = buildChangeDossier({
    id: newId("dossier", new Date(now)),
    repositoryIdentity: repositoryIdentity(repoRoot),
    createdAt: now,
    updatedAt: now,
    request: { summary: redact ? sha256Text(task) : task, sourceFingerprint: `sha256:${sha256(task)}` },
    assumptions: [],
    plan: {
      reportFingerprint: `sha256:${plan.hash}`,
      graphFingerprint: `sha256:${sha256(JSON.stringify(plan.report.impact ?? null))}`,
      ...(artifact && !artifact.startsWith("..") && !isAbsolute(artifact) ? { artifactPath: artifact } : {})
    },
    decisions: (plan.report.decisions ?? []).map((decision) => ({ id: decision.id, path: decision.path, sourceFingerprint: decision.sourceFingerprint })),
    diff,
    tests: commands.map((entry) => ({ command: entry.command, status: entry.status, evidenceFingerprint: `sha256:${sha256(entry.evidence)}`, relatedPaths: entry.relatedPaths })),
    runtimeEvidence: [],
    reviews: [],
    releaseIdentifiers: {
      ...(commit ? { commit } : {}),
      ...(pullRequest ? { pullRequest } : {})
    }
  });
  await saveStoredDossier(repoRoot, dossier);
  io.stdout(`Saved .fixmap/dossiers/${dossier.id}.json (${dossier.fingerprint}).${redact ? " Task text was redacted to SHA-256." : ""}\n`);
  return 0;
}

async function prune(repoRoot: string, parsed: Parsed, io: RecordCommandIo, fail: (message: string) => number): Promise<number> {
  const raw = one(parsed, "--older-than");
  if (!raw || !/^\d{1,5}$/.test(raw)) return fail("outcome prune requires --older-than <days> (a whole number of days, 0-99999).");
  const cutoff = new Date((io.now?.() ?? new Date()).getTime() - Number(raw) * 86_400_000);
  const result = await pruneStoredOutcomes(repoRoot, cutoff);
  io.stdout(`Removed ${result.removed.length} outcome record(s) recorded before ${cutoff.toISOString()}; kept ${result.kept}.\n` +
    result.removed.map((id) => `- ${id}\n`).join("") + renderProblems(result.problems));
  return 0;
}

function calibrate(io: RecordCommandIo, format: string, stored: { records: OutcomeRecord[]; problems: StoredRecordProblem[] }): number {
  const calibration = summarizeOutcomeCalibration({ outcomeStoreVersion: 1, records: stored.records });
  if (format === "json") io.stdout(`${JSON.stringify({ ...calibration, problems: stored.problems }, null, 2)}\n`);
  else io.stdout(renderCalibration(calibration) + renderProblems(stored.problems));
  return 0;
}

function print<T>(io: RecordCommandIo, format: string, stored: { records: T[]; problems: StoredRecordProblem[] }, render: (records: T[]) => string): number {
  io.stdout(format === "json" ? `${JSON.stringify(stored, null, 2)}\n` : render(stored.records) + renderProblems(stored.problems));
  return 0;
}

function show<T>(io: RecordCommandIo, format: string, record: T, render: (record: T) => string): number {
  io.stdout(format === "json" ? `${JSON.stringify(record, null, 2)}\n` : render(record));
  return 0;
}

function parseArgs(args: string[]): Parsed | string {
  const [action, ...rest] = args;
  if (!action || action.startsWith("-")) return "Name an action first.";
  const values = new Map<string, string[]>();
  const flags = new Set<string>();
  const positional: string[] = [];
  for (let index = 0; index < rest.length; index += 1) {
    const raw = rest[index]!;
    if (!raw.startsWith("--")) { positional.push(raw); continue; }
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    if (BOOLEAN_FLAGS.has(flag)) {
      if (separator !== -1) return `${flag} does not take a value.`;
      if (flags.has(flag)) return `Pass ${flag} only once.`;
      flags.add(flag);
      continue;
    }
    if (!VALUE_FLAGS.has(flag)) return `Unknown option: ${raw}`;
    if (values.has(flag) && !REPEATABLE.has(flag)) return `Pass ${flag} only once.`;
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    const following = rest[index + 1];
    const value = inline ?? (following !== undefined && !following.startsWith("--") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) return `${flag} requires a non-blank value.`;
    values.set(flag, [...(values.get(flag) ?? []), value.trim()]);
  }
  return { action, positional, values, flags };
}

function changeSource(parsed: Parsed, required: boolean): ChangeSource | undefined | string {
  const diffSpec = one(parsed, "--diff");
  const workingTree = parsed.flags.has("--working-tree");
  if (diffSpec && workingTree) return "Use either --diff or --working-tree, not both.";
  if (parsed.flags.has("--include-untracked") && !workingTree) return "--include-untracked only applies with --working-tree.";
  if (!diffSpec && !workingTree) return required ? "Provide --diff <spec> or --working-tree so FixMap can see what was actually edited." : undefined;
  return diffSpec ? { diffSpec } : { workingTree: true, includeUntracked: parsed.flags.has("--include-untracked") };
}

function loadReport(path: string | undefined): { report: FixMapReport; hash: string } | string {
  if (!path) return "Provide --report with the JSON report the change was planned from.";
  let text: string;
  try {
    text = readDecodedTextFile(path);
  } catch (error) {
    return `Could not read "${path}": ${describeInputReadError(path, error)}`;
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    return `"${path}" is not a JSON FixMap report. Save one with: fixmap plan --issue "..." --format json --output plan.json`;
  }
  const loaded = validateFixMapReport(candidate, `"${path}"`);
  if (!loaded.success) return loaded.message;
  return { report: loaded.report, hash: sha256(text) };
}

function loadCommandResults(paths: string[]): CommandResult[] {
  return paths.flatMap((path) => {
    let candidate: unknown;
    try {
      candidate = JSON.parse(readDecodedTextFile(path));
    } catch (error) {
      throw new Error(`Could not read command result "${path}": ${error instanceof SyntaxError ? "not valid JSON" : describeInputReadError(path, error)}`);
    }
    return (Array.isArray(candidate) ? candidate : [candidate]).map((entry, index) => commandResult(entry, `${path}[${index}]`));
  });
}

function commandResult(value: unknown, label: string): CommandResult {
  const entry = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  if (typeof entry.command !== "string" || !entry.command.trim() || !STATUSES.includes(entry.status as TestOutcomeStatus)) {
    throw new Error(`Command result ${label} needs a command and a status of ${STATUSES.join(", ")}.`);
  }
  const evidence = typeof entry.evidence === "string" && entry.evidence.trim()
    ? entry.evidence
    : entry.sandboxResultVersion === 1
      ? `sandbox ${String(entry.executionId)} exit ${String(entry.exitCode)} image ${String(entry.image)}`
      : `${String(entry.status)} (from ${label})`;
  const relatedPaths = Array.isArray(entry.relatedPaths) ? entry.relatedPaths : [];
  if (!relatedPaths.every((path) => typeof path === "string")) throw new Error(`Command result ${label} relatedPaths must be strings.`);
  return { command: entry.command, status: entry.status as TestOutcomeStatus, evidence: evidence.slice(0, 2_000), relatedPaths: relatedPaths as string[] };
}

async function resolveChangedFiles(repoRoot: string, change: ChangeSource, io: RecordCommandIo): Promise<string[]> {
  if (io.changedFiles) return io.changedFiles(repoRoot, change);
  const repo = await scanRepo({ repoRoot, ...change, useCache: true });
  const unresolved = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
  if (unresolved) throw new Error(`${unresolved.message}\nFixMap needs a resolvable diff to record what was edited.`);
  return repo.changedFiles;
}

function repositoryIdentity(repoRoot: string): string {
  const name = basename(repoRoot).replace(/[^A-Za-z0-9._-]/g, "-").replace(/^[^A-Za-z0-9]+/, "") || "repository";
  return createGraphIdentity({ workspace: "local", kind: "repository", key: name.slice(0, 100) });
}

function newId(prefix: string, now: Date): string {
  return `${prefix}-${now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z")}-${randomBytes(4).toString("hex")}`;
}
function sha256(text: string): string { return createHash("sha256").update(text, "utf8").digest("hex"); }
function sha256Text(text: string): string { return `sha256:${sha256(text)}`; }
function one(parsed: Parsed, flag: string): string | undefined { return parsed.values.get(flag)?.[0]; }
function percent(value: number | null): string { return value === null ? "n/a" : `${(value * 100).toFixed(1)}%`; }

function renderProblems(problems: StoredRecordProblem[]): string {
  if (problems.length === 0) return "";
  return `\n## Unreadable stored files (${problems.length})\n\n${problems.map((problem) => `- ${problem.file}: ${problem.message}`).join("\n")}\n`;
}

function renderOutcomeList(records: OutcomeRecord[]): string {
  if (records.length === 0) return "# FixMap Outcomes\n\nNo outcome records found.\n";
  return `# FixMap Outcomes\n\n${records.map((record) =>
    `- ${record.id} (${record.recordedAt}): ${record.predictedPaths.length} predicted, ${record.editedPaths.length} edited, ` +
    `task ${record.taskAssessment.status} (${record.taskAssessment.source})`).join("\n")}\n`;
}

function renderOutcome(record: OutcomeRecord): string {
  const list = (paths: string[]) => paths.length ? paths.map((path) => `- ${path}`).join("\n") : "- none";
  return [`# Outcome ${record.id}`, "", `Recorded: ${record.recordedAt}`, `Task: ${record.taskId}`, `Plan: ${record.planFingerprint}`,
    `Assessment: ${record.taskAssessment.status} (${record.taskAssessment.source}): ${record.taskAssessment.reason}`, "",
    "## Predicted paths", list(record.predictedPaths), "", "## Edited paths", list(record.editedPaths), "", "## Commands",
    record.testOutcomes.length ? record.testOutcomes.map((test) => `- ${test.status}: ${test.command}`).join("\n") : "- none", ""].join("\n");
}

function renderCalibration(calibration: OutcomeCalibration): string {
  const { totals } = calibration;
  return [
    "# FixMap Outcome Calibration", "",
    `Records: ${calibration.records}`,
    `Precision: ${percent(calibration.precision)} (${totals.correctlyPredictedEdits} of ${totals.predictedPaths} predicted paths were edited)`,
    `Recall: ${percent(calibration.recall)} (${totals.correctlyPredictedEdits} of ${totals.editedPaths} edited paths were predicted)`,
    `Predicted but not edited: ${totals.predictedButUnedited}`,
    `Edited but not predicted: ${totals.editedButUnpredicted}`,
    `Commands: ${Object.entries(calibration.testOutcomes).map(([status, count]) => `${status} ${count}`).join(", ")}`,
    `Task assessments: ${Object.entries(calibration.taskAssessments).map(([status, count]) => `${status} ${count}`).join(", ")}`,
    "",
    "Report only: ranking weights are never changed automatically (automaticWeightChanges: false).", ""
  ].join("\n");
}

function renderDossierList(records: ChangeDossier[]): string {
  if (records.length === 0) return "# FixMap Change Dossiers\n\nNo change dossiers found.\n";
  return `# FixMap Change Dossiers\n\n${records.map((record) =>
    `- ${record.id} (${record.createdAt}): ${record.request.summary.slice(0, 120)}`).join("\n")}\n`;
}

function renderDossier(dossier: ChangeDossier): string {
  const release = Object.entries(dossier.releaseIdentifiers).map(([key, value]) => `- ${key}: ${value}`);
  return [`# Change dossier ${dossier.id}`, "", `Fingerprint: ${dossier.fingerprint}`, `Created: ${dossier.createdAt}`,
    `Request: ${dossier.request.summary}`, `Plan report: ${dossier.plan.reportFingerprint}${dossier.plan.artifactPath ? ` (${dossier.plan.artifactPath})` : ""}`,
    `Graph: ${dossier.plan.graphFingerprint}`, "",
    "## Decisions", dossier.decisions.length ? dossier.decisions.map((entry) => `- ${entry.id}: ${entry.path}`).join("\n") : "- none", "",
    "## Diff", dossier.diff ? `${dossier.diff.changedFiles.length} changed path(s)${dossier.diff.base ? ` against ${dossier.diff.base}` : ""}\n` +
      dossier.diff.changedFiles.map((path) => `- ${path}`).join("\n") : "- not recorded", "",
    "## Commands", dossier.tests.length ? dossier.tests.map((test) => `- ${test.status}: ${test.command}`).join("\n") : "- none", "",
    "## Release identifiers", release.length ? release.join("\n") : "- none", ""].join("\n");
}
