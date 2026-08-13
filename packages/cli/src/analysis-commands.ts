import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { resolve } from "node:path";
import {
  buildFixMapGraph,
  renderContextPackMarkdown,
  renderFixMapGraphMermaid,
  type ContextPack,
  type FixMapGraph
} from "@aryam/fixmap-core";
import { analyzeRepository, contextFromAnalysis, type AnalysisSourceInput, type AnalyzedRepository } from "./analysis-source.js";
import { isSafeGitRefName, parseRepositorySource, tryParseGitHubIssueSource } from "./repository-source.js";

const CONTEXT_USAGE = `Usage: fixmap context --issue <text|public-url> [--repo <path|public-url>] [--budget <256-200000>] [--format markdown|json] [--output <file>]\n       fixmap context --working-tree [--include-untracked] [--repo <local-path>] [--budget <tokens>]\n\nBuilds a deterministic, task-aware source package from primary and impact files. The budget applies to estimated source tokens; FixMap never executes repository code or calls a model.\n`;
const GRAPH_USAGE = `Usage: fixmap graph --issue <text|public-url> [--repo <path|public-url>] [--format mermaid|json] [--output <file>]\n       fixmap graph --working-tree [--include-untracked] [--repo <local-path>]\n\nExports the evidence-backed Impact Graph as Mermaid or structured JSON.\n`;

type CommandIo = {
  stdout: (text: string) => void;
  stderr: (text: string) => void;
  writeOutput?: (path: string, contents: string) => Promise<void>;
  analyze?: (input: AnalysisSourceInput) => Promise<AnalyzedRepository>;
};

type ParsedAnalysisArgs = AnalysisSourceInput & {
  format: string;
  output?: string | undefined;
  budget: number;
};

export async function runContextCommand(args: string[], io: CommandIo): Promise<number> {
  if (args[0] === "--help" || args[0] === "-h") { io.stdout(CONTEXT_USAGE); return 0; }
  const options = parseAnalysisArgs(args, "context", io.stderr);
  if (!options) return 1;
  try {
    const analysis = await (io.analyze ?? analyzeRepository)({ ...options, internalExclude: options.output ? [options.output] : [] });
    const pack = contextFromAnalysis(analysis, options.budget);
    const rendered = options.format === "json" ? `${JSON.stringify(pack, null, 2)}\n` : renderContextPackMarkdown(pack);
    await emit(rendered, options.output, io);
    return pack.snippets.length > 0 ? 0 : 1;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export async function runGraphCommand(args: string[], io: CommandIo): Promise<number> {
  if (args[0] === "--help" || args[0] === "-h") { io.stdout(GRAPH_USAGE); return 0; }
  const options = parseAnalysisArgs(args, "graph", io.stderr);
  if (!options) return 1;
  try {
    const analysis = await (io.analyze ?? analyzeRepository)({ ...options, internalExclude: options.output ? [options.output] : [] });
    const graph = buildFixMapGraph(analysis.report);
    const rendered = options.format === "json" ? `${JSON.stringify(graph, null, 2)}\n` : renderFixMapGraphMermaid(graph);
    await emit(rendered, options.output, io);
    return graph.nodes.length > 0 ? 0 : 1;
  } catch (error) {
    io.stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function parseAnalysisArgs(
  args: string[],
  command: "context" | "graph",
  stderr: (text: string) => void
): ParsedAnalysisArgs | undefined {
  const usage = command === "context" ? CONTEXT_USAGE : GRAPH_USAGE;
  const valueFlags = new Set([
    "--issue", "--repo", "--ref", "--format", "--output", "--limit", "--exclude", "--diff", "--base", "--head",
    ...(command === "context" ? ["--budget"] : [])
  ]);
  const booleanFlags = new Set(["--working-tree", "--include-untracked", "--no-cache"]);
  const seen = new Set<string>();
  const options: ParsedAnalysisArgs = {
    format: command === "context" ? "markdown" : "mermaid",
    budget: 10_000,
    useCache: true,
    exclude: []
  };

  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index]!;
    const separator = raw.indexOf("=");
    const flag = separator === -1 ? raw : raw.slice(0, separator);
    const inline = separator === -1 ? undefined : raw.slice(separator + 1);
    if (!valueFlags.has(flag) && !booleanFlags.has(flag)) {
      stderr(`Unknown ${command} option: ${raw}\n\n${usage}`);
      return undefined;
    }
    if (flag !== "--exclude" && seen.has(flag)) {
      stderr(`Pass ${flag} only once.\n\n${usage}`);
      return undefined;
    }
    seen.add(flag);
    if (booleanFlags.has(flag)) {
      if (inline !== undefined) { stderr(`${flag} does not take a value.\n\n${usage}`); return undefined; }
      if (flag === "--working-tree") options.workingTree = true;
      else if (flag === "--include-untracked") options.includeUntracked = true;
      else options.useCache = false;
      continue;
    }
    const following = args[index + 1];
    const value = inline ?? (following && !following.startsWith("-") ? following : undefined);
    if (inline === undefined && value !== undefined) index += 1;
    if (!value?.trim()) { stderr(`${flag} requires a value.\n\n${usage}`); return undefined; }
    const normalized = value.trim();
    if (flag === "--issue") options.issueText = normalized;
    else if (flag === "--repo") options.repo = expandHomePath(normalized);
    else if (flag === "--ref") {
      if (!isSafeGitRefName(normalized)) {
        stderr(`--ref requires a safe branch or tag name.\n\n${usage}`);
        return undefined;
      }
      options.checkoutRef = normalized;
    }
    else if (flag === "--output") options.output = expandHomePath(normalized);
    else if (flag === "--diff") options.diffSpec = normalized;
    else if (flag === "--base") options.baseRef = normalized;
    else if (flag === "--head") options.headRef = normalized;
    else if (flag === "--exclude") options.exclude!.push(normalized);
    else if (flag === "--format") options.format = normalized.toLowerCase();
    else {
      const parsed = Number(normalized);
      const minimum = flag === "--budget" ? 256 : 1;
      const maximum = flag === "--budget" ? 200_000 : 20;
      if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
        stderr(`${flag} must be a whole number from ${minimum} to ${maximum}.\n\n${usage}`);
        return undefined;
      }
      if (flag === "--budget") options.budget = parsed;
      else options.limit = parsed;
    }
  }

  const formats = command === "context" ? ["markdown", "json"] : ["mermaid", "json"];
  if (!formats.includes(options.format)) {
    stderr(`--format must be ${formats.join(" or ")}.\n\n${usage}`);
    return undefined;
  }
  if (!options.issueText && !options.diffSpec && !options.baseRef && !options.workingTree) {
    stderr(`${command} needs --issue, --diff, --base/--head, or --working-tree.\n\n${usage}`);
    return undefined;
  }
  if (options.includeUntracked && !options.workingTree) {
    stderr(`--include-untracked only applies with --working-tree.\n\n${usage}`);
    return undefined;
  }
  if (options.workingTree && (options.diffSpec || options.baseRef || options.headRef)) {
    stderr(`Use either --working-tree or --diff/--base, not both.\n\n${usage}`);
    return undefined;
  }
  if (options.diffSpec && (options.baseRef || options.headRef)) {
    stderr(`Use either --diff or --base/--head, not both.\n\n${usage}`);
    return undefined;
  }
  if (options.headRef && !options.baseRef) {
    stderr(`--head requires --base.\n\n${usage}`);
    return undefined;
  }
  if (options.checkoutRef) {
    const inferredRepository = options.issueText
      ? tryParseGitHubIssueSource(options.issueText)?.repositoryUrl
      : undefined;
    const repository = parseRepositorySource(options.repo ?? inferredRepository ?? process.cwd());
    if (repository.kind !== "github") {
      stderr(`--ref only applies when --repo is a remote GitHub URL or the issue URL infers one.\n\n${usage}`);
      return undefined;
    }
  }
  return options;
}

async function emit(contents: string, output: string | undefined, io: CommandIo): Promise<void> {
  if (output) await (io.writeOutput ?? ((path, text) => writeFile(path, text, "utf8")))(output, contents);
  else io.stdout(contents);
}

function expandHomePath(path: string): string {
  if (path === "~") return homedir();
  if (path.startsWith("~/") || path.startsWith("~\\")) return resolve(homedir(), path.slice(2));
  return path;
}

export type { ContextPack, FixMapGraph };
