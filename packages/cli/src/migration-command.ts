import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  buildMigrationPlan,
  type IdentityGraph,
  type MigrationPlan,
  type MigrationStep
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const MIGRATION_USAGE = `Usage: fixmap migrate --input <migration.json> [--format markdown|json] [--output <file>]

Builds dependency-ordered, review-only migration phases from a version-1 input containing one exact identity graph and explicit steps. Every step must declare edits, compatibility, tests, and rollback. FixMap never executes or applies the plan.
`;

export type MigrationCommandInput = {
  migrationInputVersion: 1;
  graph: IdentityGraph;
  steps: MigrationStep[];
};

export type MigrationCommandDependencies = {
  stdout?: (text: string) => void;
  stderr?: (text: string) => void;
  writeOutput?: (path: string, contents: string) => Promise<void>;
};

export async function runMigrationCommand(
  args: string[],
  dependencies: MigrationCommandDependencies = {}
): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));
  if (args[0] === "--help" || args[0] === "-h") {
    stdout(MIGRATION_USAGE);
    return 0;
  }
  const parsed = parseMigrationArgs(args);
  if (!parsed.ok) {
    stderr(`${parsed.message}\n\n${MIGRATION_USAGE}`);
    return 1;
  }
  if (parsed.output && samePath(resolve(parsed.output), resolve(parsed.input))) {
    stderr("Migrate --output must not overwrite the input file.\n");
    return 1;
  }

  try {
    const input = parseMigrationInput(JSON.parse(readDecodedTextFile(parsed.input)) as unknown);
    const plan = buildMigrationPlan(input.graph, input.steps);
    const rendered = parsed.format === "json" ? `${JSON.stringify(plan, null, 2)}\n` : renderMigrationPlanMarkdown(plan);
    if (parsed.output) {
      await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    } else {
      stdout(rendered);
    }
    return 0;
  } catch (error) {
    stderr(`Could not build migration plan from "${parsed.input}": ${describeInputReadError(parsed.input, error)}\n`);
    return 1;
  }
}

export function parseMigrationInput(value: unknown): MigrationCommandInput {
  if (!isRecord(value) || value.migrationInputVersion !== 1) {
    throw new Error("Migration input migrationInputVersion must be 1.");
  }
  if (!isRecord(value.graph)) throw new Error("Migration input graph must be a version-1 identity graph object.");
  if (!Array.isArray(value.steps)) throw new Error("Migration input steps must be an array.");
  return {
    migrationInputVersion: 1,
    graph: value.graph as unknown as IdentityGraph,
    steps: value.steps as MigrationStep[]
  };
}

type MigrationArgs = {
  ok: true;
  input: string;
  format: "markdown" | "json";
  output?: string;
} | { ok: false; message: string };

function parseMigrationArgs(args: string[]): MigrationArgs {
  let input: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if (!["--input", "--format", "--output"].includes(flag)) {
      return { ok: false, message: `Unknown migrate option: ${raw}` };
    }
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
      if (normalized !== "markdown" && normalized !== "json") {
        return { ok: false, message: "--format must be markdown or json." };
      }
      format = normalized;
    }
  }
  if (!input) return { ok: false, message: "migrate requires --input <migration.json>." };
  return { ok: true, input, format, ...(output ? { output } : {}) };
}

export function renderMigrationPlanMarkdown(plan: MigrationPlan): string {
  const lines = [
    "# FixMap migration plan",
    "",
    `Graph fingerprint: ${code(plan.graphFingerprint)}`,
    `Plan fingerprint: ${code(plan.fingerprint)}`,
    "",
    ...plan.phases.flatMap((phase) => [
      `## Phase ${phase.phase}`,
      "",
      `Steps: ${phase.stepIds.map(code).join(", ")}`,
      `Prerequisites: ${phase.prerequisites.length > 0 ? phase.prerequisites.map(code).join(", ") : "none"}`,
      `Blast radius: ${phase.blastRadius.totalIdentities} identities (${phase.blastRadius.editIdentities.length} edit, ${phase.blastRadius.impactIdentities.length} impact, ${phase.blastRadius.contractIdentities.length} contract)`,
      "",
      "### Compatibility",
      "",
      ...phase.compatibilityWindows.map((entry) =>
        `- ${code(entry.stepId)} — **${entry.strategy.mode}**: ${entry.strategy.reason}${entry.strategy.exitCriteria ? ` Exit: ${entry.strategy.exitCriteria}` : ""}`
      ),
      "",
      "### Verification",
      "",
      ...phase.tests.map((test) => `- ${code(test.stepId)}: ${code(test.command)} — ${test.reason}`),
      "",
      "### Rollback",
      "",
      ...phase.rollbackPoints.map((rollback) =>
        `- ${code(rollback.stepId)} — trigger: ${rollback.trigger}; action: ${rollback.action}`
      ),
      ""
    ]),
    "> Review-only plan. FixMap did not execute commands, modify source, or authorize rollout."
  ];
  return `${lines.join("\n")}\n`;
}

function code(value: string): string {
  return `\`${value.replaceAll("`", "'")}\``;
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
