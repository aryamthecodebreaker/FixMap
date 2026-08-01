import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compareReports,
  explainFile,
  renderComparisonMarkdown,
  renderExplanationMarkdown,
  renderJsonReport,
  renderVerifyMarkdown,
  resolveExclusions,
  verifyPlan,
  renderMarkdownReport,
  scanRepo,
  type FixMapReport
} from "@aryam/fixmap-core";
import { runDoctorChecks, renderDoctorReport, type DoctorReport } from "./doctor.js";
import {
  buildReportForRepository,
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
  format: "markdown" | "json";
  output?: string | undefined;
  explainPath?: string | undefined;
  reportPath?: string | undefined;
  comparePath?: string | undefined;
  limit?: number | undefined;
  exclude: string[];
  workingTree: boolean;
  includeUntracked: boolean;
  unknownArgs: string[];
  invalidValues: string[];
};

export type CliDependencies = {
  buildReport?: (input: RepositoryPlanInput) => Promise<FixMapReport>;
  readVersion?: () => string;
  runMcpServer?: () => Promise<void>;
  runDoctor?: () => Promise<DoctorReport>;
  stderr?: (text: string) => void;
  stdout?: (text: string) => void;
  writeReport?: (path: string, contents: string) => Promise<void>;
  readIssueFile?: (path: string | number) => string | Buffer;
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
  fixmap plan --diff main...HEAD
  fixmap plan --working-tree --include-untracked --limit 12 --exclude "docs/**"
  fixmap plan --issue "Fix login" --format json --output current.json --compare previous.json
  fixmap plan --base main --head HEAD --format json
  fixmap verify --report fixmap-report.json --diff main...HEAD
  fixmap verify --report fixmap-report.json --working-tree
  fixmap doctor --format json
  fixmap mcp

Commands:
  plan                Generate a FixMap report for a task or diff
  verify              Compare a saved report against the diff that followed it
  doctor              Check the FixMap install for stale global or npx shadows
  mcp                 Run FixMap as an MCP server over stdio for AI coding agents

Options:
  --issue <text|url>  Task text, or a public GitHub issue or pull request URL
  --issue-file <file> Read task text from a UTF-8 or UTF-16 file (use - for stdin)
  --diff <spec>       Git diff spec, such as main...HEAD (the repository scan can still rank untracked candidates)
  --base <ref>        Base ref for diffing when --diff is not given
  --head <ref>        Head ref for diffing (defaults to HEAD)
  --working-tree      Map staged and unstaged changes against HEAD
  --include-untracked With --working-tree, also include untracked files
  --repo <source>     Local path or public GitHub HTTPS URL (defaults to current directory)
  --limit <n>         Maximum context files to report (default 8, max 20)
  --exclude <glob>    Path pattern to leave out of ranking (repeatable)
  --format <fmt>      Output format: markdown (default) or json
  --output <file>     Write the report or verification to a file instead of stdout
  --explain <path>    Explain why one file was ranked where it was, or left out
  --compare <file>    Compare this plan against an earlier JSON report
  --report <file>     Verify command only: the JSON report the change was planned from
  --help, -h          Show this help
  --version, -v       Show the FixMap version

A repository may also list exclusion patterns in .fixmapignore, one per line. Supported
syntax is *, **, ?, root-leading /, directory-trailing /, comments, and ! negation.
Set FIXMAP_PROGRESS=1 to print scan and clone phases to stderr.
`;

const DOCTOR_USAGE = `Usage: fixmap doctor [--format markdown|json]\n\nChecks the running FixMap binary, PATH/global shadows, and known install blind spots.\n`;
const MCP_USAGE = `Usage: fixmap mcp\n\nRuns the FixMap MCP server over stdio. Configure your MCP client to execute \"fixmap mcp\".\n`;

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
    stdout(`${(dependencies.readVersion ?? readVersion)()}\n`);
    return 0;
  }
  if (args[0] === "mcp") {
    if (args[1] === "--help" || args[1] === "-h") { stdout(MCP_USAGE); return 0; }
    if (args.length > 1) { stderr(`mcp takes no options.\n\n${MCP_USAGE}`); return 1; }
    const runMcpServer = dependencies.runMcpServer ?? (async () => {
      const module = await import("./mcp.js");
      await module.runMcpServer();
    });
    await runMcpServer();
    return 0;
  }

  if (args[0] === "doctor") {
    if (args[1] === "--help" || args[1] === "-h") { stdout(DOCTOR_USAGE); return 0; }
    const doctorArgs = args.slice(1);
    let doctorFormat: "markdown" | "json" = "markdown";
    if (doctorArgs.length > 0) {
      const match = doctorArgs.length === 2 && doctorArgs[0] === "--format" ? doctorArgs[1] :
        doctorArgs.length === 1 ? doctorArgs[0]?.match(/^--format=(.+)$/)?.[1] : undefined;
      const normalized = match?.toLowerCase();
      if (normalized === "markdown" || normalized === "json") doctorFormat = normalized;
      else { stderr(`Unknown doctor option(s): ${doctorArgs.join(", ")}\n\n${DOCTOR_USAGE}`); return 1; }
    }
    const report = await (dependencies.runDoctor ?? runDoctorChecks)();
    stdout(doctorFormat === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderDoctorReport(report));
    // Non-zero on a detected shadow: a script that runs doctor in CI should fail there,
    // not read the text and carry on.
    return report.healthy ? 0 : 1;
  }

  if ((args[0] === "plan" || args[0] === "verify") && args.slice(1).some((arg) => arg === "--help" || arg === "-h")) {
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
    const planOnly = [options.issueText && "--issue", options.issueFile && "--issue-file", options.comparePath && "--compare", options.limit !== undefined && "--limit", options.exclude.length > 0 && "--exclude", options.explainPath && "--explain"].filter(Boolean);
    if (planOnly.length > 0) { stderr(`verify does not accept plan-only option(s): ${planOnly.join(", ")}.\n`); return 1; }
    return runVerify(options, {
      stdout,
      stderr,
      writeReport: dependencies.writeReport ?? ((path, contents) => writeFile(path, contents, "utf8"))
    });
  }

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
    stderr("Provide --issue, --diff, --base/--head, or --working-tree so FixMap has a task signal.\n");
    return 1;
  }

  if (options.includeUntracked && !options.workingTree) {
    stderr("--include-untracked only applies with --working-tree.\n");
    return 1;
  }
  if (options.workingTree && (options.diffSpec || options.baseRef)) {
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
      const repo = await scanRepo({ repoRoot, diffSpec: options.diffSpec, baseRef: options.baseRef, headRef: options.headRef, workingTree: options.workingTree, includeUntracked: options.includeUntracked });
      const explanation = explainFile(
        repo,
        {
          issueText: options.issueText,
          // Without this, a file left out by .fixmapignore would be reported as having
          // scored below the cutoff — a false answer to the exact question --explain exists
          // to answer.
          exclude: await resolveExclusions(repoRoot, options.exclude),
          limit: options.limit
        },
        options.explainPath
      );
      stdout(
        options.format === "json"
          ? `${JSON.stringify(explanation, null, 2)}\n`
          : renderExplanationMarkdown(explanation)
      );
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
      workingTree: options.workingTree,
      includeUntracked: options.includeUntracked,
      limit: options.limit,
      exclude: options.exclude
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
      previousText = readFileSync(options.comparePath, "utf8");
    } catch (error) {
      stderr(
        `Could not read comparison file "${options.comparePath}": ${error instanceof Error ? error.message : String(error)}\n` +
        "Save one first with: fixmap plan --issue \"...\" --format json --output previous.json\n"
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
    if (!Array.isArray(previous.contextFiles)) {
      stderr(`"${options.comparePath}" is valid JSON but not a FixMap report: no contextFiles array.\n`);
      return 1;
    }

    const comparison = compareReports(previous, report);
    const renderedComparison = options.format === "json"
        ? `${JSON.stringify(comparison, null, 2)}\n`
        : renderComparisonMarkdown(comparison);
    if (options.output) {
      try { await (dependencies.writeReport ?? ((path, contents) => writeFile(path, contents, "utf8")))(options.output, renderedComparison); }
      catch (error) { stderr(formatOutputError(options.output, error, "comparison")); return 1; }
    } else stdout(renderedComparison);
    stderr("\nComparison complete. Refine the task or inspect the files that entered, moved, or changed confidence, then rerun the plan.\n");
    return 0;
  }

  const rendered = options.format === "json" ? renderJsonReport(report) : renderMarkdownReport(report);
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
  "--repo",
  "--format",
  "--report",
  "--explain",
  "--compare",
  "--limit",
  "--output"
]);

export const MAX_CONTEXT_FILE_LIMIT = 20;

export function parseArgs(args: string[]): CliOptions {
  const command = args[0] ?? "";
  let issueText = "";
  let issueFile: string | undefined;
  let repo: string | undefined;
  let diffSpec: string | undefined;
  let baseRef: string | undefined;
  let headRef: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  let explainPath: string | undefined;
  let reportPath: string | undefined;
  let comparePath: string | undefined;
  let limit: number | undefined;
  let workingTree = false;
  let includeUntracked = false;
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
      if (value?.trim()) issueFile = value.trim();
      else invalidValues.push("--issue-file requires a UTF-8 file path or - for stdin");
    } else if (arg === "--diff") {
      consumeValue();
      if (value?.trim()) diffSpec = value;
      else invalidValues.push("--diff requires a non-empty git diff spec");
    } else if (arg === "--base") {
      consumeValue();
      if (value?.trim()) baseRef = value;
      else invalidValues.push("--base requires a non-empty git ref");
    } else if (arg === "--head") {
      consumeValue();
      if (value?.trim()) headRef = value;
      else invalidValues.push("--head requires a non-empty git ref");
    } else if (arg === "--repo") {
      consumeValue();
      if (value?.trim()) repo = value;
      else invalidValues.push("--repo requires a local path or public GitHub repository URL");
    } else if (arg === "--format") {
      consumeValue();
      const normalized = value?.toLowerCase();
      if (normalized === "markdown" || normalized === "json") {
        format = normalized;
      } else {
        invalidValues.push(`--format received ${JSON.stringify(value ?? "(missing)")}; expected "markdown" or "json"`);
      }
    } else if (arg === "--report") {
      consumeValue();
      if (value?.trim()) reportPath = value.trim();
      else invalidValues.push("--report requires a path to a FixMap JSON report");
    } else if (arg === "--explain") {
      consumeValue();
      if (value?.trim()) explainPath = value.trim();
      else invalidValues.push("--explain requires a repository-relative file path");
    } else if (arg === "--compare") {
      consumeValue();
      if (value?.trim()) comparePath = value.trim();
      else invalidValues.push("--compare requires a path to an earlier FixMap JSON report");
    } else if (arg === "--exclude") {
      consumeValue();
      if (value?.trim()) exclude.push(value.trim());
      else invalidValues.push("--exclude requires a path or glob pattern");
    } else if (arg === "--limit") {
      consumeValue();
      const parsed = Number(value);
      if (value?.trim() && Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_CONTEXT_FILE_LIMIT) {
        limit = parsed;
      } else {
        invalidValues.push(
          `--limit received ${JSON.stringify(value ?? "(missing)")}; expected a whole number from 1 to ${MAX_CONTEXT_FILE_LIMIT}`
        );
      }
    } else if (arg === "--working-tree") {
      if (flagCounts.has(arg)) invalidValues.push(`pass ${arg} only once`);
      flagCounts.set(arg, 1);
      workingTree = true;
    } else if (arg === "--include-untracked") {
      if (flagCounts.has(arg)) invalidValues.push(`pass ${arg} only once`);
      flagCounts.set(arg, 1);
      includeUntracked = true;
    } else if (arg === "--output") {
      consumeValue();
      if (value?.trim()) output = value;
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
    format,
    output,
    explainPath,
    reportPath,
    comparePath,
    limit,
    exclude,
    workingTree,
    includeUntracked,
    unknownArgs,
    invalidValues
  };
}

function loadIssueText(
  options: CliOptions,
  read: (path: string | number) => string | Buffer
): string {
  const implicitFile = options.issueText.startsWith("@") ? options.issueText.slice(1) : undefined;
  const path = options.issueFile ?? implicitFile ?? (options.issueText === "-" ? "-" : undefined);
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
      `${error instanceof Error ? error.message : String(error)}`
    );
  }
  const text = decodeIssueText(raw);
  if (!text.trim()) {
    throw new Error(`Issue text from ${path === "-" ? "stdin" : `\"${path}\"`} was empty.`);
  }
  return text.trim();
}

function defaultReadIssueFile(path: string | number): Buffer {
  return readFileSync(path);
}

/** Decode the encodings commonly produced by editors on every supported platform. */
function decodeIssueText(raw: string | Buffer): string {
  if (typeof raw === "string") return raw.replace(/^\uFEFF/, "");
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return raw.subarray(2).toString("utf16le").replace(/^\uFEFF/, "");
  }
  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(raw.length - 2);
    for (let index = 2; index + 1 < raw.length; index += 2) {
      swapped[index - 2] = raw[index + 1]!;
      swapped[index - 1] = raw[index]!;
    }
    return swapped.toString("utf16le").replace(/^\uFEFF/, "");
  }
  return raw.toString("utf8").replace(/^\uFEFF/, "");
}

function quoteCliValue(value: string): string {
  return /\s/.test(value) ? `"${value.replaceAll('"', '\\"')}"` : value;
}

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
  ) as { version: string };
  return packageJson.version;
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

  let report: FixMapReport;
  try {
    report = JSON.parse(readFileSync(options.reportPath, "utf8")) as FixMapReport;
  } catch (error) {
    io.stderr(
      `Could not read "${options.reportPath}": ${error instanceof Error ? error.message : String(error)}\n` +
      "Generate one with: fixmap plan --issue \"...\" --format json --output fixmap-report.json\n"
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

  try {
    const repo = await scanRepo({
      repoRoot: options.repo ?? process.cwd(),
      diffSpec: options.diffSpec,
      baseRef: options.baseRef,
      headRef: options.headRef,
      workingTree: options.workingTree,
      includeUntracked: options.includeUntracked
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
    return result.findings.some((finding) => finding.severity === "error") ? 1 : 0;
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
  if (!/^https?:\/\/\S+$/i.test(value) || tryParseGitHubIssueSource(value)) return undefined;
  return "Unsupported task URL. Use a public GitHub issue or pull request URL such as " +
    "https://github.com/owner/repository/issues/123 or /pull/123, or pass descriptive task text. " +
    "A ?query, #fragment, and a www. or api. host are accepted and normalized; other hosts, credentials and ports are not.";
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
