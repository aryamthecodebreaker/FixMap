#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildRiskNotes,
  buildSummary,
  buildTestRoutes,
  rankContextFiles,
  renderJsonReport,
  renderMarkdownReport,
  scanRepo
} from "@fixmap/core";
import type { FixMapReport } from "@fixmap/core";

type CliOptions = {
  command: string;
  issueText: string;
  repoRoot: string;
  diffSpec?: string | undefined;
  baseRef?: string | undefined;
  headRef?: string | undefined;
  format: "markdown" | "json";
  output?: string | undefined;
  unknownArgs: string[];
};

const USAGE = `FixMap maps an issue, prompt, or diff to context files, test routes, and review risks.

Usage:
  fixmap plan --issue "Users cannot reset passwords"
  fixmap plan --diff main...HEAD
  fixmap plan --base main --head HEAD --format json

Options:
  --issue <text>      Issue, prompt, or task description
  --diff <spec>       Git diff spec, such as main...HEAD
  --base <ref>        Base ref for diffing when --diff is not given
  --head <ref>        Head ref for diffing (defaults to HEAD)
  --repo <path>       Repository root to scan (defaults to current directory)
  --format <fmt>      Output format: markdown (default) or json
  --output <file>     Write the report to a file instead of stdout
  --help, -h          Show this help
  --version           Show the FixMap version
`;

const rawArgs = process.argv.slice(2);

if (rawArgs.length === 0 || rawArgs[0] === "help" || rawArgs.includes("--help") || rawArgs.includes("-h")) {
  process.stdout.write(USAGE);
  process.exit(rawArgs.length === 0 ? 1 : 0);
}

if (rawArgs[0] === "--version" || rawArgs[0] === "version") {
  const packageJson = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
  ) as { version: string };
  console.log(packageJson.version);
  process.exit(0);
}

const options = parseArgs(rawArgs);

if (options.command !== "plan") {
  console.error(`Unknown command: ${options.command || "(none)"}\n\n${USAGE}`);
  process.exit(1);
}

if (options.unknownArgs.length > 0) {
  console.error(`Unknown or incomplete option(s): ${options.unknownArgs.join(", ")}\n\n${USAGE}`);
  process.exit(1);
}

if (!options.issueText && !options.diffSpec && !options.baseRef) {
  console.error("Provide --issue, --diff, or --base/--head so FixMap has a task signal.");
  process.exit(1);
}

const repo = await scanRepo({
  repoRoot: options.repoRoot,
  diffSpec: options.diffSpec,
  baseRef: options.baseRef,
  headRef: options.headRef
});
const contextFiles = rankContextFiles(repo, {
  issueText: options.issueText,
  diffText: repo.diffText
});
const contextPaths = contextFiles.map((file) => file.path);
const testRoutes = buildTestRoutes(repo, contextPaths);
const report: FixMapReport = {
  summary: buildSummary(contextFiles.length, testRoutes.length),
  contextFiles,
  testRoutes,
  risks: buildRiskNotes(contextPaths),
  changedFiles: repo.changedFiles
};

const rendered = options.format === "json" ? renderJsonReport(report) : renderMarkdownReport(report);

if (options.output) {
  await writeFile(options.output, rendered, "utf8");
} else {
  process.stdout.write(rendered);
}

function parseArgs(args: string[]): CliOptions {
  const command = args[0] ?? "";
  let issueText = "";
  let repoRoot = process.cwd();
  let diffSpec: string | undefined;
  let baseRef: string | undefined;
  let headRef: string | undefined;
  let format: "markdown" | "json" = "markdown";
  let output: string | undefined;
  const unknownArgs: string[] = [];

  for (let index = 1; index < args.length; index += 1) {
    const rawArg = args[index];
    if (!rawArg) {
      continue;
    }

    const separatorIndex = rawArg.indexOf("=");
    const arg = separatorIndex === -1 ? rawArg : rawArg.slice(0, separatorIndex);
    const inlineValue = separatorIndex === -1 ? undefined : rawArg.slice(separatorIndex + 1);
    const nextValue = inlineValue ?? args[index + 1];
    const consumedNext = inlineValue === undefined;

    if (arg === "--issue" && nextValue) {
      issueText = nextValue;
      index += consumedNext ? 1 : 0;
    } else if (arg === "--diff" && nextValue) {
      diffSpec = nextValue;
      index += consumedNext ? 1 : 0;
    } else if (arg === "--base" && nextValue) {
      baseRef = nextValue;
      index += consumedNext ? 1 : 0;
    } else if (arg === "--head" && nextValue) {
      headRef = nextValue;
      index += consumedNext ? 1 : 0;
    } else if (arg === "--repo" && nextValue) {
      repoRoot = resolve(nextValue);
      index += consumedNext ? 1 : 0;
    } else if (arg === "--format" && (nextValue === "markdown" || nextValue === "json")) {
      format = nextValue;
      index += consumedNext ? 1 : 0;
    } else if (arg === "--output" && nextValue) {
      output = nextValue;
      index += consumedNext ? 1 : 0;
    } else {
      unknownArgs.push(rawArg);
    }
  }

  return {
    command,
    issueText,
    repoRoot,
    diffSpec,
    baseRef,
    headRef,
    format,
    output,
    unknownArgs
  };
}
