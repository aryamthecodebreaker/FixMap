import { writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import {
  comparePlanAlternatives,
  createGraphIdentity,
  validateFixMapReport,
  type AlternativePlanComparison,
  type FixMapReport,
  type PlanAlternative,
  type PlanAlternativeAssessment
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const ALTERNATIVES_USAGE = `Usage:
  fixmap alternatives --input <alternatives.json> [--format markdown|json] [--output <file>]
  fixmap alternatives --report <plan-a.json> --report <plan-b.json> --graph-fingerprint <value> [options]

Compares 2-20 alternative plans for the same graph state side by side: intended edits, impact,
contract and total blast radius, contract compatibility, policy errors and warnings, planned tests,
reversibility and uncertainty. FixMap never picks a winner or folds the axes into a score; it lists
each trade-off with the evidence behind it and names the plans no other plan beats on every axis.

Options:
  --input <file>               Version-1 input: {"alternativesInputVersion": 1, "alternatives": [...]}
  --report <file>              Saved FixMap JSON plan to compare (repeatable; may be mixed with --input)
  --graph-fingerprint <value>  Graph state every --report was planned against, such as the commit SHA.
                               A saved plan does not record it, so you state it.
  --format <value>             markdown (default) or json
  --output <file>              Write the comparison to a file instead of stdout
`;

export type AlternativesSource = {
  /** Version-1 input object, or a path to a JSON file holding one. */
  input?: unknown;
  /** Saved FixMap JSON plan report paths. */
  reports?: string[];
  graphFingerprint?: string;
};

type Dependencies = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  writeOutput?: (path: string, contents: string) => Promise<void>;
};

export async function runAlternativesCommand(args: string[], dependencies: Dependencies = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args.includes("--help") || args.includes("-h")) { stdout(ALTERNATIVES_USAGE); return 0; }
  let parsed: ReturnType<typeof parseArgs>;
  try {
    parsed = parseArgs(args);
  } catch (error) {
    stderr(`${message(error)}\n\n${ALTERNATIVES_USAGE}`);
    return 1;
  }
  const inputs = [parsed.input, ...parsed.reports].filter((path): path is string => Boolean(path));
  if (parsed.output && inputs.some((path) => samePath(resolve(path), resolve(parsed.output!)))) {
    stderr("alternatives --output must not overwrite an input file.\n");
    return 1;
  }
  try {
    const comparison = compareAlternativesFromSources(parsed);
    const rendered = parsed.format === "json" ? `${JSON.stringify(comparison, null, 2)}\n` : renderAlternativesMarkdown(comparison);
    if (parsed.output) await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    else stdout(rendered);
    return 0;
  } catch (error) {
    stderr(`Could not compare plan alternatives: ${message(error)}\n`);
    return 1;
  }
}

/** Shared by the CLI and MCP: loads every source, then lets Core validate and compare them. */
export function compareAlternativesFromSources(source: AlternativesSource): AlternativePlanComparison {
  const reports = source.reports ?? [];
  if (source.input === undefined && reports.length === 0) throw new Error("Provide an alternatives input, saved plan reports, or both.");
  if (reports.length > 0 && !source.graphFingerprint) {
    throw new Error("Comparing saved plans requires a graph fingerprint (for example the commit SHA they were planned at); a saved plan does not record one.");
  }
  if (reports.length === 0 && source.graphFingerprint) throw new Error("A graph fingerprint applies only to saved plan reports.");
  const alternatives: PlanAlternative[] = [];
  if (source.input !== undefined) {
    const raw = typeof source.input === "string" ? readJson(source.input, "alternatives input") : source.input;
    alternatives.push(...parseAlternativesInput(raw));
  }
  const used = new Set(alternatives.map((alternative) => alternative.id));
  for (const path of reports) {
    const report = loadPlanReport(path);
    const alternative = planAlternativeFromReport(report, { id: uniqueId(idFromPath(path), used), graphFingerprint: source.graphFingerprint! });
    used.add(alternative.id);
    alternatives.push(alternative);
  }
  return comparePlanAlternatives(alternatives);
}

export function parseAlternativesInput(value: unknown): PlanAlternative[] {
  if (!isRecord(value) || value.alternativesInputVersion !== 1) throw new Error("Alternatives input alternativesInputVersion must be 1.");
  if (!Array.isArray(value.alternatives)) throw new Error("Alternatives input alternatives must be an array.");
  return value.alternatives as PlanAlternative[];
}

/**
 * Report adapter. A saved plan carries ranked files, impact, test routes, risks and policy findings but
 * no graph state, contract diff or rollback plan, so each mapping below uses only what the report says.
 */
export function planAlternativeFromReport(report: FixMapReport, options: { id: string; graphFingerprint: string }): PlanAlternative {
  const editPaths = [...new Set(report.impact?.seeds.length ? report.impact.seeds : report.contextFiles.map((file) => file.path))];
  if (editPaths.length === 0) throw new Error(`Plan ${options.id} has no ranked context files or impact seeds to treat as intended edits.`);
  const edits = new Set(editPaths);
  const impactByPath = new Map((report.impact?.files ?? []).map((file) => [file.path, file]));
  const breaking = new Map<string, string>();
  for (const finding of report.policy?.findings ?? []) {
    if (finding.code !== "breaking-contract") continue;
    for (const path of finding.paths) if (!breaking.has(path)) breaking.set(path, finding.message);
  }
  const tests = report.testRoutes.filter((route) => route.kind === "test").map((route) => {
    const covers = new Set<string>();
    for (const path of route.relatedFiles) {
      if (edits.has(path)) covers.add(path);
      for (const evidence of impactByPath.get(path)?.evidence ?? []) {
        if ((evidence.kind === "test-route" || evidence.kind === "imported-by") && edits.has(evidence.seed)) covers.add(evidence.seed);
      }
    }
    return { command: bounded(route.command), covers: [...covers].map(fileIdentity), reason: bounded(route.reason) };
  });
  const uncertainties: PlanAlternative["uncertainties"] = report.risks.map((risk, index) => ({
    id: `risk-${index + 1}`,
    severity: risk.severity,
    detail: bounded(`${risk.area}: ${risk.reason}`)
  }));
  if (report.analysis?.grounding.specificity === "vague") {
    uncertainties.push({ id: "vague-task", severity: "high", detail: "The task named nothing FixMap could anchor to a file or identifier." });
  }
  const unresolved = report.analysis?.grounding.unresolvedIdentifiers ?? [];
  if (unresolved.length > 0) {
    uncertainties.push({ id: "unresolved-identifiers", severity: "medium", detail: bounded(`Identifiers not found in the repository: ${unresolved.join(", ")}`) });
  }
  return {
    planAlternativeVersion: 1,
    id: options.id,
    graphFingerprint: options.graphFingerprint,
    edits: editPaths.map(fileIdentity),
    impacts: [...impactByPath.keys()].filter((path) => !edits.has(path)).map(fileIdentity),
    contracts: [...breaking].map(([path, reason]) => ({ identity: fileIdentity(path), compatibility: "breaking" as const, reason: bounded(reason) })),
    policyFindings: (report.policy?.findings ?? []).map((finding) => ({ ruleId: safeId(finding.ruleId), severity: finding.severity, message: bounded(finding.message) })),
    tests,
    // Source edits can be reverted in version control; a plan records nothing about deploys or data, so this stays partial.
    reversibility: {
      mode: "partial",
      reason: "A saved plan does not record deploy, data or migration effects; only the source edits are known to be revertible.",
      rollbackSteps: ["Revert the planned edits in version control."]
    },
    uncertainties
  };
}

type Direction = "lower" | "higher";
const AXES: Array<{ axis: string; label: string; direction: Direction; value: (entry: PlanAlternativeAssessment) => number | string }> = [
  { axis: "edit-identities", label: "Intended edits", direction: "lower", value: (entry) => entry.metrics.editIdentities },
  { axis: "impact-identities", label: "Impact identities", direction: "lower", value: (entry) => entry.metrics.impactIdentities },
  { axis: "contract-identities", label: "Contract identities", direction: "lower", value: (entry) => entry.metrics.contractIdentities },
  { axis: "blast-radius-identities", label: "Total blast radius", direction: "lower", value: (entry) => entry.metrics.totalBlastRadiusIdentities },
  { axis: "breaking-contracts", label: "Breaking contracts", direction: "lower", value: (entry) => entry.metrics.breakingContracts },
  { axis: "unknown-contracts", label: "Unknown contracts", direction: "lower", value: (entry) => entry.metrics.unknownContracts },
  { axis: "policy-errors", label: "Policy errors", direction: "lower", value: (entry) => entry.metrics.policyErrors },
  { axis: "policy-warnings", label: "Policy warnings", direction: "lower", value: (entry) => entry.metrics.policyWarnings },
  { axis: "planned-tests", label: "Planned tests", direction: "higher", value: (entry) => entry.metrics.plannedTests },
  { axis: "covered-edit-identities", label: "Edits with test coverage", direction: "higher", value: (entry) => entry.metrics.coveredEditIdentities },
  { axis: "uncovered-edits", label: "Edits without test coverage", direction: "lower", value: (entry) => entry.metrics.uncoveredEditIdentities.length },
  { axis: "reversibility", label: "Reversibility", direction: "higher", value: (entry) => entry.metrics.reversibility },
  { axis: "high-uncertainties", label: "High uncertainties", direction: "lower", value: (entry) => entry.metrics.highUncertainties },
  { axis: "medium-uncertainties", label: "Medium uncertainties", direction: "lower", value: (entry) => entry.metrics.mediumUncertainties }
];

export function renderAlternativesMarkdown(comparison: AlternativePlanComparison): string {
  const ids = comparison.alternatives.map((entry) => entry.id);
  const lines = [
    "# FixMap plan alternatives",
    "",
    `Graph fingerprint: ${code(comparison.graphFingerprint)}`,
    `Comparison fingerprint: ${code(comparison.fingerprint)}`,
    "",
    "FixMap does not pick a winner. Each axis is compared on its own; which trade-off matters is your call.",
    "",
    "## Side by side",
    "",
    `| Axis | ${ids.map(code).join(" | ")} |`,
    `| --- | ${ids.map(() => "---").join(" | ")} |`,
    ...AXES.map((axis) => `| ${axis.label} (${axis.direction} is better) | ${comparison.alternatives.map((entry) => String(axis.value(entry))).join(" | ")} |`),
    "",
    "## Trade-offs",
    ""
  ];
  for (const pair of comparison.pairwise) {
    const leftBetter: string[] = [];
    const rightBetter: string[] = [];
    for (const difference of pair.differences) {
      const axis = AXES.find((entry) => entry.axis === difference.axis);
      if (!axis) continue;
      // Each line reads from the better plan's side: "<its value> vs <the other's value>".
      if (better(axis.direction, difference.left, difference.right)) leftBetter.push(`${axis.label.toLowerCase()} (${difference.left} vs ${difference.right})`);
      else rightBetter.push(`${axis.label.toLowerCase()} (${difference.right} vs ${difference.left})`);
    }
    if (leftBetter.length === 0 && rightBetter.length === 0) {
      lines.push(`- ${code(pair.left)} and ${code(pair.right)} are equal on every compared axis.`);
      continue;
    }
    lines.push(`- ${code(pair.left)} vs ${code(pair.right)}:`);
    lines.push(`  - ${code(pair.left)} is better on ${leftBetter.length > 0 ? leftBetter.join(", ") : "no axis"}.`);
    lines.push(`  - ${code(pair.right)} is better on ${rightBetter.length > 0 ? rightBetter.join(", ") : "no axis"}.`);
  }
  lines.push(
    "",
    `Not beaten on every axis by another plan: ${comparison.nonDominatedAlternatives.map(code).join(", ")}.`,
    "Planned-test and coverage counts are shown but do not decide this; more tests are not automatically better.",
    "",
    "## Evidence",
    ""
  );
  for (const entry of comparison.alternatives) {
    lines.push(`### ${code(entry.id)}`, "");
    for (const evidence of entry.evidence) {
      const identities = evidence.identities && evidence.identities.length > 0 && evidence.axis !== "edits" && evidence.axis !== "impact"
        ? ` ${evidence.axis === "tests" ? "Uncovered" : "Identities"}: ${evidence.identities.slice(0, 10).map(code).join(", ")}${evidence.identities.length > 10 ? `, and ${evidence.identities.length - 10} more` : ""}.`
        : "";
      lines.push(`- **${evidence.axis}**: ${evidence.detail}${identities}`);
    }
    lines.push("");
  }
  lines.push("> Review-only comparison. FixMap did not execute, apply or rank these plans.");
  return `${lines.join("\n")}\n`;
}

function better(direction: Direction, left: string | number, right: string | number): boolean {
  if (typeof left === "string" || typeof right === "string") {
    const rank = (value: string | number) => (value === "full" ? 2 : value === "partial" ? 1 : 0);
    return rank(left) > rank(right);
  }
  return direction === "lower" ? left < right : left > right;
}

function parseArgs(args: string[]) {
  const reports: string[] = [];
  const singles = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const equals = raw.match(/^(--[a-z-]+)=(.*)$/);
    const flag = equals?.[1] ?? raw;
    if (!["--input", "--report", "--graph-fingerprint", "--format", "--output"].includes(flag)) throw new Error(`Unknown alternatives option: ${raw}`);
    const value = equals?.[2] ?? args[++index];
    if (typeof value !== "string" || !value.trim() || (!equals && value.startsWith("--"))) throw new Error(`${flag} requires a value.`);
    if (flag === "--report") reports.push(value.trim());
    else if (singles.has(flag)) throw new Error(`Pass ${flag} only once.`);
    else singles.set(flag, value.trim());
  }
  const format = (singles.get("--format") ?? "markdown").toLowerCase();
  if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json.");
  const input = singles.get("--input");
  if (!input && reports.length === 0) throw new Error("alternatives requires --input <alternatives.json> or --report <plan.json> (repeatable).");
  const graphFingerprint = singles.get("--graph-fingerprint");
  const output = singles.get("--output");
  return {
    format: format as "markdown" | "json",
    reports,
    ...(input ? { input } : {}),
    ...(graphFingerprint ? { graphFingerprint } : {}),
    ...(output ? { output } : {})
  };
}

function loadPlanReport(path: string): FixMapReport {
  const loaded = validateFixMapReport(readJson(path, "plan report"), `"${path}"`);
  if (!loaded.success) throw new Error(loaded.message);
  return loaded.report;
}

function readJson(path: string, label: string): unknown {
  let text: string;
  try {
    text = readDecodedTextFile(path);
  } catch (error) {
    throw new Error(`Could not read ${label} ${describeInputReadError(path, error)}`);
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error(`${label} "${path}" is not valid JSON.`);
  }
}

function fileIdentity(path: string): string { return createGraphIdentity({ workspace: "local", kind: "file", key: path }); }
function idFromPath(path: string): string { return safeId(basename(path).replace(/\.json$/i, "")); }
function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9._:-]+/g, "-").replace(/^[^A-Za-z0-9]+/, "").slice(0, 120) || "plan";
}
function uniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) if (!used.has(`${base}-${suffix}`)) return `${base}-${suffix}`;
}
function bounded(value: string): string { return value.trim().slice(0, 1_000) || "Not stated in the plan."; }
function code(value: string): string { return `\`${value.replaceAll("`", "'")}\``; }
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === "object" && value !== null && !Array.isArray(value); }
function samePath(left: string, right: string): boolean { return process.platform === "win32" ? left.toLowerCase() === right.toLowerCase() : left === right; }
function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }
