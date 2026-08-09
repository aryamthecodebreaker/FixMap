import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  compareReports,
  explainFile,
  renderComparisonMarkdown,
  renderExplanationMarkdown,
  renderJsonReport,
  renderMarkdownReport,
  renderVerifyMarkdown,
  resolveExclusions,
  scanRepo,
  stripByteOrderMark,
  validateFixMapReport,
  verifyPlan,
  type FixMapReport
} from "@aryam/fixmap-core";
import { renderDoctorReport, runDoctorChecks } from "./doctor.js";
import {
  buildReportForRepository,
  tryParseGitHubIssueSource,
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
  workingTree?: boolean;
  includeUntracked?: boolean;
  noCache?: boolean;
};

type ExplainArguments = {
  path: string;
  issue?: string;
  diff?: string;
  base?: string;
  head?: string;
  repo?: string;
  exclude?: string[];
  limit?: number;
  format?: "markdown" | "json";
  workingTree?: boolean;
  includeUntracked?: boolean;
  noCache?: boolean;
};

type PlanArgumentsValidation =
  | { success: true; value: PlanArguments }
  | { success: false; message: string };

type VerifyArguments = {
  report: FixMapReport;
  reportPath?: string;
  diff?: string;
  base?: string;
  head?: string;
  repo?: string;
  format?: "markdown" | "json";
  workingTree?: boolean;
  includeUntracked?: boolean;
  noCache?: boolean;
};

const PLAN_TOOL = {
  name: "fixmap_plan",
  title: "FixMap plan",
  description:
    "Map an issue, prompt, or git diff to the repository files worth reading first, " +
    "the test commands most likely to validate a change, and the areas that deserve review attention. " +
    "Run this before editing code so the change starts from the right context. " +
    "Provide at least one of issue, diff, base/head, or workingTree. " +
    // Agents otherwise read a ranked list as a settled answer. A figure here goes stale the
    // moment the suites are re-recorded — it already had, quoting a 9/15 rate from a suite
    // that no longer exists — and a stale calibration number is worse than none, because an
    // agent weights its confidence by it. Point at the published evidence instead, which is
    // regenerated from the recorded results on every release.
    "analysis.nextAction carries the single most useful next step for this report. Read it before acting. " +
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
        description: "Output format: markdown (default) or json, case-insensitive"
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
      },
      workingTree: { type: "boolean", description: "Map staged and unstaged tracked changes against HEAD" },
      includeUntracked: { type: "boolean", description: "With workingTree, include untracked files" },
      noCache: { type: "boolean", description: "Bypass the exact-state repository scan cache" }
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
      base: { type: "string", description: "Base git ref to diff against when diff is not given" },
      head: { type: "string", description: "Head git ref, defaults to HEAD" },
      workingTree: { type: "boolean", description: "Explain against staged and unstaged tracked changes, matching a working-tree plan" },
      includeUntracked: { type: "boolean", description: "With workingTree, include untracked files" },
      repo: {
        type: "string",
        description: "Local repository path, defaults to the server working directory. Remote URLs are not supported."
      },
      exclude: {
        type: "array",
        items: { type: "string" },
        description: "The same exclusion patterns used for the plan"
      },
      limit: { type: "number", description: `Maximum reported context files, 1 to ${MAX_MCP_LIMIT}` },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" },
      noCache: { type: "boolean", description: "Bypass the exact-state repository scan cache" }
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
      workingTree: { type: "boolean", description: "Verify staged and unstaged tracked changes against HEAD" },
      includeUntracked: { type: "boolean", description: "With workingTree, include untracked files" },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" },
      noCache: { type: "boolean", description: "Bypass the exact-state repository scan cache" }
    },
    required: ["report"],
    additionalProperties: false
  }
};

const COMPARE_TOOL = {
  name: "fixmap_compare",
  title: "FixMap compare",
  description:
    "Compare an earlier FixMap JSON report with a current report without rescanning. " +
    "Returns files that entered, left, moved, changed confidence, or stayed unchanged.",
  inputSchema: {
    type: "object" as const,
    properties: {
      previous: {
        description: "Earlier FixMap JSON report object or path to a local JSON report file",
        anyOf: [{ type: "object" }, { type: "string" }]
      },
      current: {
        description: "Current FixMap JSON report object or path to a local JSON report file",
        anyOf: [{ type: "object" }, { type: "string" }]
      },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" }
    },
    required: ["previous", "current"],
    additionalProperties: false
  }
};

const DOCTOR_TOOL = {
  name: "fixmap_doctor",
  title: "FixMap doctor",
  description: "Check the running FixMap installation for stale or shadowed binaries.",
  inputSchema: { type: "object" as const, properties: { format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" } }, additionalProperties: false }
};

export function createFixMapMcpServer(
  repositorySourceDependencies: RepositorySourceDependencies = {}
): Server {
  const server = new Server({ name: "fixmap", version: readVersion() }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [PLAN_TOOL, VERIFY_TOOL, EXPLAIN_TOOL, COMPARE_TOOL, DOCTOR_TOOL]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === COMPARE_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const unknown = Object.keys(record ?? {}).filter((key) => !["previous", "current", "format"].includes(key));
      if (unknown.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` }]
        };
      }
      const previous = loadReportInput(record?.previous, '"previous"');
      if (!previous.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${previous.message}` }] };
      const current = loadReportInput(record?.current, '"current"');
      if (!current.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${current.message}` }] };
      const comparison = compareReports(previous.report, current.report);
      const format = normalizeFormat(record?.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      return { content: [{ type: "text", text: format.value === "json" ? `${JSON.stringify(comparison, null, 2)}\n` : renderComparisonMarkdown(comparison) }] };
    }
    if (request.params.name === DOCTOR_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const format = normalizeFormat(record?.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      const unknown = Object.keys(record ?? {}).filter((key) => key !== "format");
      if (unknown.length > 0) {
        return {
          isError: true,
          content: [{
            type: "text",
            text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`
          }]
        };
      }
      const report = await runDoctorChecks();
      // A client that branches only on isError read a shadowed install as a healthy run,
      // which is the single situation doctor exists to catch.
      return {
        ...(report.healthy ? {} : { isError: true }),
        content: [{ type: "text", text: format.value === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderDoctorReport(report) }]
      };
    }
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
          headRef: args.head,
          workingTree: args.workingTree,
          includeUntracked: args.includeUntracked,
          useCache: !args.noCache,
          internalExclude: args.reportPath ? [resolve(args.reportPath)] : undefined
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
        const repo = await scanRepo({
          repoRoot,
          diffSpec: args.diff,
          baseRef: args.base,
          headRef: args.head,
          workingTree: args.workingTree,
          includeUntracked: args.includeUntracked,
          useCache: !args.noCache
        });
        const explanation = explainFile(
          repo,
          {
            issueText: args.issue,
            diffText: repo.diffText,
            exclude: await resolveExclusions(repoRoot, args.exclude ?? []),
            limit: args.limit
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
    if (!args.issue && !args.diff && !args.base && !args.workingTree) {
      return {
        isError: true,
        content: [{ type: "text", text: "Provide issue, diff, base/head, or workingTree so FixMap has a task signal." }]
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
        workingTree: args.workingTree,
        includeUntracked: args.includeUntracked,
        useCache: !args.noCache,
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
  const allowed = new Set(["issue", "diff", "base", "head", "repo", "format", "limit", "exclude", "workingTree", "includeUntracked", "noCache"]);
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
  for (const name of ["issue", "diff", "base", "head", "repo"] as const) {
    if (typeof record[name] === "string" && !record[name].trim()) return { success: false, message: `"${name}" must not be blank.` };
  }
  for (const name of ["workingTree", "includeUntracked", "noCache"] as const) if (record[name] !== undefined && typeof record[name] !== "boolean") return { success: false, message: `"${name}" must be a boolean.` };
  if (record.includeUntracked === true && record.workingTree !== true) return { success: false, message: '"includeUntracked" requires "workingTree".' };
  if (record.workingTree === true && (record.diff || record.base || record.head)) return { success: false, message: 'use either "workingTree" or diff/base/head, not both.' };
  if (record.diff && (record.base || record.head)) return { success: false, message: 'use either "diff" or base/head, not both.' };
  if (record.head && !record.base) return { success: false, message: '"head" requires "base".' };
  const format = normalizeFormat(record.format); if (!format.success) return format;
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
  if (format.value) value.format = format.value;
  if (limit.value !== undefined) {
    value.limit = limit.value;
  }
  if (exclude.value.length > 0) {
    value.exclude = exclude.value;
  }
  if (record.workingTree === true) value.workingTree = true;
  if (record.includeUntracked === true) value.includeUntracked = true;
  if (record.noCache === true) value.noCache = true;
  if (value.issue && /^https?:\/\/\S+$/i.test(value.issue) && !tryParseGitHubIssueSource(value.issue)) return { success: false, message: '"issue" URL must be a canonical public GitHub issue or pull request URL.' };
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
  const allowed = new Set(["path", "issue", "diff", "base", "head", "repo", "exclude", "format", "limit", "workingTree", "includeUntracked", "noCache"]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return { success: false, message: `unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` };
  }
  for (const name of ["path", "issue", "diff", "base", "head", "repo"] as const) {
    const value = record[name];
    if (value !== undefined && typeof value !== "string") {
      return { success: false, message: `"${name}" must be a string.` };
    }
  }
  for (const name of ["issue", "diff", "base", "head", "repo"] as const) {
    if (typeof record[name] === "string" && !record[name].trim()) {
      return { success: false, message: `"${name}" must not be blank.` };
    }
  }
  for (const name of ["workingTree", "includeUntracked", "noCache"] as const) {
    if (record[name] !== undefined && typeof record[name] !== "boolean") {
      return { success: false, message: `"${name}" must be a boolean.` };
    }
  }
  const path = typeof record.path === "string" ? record.path.trim() : "";
  if (!path) {
    return { success: false, message: '"path" is required and must be a repository-relative file path.' };
  }
  if (record.includeUntracked === true && record.workingTree !== true) return { success: false, message: '"includeUntracked" requires "workingTree".' };
  if (record.workingTree === true && (record.diff || record.base || record.head)) return { success: false, message: 'use either "workingTree" or diff/base/head, not both.' };
  if (record.diff && (record.base || record.head)) return { success: false, message: 'use either "diff" or base/head, not both.' };
  if (record.head && !record.base) return { success: false, message: '"head" requires "base".' };
  const format = normalizeFormat(record.format); if (!format.success) return format;
  const limit = validateLimit(record.limit); if (!limit.success) return limit;
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
      ...(typeof record.base === "string" && record.base.trim() ? { base: record.base.trim() } : {}),
      ...(typeof record.head === "string" && record.head.trim() ? { head: record.head.trim() } : {}),
      ...(record.workingTree === true ? { workingTree: true } : {}),
      ...(record.includeUntracked === true ? { includeUntracked: true } : {}),
      ...(record.noCache === true ? { noCache: true } : {}),
      ...(typeof record.repo === "string" && record.repo.trim() ? { repo: record.repo.trim() } : {}),
      ...(exclude.value.length > 0 ? { exclude: exclude.value } : {}),
      ...(limit.value !== undefined ? { limit: limit.value } : {}),
      ...(format.value ? { format: format.value } : {})
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
  const allowed = new Set(["report", "diff", "base", "head", "repo", "format", "workingTree", "includeUntracked", "noCache"]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return { success: false, message: `unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` };
  }
  const loaded = loadReportInput(record.report, '"report"');
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
  if (!record.diff && !record.base && record.workingTree !== true) {
    return { success: false, message: 'provide "diff", "base"/"head", or "workingTree" so FixMap can see what changed.' };
  }
  for (const name of ["workingTree", "includeUntracked", "noCache"] as const) if (record[name] !== undefined && typeof record[name] !== "boolean") return { success: false, message: `"${name}" must be a boolean.` };
  if (record.includeUntracked === true && record.workingTree !== true) return { success: false, message: '"includeUntracked" requires "workingTree".' };
  if (record.workingTree === true && (record.diff || record.base || record.head)) return { success: false, message: 'use either "workingTree" or diff/base/head, not both.' };
  if (record.diff && (record.base || record.head)) return { success: false, message: 'use either "diff" or base/head, not both.' };
  if (record.head && !record.base) return { success: false, message: '"head" requires "base".' };
  const format = normalizeFormat(record.format); if (!format.success) return format;
  return {
    success: true,
    value: {
      report,
      ...(loaded.sourcePath ? { reportPath: loaded.sourcePath } : {}),
      ...(typeof record.diff === "string" ? { diff: record.diff.trim() } : {}),
      ...(typeof record.base === "string" ? { base: record.base.trim() } : {}),
      ...(typeof record.head === "string" ? { head: record.head.trim() } : {}),
      ...(typeof record.repo === "string" ? { repo: record.repo.trim() } : {}),
      ...(record.workingTree === true ? { workingTree: true } : {}),
      ...(record.includeUntracked === true ? { includeUntracked: true } : {}),
      ...(record.noCache === true ? { noCache: true } : {}),
      ...(format.value ? { format: format.value } : {})
    }
  };
}

function normalizeFormat(candidate: unknown): { success: true; value: "markdown" | "json" | undefined } | { success: false; message: string } {
  if (candidate === undefined) return { success: true, value: undefined };
  if (typeof candidate !== "string") return { success: false, message: '"format" must be either "markdown" or "json".' };
  const value = candidate.trim().toLowerCase();
  return value === "markdown" || value === "json" ? { success: true, value } : { success: false, message: '"format" must be either "markdown" or "json".' };
}

type LoadedReport =
  | { success: true; report: FixMapReport; sourcePath?: string }
  | { success: false; message: string };

/**
 * Accepts the report either inline or as a path to a JSON file, mirroring CLI
 * `--report plan.json`. Agents reaching for MCP after using the CLI pass a path, and the
 * object-only rule both rejected them without naming the working shape and forced the
 * model to re-embed an entire plan in the tool call — token-heavy and easy to truncate.
 */
function loadReportInput(input: unknown, label: string): LoadedReport {
  if (typeof input === "string") {
    const path = input.trim();
    if (!path) {
      return { success: false, message: `${label} must be a FixMap report object or a path to a FixMap JSON report.` };
    }
    let contents: string;
    try {
      contents = stripByteOrderMark(readFileSync(path, "utf8"));
    } catch (error) {
      return {
        success: false,
        message: `${label} looked like a file path but could not be read: ${error instanceof Error ? error.message : String(error)}.`
      };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(contents);
    } catch (error) {
      return {
        success: false,
        message: `${label} pointed at ${path}, which is not valid JSON: ${error instanceof Error ? error.message : String(error)}.`
      };
    }
    const loaded = asFixMapReport(parsed, `the JSON in ${path}`);
    return loaded.success ? { ...loaded, sourcePath: resolve(path) } : loaded;
  }
  return asFixMapReport(input, label);
}

function asFixMapReport(candidate: unknown, label: string): LoadedReport {
  return validateFixMapReport(candidate, label);
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
