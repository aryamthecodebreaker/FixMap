import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  renderReviewRoutingMarkdown,
  reviewRoutingWithoutMentions,
  routeReviewers,
  scanRepo,
  validateFixMapReport
} from "@aryam/fixmap-core";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";

export const REVIEWERS_USAGE = `Usage: fixmap reviewers (--report <plan.json> | --diff <spec> | --working-tree) [options]

Preview: suggests reviewers for each changed path from the highest-precedence CODEOWNERS file
(last matching rule wins), active annotation owners, architecture-policy reviewers, and up to
250 non-merge commits. Commit authors go through the repository's .mailmap when one exists.
FixMap never requests reviews or notifies anyone: names are printed without "@". A name is not
evidence of identity, employment, or current availability.

Options:
  --report <file>        Route the changed files (or, if none, the ranked context files) of a saved JSON plan
  --diff <spec>          Route the files changed by a git diff spec, such as main...HEAD
  --working-tree         Route staged and unstaged changes against HEAD
  --no-history-authors   Leave out commit-author suggestions; use only CODEOWNERS, annotations, and policy
  --repo <path>          Local checkout to read (default current directory)
  --no-cache             Bypass repository scan caches
  --format <value>       markdown (default) or json
  --output <file>        Write output to a file instead of stdout
  --help, -h             Show this help
`;

type ParsedReviewers = {
  report?: string;
  diff?: string;
  workingTree: boolean;
  historyAuthors: boolean;
  repo?: string;
  noCache: boolean;
  format: "markdown" | "json";
  output?: string;
};

export async function runReviewersCommand(
  args: string[],
  io: {
    stdout?: (text: string) => void;
    stderr?: (text: string) => void;
    writeOutput?: (path: string, contents: string) => Promise<void>;
    now?: () => string;
  } = {}
): Promise<number> {
  const stdout = io.stdout ?? ((text: string) => process.stdout.write(text));
  const stderr = io.stderr ?? ((text: string) => process.stderr.write(text));
  if (args.includes("--help") || args.includes("-h")) {
    stdout(REVIEWERS_USAGE);
    return 0;
  }
  let parsed: ParsedReviewers;
  try {
    parsed = parseReviewersArgs(args);
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n\n${REVIEWERS_USAGE}`);
    return 1;
  }
  try {
    const reportPaths = parsed.report === undefined ? undefined : readReportPaths(parsed.report);
    const repo = await scanRepo({
      repoRoot: resolve(parsed.repo ?? process.cwd()),
      useCache: !parsed.noCache,
      includeHistory: parsed.historyAuthors,
      ...(parsed.diff !== undefined ? { diffSpec: parsed.diff } : {}),
      ...(parsed.workingTree ? { workingTree: true } : {})
    });
    const scanError = repo.diagnostics.find((diagnostic) => diagnostic.severity === "error");
    if (scanError) throw new Error(scanError.message);
    if (parsed.diff !== undefined) {
      const unresolved = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
      if (unresolved) throw new Error(unresolved.message);
    }
    const result = routeReviewers(repo, {
      changedPaths: reportPaths ?? repo.changedFiles,
      now: (io.now ?? (() => new Date().toISOString()))(),
      includeHistoryAuthors: parsed.historyAuthors
    });
    const rendered = parsed.format === "json"
      ? `${JSON.stringify(reviewRoutingWithoutMentions(result), null, 2)}\n`
      : renderReviewRoutingMarkdown(result);
    if (parsed.output) {
      await (io.writeOutput ?? ((path, contents) => writeFile(path, contents, "utf8")))(parsed.output, rendered);
    } else {
      stdout(rendered);
    }
    return 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

function readReportPaths(path: string): string[] {
  let text: string;
  try {
    text = readDecodedTextFile(path);
  } catch (error) {
    throw new Error(`Could not read "${path}": ${describeInputReadError(path, error)}`);
  }
  if (/^\s*#\s*FixMap/i.test(text)) {
    throw new Error(`"${path}" is a Markdown report. reviewers --report requires the JSON plan saved with --format json.`);
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch (error) {
    throw new Error(`"${path}" is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`);
  }
  const loaded = validateFixMapReport(candidate, `the JSON in ${path}`);
  if (!loaded.success) throw new Error(loaded.message);
  const report = loaded.report;
  return report.changedFiles.length > 0 ? report.changedFiles : report.contextFiles.map((file) => file.path);
}

function parseReviewersArgs(args: string[]): ParsedReviewers {
  const singles = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    if (arg === "--working-tree" || arg === "--no-history-authors" || arg === "--no-cache") {
      if (booleans.has(arg)) throw new Error(`Pass ${arg} only once.`);
      booleans.add(arg);
      continue;
    }
    const equals = arg.match(/^(--[a-z-]+)=(.*)$/);
    const flag = equals?.[1] ?? arg;
    if (!["--report", "--diff", "--repo", "--format", "--output"].includes(flag)) {
      throw new Error(`Unknown reviewers option: ${arg}`);
    }
    const value = equals?.[2] ?? args[++index];
    if (typeof value !== "string" || !value.trim() || (!equals && value.startsWith("--"))) {
      throw new Error(`${flag} requires a non-blank value.`);
    }
    if (singles.has(flag)) throw new Error(`Pass ${flag} only once.`);
    singles.set(flag, value.trim());
  }
  const workingTree = booleans.has("--working-tree");
  const sources = Number(singles.has("--report")) + Number(singles.has("--diff")) + Number(workingTree);
  if (sources !== 1) throw new Error("reviewers needs exactly one of --report, --diff, or --working-tree.");
  const format = singles.get("--format") ?? "markdown";
  if (format !== "markdown" && format !== "json") throw new Error("--format must be markdown or json.");
  const repo = singles.get("--repo");
  if (repo && /^https?:\/\//i.test(repo)) throw new Error("reviewers needs a local checkout; --repo cannot be a URL.");
  const report = singles.get("--report");
  const diff = singles.get("--diff");
  const output = singles.get("--output");
  return {
    ...(report ? { report } : {}),
    ...(diff ? { diff } : {}),
    workingTree,
    historyAuthors: !booleans.has("--no-history-authors"),
    ...(repo ? { repo } : {}),
    noCache: booleans.has("--no-cache"),
    format,
    ...(output ? { output } : {})
  };
}
