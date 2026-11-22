import { realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { compareArchitectureRefs, type ArchitectureRefComparison } from "@aryam/fixmap-core";

export const HISTORY_USAGE = `Usage: fixmap history --from <git-ref> --to <git-ref> [--repo <dir>] [--coupling-delta <n>] [--no-policy] [--no-cache] [--format markdown|json] [--output <file>]

Preview: Compares exact committed architecture snapshots through Git objects without checking out either ref or changing the worktree.
Reports added/removed import edges, new/resolved cycles, .fixmap/policy.json boundary violations, coupling growth, and
decision disagreements: edges at --to that break a fixmap-deny-imports rule stated by an accepted decision record.
Snapshots are cached per exact commit outside the repository (FIXMAP_CACHE_DIR); --no-cache rebuilds them.
`;

type HistoryResult = ArchitectureRefComparison;

export async function runHistoryCommand(
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
    stdout(HISTORY_USAGE);
    return 0;
  }
  const parsed = parseArgs(args);
  if (!parsed.ok) {
    stderr(`${parsed.message}\n\n${HISTORY_USAGE}`);
    return 1;
  }
  try {
    const requestedRoot = resolve(parsed.repo);
    if (!(await stat(requestedRoot)).isDirectory()) throw new Error("not-directory");
    const repoRoot = await realpath(requestedRoot);
    const result = await compareArchitectureRefs({
      repoRoot,
      fromRef: parsed.from,
      toRef: parsed.to,
      applyRepositoryPolicy: parsed.applyPolicy,
      couplingDelta: parsed.couplingDelta,
      useCache: parsed.useCache
    });
    const rendered = parsed.format === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderHistoryMarkdown(result);
    if (parsed.output) await (dependencies.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    else stdout(rendered);
    return 0;
  } catch (error) {
    stderr(`${historyError(parsed.repo, error)}\n`);
    return 1;
  }
}

export function renderHistoryMarkdown(result: HistoryResult): string {
  const drift = result.drift;
  const section = <T>(title: string, values: readonly T[], render: (value: T) => string): string[] => [
    `## ${title}`,
    "",
    ...(values.length > 0 ? values.map((value) => `- ${render(value)}`) : ["- None observed."]),
    ""
  ];
  return `${[
    "# FixMap architecture history",
    "",
    `From: \`${result.from.requestedRef}\` at \`${result.from.commit}\` (\`${result.from.snapshot.fingerprint}\`)`,
    `To: \`${result.to.requestedRef}\` at \`${result.to.commit}\` (\`${result.to.snapshot.fingerprint}\`)`,
    "",
    ...section("Added edges", drift.addedEdges, (edge) => `\`${edge.from}\` -> \`${edge.to}\``),
    ...section("Removed edges", drift.removedEdges, (edge) => `\`${edge.from}\` -> \`${edge.to}\``),
    ...section("New cycles", drift.newCycles, (cycle) => cycle.map((path) => `\`${path}\``).join(" -> ")),
    ...section("Resolved cycles", drift.resolvedCycles, (cycle) => cycle.map((path) => `\`${path}\``).join(" -> ")),
    ...section("New boundary violations", drift.newBoundaryViolations, (entry) => `\`${entry.ruleId}\`: \`${entry.from}\` -> \`${entry.to}\``),
    ...section("Resolved boundary violations", drift.resolvedBoundaryViolations, (entry) => `\`${entry.ruleId}\`: \`${entry.from}\` -> \`${entry.to}\``),
    ...section("Coupling growth", drift.couplingGrowth, (entry) => `\`${entry.path}\`: ${entry.before} -> ${entry.after} (+${entry.delta})`),
    ...section("Decision disagreements", result.decisionDisagreements, (entry) =>
      `\`${entry.decisionPath}\` (${entry.decisionTitle}) denies \`${entry.rule.from}\` -> \`${entry.rule.deny}\`; ` +
      `\`${entry.edge.from}\` -> \`${entry.edge.to}\` ${entry.introduced ? "was introduced in this range" : "already existed at the earlier ref"}`),
    ...(result.to.decisionDiagnostics.length > 0
      ? section("Decision records not evaluated", result.to.decisionDiagnostics, (entry) => entry.message)
      : []),
    "> Read-only historical comparison. FixMap read committed Git objects and did not checkout a ref or change the worktree."
  ].join("\n")}\n`;
}

type ParsedArgs = {
  ok: true;
  from: string;
  to: string;
  repo: string;
  couplingDelta: number;
  applyPolicy: boolean;
  useCache: boolean;
  format: "markdown" | "json";
  output?: string;
} | { ok: false; message: string };

function parseArgs(args: string[]): ParsedArgs {
  let from: string | undefined;
  let to: string | undefined;
  let repo = ".";
  let couplingDelta = 2;
  let applyPolicy = true;
  let useCache = true;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  const seen = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    if (raw === "--no-policy" || raw === "--no-cache") {
      if (seen.has(raw)) return { ok: false, message: `Pass ${raw} only once.` };
      seen.add(raw);
      if (raw === "--no-policy") applyPolicy = false;
      else useCache = false;
      continue;
    }
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if (!["--from", "--to", "--repo", "--coupling-delta", "--format", "--output"].includes(flag)) return { ok: false, message: `Unknown history option: ${raw}` };
    if (seen.has(flag)) return { ok: false, message: `Pass ${flag} only once.` };
    seen.add(flag);
    const following = args[index + 1];
    const value = inline ?? (following && !following.startsWith("--") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) return { ok: false, message: `${flag} requires a value.` };
    const trimmed = value.trim();
    if (/[\0\r\n]/.test(trimmed)) return { ok: false, message: `${flag} must be a single-line value.` };
    if (flag === "--from") from = trimmed;
    else if (flag === "--to") to = trimmed;
    else if (flag === "--repo") repo = expandHomePath(trimmed);
    else if (flag === "--output") output = expandHomePath(trimmed);
    else if (flag === "--coupling-delta") {
      const numeric = Number(trimmed);
      if (!Number.isSafeInteger(numeric) || numeric < 1 || numeric > 10_000) return { ok: false, message: "--coupling-delta must be an integer from 1 to 10000." };
      couplingDelta = numeric;
    } else {
      const normalized = trimmed.toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") return { ok: false, message: "--format must be markdown or json." };
      format = normalized;
    }
  }
  if (!from || !to) return { ok: false, message: "history requires both --from <git-ref> and --to <git-ref>." };
  return { ok: true, from, to, repo, couplingDelta, applyPolicy, useCache, format, ...(output ? { output } : {}) };
}

function historyError(repo: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "not-directory" || /ENOENT/.test(message)) return `History repository "${repo}" does not exist or is not a directory.`;
  if (message.includes("Could not resolve Git ref")) {
    return `Could not resolve one of the requested Git refs in "${repo}". Confirm both refs exist and the path is a Git checkout.`;
  }
  return `Could not compare historical architecture in "${repo}": ${message.replace(/Command failed:[\s\S]*/i, "Git could not read the requested committed state.")}`;
}

function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return resolve(homedir(), value.slice(2));
  return value;
}
