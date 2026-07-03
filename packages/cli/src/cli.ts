#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  buildRiskNotes,
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
};

const options = parseArgs(process.argv.slice(2));

if (options.command !== "plan") {
  console.error("Usage: fixmap plan --issue \"...\" [--diff main...HEAD] [--base main --head HEAD] [--repo .] [--format markdown|json] [--output file]");
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
  diffText: options.diffSpec ?? [options.baseRef, options.headRef].filter(Boolean).join(" ")
});
const contextPaths = contextFiles.map((file) => file.path);
const testRoutes = buildTestRoutes(repo, contextPaths);
const report: FixMapReport = {
  summary: `FixMap found ${contextFiles.length} context files and generated ${testRoutes.length} test routes.`,
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

  for (let index = 1; index < args.length; index += 1) {
    const rawArg = args[index];
    if (!rawArg) {
      continue;
    }

    const [arg, inlineValue] = rawArg.split("=", 2);
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
    output
  };
}
