import { readFileSync } from "node:fs";
import { realpath, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareReports,
  explainFile,
  quoteCliValue as formatCliValue,
  renderComparisonMarkdown,
  renderExplanationMarkdown,
  renderAgentReport,
  renderJsonReport,
  renderVerifyMarkdown,
  resolveExclusions,
  verifyPlan,
  renderMarkdownReport,
  scanRepo,
  validateFixMapReport,
  type FixMapReport
} from "@aryam/fixmap-core";
import { runDoctorChecks, renderDoctorReport, type DoctorReport } from "./doctor.js";
import { installAgentCommands, renderFeatureCatalog, type AgentTarget } from "./agent-setup.js";
import { clarifyMissingPath } from "./explain-path.js";
import type { RepositoryBenchmark } from "./benchmark.js";
import type { WatchRepositoryInput, WatchUpdate } from "./watch.js";
import { decodeInputText, describeInputReadError, readDecodedTextFile } from "./decode-input.js";
import {
  buildReportForRepository,
  isSafeGitRefName,
  parseGitHubIssueSource,
  progressRequested,
  tryParseGitHubIssueSource,
  type RepositoryPlanInput
} from "./repository-source.js";

export type CliOptions = {
  command: string;
  issueText: string;
  issueFile?: string | undefined;
  repo?: string | undefined;
  diffSpec?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  checkoutRef?: string | undefined;
  format: "markdown" | "json" | "agent";
  output?: string | undefined;
  explainPath?: string | undefined;
  reportPath?: string | undefined;
  comparePath?: string | undefined;
  limit?: number | undefined;
  failOn?: "error" | "warning" | undefined;
  exclude: string[];
  workingTree: boolean;
  includeUntracked: boolean;
  noCache: boolean;
  semanticModelPath?: string | undefined;
  unknownArgs: string[];
  invalidValues: string[];
};

export type CliDependencies = {
  buildReport?: (input: RepositoryPlanInput) => Promise<FixMapReport>;
  readVersion?: () => string;
  runMcpServer?: (defaultRepo?: string) => Promise<void>;
  runDoctor?: () => Promise<DoctorReport>;
  stderr?: (text: string) => void;
  stdout?: (text: string) => void;
  writeReport?: (path: string, contents: string) => Promise<void>;
  readIssueFile?: (path: string | number) => string | Buffer;
  benchmarkRepository?: (input: { repoRoot: string; last?: number; progress?: (message: string) => void }) => Promise<RepositoryBenchmark>;
  renderBenchmark?: (result: RepositoryBenchmark) => string;
  watchRepository?: (input: WatchRepositoryInput) => Promise<WatchUpdate | undefined>;
  renderWatchUpdate?: (update: WatchUpdate, format: "markdown" | "json") => string;
};

export const USAGE = `FixMap maps an issue, prompt, or diff to context files, test routes, and review risks.

Usage:
  fixmap owner/repository#123
  fixmap https://github.com/owner/repository/issues/123
  fixmap plan --issue "Users cannot reset passwords"
  fixmap plan --issue https://github.com/owner/repository/issues/123
  fixmap plan --issue https://github.com/owner/repository/pull/123
  fixmap plan --issue-file task.md
  fixmap plan --issue -
  fixmap plan --issue "Fix login" --repo https://github.com/owner/repository
  fixmap plan --issue "Fix login" --repo https://github.com/owner/repository --ref release-2.x
  fixmap plan --diff main...HEAD
  fixmap plan --working-tree --include-untracked --limit 12 --exclude "docs/**"
  fixmap plan --no-cache --issue "Fix login" --repo .
  fixmap plan --issue "Keep signed-in users active" --semantic-model C:\\models\\all-MiniLM-L6-v2
  fixmap plan --issue "Fix login" --format json --output plan.json
  fixmap plan --issue "Fix login" --format agent
  fixmap plan --issue "Fix login in auth middleware" --compare plan.json
  fixmap plan --base main --head HEAD --format json
  fixmap verify --report plan.json --diff main...HEAD
  fixmap verify --report plan.json --working-tree
  fixmap verify --report plan.json --working-tree --fail-on warning
  fixmap doctor --format json
  fixmap validate plan.json
  fixmap benchmark --repo . --last 50
  fixmap context --issue "Fix login" --budget 10000
  fixmap graph --issue "Fix login" --format mermaid
  fixmap workspace --config .fixmap/workspace.json --seed auth --format json
  fixmap ask --report plan.json --question "Which tests should I run?"
  fixmap migrate --input migration.json --format markdown
  fixmap reverse-docs --input reverse-docs.json --format markdown
  fixmap watch --report plan.json --repo .
  fixmap annotate src/auth/token.ts --note "Do not refactor; external contract"
  fixmap features
  fixmap setup [--agent claude|cursor|copilot|agents|all] [--repo <path>]
  fixmap mcp [--repo <path>]

Commands:
  plan                Generate a FixMap report for a task or diff
  verify              Compare a saved report against the diff that followed it
  doctor              Check the FixMap install for stale global or npx shadows
  validate            Validate a saved FixMap JSON report
  benchmark           Backtest BM25, FixMap, and Impact Graph on pre-change snapshots
  context             Package the highest-value source ranges within a token budget
  graph               Export the evidence-backed Impact Graph as Mermaid or JSON
  workspace           Map package dependencies and impact across local repositories
  ask                 Answer structural questions from a saved report with citations
  migrate             Build a dependency-ordered, review-only migration plan
  reverse-docs        Draft review-only documentation from exact structural evidence
  watch               Recheck working-tree drift and impact whenever edits change
  annotate            Attach reviewable tribal knowledge to files, symbols, services, or contracts
  features            List every FixMap capability and its command
  setup               Preview workflows, or explicitly install /fixmap for coding agents
  mcp                 Run FixMap as an MCP server over stdio for AI coding agents

Options:
  --issue <text|url>  Task text, or a public GitHub issue or pull request URL
  --issue-file <file> Read task text from a UTF-8 or UTF-16 file (use - for stdin)
  --diff <spec>       Git diff spec, such as main...HEAD (the repository scan can still rank untracked candidates)
  --base <ref>        Base ref for diffing when --diff is not given
  --head <ref>        Head ref for diffing (defaults to HEAD)
  --working-tree      Map staged and unstaged changes against HEAD
  --include-untracked With --working-tree, also include untracked files
  --no-cache          Bypass the exact git-state repository scan cache
  --semantic-model <dir> Use an existing local embedding model; never downloads or uploads source
  --repo <source>     Local path or public GitHub HTTPS URL (defaults to current directory)
  --ref <branch|tag>  Branch or tag to scan when --repo is a remote GitHub URL
  --limit <n>         Maximum context files to report (default 8, max 20)
  --exclude <glob>    Path pattern to leave out of ranking (repeatable)
  --format <fmt>      Output format: markdown (default), json, or compact agent
  --output <file>     Write the report or verification to a file instead of stdout
  --explain <path>    Explain why one file was ranked where it was, or left out
  --compare <file>    Compare this plan against an earlier JSON report
  --report <file>     Verify command only: the JSON report the change was planned from
  --fail-on <level>   Verify exit policy: error (default) or warning
  --help, -h          Show this help
  --version, -v       Show the FixMap version

A repository may also list exclusion patterns in .fixmapignore, one per line. Supported
syntax is *, **, ?, repository-root-leading /, directory-trailing /, comments, and ! negation.
Absolute paths pasted from inside the repository are normalized to repository-relative patterns.
Set FIXMAP_PROGRESS=1 to print scan and clone phases to stderr.
Set FIXMAP_CACHE_DIR to move the OS scan cache, and FIXMAP_VERBOSE_USAGE=1 to include this full help after argument errors.
`;

const DOCTOR_USAGE = `Usage: fixmap doctor [--format markdown|json]\n\nChecks the running FixMap binary, PATH/global shadows, and known install blind spots.\n`;
const MCP_USAGE = `Usage: fixmap mcp [--repo <path>]\n\nRuns the FixMap MCP server over stdio. --repo sets the default local repository for tool calls that omit repo.\n`;
const FEATURES_USAGE = `Usage: fixmap features [--format markdown|json]\n\nLists every FixMap capability and the command that exposes it.\n`;
const SETUP_USAGE = `Usage: fixmap setup [--agent claude|cursor|copilot|agents|all] [--repo <path>] [--force]\n\nWith no arguments, previews every workflow without writing files. Pass --agent explicitly to install a /fixmap command.\n`;
const VALIDATE_USAGE = `Usage: fixmap validate <report.json> [--format markdown|json]\n\nChecks a saved report against FixMap's structural compatibility contract.\n`;
const BENCHMARK_USAGE = `Usage: fixmap benchmark [--repo <local-path>] [--last <1-100>] [--format markdown|json] [--output <file>]\n\nBacktests BM25, FixMap, and Impact Graph against historical parent snapshots without executing repository code.\n`;

export async function runCli(args: string[], dependencies: CliDependencies = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));

  args = expandIssueShorthand(args);

  if (args.length === 0) {
    stdout(USAGE);
    return 1;
  }
  if (args[0] === "help" || args[0] === "--help" || args[0] === "-h") {
    stdout(USAGE);
    return 0;
  }
  if (args[0] === "version" || args[0] === "--version" || args[0] === "-v") {
    try {
      stdout(`${(dependencies.readVersion ?? readVersion)()}\n`);
      return 0;
    } catch (error) {
      stderr(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }
  if (args[0] === "mcp") {
    if (args[1] === "--help" || args[1] === "-h") { stdout(MCP_USAGE); return 0; }
    const mcpArgs = args.slice(1);
    let defaultRepo: string | undefined;
    if (mcpArgs.length === 1 && mcpArgs[0]?.startsWith("--repo=")) {
      defaultRepo = mcpArgs[0].slice("--repo=".length).trim();
    } else if (mcpArgs.length === 2 && mcpArgs[0] === "--repo") {
      defaultRepo = mcpArgs[1]?.trim();
    } else if (mcpArgs.length > 0) {
      stderr(`mcp accepts only --repo <path>.\n\n${MCP_USAGE}`);
      return 1;
    }
    if (defaultRepo !== undefined && !defaultRepo) {
      stderr(`--repo needs a non-blank local path.\n\n${MCP_USAGE}`);
      return 1;
    }
    if (defaultRepo && /^https?:\/\//i.test(defaultRepo)) {
      stderr(`mcp --repo needs a local checkout, not a remote URL.\n\n${MCP_USAGE}`);
      return 1;
    }
    const runMcpServer = dependencies.runMcpServer ?? (async () => {
      const module = await import("./mcp.js");
      await module.runMcpServer(defaultRepo);
    });
    await runMcpServer(defaultRepo);
    return 0;
  }

  if (args[0] === "annotate") {
    const module = await import("./annotation-command.js");
    return module.runAnnotateCommand(args.slice(1), { stdout, stderr });
  }

  if (args[0] === "features") {
    const featureArgs = args.slice(1);
    if (featureArgs[0] === "--help" || featureArgs[0] === "-h") { stdout(FEATURES_USAGE); return 0; }
    let format: "markdown" | "json" = "markdown";
    if (featureArgs.length > 0) {
      const value = featureArgs.length === 2 && featureArgs[0] === "--format"
        ? featureArgs[1]
        : featureArgs.length === 1
          ? featureArgs[0]?.match(/^--format=(.+)$/)?.[1]
          : undefined;
      const normalized = value?.trim().toLowerCase();
      if (normalized !== "markdown" && normalized !== "json") {
        stderr('features accepts only --format markdown or --format json.\n');
        return 1;
      }
      format = normalized;
    }
    stdout(renderFeatureCatalog(format));
    return 0;
  }

  if (args[0] === "setup") {
    if (args[1] === "--help" || args[1] === "-h") { stdout(SETUP_USAGE); return 0; }
    if (args.length === 1) {
      stdout(`${renderFeatureCatalog("markdown")}Preview only: no files were changed. Install explicitly with fixmap setup --agent <claude|cursor|copilot|agents|all> [--repo <path>].\n`);
      return 0;
    }
    let repoRoot = process.cwd();
    let targets: AgentTarget[] = ["claude", "cursor", "copilot", "agents"];
    let force = false;
    let repoSeen = false;
    let agentSeen = false;
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index];
      if (arg === "--force") { force = true; continue; }
      if (arg?.startsWith("--repo=")) {
        if (repoSeen) { stderr(`Pass --repo only once.\n\n${SETUP_USAGE}`); return 1; }
        const value = arg.slice("--repo=".length).trim();
        if (!value) { stderr(`--repo requires a directory.\n\n${SETUP_USAGE}`); return 1; }
        repoRoot = expandHomePath(value);
        repoSeen = true;
        continue;
      }
      if (arg === "--repo") {
        if (repoSeen) { stderr(`Pass --repo only once.\n\n${SETUP_USAGE}`); return 1; }
        const value = args[index + 1];
        if (!value?.trim() || value.startsWith("--")) { stderr(`--repo requires a directory.\n\n${SETUP_USAGE}`); return 1; }
        repoRoot = expandHomePath(value.trim());
        repoSeen = true;
        index += 1;
        continue;
      }
      if (arg?.startsWith("--agent=")) {
        if (agentSeen) { stderr(`Pass --agent only once.\n\n${SETUP_USAGE}`); return 1; }
        const value = arg.slice("--agent=".length).trim().toLowerCase();
        if (!["claude", "cursor", "copilot", "agents", "all"].includes(value)) {
          stderr(`--agent must be claude, cursor, copilot, agents, or all.\n\n${SETUP_USAGE}`);
          return 1;
        }
        targets = value === "all" ? ["claude", "cursor", "copilot", "agents"] : [value as AgentTarget];
        agentSeen = true;
        continue;
      }
      if (arg === "--agent") {
        if (agentSeen) { stderr(`Pass --agent only once.\n\n${SETUP_USAGE}`); return 1; }
        const value = args[index + 1]?.trim().toLowerCase();
        if (!value || !["claude", "cursor", "copilot", "agents", "all"].includes(value)) {
          stderr(`--agent must be claude, cursor, copilot, agents, or all.\n\n${SETUP_USAGE}`);
          return 1;
        }
        targets = value === "all" ? ["claude", "cursor", "copilot", "agents"] : [value as AgentTarget];
        agentSeen = true;
        index += 1;
        continue;
      }
      stderr(`Unknown setup option: ${arg}\n\n${SETUP_USAGE}`);
      return 1;
    }
    if (!agentSeen) {
      if (force) {
        stderr(`--force requires an explicit --agent target.\n\n${SETUP_USAGE}`);
        return 1;
      }
      stdout(`${renderFeatureCatalog("markdown")}Preview only: no files were changed. Install explicitly with fixmap setup --agent <claude|cursor|copilot|agents|all> [--repo <path>].\n`);
      return 0;
    }
    try {
      const installed = await installAgentCommands({ repoRoot, targets, force });
      stdout(`${installed.map((entry) => `${entry.status}: ${entry.path}`).join("\n")}\n\nType /fixmap in a supported agent to open the full FixMap feature menu.\n`);
      return 0;
    } catch (error) {
      stderr(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  if (args[0] === "validate") {
    if (args[1] === "--help" || args[1] === "-h") { stdout(VALIDATE_USAGE); return 0; }
    let reportPath: string | undefined;
    let format: "markdown" | "json" = "markdown";
    let formatSeen = false;
    for (let index = 1; index < args.length; index += 1) {
      const arg = args[index]!;
      if (arg === "--format") {
        if (formatSeen) { stderr(`Pass --format only once.\n\n${VALIDATE_USAGE}`); return 1; }
        const value = args[index + 1]?.trim().toLowerCase();
        if (value !== "markdown" && value !== "json") { stderr(`--format must be markdown or json.\n\n${VALIDATE_USAGE}`); return 1; }
        format = value;
        formatSeen = true;
        index += 1;
      } else if (arg.startsWith("--format=")) {
        if (formatSeen) { stderr(`Pass --format only once.\n\n${VALIDATE_USAGE}`); return 1; }
        const value = arg.slice("--format=".length).trim().toLowerCase();
        if (value !== "markdown" && value !== "json") { stderr(`--format must be markdown or json.\n\n${VALIDATE_USAGE}`); return 1; }
        format = value;
        formatSeen = true;
      } else if (arg.startsWith("-") || reportPath) {
        stderr(`Unknown validate argument: ${arg}\n\n${VALIDATE_USAGE}`);
        return 1;
      } else {
        reportPath = expandHomePath(arg);
      }
    }
    if (!reportPath) { stderr(`validate requires a report path.\n\n${VALIDATE_USAGE}`); return 1; }
    try {
      const parsed = JSON.parse(readDecodedTextFile(reportPath)) as unknown;
      const result = validateFixMapReport(parsed, `"${reportPath}"`);
      if (!result.success) { stderr(`${result.message}\n`); return 1; }
      const payload = {
        valid: true,
        path: reportPath,
        reportVersion: result.report.reportVersion ?? "legacy",
        contextFiles: result.report.contextFiles.length
      };
      stdout(format === "json"
        ? `${JSON.stringify(payload, null, 2)}\n`
        : `Valid FixMap report: ${reportPath} (${payload.contextFiles} context files, reportVersion ${payload.reportVersion}).\n`);
      return 0;
    } catch (error) {
      stderr(`Could not validate "${reportPath}": ${describeInputReadError(reportPath, error)}\n`);
      return 1;
    }
  }

  if (args[0] === "benchmark") {
    if (args[1] === "--help" || args[1] === "-h") { stdout(BENCHMARK_USAGE); return 0; }
    let repoRoot = process.cwd();
    let last: number | undefined;
    let format: "markdown" | "json" = "markdown";
    let output: string | undefined;
    const seen = new Set<string>();
    for (let index = 1; index < args.length; index += 1) {
      const raw = args[index]!;
      const separator = raw.indexOf("=");
      const flag = separator === -1 ? raw : raw.slice(0, separator);
      const inline = separator === -1 ? undefined : raw.slice(separator + 1);
      if (!new Set(["--repo", "--last", "--format", "--output"]).has(flag) || seen.has(flag)) {
        stderr(`${seen.has(flag) ? `Pass ${flag} only once.` : `Unknown benchmark option: ${raw}`}\n\n${BENCHMARK_USAGE}`);
        return 1;
      }
      seen.add(flag);
      const following = args[index + 1];
      const value = inline ?? (following && !following.startsWith("-") ? following : undefined);
      if (inline === undefined && value !== undefined) index += 1;
      if (!value?.trim()) { stderr(`${flag} requires a value.\n\n${BENCHMARK_USAGE}`); return 1; }
      if (flag === "--repo") repoRoot = expandHomePath(value.trim());
      else if (flag === "--output") output = expandHomePath(value.trim());
      else if (flag === "--format") {
        const normalized = value.trim().toLowerCase();
        if (normalized !== "markdown" && normalized !== "json") {
          stderr(`--format must be markdown or json.\n\n${BENCHMARK_USAGE}`);
          return 1;
        }
        format = normalized;
      } else {
        const parsed = Number(value);
        if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) {
          stderr(`--last must be a whole number from 1 to 100.\n\n${BENCHMARK_USAGE}`);
          return 1;
        }
        last = parsed;
      }
    }
    if (/^https?:\/\//i.test(repoRoot)) {
      stderr(`benchmark --repo needs a local Git checkout so history cutoffs can be enforced.\n\n${BENCHMARK_USAGE}`);
      return 1;
    }
    try {
      const benchmarkModule = dependencies.benchmarkRepository && dependencies.renderBenchmark
        ? undefined
        : await import("./benchmark.js");
      const result = await (dependencies.benchmarkRepository ?? benchmarkModule!.benchmarkRepository)({
        repoRoot,
        ...(last === undefined ? {} : { last }),
        progress: (message) => {
          if (progressRequested(process.env.FIXMAP_PROGRESS) || process.stderr.isTTY) stderr(`${message}\n`);
        }
      });
      const rendered = format === "json"
        ? `${JSON.stringify(result, null, 2)}\n`
        : (dependencies.renderBenchmark ?? benchmarkModule!.renderRepositoryBenchmark)(result);
      if (output) await (dependencies.writeReport ?? ((path, contents) => writeFile(path, contents, "utf8")))(output, rendered);
      else stdout(rendered);
      return 0;
    } catch (error) {
      stderr(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  if (args[0] === "context") {
    const { runContextCommand } = await import("./analysis-commands.js");
    return runContextCommand(args.slice(1), {
      stdout,
      stderr,
      ...(dependencies.writeReport ? { writeOutput: dependencies.writeReport } : {})
    });
  }

  if (args[0] === "graph") {
    const { runGraphCommand } = await import("./analysis-commands.js");
    return runGraphCommand(args.slice(1), {
      stdout,
      stderr,
      ...(dependencies.writeReport ? { writeOutput: dependencies.writeReport } : {})
    });
  }

  if (args[0] === "workspace") {
    const { runWorkspaceCommand } = await import("./workspace-command.js");
    return runWorkspaceCommand(args.slice(1), {
      stdout,
      stderr,
      ...(dependencies.writeReport ? { writeOutput: dependencies.writeReport } : {})
    });
  }

  if (args[0] === "ask") {
    const { runAskCommand } = await import("./ask-command.js");
    return runAskCommand(args.slice(1), {
      stdout,
      stderr,
      ...(dependencies.writeReport ? { writeOutput: dependencies.writeReport } : {})
    });
  }

  if (args[0] === "migrate") {
    const { runMigrationCommand } = await import("./migration-command.js");
    return runMigrationCommand(args.slice(1), {
      stdout,
      stderr,
      ...(dependencies.writeReport ? { writeOutput: dependencies.writeReport } : {})
    });
  }

  if (args[0] === "reverse-docs") {
    const { runReverseDocsCommand } = await import("./reverse-docs-command.js");
    return runReverseDocsCommand(args.slice(1), {
      stdout,
      stderr,
      ...(dependencies.writeReport ? { writeOutput: dependencies.writeReport } : {})
    });
  }

  if (args[0] === "watch") {
    const { runWatchCommand } = await import("./watch-command.js");
    return runWatchCommand(args.slice(1), {
      stdout,
      stderr,
      watchRepository: dependencies.watchRepository,
      renderWatchUpdate: dependencies.renderWatchUpdate
    });
  }

  if (args[0] === "doctor") {
    if (args[1] === "--help" || args[1] === "-h") { stdout(DOCTOR_USAGE); return 0; }
    const doctorArgs = args.slice(1);
    let doctorFormat: "markdown" | "json" = "markdown";
    if (doctorArgs.length > 0) {
      const match = doctorArgs.length === 2 && doctorArgs[0] === "--format" ? doctorArgs[1] :
        doctorArgs.length === 1 ? doctorArgs[0]?.match(/^--format=(.+)$/)?.[1] : undefined;
      const normalized = match?.trim().toLowerCase();
      if (normalized === "markdown" || normalized === "json") doctorFormat = normalized;
      else { stderr(`Unknown doctor option(s): ${doctorArgs.join(", ")}\n\n${DOCTOR_USAGE}`); return 1; }
    }
    const report = await (dependencies.runDoctor ?? runDoctorChecks)();
    stdout(doctorFormat === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderDoctorReport(report));
    // Non-zero on a detected shadow: a script that runs doctor in CI should fail there,
    // not read the text and carry on.
    return report.healthy ? 0 : 1;
  }

  if ((args[0] === "plan" || args[0] === "verify") && hasStandaloneHelpFlag(args)) {
    stdout(USAGE);
    return 0;
  }

  const options = parseArgs(args);
  if (options.command.startsWith("-")) {
    stderr(withUsageHint(`FixMap needs a subcommand. Try: fixmap plan ${args.join(" ")}`));
    return 1;
  }
  if (options.command !== "plan" && options.command !== "verify") {
    stderr(withUsageHint(`Unknown command: ${options.command || "(none)"}`));
    return 1;
  }
  if (options.invalidValues.length > 0 || options.unknownArgs.length > 0) {
    const sections = [
      options.invalidValues.length > 0
        ? `Invalid option value(s):\n${options.invalidValues.map((value) => `- ${value}`).join("\n")}`
        : "",
      options.unknownArgs.length > 0
        ? `Unknown option(s): ${options.unknownArgs.join(", ")}`
        : "",
      describeMisplacedGlobalFlags(options.unknownArgs)
    ].filter(Boolean);
    stderr(withUsageHint(sections.join("\n")));
    return 1;
  }
  if (options.command === "verify") {
    const planOnly = [options.issueText && "--issue", options.issueFile && "--issue-file", options.comparePath && "--compare", options.limit !== undefined && "--limit", options.exclude.length > 0 && "--exclude", options.explainPath && "--explain", options.semanticModelPath && "--semantic-model"].filter(Boolean);
    if (planOnly.length > 0) { stderr(`verify does not accept plan-only option(s): ${planOnly.join(", ")}.\n`); return 1; }
    const outputCollision = await describeOutputInputCollision(options);
    if (outputCollision) { stderr(`${outputCollision}\n`); return 1; }
    return runVerify(options, {
      stdout,
      stderr,
      writeReport: dependencies.writeReport ?? ((path, contents) => writeFile(path, contents, "utf8"))
    });
  }
  if (options.reportPath) {
    stderr(withUsageHint("--report is a verify option. Did you mean --output to write this plan to a file?"));
    return 1;
  }
  if (options.failOn) {
    stderr(withUsageHint("--fail-on is a verify option. Use it with fixmap verify."));
    return 1;
  }

  const outputCollision = await describeOutputInputCollision(options);
  if (outputCollision) { stderr(`${outputCollision}\n`); return 1; }

  try {
    options.issueText = loadIssueText(options, dependencies.readIssueFile ?? defaultReadIssueFile);
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  // --explain answers two different kinds of question. "Why did this rank where it did?"
  // needs a task to rank against; "was this file even scanned, or is it excluded?" is a
  // property of the repository alone. Requiring a task signal for both made the second
  // unaskable, which is the one you reach for when a file is missing from a report.
  if (!options.issueText && !options.diffSpec && !options.baseRef && !options.workingTree && !options.explainPath) {
    stderr("Provide --issue, --diff, --base/--head, or --working-tree so FixMap has a task signal. Pipe task text directly, or use --issue-file - for explicit stdin.\n");
    return 1;
  }

  if (options.includeUntracked && !options.workingTree) {
    stderr("--include-untracked only applies with --working-tree.\n");
    return 1;
  }
  if (options.workingTree && (options.diffSpec || options.baseRef || options.headRef)) {
    stderr("Use either --working-tree or --diff/--base, not both: they name different sets of changes.\n");
    return 1;
  }
  if (options.diffSpec && (options.baseRef || options.headRef)) {
    stderr("Use either --diff or --base/--head, not both.\n");
    return 1;
  }
  if (options.headRef && !options.baseRef) {
    stderr("--head requires --base; use --diff when you already have a complete range.\n");
    return 1;
  }
  if (options.explainPath && options.comparePath) {
    stderr("Use either --explain or --compare, not both.\n");
    return 1;
  }
  if (/^https?:\/\//i.test(options.repo ?? "") && (options.workingTree || options.includeUntracked)) {
    stderr("--working-tree and --include-untracked need a local checkout; remote URL checkouts are always clean.\n");
    return 1;
  }
  const remoteIssueSource = options.issueText ? tryParseGitHubIssueSource(options.issueText) : undefined;
  const remoteRepository = /^https?:\/\//i.test(options.repo ?? "") || (!options.repo && remoteIssueSource !== undefined);
  if (options.checkoutRef && !remoteRepository) {
    stderr("--ref only applies when --repo is a remote GitHub URL or the issue URL infers one.\n");
    return 1;
  }
  const unsupportedTaskUrl = describeUnsupportedTaskUrl(options.issueText);
  if (unsupportedTaskUrl) { stderr(`${unsupportedTaskUrl}\n`); return 1; }

  if (options.explainPath) {
    // Explaining a ranking needs the scanned repository, not just the finished report,
    // so this runs against a local checkout. Remote mode already excludes anything
    // beyond issue analysis for the same reason.
    if (/^https?:\/\//i.test(options.repo ?? "")) {
      stderr("--explain needs a local checkout; clone the repository and point --repo at the directory.\n");
      return 1;
    }
    try {
      const repoRoot = options.repo ?? process.cwd();
      const repo = await scanRepo({
        repoRoot,
        diffSpec: options.diffSpec,
        baseRef: options.baseRef,
        headRef: options.headRef,
        workingTree: options.workingTree,
        includeUntracked: options.includeUntracked,
        useCache: !options.noCache,
        internalExclude: localPlanArtifactExclusions(options)
      });
      const unresolvedDiff = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
      if (unresolvedDiff && (options.diffSpec || options.baseRef || options.headRef || options.workingTree)) {
        stderr(`${unresolvedDiff.message}\nExplanation needs a resolvable diff to include change evidence.\n`);
        return 1;
      }
      const explanation = await clarifyMissingPath(explainFile(
        repo,
        {
          issueText: options.issueText,
          diffText: repo.diffText,
          // Without this, a file left out by .fixmapignore would be reported as having
          // scored below the cutoff — a false answer to the exact question --explain exists
          // to answer.
          exclude: await resolveExclusions(repoRoot, [
            ...options.exclude,
            ...localPlanArtifactExclusions(options)
          ]),
          limit: options.limit
        },
        options.explainPath
      ), repo, options.explainPath);
      const renderedExplanation = options.format === "json"
        ? `${JSON.stringify(explanation, null, 2)}\n`
        : renderExplanationMarkdown(explanation);
      if (options.output) {
        try {
          await (dependencies.writeReport ?? ((path, contents) => writeFile(path, contents, "utf8")))(
            options.output,
            renderedExplanation
          );
        } catch (error) {
          stderr(formatOutputError(options.output, error, "explanation"));
          return 1;
        }
      } else {
        stdout(renderedExplanation);
      }
      return 0;
    } catch (error) {
      stderr(`${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  }

  let report: FixMapReport;
  try {
    report = await (dependencies.buildReport ?? buildReportForRepository)({
      repo: options.repo,
      issueText: options.issueText,
      diffSpec: options.diffSpec,
      baseRef: options.baseRef,
      headRef: options.headRef,
      checkoutRef: options.checkoutRef,
      workingTree: options.workingTree,
      includeUntracked: options.includeUntracked,
      useCache: !options.noCache,
      limit: options.limit,
      exclude: options.exclude,
      internalExclude: localPlanArtifactExclusions(options),
      semanticModelPath: options.semanticModelPath
    });
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  // An explicitly requested diff that could not be resolved is a failed request, whether or
  // not task text happened to be available to rank from. Exiting 0 with a warning buried in
  // the diagnostics told every script and agent checking `$?` that the named diff had been
  // applied, and the report says `changedFiles: []` with no way to tell the two apart.
  const diffFailure = report.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
  const changeRequested = Boolean(options.diffSpec || options.baseRef || options.headRef || options.workingTree);
  // The report is still written and still useful, so it is not suppressed — but the exit
  // code has to say the request failed. Reporting success told every script checking `$?`
  // that the named diff had been applied, and `changedFiles: []` reads identically whether
  // the diff was empty or never resolved.
  const unresolvedChangeRequest = Boolean(diffFailure) && changeRequested;
  if (unresolvedChangeRequest && options.issueText) {
    stderr(
      `${diffFailure!.message}\n` +
      "This plan ranks from the task text alone and is not diff-aware. " +
      "Fix the ref, or drop the change option to ask for a task-text plan deliberately.\n"
    );
  }

  if (!options.issueText) {
    if (diffFailure) {
      stderr(
        `${diffFailure.message}\n` +
        "No --issue text was provided to fall back to, so this report would be empty. Fix the ref or add --issue.\n"
      );
      return 1;
    }
    if (report.changedFiles.length === 0) {
      stderr(
        (options.workingTree
          ? "The working tree has zero selected changes and no --issue text was provided. Make a tracked change, add --include-untracked, or add --issue.\n"
          : "The requested diff resolved to zero changed files and no --issue text was provided. Choose a non-empty diff or add --issue.\n")
      );
      return 1;
    }
  }

  // The habit worth having: plan, add the identifier the task was missing, re-plan, and
  // check whether the real file rose. When comparing, the delta is the answer — the full
  // report is what the reader already has from the previous run.
  if (options.comparePath) {
    let previous: FixMapReport;
    let previousText: string;
    try {
      previousText = readDecodedTextFile(options.comparePath);
    } catch (error) {
      stderr(
        `Could not read comparison file "${options.comparePath}": ${describeInputReadError(options.comparePath, error)}\n` +
        "Save one first with: fixmap plan --issue \"...\" --format json --output plan.json\n"
      );
      return 1;
    }
    if (!previousText.trim()) {
      stderr(`Comparison file "${options.comparePath}" is empty. Save a JSON plan with --format json first.\n`);
      return 1;
    }
    if (/^\s*#\s*FixMap/i.test(previousText)) {
      stderr(`"${options.comparePath}" is a Markdown report. --compare requires the JSON plan saved with --format json.\n`);
      return 1;
    }
    try {
      previous = JSON.parse(previousText) as FixMapReport;
    } catch (error) {
      stderr(`"${options.comparePath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
    const loaded = validateFixMapReport(previous, `"${options.comparePath}"`);
    if (!loaded.success) {
      stderr(`${loaded.message}\n`);
      return 1;
    }
    previous = loaded.report;
    if (unresolvedChangeRequest) {
      stderr("The current plan lost its requested diff signal, so it was not compared with the saved plan. Fix the ref and rerun.\n");
      return 1;
    }

    const comparison = compareReports(previous, report);
    const renderedComparison = options.format === "json"
        ? `${JSON.stringify(comparison, null, 2)}\n`
        : renderComparisonMarkdown(comparison);
    if (options.output) {
      try { await (dependencies.writeReport ?? ((path, contents) => writeFile(path, contents, "utf8")))(options.output, renderedComparison); }
      catch (error) { stderr(formatOutputError(options.output, error, "comparison")); return 1; }
      // The file holds the comparison, not the plan that produced it — so the obvious next
      // loop, comparing again against this run, needs a plan that was never saved. Saying so
      // beats discovering it one run later.
      stderr(
        `Wrote the comparison to "${options.output}". The plan itself was not saved; ` +
        "rerun without --compare and with --output to keep it as the baseline for the next comparison.\n"
      );
    } else stdout(renderedComparison);
    // Telling someone to inspect what entered, moved or changed confidence when nothing did
    // reads as though the output were misread. An unchanged comparison is a real answer: the
    // task edit made no difference, and the next move is a different edit, not a closer look.
    const moved = comparison.entered.length + comparison.left.length +
      comparison.moved.length + comparison.confidenceChanged.length;
    stderr(moved === 0
      ? "\nComparison complete. Nothing entered, left, moved, or changed confidence — that task edit did not affect the ranking. Try naming a symbol, error string, or path from the file you expect.\n"
      : "\nComparison complete. Refine the task or inspect the files that entered, moved, or changed confidence, then rerun the plan.\n");
    return unresolvedChangeRequest ? 1 : 0;
  }

  const rendered = options.format === "json"
    ? renderJsonReport(report)
    : options.format === "agent"
      ? renderAgentReport(report)
      : renderMarkdownReport(report);
  if (options.output) {
    try {
      await (dependencies.writeReport ?? ((path, contents) => writeFile(path, contents, "utf8")))(
        options.output,
        rendered
      );
    } catch (error) {
      stderr(formatOutputError(options.output, error, "report"));
      return 1;
    }
  } else {
    stdout(rendered);
  }

  const hint = nextCommandHint(options, report);
  if (hint) {
    stderr(hint);
  }

  return unresolvedChangeRequest ? 1 : 0;
}

/**
 * Names the command that helps next, on stderr so the report itself stays clean for
 * pipes, files, JSON consumers, and the Action comment.
 *
 * Only one hint, only when it applies. A feature nobody discovers may as well not
 * exist, but a banner on every run is noise — so this speaks when the situation makes
 * the suggestion obviously useful and stays quiet otherwise.
 */
function nextCommandHint(options: CliOptions, report: FixMapReport): string | undefined {
  if (report.contextFiles.length === 0 || report.analysis?.grounding.specificity === "vague") {
    return `\n${report.analysis?.nextAction ?? "Add a concrete repository anchor and rerun FixMap."}\n`;
  }

  const leading = report.contextFiles[0];
  if (leading?.confidence === "low" || report.analysis?.ranking.clustered === true) {
    return `\n${report.analysis?.nextAction ?? "Refine the task with a concrete symbol, error, or path before editing."}\n`;
  }

  if (options.output && options.format === "json") {
    const remoteIssue = options.issueText ? parseGitHubIssueSource(options.issueText) : undefined;
    const remoteRepo = /^https?:\/\//i.test(options.repo ?? "") || (remoteIssue && !options.repo);
    const repo = remoteRepo
      ? " --repo <local-checkout>"
      : options.repo
        ? ` --repo ${quoteCliValue(options.repo)}`
        : "";
    const prefix = remoteRepo
      ? "\nAfter you clone and edit the scanned repository, check it against this plan:\n"
      : "\nAfter you make the change, check it against this plan:\n";
    const command = `  fixmap verify --report ${quoteCliValue(options.output)}`;

    // An issue-only plan has no base to name. Inventing one was #110; printing the
    // placeholder `<base>...HEAD` inside a copy-paste command replaced that with a line
    // that looks runnable and is not. Keep the command runnable-as-printed and put the
    // part the user must supply on its own line, outside it.
    if (options.workingTree) {
      return `${prefix}${command} --working-tree${options.includeUntracked ? " --include-untracked" : ""}${repo}\n`;
    }

    const diff = options.diffSpec ??
      (options.baseRef ? `${options.baseRef}...${options.headRef ?? "HEAD"}` : undefined);
    if (!diff) {
      return `${prefix}${command}${repo}\n` +
        "Add --diff with the range holding your edit, such as HEAD~1...HEAD.\n";
    }
    return `${prefix}${command} --diff ${diff}${repo}\n`;
  }

  return undefined;
}

/**
 * The common first run should read like a destination, not parser plumbing. A canonical
 * GitHub issue/PR URL and GitHub's familiar owner/repository#number shorthand both mean
 * `plan --issue`; every existing explicit command remains valid.
 */
/**
 * Reprinting the whole USAGE block put the one line that mattered thirty lines above the
 * cursor, and PowerShell's NativeCommandError wrapping buried it further. The cause comes
 * first and the full block stays one flag away; FIXMAP_VERBOSE_USAGE=1 restores it inline
 * for anyone who was relying on it.
 */
function withUsageHint(message: string): string {
  return progressRequested(process.env.FIXMAP_VERBOSE_USAGE)
    ? `${message}\n\n${USAGE}`
    : `${message}\n\nRun "fixmap --help" for the full usage, or set FIXMAP_VERBOSE_USAGE=1 to print it with every error.\n`;
}

/**
 * `--version` and `--help` are real flags that simply do not belong after a subcommand.
 * "Unknown option" is true of the position and false of the flag, which reads as though
 * FixMap has no such option at all.
 */
function describeMisplacedGlobalFlags(unknownArgs: string[]): string {
  const misplaced = unknownArgs.filter((arg) => ["--version", "-v", "--help", "-h"].includes(arg));
  if (misplaced.length === 0) return "";
  const canonical = misplaced[0] === "--help" || misplaced[0] === "-h" ? "--help" : "--version";
  return `${misplaced.join(", ")} ${misplaced.length === 1 ? "is a global flag" : "are global flags"}, not a plan option. Run "fixmap ${canonical}" instead.`;
}

export function expandIssueShorthand(args: string[]): string[] {
  const first = args[0]?.trim();
  if (!first) return args;

  // Any GitHub host we might normalize routes through plan, whether or not it parses:
  // a malformed one should receive plan's specific URL guidance, not "unknown command".
  if (/^https?:\/\/(?:www\.|api\.)?github\.com\//i.test(first)) {
    return ["plan", "--issue", first, ...args.slice(1)];
  }

  const shorthand = first.match(/^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]+)#([1-9]\d*)$/);
  if (!shorthand) return args;

  const [, owner, repository, number] = shorthand;
  if (!/[A-Za-z]/.test(owner ?? "")) return ["plan", "--issue", first, ...args.slice(1)];
  return ["plan", "--issue", `https://github.com/${owner}/${repository}/issues/${number}`, ...args.slice(1)];
}

// --exclude is deliberately absent: it is the one flag that accumulates, because naming
// several directories to leave out is the normal way to use it.
const SINGLE_VALUE_FLAGS = new Set([
  "--issue",
  "--issue-file",
  "--diff",
  "--base",
  "--head",
  "--ref",
  "--repo",
  "--semantic-model",
  "--format",
  "--report",
  "--explain",
  "--compare",
  "--limit",
  "--fail-on",
  "--output"
]);
const BOOLEAN_FLAGS = new Set(["--working-tree", "--include-untracked", "--no-cache"]);

function hasStandaloneHelpFlag(args: string[]): boolean {
  for (let index = 1; index < args.length; index += 1) {
    const raw = args[index] ?? "";
    if (raw === "--help" || raw === "-h") return true;
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    if (separator === -1 && (SINGLE_VALUE_FLAGS.has(flag) || flag === "--exclude")) index += 1;
  }
  return false;
}

function isKnownOptionToken(value: string): boolean {
  const separator = value.indexOf("=");
  const flag = separator === -1 ? value : value.slice(0, separator);
  return SINGLE_VALUE_FLAGS.has(flag) || BOOLEAN_FLAGS.has(flag) || flag === "--exclude" || flag === "--help" || flag === "-h";
}

export const MAX_CONTEXT_FILE_LIMIT = 20;

export function parseArgs(args: string[]): CliOptions {
  const command = args[0] ?? "";
  let issueText = "";
  let issueFile: string | undefined;
  let repo: string | undefined;
  let diffSpec: string | undefined;
  let baseRef: string | undefined;
  let headRef: string | undefined;
  let checkoutRef: string | undefined;
  let format: "markdown" | "json" | "agent" = "markdown";
  let output: string | undefined;
  let explainPath: string | undefined;
  let reportPath: string | undefined;
  let comparePath: string | undefined;
  let limit: number | undefined;
  let failOn: "error" | "warning" | undefined;
  let workingTree = false;
  let includeUntracked = false;
  let noCache = false;
  let semanticModelPath: string | undefined;
  const exclude: string[] = [];
  const unknownArgs: string[] = [];
  const invalidValues: string[] = [];
  const flagCounts = new Map<string, number>();

  for (let index = 1; index < args.length; index += 1) {
    const rawArg = args[index];
    if (!rawArg) {
      continue;
    }

    const separatorIndex = rawArg.indexOf("=");
    const arg = separatorIndex === -1 ? rawArg : rawArg.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : rawArg.slice(separatorIndex + 1);
    const followingValue = args[index + 1];
    const canConsumeFollowing =
      inlineValue === undefined &&
      followingValue !== undefined &&
      (!followingValue.startsWith("-") ||
        (arg === "--issue" && !isKnownOptionToken(followingValue)) ||
        (arg === "--limit" && /^-\d/.test(followingValue)) ||
        ((arg === "--issue" || arg === "--issue-file") && followingValue === "-"));
    const value = inlineValue ?? (canConsumeFollowing ? followingValue : undefined);
    const consumeValue = () => {
      if (canConsumeFollowing) {
        index += 1;
      }
    };

    // Every one of these takes a single value, so a repeat is a mistake rather than a
    // refinement. Silently keeping the last one is worst for --repo, which then scans a
    // different tree than the one the user named first, and --format, which hands the
    // consumer a contract it did not ask for.
    if (SINGLE_VALUE_FLAGS.has(arg)) {
      const occurrence = (flagCounts.get(arg) ?? 0) + 1;
      flagCounts.set(arg, occurrence);
      if (occurrence > 1) {
        consumeValue();
        invalidValues.push(`pass only one ${arg} value`);
        continue;
      }
    }

    if (arg === "--issue") {
      consumeValue();
      if (value?.trim()) issueText = value;
      else invalidValues.push('--issue requires non-empty text or a GitHub issue URL');
    } else if (arg === "--issue-file") {
      consumeValue();
      if (value?.trim()) issueFile = expandHomePath(value.trim());
      else invalidValues.push("--issue-file requires a UTF-8 file path or - for stdin");
    } else if (arg === "--diff") {
      consumeValue();
      if (value?.trim()) diffSpec = value.trim();
      else invalidValues.push("--diff requires a non-empty git diff spec");
    } else if (arg === "--base") {
      consumeValue();
      if (value?.trim()) baseRef = value.trim();
      else invalidValues.push("--base requires a non-empty git ref");
    } else if (arg === "--head") {
      consumeValue();
      if (value?.trim()) headRef = value.trim();
      else invalidValues.push("--head requires a non-empty git ref");
    } else if (arg === "--ref") {
      consumeValue();
      if (value?.trim() && isSafeGitRefName(value.trim())) {
        checkoutRef = value.trim();
      } else {
        invalidValues.push("--ref requires a safe branch or tag name");
      }
    } else if (arg === "--repo") {
      consumeValue();
      if (value?.trim()) repo = expandHomePath(value.trim());
      else invalidValues.push("--repo requires a local path or public GitHub repository URL");
    } else if (arg === "--semantic-model") {
      consumeValue();
      if (value?.trim()) semanticModelPath = expandHomePath(value.trim());
      else invalidValues.push("--semantic-model requires a local model directory");
    } else if (arg === "--format") {
      consumeValue();
      const normalized = value?.trim().toLowerCase();
      if (normalized === "markdown" || normalized === "json" || normalized === "agent") {
        format = normalized;
      } else {
        invalidValues.push(`--format received ${JSON.stringify(value ?? "(missing)")}; expected "markdown", "json", or "agent"`);
      }
    } else if (arg === "--report") {
      consumeValue();
      if (value?.trim()) reportPath = expandHomePath(value.trim());
      else invalidValues.push("--report requires a path to a FixMap JSON report");
    } else if (arg === "--explain") {
      consumeValue();
      if (value?.trim()) explainPath = value.trim();
      else invalidValues.push("--explain requires a repository-relative file path");
    } else if (arg === "--compare") {
      consumeValue();
      if (value?.trim()) comparePath = expandHomePath(value.trim());
      else invalidValues.push("--compare requires a path to an earlier FixMap JSON report");
    } else if (arg === "--exclude") {
      consumeValue();
      if (value?.trim()) exclude.push(value.trim());
      else invalidValues.push("--exclude requires a path or glob pattern");
    } else if (arg === "--limit") {
      consumeValue();
      const normalized = value?.trim() ?? "";
      const parsed = Number(normalized);
      if (/^\d+$/.test(normalized) && Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_CONTEXT_FILE_LIMIT) {
        limit = parsed;
      } else {
        invalidValues.push(
          `--limit received ${JSON.stringify(value ?? "(missing)")}; expected a whole number from 1 to ${MAX_CONTEXT_FILE_LIMIT}`
        );
      }
    } else if (arg === "--fail-on") {
      consumeValue();
      const normalized = value?.trim().toLowerCase();
      if (normalized === "error" || normalized === "warning") failOn = normalized;
      else invalidValues.push(`--fail-on received ${JSON.stringify(value ?? "(missing)")}; expected "error" or "warning"`);
    } else if (arg === "--working-tree") {
      if (flagCounts.has(arg)) invalidValues.push(`pass ${arg} only once`);
      flagCounts.set(arg, 1);
      if (inlineValue !== undefined) invalidValues.push(`${arg} does not accept a value; pass ${arg} by itself`);
      else workingTree = true;
    } else if (arg === "--include-untracked") {
      if (flagCounts.has(arg)) invalidValues.push(`pass ${arg} only once`);
      flagCounts.set(arg, 1);
      if (inlineValue !== undefined) invalidValues.push(`${arg} does not accept a value; pass ${arg} by itself`);
      else includeUntracked = true;
    } else if (arg === "--no-cache") {
      if (flagCounts.has(arg)) invalidValues.push(`pass ${arg} only once`);
      flagCounts.set(arg, 1);
      if (inlineValue !== undefined) invalidValues.push(`${arg} does not accept a value; pass ${arg} by itself`);
      else noCache = true;
    } else if (arg === "--output") {
      consumeValue();
      if (value?.trim()) output = expandHomePath(value.trim());
      else invalidValues.push("--output requires a non-empty file path");
    } else {
      unknownArgs.push(rawArg);
    }
  }

  return {
    command,
    issueText,
    issueFile,
    repo,
    diffSpec,
    baseRef,
    headRef,
    checkoutRef,
    format,
    output,
    explainPath,
    reportPath,
    comparePath,
    limit,
    failOn,
    exclude,
    workingTree,
    includeUntracked,
    noCache,
    semanticModelPath,
    unknownArgs,
    invalidValues
  };
}

function expandHomePath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) {
    return join(homedir(), value.slice(2));
  }
  return value;
}

/**
 * Inputs and outputs generated by the current FixMap workflow are rich in the task's own
 * vocabulary. If they live inside the scanned checkout, ranking them as repository context
 * creates a self-fulfilling result (`plan.json` explaining why `plan.json` is relevant).
 */
function localPlanArtifactExclusions(options: CliOptions): string[] {
  const remoteIssue = options.issueText ? parseGitHubIssueSource(options.issueText) : undefined;
  const remoteRepository = /^https?:\/\//i.test(options.repo ?? "") || (remoteIssue && !options.repo);
  if (remoteRepository) return [];

  const root = resolve(options.repo ?? process.cwd());
  return [
    options.output,
    options.comparePath,
    options.reportPath,
    options.issueFile === "-" ? undefined : options.issueFile
  ]
    .filter((path): path is string => path !== undefined)
    .map((path) => resolve(path))
    .filter((path) => {
      const distance = relative(root, path);
      return distance !== "" && distance !== ".." && !distance.startsWith(`..${sep}`) && !isAbsolute(distance);
    });
}

/**
 * A workflow input must remain usable after the command finishes. Reading a plan, task, or
 * source file and then writing the result back through the same path silently destroyed the
 * only copy while still exiting zero. Compare both path spelling and filesystem identity so
 * relative aliases, symlinks, and hardlinks receive the same protection.
 */
async function describeOutputInputCollision(options: CliOptions): Promise<string | undefined> {
  if (!options.output) return undefined;

  const inputs: Array<{ flag: string; path: string }> = [];
  if (options.command === "verify" && options.reportPath) {
    inputs.push({ flag: "--report", path: options.reportPath });
  } else {
    if (options.issueFile && options.issueFile !== "-") {
      inputs.push({ flag: "--issue-file", path: options.issueFile });
    }
    if (options.comparePath) {
      inputs.push({ flag: "--compare", path: options.comparePath });
    }
    if (options.explainPath) {
      inputs.push({
        flag: "--explain",
        path: isAbsolute(options.explainPath)
          ? options.explainPath
          : resolve(options.repo ?? process.cwd(), options.explainPath)
      });
    }
  }

  for (const input of inputs) {
    if (await pathsReferToSameFile(options.output, input.path)) {
      return `Refusing to write --output "${options.output}" because it is the same file as ${input.flag} "${input.path}". ` +
        "Choose a different --output path so FixMap does not overwrite its input.";
    }
  }
  return undefined;
}

async function pathsReferToSameFile(leftPath: string, rightPath: string): Promise<boolean> {
  const left = resolve(leftPath);
  const right = resolve(rightPath);
  const normalize = process.platform === "win32"
    ? (path: string) => path.toLowerCase()
    : (path: string) => path;
  if (normalize(left) === normalize(right)) return true;

  try {
    const [leftReal, rightReal] = await Promise.all([realpath(left), realpath(right)]);
    if (normalize(leftReal) === normalize(rightReal)) return true;
  } catch {
    // A missing path cannot already alias an existing input. The command that consumes it
    // will produce the more useful read/write error later.
  }

  try {
    const [leftStat, rightStat] = await Promise.all([stat(left), stat(right)]);
    return leftStat.ino !== 0 && leftStat.dev === rightStat.dev && leftStat.ino === rightStat.ino;
  } catch {
    return false;
  }
}

function loadIssueText(
  options: CliOptions,
  read: (path: string | number) => string | Buffer
): string {
  const path = options.issueFile ?? (options.issueText === "-" ? "-" : undefined);
  if (!path) {
    return options.issueText.trim();
  }
  if (options.issueFile && options.issueText) {
    throw new Error("Use either --issue or --issue-file, not both.");
  }
  const source = path === "-" ? 0 : path;
  let raw: string | Buffer;
  try {
    raw = read(source);
  } catch (error) {
    throw new Error(
      `Could not read issue text from ${path === "-" ? "stdin" : `\"${path}\"`}: ` +
      `${path === "-" ? (error instanceof Error ? error.message : String(error)) : describeInputReadError(path, error)}`
    );
  }
  const text = decodeInputText(raw);
  if (!text.trim()) {
    throw new Error(`Issue text from ${path === "-" ? "stdin" : `\"${path}\"`} was empty.`);
  }
  return text.trim();
}

function defaultReadIssueFile(path: string | number): Buffer {
  return readFileSync(path);
}

function quoteCliValue(value: string): string {
  return formatCliValue(value, process.platform === "win32" ? "powershell" : "posix");
}

function readVersion(): string {
  const path = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  try {
    const packageJson = JSON.parse(readFileSync(path, "utf8")) as { version?: unknown };
    if (typeof packageJson.version !== "string" || !packageJson.version.trim()) {
      throw new Error("the version field is missing or invalid");
    }
    return packageJson.version;
  } catch (error) {
    throw new Error(
      `FixMap could not read its version from "${path}"; the installation looks incomplete: ` +
      `${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Compares a saved plan against the diff that followed it. Both inputs are things the
 * user already has, so nothing is executed and no repository code runs.
 */
async function runVerify(
  options: CliOptions,
  io: {
    stdout: (text: string) => void;
    stderr: (text: string) => void;
    writeReport: (path: string, contents: string) => Promise<void>;
  }
): Promise<number> {
  if (options.includeUntracked && !options.workingTree) {
    io.stderr("--include-untracked only applies with --working-tree.\n");
    return 1;
  }
  if (options.workingTree && (options.diffSpec || options.baseRef || options.headRef)) {
    io.stderr("Use either --working-tree or --diff/--base, not both.\n");
    return 1;
  }
  if (options.diffSpec && (options.baseRef || options.headRef)) {
    io.stderr("Use either --diff or --base/--head, not both.\n");
    return 1;
  }
  if (options.headRef && !options.baseRef) {
    io.stderr("--head requires --base; use --diff when you already have a complete range.\n");
    return 1;
  }
  if (!options.reportPath) {
    const changeSource = !options.diffSpec && !options.baseRef && !options.workingTree
      ? " Also provide --diff, --base/--head, or --working-tree so FixMap can see what changed."
      : "";
    io.stderr(`Provide --report with the JSON report this change was planned from.${changeSource}\n`);
    return 1;
  }
  if (!options.diffSpec && !options.baseRef && !options.workingTree) {
    io.stderr("Provide --diff, --base/--head, or --working-tree so FixMap can see what changed.\n");
    return 1;
  }
  if (/^https?:\/\//i.test(options.repo ?? "")) {
    io.stderr("verify needs a local checkout; remote mode cannot resolve a diff.\n");
    return 1;
  }

  let reportText: string;
  try {
    reportText = readDecodedTextFile(options.reportPath);
  } catch (error) {
    io.stderr(
      `Could not read "${options.reportPath}": ${describeInputReadError(options.reportPath, error)}\n` +
      "Generate one with: fixmap plan --issue \"...\" --format json --output plan.json\n"
    );
    return 1;
  }
  // --compare already detected this and said so plainly; verify raised a raw
  // `Unexpected token '#'` from JSON.parse, which describes the parser rather than the
  // mistake. Passing the markdown report is the obvious thing to try first.
  if (/^\s*#\s*FixMap/i.test(reportText)) {
    io.stderr(
      `"${options.reportPath}" is a Markdown report. verify --report requires the JSON plan saved with --format json.\n` +
      "Generate one with: fixmap plan --issue \"...\" --format json --output plan.json\n"
    );
    return 1;
  }

  let report: FixMapReport;
  try {
    report = JSON.parse(reportText) as FixMapReport;
  } catch (error) {
    io.stderr(
      `"${options.reportPath}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}\n` +
      "Generate one with: fixmap plan --issue \"...\" --format json --output plan.json\n"
    );
    return 1;
  }
  if (!Array.isArray(report.contextFiles)) {
    if (isReportComparison(report)) {
      io.stderr(
        `"${options.reportPath}" is a FixMap comparison result, not a plan report. ` +
        "Pass the original JSON plan written by fixmap plan --format json.\n"
      );
      return 1;
    }
    io.stderr(`"${options.reportPath}" is not a FixMap JSON report: no contextFiles array.\n`);
    return 1;
  }
  const loaded = validateFixMapReport(report, `"${options.reportPath}"`);
  if (!loaded.success) {
    io.stderr(`${loaded.message}\n`);
    return 1;
  }
  report = loaded.report;

  try {
    const repo = await scanRepo({
      repoRoot: options.repo ?? process.cwd(),
      diffSpec: options.diffSpec,
      baseRef: options.baseRef,
      headRef: options.headRef,
      workingTree: options.workingTree,
      includeUntracked: options.includeUntracked,
      useCache: !options.noCache,
      includeHistory: true,
      internalExclude: localPlanArtifactExclusions(options)
    });
    const unresolvedDiff = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
    if (unresolvedDiff) {
      io.stderr(`${unresolvedDiff.message}\nVerification needs a resolvable diff to compare against.\n`);
      return 1;
    }

    const result = verifyPlan(report, repo);
    const rendered = options.format === "json"
      ? `${JSON.stringify(result, null, 2)}\n`
      : renderVerifyMarkdown(result);
    if (options.output) {
      try {
        await io.writeReport(options.output, rendered);
      } catch (error) {
        io.stderr(
          formatOutputError(options.output, error, "verification")
        );
        return 1;
      }
    } else {
      io.stdout(rendered);
    }
    // A generated-location edit is discarded by the next build, so it fails the command
    // rather than being reported and ignored. Everything else is advisory.
    const failOn = options.failOn ?? "error";
    return result.findings.some((finding) =>
      finding.severity === "error" || (failOn === "warning" && finding.severity === "warning")
    ) ? 1 : 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function isReportComparison(candidate: unknown): boolean {
  if (typeof candidate !== "object" || candidate === null || Array.isArray(candidate)) return false;
  const record = candidate as Record<string, unknown>;
  return ["entered", "left", "moved", "confidenceChanged", "unchanged"]
    .every((key) => Array.isArray(record[key]));
}

function describeUnsupportedTaskUrl(issueText: string): string | undefined {
  const value = issueText.trim();
  // `tryParse`, not `parse` — this is a boolean probe, and the throwing variant printed a
  // Node stack here for URLs it could not classify instead of this one-line message.
  if (!/^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(value) || tryParseGitHubIssueSource(value)) return undefined;
  return "Unsupported task URL. Use a public GitHub issue or pull request URL such as " +
    "https://github.com/owner/repository/issues/123 or /pull/123, or pass descriptive task text. " +
    "The URL must use https. A ?query, #fragment, and a www. or api. host are accepted and normalized; " +
    "other hosts, credentials and ports are not.";
}

function formatOutputError(path: string, error: unknown, kind: string): string {
  const candidate = error as { code?: string; message?: string };
  const guidance = candidate?.code === "EISDIR"
    ? " The output path must name a file, not a directory."
    : candidate?.code === "ENOENT"
      ? " Create the parent directory first, then retry."
      : "";
  return `Could not write ${kind} to "${path}": ${candidate?.message ?? String(error)}.${guidance}\n`;
}
