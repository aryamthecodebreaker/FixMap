import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  explainFile,
  renderExplanationMarkdown,
  renderJsonReport,
  renderMarkdownReport,
  renderVerifyMarkdown,
  resolveExclusions,
  scanRepo,
  verifyPlan,
  type FixMapReport
} from "@aryam/fixmap-core";
import {
  buildReportForRepository,
  type RepositorySourceDependencies
} from "./repository-source.js";

export const MAX_MCP_LIMIT = 20;

type PlanArguments = {
  issue?: string;
  diff?: string;
  base?: string;
  head?: string;
  repo?: string;
  format?: "markdown" | "json";
  limit?: number;
  exclude?: string[];
};

type ExplainArguments = {
  path: string;
  issue?: string;
  diff?: string;
  repo?: string;
  exclude?: string[];
  format?: "markdown" | "json";
};

type PlanArgumentsValidation =
  | { success: true; value: PlanArguments }
  | { success: false; message: string };

type VerifyArguments = {
  report: FixMapReport;
  diff?: string;
  base?: string;
  head?: string;
  repo?: string;
  format?: "markdown" | "json";
};

const PLAN_TOOL = {
  name: "fixmap_plan",
  title: "FixMap plan",
  description:
    "Map an issue, prompt, or git diff to the repository files worth reading first, " +
    "the test commands most likely to validate a change, and the areas that deserve review attention. " +
    "Run this before editing code so the change starts from the right context. " +
    "Provide at least one of issue, diff, or base. " +
    // Agents otherwise read a ranked list as a settled answer. On the frozen suites a top
    // result labeled high confidence is the correct fixing file 9 times out of 15, so the
    // ranking is a lead to verify rather than a conclusion. High is also deliberately
    // scarce: it marks the file that led, not every file worth reading.
    "Treat the result as a starting map, not proof the task is valid: check the analysis " +
    "block before editing, and when it reports unresolved or unverified identifiers, vague " +
    "task grounding, an incomplete scan, or a clustered ranking, widen the search or ask for " +
    "clarification instead of assuming the top-ranked file is correct.",
  inputSchema: {
    type: "object" as const,
    properties: {
      issue: {
        type: "string",
        description:
          "Issue text, task description, or public GitHub issue URL. " +
          "A GitHub issue URL supplies the task and infers repo when repo is omitted."
      },
      diff: { type: "string", description: "Git diff spec, such as main...HEAD" },
      base: { type: "string", description: "Base git ref to diff against when diff is not given" },
      head: { type: "string", description: "Head git ref, defaults to HEAD" },
      repo: {
        type: "string",
        description:
          "Local path or public GitHub HTTPS repository URL, defaults to the server working directory. " +
          "GitHub URLs support issue-only analysis and are removed after scanning."
      },
      format: {
        type: "string",
        enum: ["markdown", "json"],
        description: "Report format, markdown by default"
      },
      limit: {
        type: "number",
        description:
          `Maximum context files to return, 1 to ${MAX_MCP_LIMIT}, default 8. ` +
          "Lower it when context budget matters: the useful signal is usually the top one to three."
      },
      exclude: {
        type: "array",
        items: { type: "string" },
        description:
          "Path patterns to leave out of ranking, gitignore-flavored, such as \"apps/web\" or \"docs/**\". " +
          "A .fixmapignore file in the repository is applied as well."
      }
    },
    additionalProperties: false
  }
};

const EXPLAIN_TOOL = {
  name: "fixmap_explain",
  title: "FixMap explain",
  description:
    "Answer why one specific file was ranked where it was, or left out of a plan entirely. " +
    "Use this when a file you expected is missing from fixmap_plan, or when a ranked file looks wrong: " +
    "it separates the cases that actually differ — ranked, scored below the cutoff, tied but outside " +
    "the reported limit, deliberately excluded, or never scanned — instead of leaving you to guess. " +
    "Needs a local checkout, because it re-ranks the repository rather than reading a saved report.",
  inputSchema: {
    type: "object" as const,
    properties: {
      path: {
        type: "string",
        description: "Repository-relative path to explain, such as \"src/auth/reset-password.ts\""
      },
      issue: {
        type: "string",
        description: "The same task signal used for the plan, so the explanation matches that ranking"
      },
      diff: { type: "string", description: "Git diff spec, such as main...HEAD" },
      repo: {
        type: "string",
        description: "Local repository path, defaults to the server working directory. Remote URLs are not supported."
      },
      exclude: {
        type: "array",
        items: { type: "string" },
        description: "The same exclusion patterns used for the plan"
      },
      format: { type: "string", enum: ["markdown", "json"], description: "Output format, markdown by default" }
    },
    required: ["path"],
    additionalProperties: false
  }
};

const VERIFY_TOOL = {
  name: "fixmap_verify",
  title: "FixMap verify",
  description:
    "Compare a FixMap plan with the git diff produced after editing. Flags unplanned files, " +
    "missing test changes, new risk areas, and generated artifacts. Provide the JSON report " +
    "returned by fixmap_plan plus diff or base/head, and run against a local checkout.",
  inputSchema: {
    type: "object" as const,
    properties: {
      report: {
        description:
          "The FixMap report to verify against, either as the JSON object returned by " +
          "fixmap_plan or as a path to a local JSON report file such as \"./fixmap-report.json\". " +
          "Prefer the path when the plan is large.",
        anyOf: [{ type: "object" }, { type: "string" }]
      },
      diff: { type: "string", description: "Git diff spec, such as main...HEAD" },
      base: { type: "string", description: "Base git ref when diff is omitted" },
      head: { type: "string", description: "Head git ref, defaults to HEAD" },
      repo: { type: "string", description: "Local repository path, defaults to the server working directory" },
      format: { type: "string", enum: ["markdown", "json"], description: "Output format, markdown by default" }
    },
    required: ["report"],
    additionalProperties: false
  }
};

export function createFixMapMcpServer(
  repositorySourceDependencies: RepositorySourceDependencies = {}
): Server {
  const server = new Server({ name: "fixmap", version: readVersion() }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [PLAN_TOOL, VERIFY_TOOL, EXPLAIN_TOOL]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === VERIFY_TOOL.name) {
      const parsed = parseVerifyArguments(request.params.arguments ?? {});
      if (!parsed.success) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid arguments: ${parsed.message}` }]
        };
      }
      const args = parsed.value;
      try {
        const repo = await scanRepo({
          repoRoot: args.repo ?? process.cwd(),
          diffSpec: args.diff,
          baseRef: args.base,
          headRef: args.head
        });
        const diffFailure = repo.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
        if (diffFailure) {
          throw new Error(`${diffFailure.message} Verification needs a resolvable diff.`);
        }
        const result = verifyPlan(args.report, repo);
        const text = args.format === "json"
          ? `${JSON.stringify(result, null, 2)}\n`
          : renderVerifyMarkdown(result);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
        };
      }
    }

    if (request.params.name === EXPLAIN_TOOL.name) {
      const parsed = parseExplainArguments(request.params.arguments ?? {});
      if (!parsed.success) {
        return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${parsed.message}` }] };
      }
      const args = parsed.value;
      // Explaining re-ranks the repository rather than reading a saved report, so it needs
      // the tree on disk. Same constraint the CLI states.
      if (/^https?:\/\//i.test(args.repo ?? "")) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: "explain needs a local checkout; clone the repository and point repo at the directory."
          }]
        };
      }
      try {
        const repoRoot = args.repo ?? process.cwd();
        const repo = await scanRepo({ repoRoot, diffSpec: args.diff });
        const explanation = explainFile(
          repo,
          {
            issueText: args.issue,
            diffText: repo.diffText,
            exclude: await resolveExclusions(repoRoot, args.exclude ?? [])
          },
          args.path
        );
        const text = args.format === "json"
          ? `${JSON.stringify(explanation, null, 2)}\n`
          : renderExplanationMarkdown(explanation);
        return { content: [{ type: "text", text }] };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
        };
      }
    }

    if (request.params.name !== PLAN_TOOL.name) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }]
      };
    }

    const parsed = parsePlanArguments(request.params.arguments ?? {});
    if (!parsed.success) {
      return {
        isError: true,
        content: [{ type: "text", text: `Invalid arguments: ${parsed.message}` }]
      };
    }
    const args = parsed.value;
    if (!args.issue && !args.diff && !args.base) {
      return {
        isError: true,
        content: [{ type: "text", text: "Provide issue, diff, or base/head so FixMap has a task signal." }]
      };
    }

    let report: FixMapReport;
    try {
      report = await buildReportForRepository({
        repo: args.repo,
        issueText: args.issue,
        diffSpec: args.diff,
        baseRef: args.base,
        headRef: args.head,
        limit: args.limit,
        exclude: args.exclude
      }, repositorySourceDependencies);
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }]
      };
    }

    if (!args.issue) {
      const diffFailure = report.diagnostics.find((diagnostic) => diagnostic.code === "diff-unavailable");
      if (diffFailure) {
        return {
          isError: true,
          content: [{ type: "text", text: `${diffFailure.message} No issue text was provided to fall back to.` }]
        };
      }
      if (report.changedFiles.length === 0) {
        return {
          isError: true,
          content: [{ type: "text", text: "The requested diff resolved to zero changed files and no issue text was provided." }]
        };
      }
    }

    const text = args.format === "json" ? renderJsonReport(report) : renderMarkdownReport(report);
    return { content: [{ type: "text", text }] };
  });

  return server;
}

export function parsePlanArguments(input: unknown): PlanArgumentsValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, message: "tool arguments must be an object." };
  }

  const record = input as Record<string, unknown>;
  const allowed = new Set(["issue", "diff", "base", "head", "repo", "format", "limit", "exclude"]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return {
      success: false,
      message: `unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`
    };
  }

  for (const name of ["issue", "diff", "base", "head", "repo"] as const) {
    const value = record[name];
    if (value !== undefined && typeof value !== "string") {
      return { success: false, message: `"${name}" must be a string.` };
    }
  }
  const format = record.format;
  if (format !== undefined && format !== "markdown" && format !== "json") {
    return { success: false, message: '"format" must be either "markdown" or "json".' };
  }
  const limit = validateLimit(record.limit);
  if (!limit.success) {
    return limit;
  }
  const exclude = validateExclude(record.exclude);
  if (!exclude.success) {
    return exclude;
  }

  const value: PlanArguments = {};
  for (const name of ["issue", "diff", "base", "head", "repo"] as const) {
    const candidate = record[name];
    if (typeof candidate === "string" && candidate.trim()) {
      value[name] = candidate.trim();
    }
  }
  if (format === "markdown" || format === "json") {
    value.format = format;
  }
  if (limit.value !== undefined) {
    value.limit = limit.value;
  }
  if (exclude.value.length > 0) {
    value.exclude = exclude.value;
  }
  return { success: true, value };
}

function validateLimit(
  candidate: unknown
): { success: true; value: number | undefined } | { success: false; message: string } {
  if (candidate === undefined) {
    return { success: true, value: undefined };
  }
  if (
    typeof candidate !== "number" ||
    !Number.isSafeInteger(candidate) ||
    candidate < 1 ||
    candidate > MAX_MCP_LIMIT
  ) {
    return { success: false, message: `"limit" must be a whole number from 1 to ${MAX_MCP_LIMIT}.` };
  }
  return { success: true, value: candidate };
}

function validateExclude(
  candidate: unknown
): { success: true; value: string[] } | { success: false; message: string } {
  if (candidate === undefined) {
    return { success: true, value: [] };
  }
  if (!Array.isArray(candidate) || candidate.some((entry) => typeof entry !== "string")) {
    return { success: false, message: '"exclude" must be an array of path patterns.' };
  }
  return { success: true, value: (candidate as string[]).map((entry) => entry.trim()).filter(Boolean) };
}

export function parseExplainArguments(
  input: unknown
): { success: true; value: ExplainArguments } | { success: false; message: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, message: "tool arguments must be an object." };
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set(["path", "issue", "diff", "repo", "exclude", "format"]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return { success: false, message: `unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` };
  }
  for (const name of ["path", "issue", "diff", "repo"] as const) {
    const value = record[name];
    if (value !== undefined && typeof value !== "string") {
      return { success: false, message: `"${name}" must be a string.` };
    }
  }
  const path = typeof record.path === "string" ? record.path.trim() : "";
  if (!path) {
    return { success: false, message: '"path" is required and must be a repository-relative file path.' };
  }
  const format = record.format;
  if (format !== undefined && format !== "markdown" && format !== "json") {
    return { success: false, message: '"format" must be either "markdown" or "json".' };
  }
  const exclude = validateExclude(record.exclude);
  if (!exclude.success) {
    return exclude;
  }

  return {
    success: true,
    value: {
      path,
      ...(typeof record.issue === "string" && record.issue.trim() ? { issue: record.issue.trim() } : {}),
      ...(typeof record.diff === "string" && record.diff.trim() ? { diff: record.diff.trim() } : {}),
      ...(typeof record.repo === "string" && record.repo.trim() ? { repo: record.repo.trim() } : {}),
      ...(exclude.value.length > 0 ? { exclude: exclude.value } : {}),
      ...(format === "markdown" || format === "json" ? { format } : {})
    }
  };
}

type VerifyArgumentsValidation =
  | { success: true; value: VerifyArguments }
  | { success: false; message: string };

export function parseVerifyArguments(input: unknown): VerifyArgumentsValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, message: "tool arguments must be an object." };
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set(["report", "diff", "base", "head", "repo", "format"]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return { success: false, message: `unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` };
  }
  const loaded = loadVerifyReport(record.report);
  if (!loaded.success) {
    return { success: false, message: loaded.message };
  }
  const report = loaded.report;
  for (const name of ["diff", "base", "head", "repo"] as const) {
    const value = record[name];
    if (value !== undefined && (typeof value !== "string" || !value.trim())) {
      return { success: false, message: `"${name}" must be a non-empty string.` };
    }
  }
  if (!record.diff && !record.base) {
    return { success: false, message: 'provide "diff" or "base"/"head" so FixMap can see what changed.' };
  }
  const format = record.format;
  if (format !== undefined && format !== "markdown" && format !== "json") {
    return { success: false, message: '"format" must be either "markdown" or "json".' };
  }
  return {
    success: true,
    value: {
      report,
      ...(typeof record.diff === "string" ? { diff: record.diff.trim() } : {}),
      ...(typeof record.base === "string" ? { base: record.base.trim() } : {}),
      ...(typeof record.head === "string" ? { head: record.head.trim() } : {}),
      ...(typeof record.repo === "string" ? { repo: record.repo.trim() } : {}),
      ...(format === "markdown" || format === "json" ? { format } : {})
    }
  };
}

type LoadedReport =
  | { success: true; report: FixMapReport }
  | { success: false; message: string };

/**
 * Accepts the report either inline or as a path to a JSON file, mirroring CLI
 * `--report plan.json`. Agents reaching for MCP after using the CLI pass a path, and the
 * object-only rule both rejected them without naming the working shape and forced the
 * model to re-embed an entire plan in the tool call — token-heavy and easy to truncate.
 */
function loadVerifyReport(input: unknown): LoadedReport {
  if (typeof input === "string") {
    const path = input.trim();
    if (!path) {
      return { success: false, message: '"report" must be a FixMap report object or a path to a FixMap JSON report.' };
    }
    let contents: string;
    try {
      contents = readFileSync(path, "utf8");
    } catch (error) {
      return {
        success: false,
        message: `"report" looked like a file path but could not be read: ${error instanceof Error ? error.message : String(error)}.`
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      return {
        success: false,
        message: `"report" pointed at ${path}, which is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`
      };
    }
    return asFixMapReport(parsed, `the JSON in ${path}`);
  }
  return asFixMapReport(input, '"report"');
}

function asFixMapReport(candidate: unknown, label: string): LoadedReport {
  if (
    typeof candidate !== "object" ||
    candidate === null ||
    Array.isArray(candidate) ||
    !Array.isArray((candidate as Partial<FixMapReport>).contextFiles)
  ) {
    return {
      success: false,
      message: `${label} must be a FixMap JSON report with a contextFiles array, or a path to one.`
    };
  }
  return { success: true, report: candidate as FixMapReport };
}

export async function runMcpServer(): Promise<void> {
  await createFixMapMcpServer().connect(new StdioServerTransport());
}

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
  ) as { version: string };
  return packageJson.version;
}
