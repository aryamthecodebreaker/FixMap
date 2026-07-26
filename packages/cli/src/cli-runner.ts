import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  explainFile,
  renderJsonReport,
  renderVerifyMarkdown,
  verifyPlan,
  renderMarkdownReport,
  scanRepo,
  type FileExplanation,
  type FixMapReport
} from "@aryam/fixmap-core";
import { buildReportForRepository, type RepositoryPlanInput } from "./repository-source.js";

export type CliOptions = {
  command: string;
  issueText: string;
  repo?: string | undefined;
  diffSpec?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  format: "markdown" | "json";
  output?: string | undefined;
  explainPath?: string | undefined;
  reportPath?: string | undefined;
  unknownArgs: string[];
  invalidValues: string[];
};

export type CliDependencies = {
  buildReport?: (input: RepositoryPlanInput) => Promise<FixMapReport>;
  readVersion?: () => string;
  runMcpServer?: () => Promise<void>;
  stderr?: (text: string) => void;
  stdout?: (text: string) => void;
  writeReport?: (path: string, contents: string) => Promise<void>;
};

export const USAGE = `FixMap maps an issue, prompt, or diff to context files, test routes, and review risks.

Usage:
  fixmap plan --issue "Users cannot reset passwords"
  fixmap plan --issue https://github.com/owner/repository/issues/123
  fixmap plan --issue "Fix login" --repo https://github.com/owner/repository
  fixmap plan --diff main...HEAD
  fixmap plan --base main --head HEAD --format json
  fixmap verify --report fixmap-report.json --diff main...HEAD
  fixmap mcp

Commands:
  plan                Generate a FixMap report for a task or diff
  verify              Compare a saved report against the diff that followed it
  mcp                 Run FixMap as an MCP server over stdio for AI coding agents

Options:
  --issue <text|url>  Issue text, task description, or public GitHub issue URL
  --diff <spec>       Git diff spec, such as main...HEAD
  --base <ref>        Base ref for diffing when --diff is not given
  --head <ref>        Head ref for diffing (defaults to HEAD)
  --repo <source>     Local path or public GitHub HTTPS URL (defaults to current directory)
  --format <fmt>      Output format: markdown (default) or json
  --output <file>     Write the report to a file instead of stdout
  --explain <path>    Explain why one file was ranked where it was, or left out
  --report <file>     Verify command only: the JSON report the change was planned from
  --help, -h          Show this help
  --version, -v       Show the FixMap version
`;

export async function runCli(args: string[], dependencies: CliDependencies = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = dependencies.stderr ?? ((text: string) => process.stderr.write(text));

  if (args.length === 0) {
    stdout(USAGE);
    return 1;
  }
  if (args[0] === "help" || args.includes("--help") || args.includes("-h")) {
    stdout(USAGE);
    return 0;
  }
  if (args[0] === "version" || args.includes("--version") || args.includes("-v")) {
    stdout(`${(dependencies.readVersion ?? readVersion)()}\n`);
    return 0;
  }
  if (args[0] === "mcp") {
    const runMcpServer = dependencies.runMcpServer ?? (async () => {
      const module = await import("./mcp.js");
      await module.runMcpServer();
    });
    await runMcpServer();
    return 0;
  }

  const options = parseArgs(args);
  if (options.command !== "plan" && options.command !== "verify") {
    stderr(`Unknown command: ${options.command || "(none)"}\n\n${USAGE}`);
    return 1;
  }
  if (options.invalidValues.length > 0 || options.unknownArgs.length > 0) {
    const sections = [
      options.invalidValues.length > 0
        ? `Invalid option value(s):\n${options.invalidValues.map((value) => `- ${value}`).join("\n")}`
        : "",
      options.unknownArgs.length > 0
        ? `Unknown option(s): ${options.unknownArgs.join(", ")}`
        : ""
    ].filter(Boolean);
    stderr(`${sections.join("\n")}\n\n${USAGE}`);
    return 1;
  }
  if (options.command === "verify") {
    return runVerify(options, { stdout, stderr });
  }

  if (!options.issueText && !options.diffSpec && !options.baseRef) {
    stderr("Provide --issue, --diff, or --base/--head so FixMap has a task signal.\n");
    return 1;
  }

  if (options.explainPath) {
    // Explaining a ranking needs the scanned repository, not just the finished report,
    // so this runs against a local checkout. Remote mode already excludes anything
    // beyond issue analysis for the same reason.
    if (/^https?:\/\//i.test(options.repo ?? "")) {
      stderr("--explain needs a local checkout; clone the repository and point --repo at the directory.\n");
      return 1;
    }
    try {
      const repo = await scanRepo({ repoRoot: options.repo ?? process.cwd() });
      const explanation = explainFile(repo, { issueText: options.issueText }, options.explainPath);
      stdout(
        options.format === "json"
          ? `${JSON.stringify(explanation, null, 2)}\n`
          : renderExplanation(explanation)
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
      headRef: options.headRef
    });
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  if (!options.issueText) {
    const diffFailure = report.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
    if (diffFailure) {
      stderr(
        `${diffFailure.message}\n` +
        "No --issue text was provided to fall back to, so this report would be empty. Fix the ref or add --issue.\n"
      );
      return 1;
    }
  }

  const rendered = options.format === "json" ? renderJsonReport(report) : renderMarkdownReport(report);
  if (options.output) {
    try {
      await (dependencies.writeReport ?? ((path, contents) => writeFile(path, contents, "utf8")))(
        options.output,
        rendered
      );
    } catch (error) {
      stderr(`Could not write report to "${options.output}": ${error instanceof Error ? error.message : String(error)}\n`);
      return 1;
    }
  } else {
    stdout(rendered);
  }

  const hint = nextCommandHint(options, report);
  if (hint) {
    stderr(hint);
  }

  return 0;
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
  if (options.output && options.format === "json") {
    const diff = options.diffSpec ?? "main...HEAD";
    return `\nAfter you make the change, check it against this plan:\n  fixmap verify --report ${options.output} --diff ${diff}\n`;
  }

  const leading = report.contextFiles[0];
  const weak =
    report.contextFiles.length === 0 ||
    leading?.confidence === "low" ||
    report.analysis?.ranking.clustered === true;
  if (weak) {
    return "\nExpected a file that is not listed? Ask why it was left out:\n  fixmap plan --issue \"<same task>\" --explain <path>\n";
  }

  return undefined;
}

export function parseArgs(args: string[]): CliOptions {
  const command = args[0] ?? "";
  let issueText = "";
  let repo: string | undefined;
  let diffSpec: string | undefined;
  let baseRef: string | undefined;
  let headRef: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  let explainPath: string | undefined;
  let reportPath: string | undefined;
  const unknownArgs: string[] = [];
  const invalidValues: string[] = [];

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
      !followingValue.startsWith("-");
    const value = inlineValue ?? (canConsumeFollowing ? followingValue : undefined);
    const consumeValue = () => {
      if (canConsumeFollowing) {
        index += 1;
      }
    };

    if (arg === "--issue") {
      consumeValue();
      if (value?.trim()) issueText = value;
      else invalidValues.push('--issue requires non-empty text or a GitHub issue URL');
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
      if (value === "markdown" || value === "json") {
        format = value;
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
    repo,
    diffSpec,
    baseRef,
    headRef,
    format,
    output,
    explainPath,
    reportPath,
    unknownArgs,
    invalidValues
  };
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
  io: { stdout: (text: string) => void; stderr: (text: string) => void }
): Promise<number> {
  if (!options.reportPath) {
    io.stderr("Provide --report with the JSON report this change was planned from.\n");
    return 1;
  }
  if (!options.diffSpec && !options.baseRef) {
    io.stderr("Provide --diff or --base/--head so FixMap can see what changed.\n");
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
    io.stderr(`"${options.reportPath}" is not a FixMap JSON report: no contextFiles array.\n`);
    return 1;
  }

  try {
    const repo = await scanRepo({
      repoRoot: options.repo ?? process.cwd(),
      diffSpec: options.diffSpec,
      baseRef: options.baseRef,
      headRef: options.headRef
    });
    const unresolvedDiff = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
    if (unresolvedDiff) {
      io.stderr(`${unresolvedDiff.message}\nVerification needs a resolvable diff to compare against.\n`);
      return 1;
    }

    const result = verifyPlan(report, repo);
    io.stdout(
      options.format === "json"
        ? `${JSON.stringify(result, null, 2)}\n`
        : renderVerifyMarkdown(result)
    );
    // A generated-location edit is discarded by the next build, so it fails the command
    // rather than being reported and ignored. Everything else is advisory.
    return result.findings.some((finding) => finding.severity === "error") ? 1 : 0;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

/** Renders one file's explanation. The summary carries the answer; reasons show the working. */
function renderExplanation(explanation: FileExplanation): string {
  const lines = [`# Why ${explanation.path}`, "", explanation.summary];
  if (explanation.reasons.length > 0) {
    lines.push("", "## Signals", "");
    for (const reason of explanation.reasons) {
      lines.push(`- ${reason}`);
    }
  }
  return `${lines.join("\n")}\n`;
}
