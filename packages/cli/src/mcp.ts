import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { buildFixMapReport, renderJsonReport, renderMarkdownReport } from "@aryam/fixmap-core";

type PlanArguments = {
  issue?: string;
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
    "Provide at least one of issue, diff, or base.",
  inputSchema: {
    type: "object" as const,
    properties: {
      issue: { type: "string", description: "Issue, prompt, or task description" },
      diff: { type: "string", description: "Git diff spec, such as main...HEAD" },
      base: { type: "string", description: "Base git ref to diff against when diff is not given" },
      head: { type: "string", description: "Head git ref, defaults to HEAD" },
      repo: {
        type: "string",
        description: "Absolute path to the repository root, defaults to the server working directory"
      },
      format: {
        type: "string",
        enum: ["markdown", "json"],
        description: "Report format, markdown by default"
      }
    }
  }
};

export function createFixMapMcpServer(): Server {
  const server = new Server({ name: "fixmap", version: readVersion() }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [PLAN_TOOL] }));

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== PLAN_TOOL.name) {
      return {
        isError: true,
        content: [{ type: "text", text: `Unknown tool: ${request.params.name}` }]
      };
    }

    const args = (request.params.arguments ?? {}) as PlanArguments;
    if (!args.issue && !args.diff && !args.base) {
      return {
        isError: true,
        content: [{ type: "text", text: "Provide issue, diff, or base/head so FixMap has a task signal." }]
      };
    }

    const report = await buildFixMapReport({
      repoRoot: args.repo ? resolve(args.repo) : process.cwd(),
      issueText: args.issue,
      diffSpec: args.diff,
      baseRef: args.base,
      headRef: args.head
    });
    const text = args.format === "json" ? renderJsonReport(report) : renderMarkdownReport(report);
    return { content: [{ type: "text", text }] };
  });

  return server;
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
