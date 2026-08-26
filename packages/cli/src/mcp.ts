import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  isInitializedNotification,
  isJSONRPCRequest,
  type JSONRPCMessage,
  type MessageExtraInfo
} from "@modelcontextprotocol/sdk/types.js";
import {
  answerFixMapQuestion,
  buildMigrationPlan,
  draftReverseDocumentation,
  mapRuntimeEvidence,
  compareReports,
  compareArchitectureRefs,
  buildFixMapGraph,
  explainFile,
  renderComparisonMarkdown,
  renderExplanationMarkdown,
  renderAgentReport,
  renderContextPackMarkdown,
  renderFixMapGraphMermaid,
  renderJsonReport,
  renderMarkdownReport,
  renderVerifyMarkdown,
  resolveExclusions,
  scanRepo,
  validateFixMapReport,
  verifyPlan,
  type FixMapReport
} from "@aryam/fixmap-core";
import { renderDoctorReport, runDoctorChecks } from "./doctor.js";
import { describeInputReadError, readDecodedTextFile } from "./decode-input.js";
import { clarifyMissingPath } from "./explain-path.js";
import { analyzeRepository, contextFromAnalysis } from "./analysis-source.js";
import { renderAskMarkdown } from "./ask-command.js";
import { parseMigrationInput, renderMigrationPlanMarkdown } from "./migration-command.js";
import { parseReverseDocsInput, renderReverseDocsMarkdown } from "./reverse-docs-command.js";
import { renderHistoryMarkdown } from "./history-command.js";
import { buildSupplyChainReport, renderSupplyChainMarkdown } from "./supply-chain-command.js";
import { parseRuntimeInput, renderRuntimeMarkdown } from "./runtime-command.js";
import { runWorkspaceCommand } from "./workspace-command.js";
import {
  buildReportForRepository,
  isSafeGitRefName,
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
  ref?: string;
  format?: "markdown" | "json" | "agent";
  limit?: number;
  exclude?: string[];
  workingTree?: boolean;
  includeUntracked?: boolean;
  noCache?: boolean;
  semanticModel?: string;
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

type AnalysisToolArguments = Omit<PlanArguments, "format"> & {
  format?: "markdown" | "json" | "mermaid";
  budget?: number;
};

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
      ref: { type: "string", description: "Branch or tag to scan when repo is a remote GitHub URL" },
      format: {
        type: "string",
        description: "Output format: markdown (default), json, or compact agent, case-insensitive"
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
      noCache: { type: "boolean", description: "Bypass the exact-state repository scan cache" },
      semanticModel: {
        type: "string",
        description: "Existing local Transformers.js embedding model directory. Never downloads a model or uploads source."
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

const CONTEXT_TOOL = {
  name: "fixmap_context",
  title: "FixMap context",
  description: "Select task-aware source ranges from FixMap's primary and impact files within a deterministic source-token budget. Use this after Plan and before editing; it does not call a model or execute repository code.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...PLAN_TOOL.inputSchema.properties,
      budget: { type: "number", description: "Estimated source-token budget, a whole number from 256 to 200000; default 10000" },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" }
    },
    additionalProperties: false
  }
};

const GRAPH_TOOL = {
  name: "fixmap_graph",
  title: "FixMap graph",
  description: "Export FixMap's evidence-backed Impact Graph, including import direction, routed tests, and repeated co-change relationships, as Mermaid or JSON.",
  inputSchema: {
    type: "object" as const,
    properties: {
      ...PLAN_TOOL.inputSchema.properties,
      format: { type: "string", description: "Output format: mermaid (default) or json, case-insensitive" }
    },
    additionalProperties: false
  }
};

const WORKSPACE_TOOL = {
  name: "fixmap_workspace",
  title: "FixMap workspace",
  description:
    "Build a versioned package and impact graph across 1-32 local repository checkouts from a reviewed JSON config. " +
    "Resolves Node, Python, and Maven package versions plus manifest/import/submodule evidence without executing repository code. " +
    "Use seeds to trace provider-to-consumer impact.",
  inputSchema: {
    type: "object" as const,
    properties: {
      config: { type: "string", description: "Local workspace JSON config path; repository paths inside it are relative to this file" },
      seeds: {
        type: "array",
        items: { type: "string" },
        description: "Repository IDs whose downstream consumers should be traced"
      },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" },
      noCache: { type: "boolean", description: "Bypass the exact-state scan cache in every workspace repository" }
    },
    required: ["config"],
    additionalProperties: false
  }
};

const ASK_TOOL = {
  name: "fixmap_ask",
  title: "FixMap ask",
  description:
    "Answer structural questions from a saved FixMap report using ranked context, impact, tests, risks, diagnostics, annotations, ADRs, and architecture policy. " +
    "Deterministic mode reads no source content, calls no model, cites report evidence, and preserves unknowns instead of guessing.",
  inputSchema: {
    type: "object" as const,
    properties: {
      report: {
        description: "FixMap report JSON object or local report path",
        anyOf: [{ type: "object" }, { type: "string" }]
      },
      question: { type: "string", description: "Structural question of at most 5,000 characters" },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" }
    },
    required: ["report", "question"],
    additionalProperties: false
  }
};

const MIGRATION_TOOL = {
  name: "fixmap_migrate",
  title: "FixMap migrate",
  description:
    "Build dependency-ordered, review-only migration phases against one exact identity graph. " +
    "Every explicit step must declare edits, compatibility, tests, and rollback; cycles, unknown identities, and unsafe parallel overlap fail closed. " +
    "This tool never executes commands or applies changes.",
  inputSchema: {
    type: "object" as const,
    properties: {
      input: {
        description: "Version-1 migration input object or path to a local JSON input file",
        anyOf: [{ type: "object" }, { type: "string" }]
      },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" }
    },
    required: ["input"],
    additionalProperties: false
  }
};

const REVERSE_DOCS_TOOL = {
  name: "fixmap_reverse_docs",
  title: "FixMap reverse docs",
  description:
    "Build deterministic, review-only module or architecture documentation drafts from exact file fingerprints, structural edges, and authored decisions. " +
    "Observations, inferences, and unknowns remain separate; this tool never writes or overwrites repository files.",
  inputSchema: {
    type: "object" as const,
    properties: {
      input: {
        description: "Version-1 reverse-documentation input object or path to a local JSON input file",
        anyOf: [{ type: "object" }, { type: "string" }]
      },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" }
    },
    required: ["input"],
    additionalProperties: false
  }
};

const HISTORY_TOOL = {
  name: "fixmap_history",
  title: "FixMap history",
  description:
    "Compare architecture at two exact committed Git refs without checking out either ref or changing the worktree. " +
    "Returns immutable commit IDs plus added/removed edges, cycle and boundary drift, and coupling growth.",
  inputSchema: {
    type: "object" as const,
    properties: {
      repo: { type: "string", description: "Local Git checkout path (defaults to the MCP server repository)" },
      from: { type: "string", description: "Earlier committed Git ref" },
      to: { type: "string", description: "Later committed Git ref" },
      couplingDelta: { type: "integer", minimum: 1, maximum: 10000, description: "Minimum coupling growth to report (default 2)" },
      applyPolicy: { type: "boolean", description: "Apply the repository architecture policy when present (default true)" },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" }
    },
    required: ["from", "to"],
    additionalProperties: false
  }
};

const SUPPLY_CHAIN_TOOL = {
  name: "fixmap_supply_chain",
  title: "FixMap supply chain",
  description:
    "Validate and render a version-1 normalized external scanner or SBOM bundle with package-aware vulnerability, outdated-version, and license-policy evidence. " +
    "FixMap never fetches advisory data, maintains no vulnerability corpus, executes no scanner, and authorizes no remediation.",
  inputSchema: {
    type: "object" as const,
    properties: {
      input: {
        description: "Version-1 supply-chain bundle object or path to a local JSON file",
        anyOf: [{ type: "object" }, { type: "string" }]
      },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" }
    },
    required: ["input"],
    additionalProperties: false
  }
};

const RUNTIME_TOOL = {
  name: "fixmap_runtime",
  title: "FixMap runtime",
  description:
    "Map a redaction-reviewed OpenTelemetry, normalized APM, Speedscope, or pprof bundle only through explicit repository IDs, paths, and exact file fingerprints. " +
    "Labels and symbols never establish identity; correlation never establishes causality.",
  inputSchema: {
    type: "object" as const,
    properties: {
      input: {
        description: "Version-1 runtime input object or path containing bundle and exact repository snapshots",
        anyOf: [{ type: "object" }, { type: "string" }]
      },
      format: { type: "string", description: "Output format: markdown (default) or json, case-insensitive" }
    },
    required: ["input"],
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
  repositorySourceDependencies: RepositorySourceDependencies = {},
  defaultRepo = process.cwd()
): Server {
  const server = new Server({ name: "fixmap", version: readVersion() }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [PLAN_TOOL, CONTEXT_TOOL, GRAPH_TOOL, WORKSPACE_TOOL, ASK_TOOL, MIGRATION_TOOL, REVERSE_DOCS_TOOL, HISTORY_TOOL, SUPPLY_CHAIN_TOOL, RUNTIME_TOOL, VERIFY_TOOL, EXPLAIN_TOOL, COMPARE_TOOL, DOCTOR_TOOL]
  }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === CONTEXT_TOOL.name || request.params.name === GRAPH_TOOL.name) {
      const kind = request.params.name === CONTEXT_TOOL.name ? "context" : "graph";
      const parsed = parseAnalysisToolArguments(request.params.arguments ?? {}, kind);
      if (!parsed.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${parsed.message}` }] };
      const args = parsed.value;
      try {
        const analysis = await analyzeRepository({
          repo: args.repo ?? (tryParseGitHubIssueSource(args.issue ?? "") ? undefined : defaultRepo),
          checkoutRef: args.ref,
          issueText: args.issue,
          diffSpec: args.diff,
          baseRef: args.base,
          headRef: args.head,
          workingTree: args.workingTree,
          includeUntracked: args.includeUntracked,
          useCache: !args.noCache,
          limit: args.limit,
          exclude: args.exclude,
          semanticModelPath: args.semanticModel
        }, repositorySourceDependencies);
        if (kind === "context") {
          const pack = contextFromAnalysis(analysis, args.budget ?? 10_000);
          const text = args.format === "json" ? `${JSON.stringify(pack, null, 2)}\n` : renderContextPackMarkdown(pack);
          return { ...(pack.snippets.length === 0 ? { isError: true } : {}), content: [{ type: "text", text }] };
        }
        const graph = buildFixMapGraph(analysis.report);
        const text = args.format === "json" ? `${JSON.stringify(graph, null, 2)}\n` : renderFixMapGraphMermaid(graph);
        return { ...(graph.nodes.length === 0 ? { isError: true } : {}), content: [{ type: "text", text }] };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
      }
    }
    if (request.params.name === WORKSPACE_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const unknown = Object.keys(record ?? {}).filter((key) => !["config", "seeds", "format", "noCache"].includes(key));
      if (unknown.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` }]
        };
      }
      if (typeof record?.config !== "string" || !record.config.trim()) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "config" is required and must be a non-empty local path.' }] };
      }
      if (record.seeds !== undefined && (
        !Array.isArray(record.seeds) || record.seeds.length > 32 ||
        record.seeds.some((seed) => typeof seed !== "string" || !seed.trim())
      )) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "seeds" must be an array of at most 32 non-empty repository IDs.' }] };
      }
      if (record.noCache !== undefined && typeof record.noCache !== "boolean") {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "noCache" must be a boolean.' }] };
      }
      const format = normalizeFormat(record.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      const stdout: string[] = [];
      const stderr: string[] = [];
      const commandArgs = ["--config", record.config.trim(), "--format", format.value ?? "markdown"];
      for (const seed of (record.seeds as string[] | undefined) ?? []) commandArgs.push("--seed", seed.trim());
      if (record.noCache === true) commandArgs.push("--no-cache");
      const exitCode = await runWorkspaceCommand(commandArgs, {
        stdout: (text) => stdout.push(text),
        stderr: (text) => stderr.push(text)
      });
      return {
        ...(exitCode === 0 ? {} : { isError: true }),
        content: [{ type: "text", text: exitCode === 0 ? stdout.join("") : stderr.join("") }]
      };
    }
    if (request.params.name === ASK_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const unknown = Object.keys(record ?? {}).filter((key) => !["report", "question", "format"].includes(key));
      if (unknown.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` }]
        };
      }
      const loaded = loadReportInput(record?.report, '"report"');
      if (!loaded.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${loaded.message}` }] };
      if (typeof record?.question !== "string" || !record.question.trim() || record.question.length > 5_000 || record.question.includes("\0")) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "question" is required and must contain at most 5,000 characters and no null bytes.' }] };
      }
      const format = normalizeFormat(record.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      try {
        const answer = await answerFixMapQuestion(loaded.report, record.question);
        return {
          content: [{
            type: "text",
            text: format.value === "json" ? `${JSON.stringify(answer, null, 2)}\n` : renderAskMarkdown(answer)
          }]
        };
      } catch (error) {
        return { isError: true, content: [{ type: "text", text: error instanceof Error ? error.message : String(error) }] };
      }
    }
    if (request.params.name === MIGRATION_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const unknown = Object.keys(record ?? {}).filter((key) => !["input", "format"].includes(key));
      if (unknown.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` }]
        };
      }
      if (record?.input === undefined) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "input" is required and must be a migration object or local JSON path.' }] };
      }
      const format = normalizeFormat(record.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      try {
        const raw: unknown = typeof record.input === "string"
          ? JSON.parse(readDecodedTextFile(record.input))
          : record.input;
        const input = parseMigrationInput(raw);
        const plan = buildMigrationPlan(input.graph, input.steps);
        return {
          content: [{
            type: "text",
            text: format.value === "json" ? `${JSON.stringify(plan, null, 2)}\n` : renderMigrationPlanMarkdown(plan)
          }]
        };
      } catch (error) {
        const message = typeof record.input === "string"
          ? describeInputReadError(record.input, error)
          : error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    }
    if (request.params.name === REVERSE_DOCS_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const unknown = Object.keys(record ?? {}).filter((key) => !["input", "format"].includes(key));
      if (unknown.length > 0) {
        return {
          isError: true,
          content: [{ type: "text", text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` }]
        };
      }
      if (record?.input === undefined) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "input" is required and must be a reverse-documentation object or local JSON path.' }] };
      }
      const format = normalizeFormat(record.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      try {
        const raw: unknown = typeof record.input === "string"
          ? JSON.parse(readDecodedTextFile(record.input))
          : record.input;
        const input = parseReverseDocsInput(raw);
        const drafts = draftReverseDocumentation(input.repo, input.architecture, input.decisions, input.targets);
        return {
          content: [{
            type: "text",
            text: format.value === "json" ? `${JSON.stringify(drafts, null, 2)}\n` : renderReverseDocsMarkdown(drafts)
          }]
        };
      } catch (error) {
        const message = typeof record.input === "string"
          ? describeInputReadError(record.input, error)
          : error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    }
    if (request.params.name === HISTORY_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const unknown = Object.keys(record ?? {}).filter((key) => !["repo", "from", "to", "couplingDelta", "applyPolicy", "format"].includes(key));
      if (unknown.length > 0) {
        return { isError: true, content: [{ type: "text", text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` }] };
      }
      if (typeof record?.from !== "string" || !record.from.trim() || /[\0\r\n]/.test(record.from) || record.from.length > 500 ||
        typeof record.to !== "string" || !record.to.trim() || /[\0\r\n]/.test(record.to) || record.to.length > 500) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "from" and "to" are required bounded single-line Git refs.' }] };
      }
      if (record.repo !== undefined && (typeof record.repo !== "string" || !record.repo.trim() || record.repo.includes("\0"))) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "repo" must be a non-empty local path.' }] };
      }
      if (record.couplingDelta !== undefined && (!Number.isSafeInteger(record.couplingDelta) || Number(record.couplingDelta) < 1 || Number(record.couplingDelta) > 10_000)) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "couplingDelta" must be an integer from 1 to 10000.' }] };
      }
      if (record.applyPolicy !== undefined && typeof record.applyPolicy !== "boolean") {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "applyPolicy" must be a boolean.' }] };
      }
      const format = normalizeFormat(record.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      const repoRoot = resolve(typeof record.repo === "string" ? record.repo.trim() : defaultRepo ?? process.cwd());
      try {
        const result = await compareArchitectureRefs({
          repoRoot,
          fromRef: record.from.trim(),
          toRef: record.to.trim(),
          couplingDelta: record.couplingDelta === undefined ? 2 : Number(record.couplingDelta),
          applyRepositoryPolicy: record.applyPolicy === undefined ? true : record.applyPolicy
        });
        return { content: [{ type: "text", text: format.value === "json" ? `${JSON.stringify(result, null, 2)}\n` : renderHistoryMarkdown(result) }] };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: message.includes("Could not resolve Git ref")
          ? `Could not resolve one of the requested Git refs in "${repoRoot}". Confirm both refs exist and the path is a Git checkout.`
          : `Could not compare historical architecture in "${repoRoot}".` }] };
      }
    }
    if (request.params.name === SUPPLY_CHAIN_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const unknown = Object.keys(record ?? {}).filter((key) => !["input", "format"].includes(key));
      if (unknown.length > 0) {
        return { isError: true, content: [{ type: "text", text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` }] };
      }
      if (record?.input === undefined) {
        return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "input" is required and must be a supply-chain object or local JSON path.' }] };
      }
      const format = normalizeFormat(record.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      try {
        const raw: unknown = typeof record.input === "string" ? JSON.parse(readDecodedTextFile(record.input)) : record.input;
        const report = await buildSupplyChainReport(raw);
        return { content: [{ type: "text", text: format.value === "json" ? `${JSON.stringify(report, null, 2)}\n` : renderSupplyChainMarkdown(report) }] };
      } catch (error) {
        const message = typeof record.input === "string"
          ? describeInputReadError(record.input, error)
          : error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    }
    if (request.params.name === RUNTIME_TOOL.name) {
      const record = request.params.arguments as Record<string, unknown> | undefined;
      const unknown = Object.keys(record ?? {}).filter((key) => !["input", "format"].includes(key));
      if (unknown.length > 0) return { isError: true, content: [{ type: "text", text: `Invalid arguments: unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` }] };
      if (record?.input === undefined) return { isError: true, content: [{ type: "text", text: 'Invalid arguments: "input" is required and must be a runtime object or local JSON path.' }] };
      const format = normalizeFormat(record.format);
      if (!format.success) return { isError: true, content: [{ type: "text", text: `Invalid arguments: ${format.message}` }] };
      try {
        const raw: unknown = typeof record.input === "string" ? JSON.parse(readDecodedTextFile(record.input)) : record.input;
        const input = parseRuntimeInput(raw);
        const mapped = mapRuntimeEvidence(input.bundle, input.snapshots);
        return { content: [{ type: "text", text: format.value === "json" ? `${JSON.stringify(mapped, null, 2)}\n` : renderRuntimeMarkdown(mapped) }] };
      } catch (error) {
        const message = typeof record.input === "string"
          ? describeInputReadError(record.input, error)
          : error instanceof Error ? error.message : String(error);
        return { isError: true, content: [{ type: "text", text: message }] };
      }
    }
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
          repoRoot: args.repo ?? defaultRepo,
          diffSpec: args.diff,
          baseRef: args.base,
          headRef: args.head,
          workingTree: args.workingTree,
          includeUntracked: args.includeUntracked,
          useCache: !args.noCache,
          includeHistory: true,
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
        const repoRoot = args.repo ?? defaultRepo;
        const repo = await scanRepo({
          repoRoot,
          diffSpec: args.diff,
          baseRef: args.base,
          headRef: args.head,
          workingTree: args.workingTree,
          includeUntracked: args.includeUntracked,
          useCache: !args.noCache
        });
        const explanation = await clarifyMissingPath(explainFile(
          repo,
          {
            issueText: args.issue,
            diffText: repo.diffText,
            exclude: await resolveExclusions(repoRoot, args.exclude ?? []),
            limit: args.limit
          },
          args.path
        ), repo, args.path);
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
        repo: args.repo ?? (tryParseGitHubIssueSource(args.issue ?? "") ? undefined : defaultRepo),
        checkoutRef: args.ref,
        issueText: args.issue,
        diffSpec: args.diff,
        baseRef: args.base,
        headRef: args.head,
        workingTree: args.workingTree,
        includeUntracked: args.includeUntracked,
        useCache: !args.noCache,
        limit: args.limit,
        exclude: args.exclude,
        semanticModelPath: args.semanticModel
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

    const text = args.format === "json"
      ? renderJsonReport(report)
      : args.format === "agent"
        ? renderAgentReport(report)
        : renderMarkdownReport(report);
    return { content: [{ type: "text", text }] };
  });

  return server;
}

export function parsePlanArguments(input: unknown): PlanArgumentsValidation {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, message: "tool arguments must be an object." };
  }

  const record = input as Record<string, unknown>;
  const allowed = new Set(["issue", "diff", "base", "head", "repo", "ref", "format", "limit", "exclude", "workingTree", "includeUntracked", "noCache", "semanticModel"]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    return {
      success: false,
      message: `unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.`
    };
  }

  for (const name of ["issue", "diff", "base", "head", "repo", "ref"] as const) {
    const value = record[name];
    if (value !== undefined && typeof value !== "string") {
      return { success: false, message: `"${name}" must be a string.` };
    }
  }
  if (record.semanticModel !== undefined && (typeof record.semanticModel !== "string" || !record.semanticModel.trim())) {
    return { success: false, message: '"semanticModel" must be a non-empty local directory path.' };
  }
  for (const name of ["issue", "diff", "base", "head", "repo", "ref"] as const) {
    if (typeof record[name] === "string" && !record[name].trim()) return { success: false, message: `"${name}" must not be blank.` };
  }
  for (const name of ["workingTree", "includeUntracked", "noCache"] as const) if (record[name] !== undefined && typeof record[name] !== "boolean") return { success: false, message: `"${name}" must be a boolean.` };
  if (record.includeUntracked === true && record.workingTree !== true) return { success: false, message: '"includeUntracked" requires "workingTree".' };
  if (record.workingTree === true && (record.diff || record.base || record.head)) return { success: false, message: 'use either "workingTree" or diff/base/head, not both.' };
  if (record.diff && (record.base || record.head)) return { success: false, message: 'use either "diff" or base/head, not both.' };
  if (record.head && !record.base) return { success: false, message: '"head" requires "base".' };
  const format = normalizePlanFormat(record.format); if (!format.success) return format;
  const limit = validateLimit(record.limit);
  if (!limit.success) {
    return limit;
  }
  const exclude = validateExclude(record.exclude);
  if (!exclude.success) {
    return exclude;
  }

  const value: PlanArguments = {};
  for (const name of ["issue", "diff", "base", "head", "repo", "ref"] as const) {
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
  if (typeof record.semanticModel === "string") value.semanticModel = record.semanticModel.trim();
  if (value.ref && !/^https?:\/\//i.test(value.repo ?? "") && !tryParseGitHubIssueSource(value.issue ?? "")) {
    return { success: false, message: '"ref" requires a remote GitHub "repo" or issue URL.' };
  }
  if (value.ref && !isSafeGitRefName(value.ref)) {
    return { success: false, message: '"ref" must be a safe branch or tag name.' };
  }
  if (value.issue && /^https?:\/\/\S+$/i.test(value.issue) && !tryParseGitHubIssueSource(value.issue)) return { success: false, message: '"issue" URL must be a canonical public GitHub issue or pull request URL.' };
  return { success: true, value };
}

function parseAnalysisToolArguments(
  input: unknown,
  kind: "context" | "graph"
): { success: true; value: AnalysisToolArguments } | { success: false; message: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return { success: false, message: "tool arguments must be an object." };
  }
  const record = input as Record<string, unknown>;
  const allowed = new Set(["issue", "diff", "base", "head", "repo", "ref", "format", "limit", "exclude", "workingTree", "includeUntracked", "noCache", "semanticModel", ...(kind === "context" ? ["budget"] : [])]);
  const unknown = Object.keys(record).filter((key) => !allowed.has(key));
  if (unknown.length > 0) return { success: false, message: `unknown argument${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}.` };

  const format = record.format === undefined ? undefined : typeof record.format === "string" ? record.format.trim().toLowerCase() : "";
  const formats = kind === "context" ? ["markdown", "json"] : ["mermaid", "json"];
  if (record.format !== undefined && (typeof format !== "string" || !formats.includes(format))) return { success: false, message: `"format" must be "${formats.join('" or "')}".` };
  const normalizedFormat: "markdown" | "json" | "mermaid" | undefined =
    format === "markdown" || format === "json" || format === "mermaid" ? format : undefined;
  if (record.budget !== undefined && (
    typeof record.budget !== "number" || !Number.isSafeInteger(record.budget) || record.budget < 256 || record.budget > 200_000
  )) return { success: false, message: '"budget" must be a whole number from 256 to 200000.' };

  const baseRecord = { ...record };
  delete baseRecord.format;
  delete baseRecord.budget;
  const parsed = parsePlanArguments(baseRecord);
  if (!parsed.success) return parsed;
  if (!parsed.value.issue && !parsed.value.diff && !parsed.value.base && !parsed.value.workingTree) {
    return { success: false, message: "provide issue, diff, base/head, or workingTree so FixMap has a task signal." };
  }
  const { format: _planFormat, ...baseValue } = parsed.value;
  void _planFormat;
  return {
    success: true,
    value: {
      ...baseValue,
      ...(normalizedFormat !== undefined ? { format: normalizedFormat } : {}),
      ...(typeof record.budget === "number" ? { budget: record.budget } : {})
    }
  };
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
  if (record.report === undefined) {
    return { success: false, message: '"report" is required and must be a FixMap report object or a path to a FixMap JSON report.' };
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

function normalizePlanFormat(candidate: unknown): { success: true; value: "markdown" | "json" | "agent" | undefined } | { success: false; message: string } {
  if (candidate === undefined) return { success: true, value: undefined };
  if (typeof candidate !== "string") return { success: false, message: '"format" must be "markdown", "json", or "agent".' };
  const value = candidate.trim().toLowerCase();
  return value === "markdown" || value === "json" || value === "agent"
    ? { success: true, value }
    : { success: false, message: '"format" must be "markdown", "json", or "agent".' };
}

function normalizeFormat(candidate: unknown): { success: true; value: "markdown" | "json" | undefined } | { success: false; message: string } {
  if (candidate === undefined) return { success: true, value: undefined };
  if (typeof candidate !== "string") return { success: false, message: '"format" must be either "markdown" or "json".' };
  const value = candidate.trim().toLowerCase();
  return value === "markdown" || value === "json"
    ? { success: true, value }
    : { success: false, message: '"format" must be either "markdown" or "json".' };
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
      contents = readDecodedTextFile(path);
    } catch (error) {
      return {
        success: false,
        message: `${label} looked like a file path but could not be read: ${describeInputReadError(path, error)}`
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

export async function runMcpServer(defaultRepo = process.cwd()): Promise<void> {
  await createFixMapMcpServer({}, defaultRepo).connect(
    new InitializationGuardTransport(new StdioServerTransport())
  );
}

/**
 * The SDK handles capability negotiation but currently dispatches requests received before
 * `notifications/initialized`. Keep the protocol boundary honest here, and turn malformed
 * JSON lines into JSON-RPC parse errors instead of leaving a stdio client waiting forever.
 */
export class InitializationGuardTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: <T extends JSONRPCMessage>(message: T, extra?: MessageExtraInfo) => void;
  private initializeRequested = false;
  private initialized = false;

  constructor(private readonly inner: Transport) {}

  async start(): Promise<void> {
    this.inner.onclose = () => this.onclose?.();
    this.inner.onerror = (error) => {
      if (error instanceof SyntaxError) {
        void this.inner.send({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error" }
        } as unknown as JSONRPCMessage).catch((sendError: unknown) => this.onerror?.(toError(sendError)));
        return;
      }
      this.onerror?.(error);
    };
    this.inner.onmessage = (message, extra) => {
      if (isInitializedNotification(message)) {
        if (!this.initializeRequested) return;
        this.initialized = true;
        this.onmessage?.(message, extra);
        return;
      }
      if (isJSONRPCRequest(message) && message.method === "initialize") {
        this.initializeRequested = true;
      }
      if (isJSONRPCRequest(message) && message.method !== "initialize" && message.method !== "ping" && !this.initialized) {
        void this.inner.send({
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32002, message: "Server not initialized" }
        }).catch((sendError: unknown) => this.onerror?.(toError(sendError)));
        return;
      }
      this.onmessage?.(message, extra);
    };
    await this.inner.start();
  }

  send(message: JSONRPCMessage): Promise<void> {
    return this.inner.send(message);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

function toError(candidate: unknown): Error {
  return candidate instanceof Error ? candidate : new Error(String(candidate));
}

function readVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8")
  ) as { version: string };
  return packageJson.version;
}
