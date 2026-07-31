import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  renderJsonReport,
  renderMarkdownReport,
  renderVerifyMarkdown,
  scanRepo,
  verifyPlan,
  type FixMapReport
} from "@aryam/fixmap-core";
import {
  buildReportForRepository,
  type RepositorySourceDependencies
} from "./repository-source.js";

type PlanArguments = {
  issue?: string;
  diff?: string;
  base?: string;
  head?: string;
  repo?: string;
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
    // Agents otherwise read a ranked list as a settled answer. On the frozen suites the
    // top result is correct about three quarters of the time when labeled high
    // confidence, so the ranking is a lead to verify rather than a conclusion.
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
      }
    },
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
      report: { type: "object", description: "The JSON FixMap report returned by fixmap_plan" },
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

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [PLAN_TOOL, VERIFY_TOOL] }));

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
        headRef: args.head
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
  const allowed = new Set(["issue", "diff", "base", "head", "repo", "format"]);
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
  return { success: true, value };
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
  const report = record.report as Partial<FixMapReport> | undefined;
  if (typeof report !== "object" || report === null || !Array.isArray(report.contextFiles)) {
    return { success: false, message: '"report" must be a FixMap JSON report with a contextFiles array.' };
  }
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
      report: report as FixMapReport,
      ...(typeof record.diff === "string" ? { diff: record.diff.trim() } : {}),
      ...(typeof record.base === "string" ? { base: record.base.trim() } : {}),
      ...(typeof record.head === "string" ? { head: record.head.trim() } : {}),
      ...(typeof record.repo === "string" ? { repo: record.repo.trim() } : {}),
      ...(format === "markdown" || format === "json" ? { format } : {})
    }
  };
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
