import { isAbsolute, relative, resolve } from "node:path";
import {
  buildWorkspaceVerifyNarrative,
  findWorkspaceRepository,
  loadWorkspaceConfig,
  withoutMentions,
  type LoadedWorkspace
} from "@aryam/fixmap-core";

/** Statements shown in the comment; the CLI and MCP return the same bounded list. */
const WORKSPACE_STATEMENT_LIMIT = 8;

export type WorkspaceSectionContext = {
  repoRoot: string;
  /** The job workspace; the config must live inside it. Defaults to `repoRoot`. */
  jobRoot?: string;
  useCache: boolean;
  changedPaths: readonly string[];
  loadWorkspace?: typeof loadWorkspaceConfig;
};

/** Resolves the `workspace` input against the checkout and refuses paths outside the job workspace. */
export function resolveWorkspaceInput(raw: string | undefined, repoRoot: string, jobRoot = repoRoot): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) throw new Error("workspace must be a path to a workspace config file in the job workspace, not a URL.");
  const path = resolve(repoRoot, value);
  const offset = relative(resolve(jobRoot), path);
  if (offset === "" || offset.startsWith("..") || isAbsolute(offset)) {
    throw new Error("workspace must name a config file inside the job workspace.");
  }
  return path;
}

/**
 * Loads the workspace config, finds this checkout in it, and narrates which other checkouts consume
 * packages the pull request changes. Read-only: every checkout is scanned, nothing is written or run.
 */
export async function buildWorkspaceSection(configPath: string, context: WorkspaceSectionContext): Promise<string> {
  const loaded: LoadedWorkspace = await (context.loadWorkspace ?? loadWorkspaceConfig)(configPath, { useCache: context.useCache });
  const repository = await findWorkspaceRepository(loaded, context.repoRoot);
  if (!repository) {
    throw new Error("workspace config does not list this checkout; add its path so FixMap can trace what depends on it.");
  }
  const statements = buildWorkspaceVerifyNarrative(loaded.map, repository, context.changedPaths);
  const lines = [
    "## Cross-repository impact (preview)",
    "",
    `Workspace ${markdownCode(loaded.map.workspace)}, this checkout ${markdownCode(repository)}, ${count(loaded.map.repositories.length, "repository", "repositories")}, ${count(loaded.map.dependencies.length, "cross-repository dependency", "cross-repository dependencies")}.`,
    ""
  ];
  if (context.changedPaths.length === 0) {
    lines.push("- No changed files to trace.");
  } else if (statements.length === 0) {
    lines.push("- No other workspace checkout consumes a package this pull request changes.");
  } else {
    for (const statement of statements.slice(0, WORKSPACE_STATEMENT_LIMIT)) {
      const source = statement.evidence.find((entry) => entry.kind === "cross-repository");
      lines.push(`- **${statement.classification}** ${safeText(statement.text)}${source?.path ? ` (evidence: ${markdownCode(source.path)})` : ""}`);
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Scoped package names go in code spans; any other `@name` loses its `@` so nobody is notified. */
function safeText(text: string): string {
  return text.split(/(@[A-Za-z0-9][\w.-]*\/[\w.-]+)/g)
    .map((part, index) => index % 2 === 1 ? markdownCode(part) : withoutMentions(part).replace(/[\\`*_[\]<>|]/g, (character) => `\\${character}`))
    .join("");
}

function count(value: number, one: string, many: string): string {
  return `${value.toLocaleString()} ${value === 1 ? one : many}`;
}

function markdownCode(value: string): string {
  const longestRun = Math.max(0, ...(value.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longestRun + 1);
  const pad = /^[` ]|[` ]$/.test(value) ? " " : "";
  return `${fence}${pad}${value}${pad}${fence}`;
}
