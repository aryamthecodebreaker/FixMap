import { lstat, mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export type AgentTarget = "claude" | "cursor" | "copilot" | "agents";

export const FIXMAP_FEATURES = [
  { name: "Plan", command: "fixmap plan", detail: "Rank context files, test routes, risks, changed files, and uncertainty from a task, issue URL, diff, or working tree." },
  { name: "Explain", command: "fixmap plan --explain <path>", detail: "Show whether a path ranked, tied below the limit, was excluded, or was never scanned." },
  { name: "Compare", command: "fixmap plan --compare <report.json>", detail: "Compare a refined task and current plan with an earlier JSON report." },
  { name: "Verify", command: "fixmap verify --report <report.json>", detail: "Compare the completed diff or working tree with the saved plan." },
  { name: "Validate", command: "fixmap validate <report.json>", detail: "Check a saved report against FixMap's structural compatibility contract." },
  { name: "Doctor", command: "fixmap doctor", detail: "Diagnose stale local, global, PATH, and npx install shadows." },
  { name: "MCP", command: "fixmap mcp", detail: "Expose Plan, Explain, Compare, Verify, and Doctor over local stdio." },
  { name: "Focus", command: "--limit, --exclude, .fixmapignore", detail: "Narrow ranking without changing the repository." },
  { name: "Live changes", command: "--working-tree --include-untracked", detail: "Map staged, unstaged, and optionally untracked work against HEAD." },
  { name: "Fresh scan", command: "--no-cache", detail: "Bypass the exact git-state scan cache and report that a fresh scan was used." }
] as const;

export function renderFeatureCatalog(format: "markdown" | "json" = "markdown"): string {
  if (format === "json") return `${JSON.stringify({ features: FIXMAP_FEATURES }, null, 2)}\n`;
  return [
    "# FixMap features",
    "",
    ...FIXMAP_FEATURES.flatMap((feature) => [
      `- **${feature.name}** — \`${feature.command}\``,
      `  ${feature.detail}`
    ]),
    "",
    "Run `fixmap setup` to install `/fixmap` discovery for supported coding agents.",
    ""
  ].join("\n");
}

const SHARED_INSTRUCTIONS = `You are the FixMap workflow assistant for this repository.

When this command is invoked without a task, run \`fixmap features\` and present every feature in a compact menu. Do not edit files. Ask which workflow the user wants.

When the invocation includes a task, issue URL, diff, file path, or workflow name:

1. Run \`fixmap features\` if the requested capability is ambiguous.
2. Use the matching local command: Plan, Explain, Compare, Verify, Validate, Doctor, or MCP.
3. Preserve the user's repository and never imply that FixMap ran tests or proved correctness; it produces a starting map and verification findings.
4. Report the exact command used and summarize files, checks, risks, and diagnostics.

Prefer \`fixmap plan --issue "$ARGUMENTS" --repo .\` for task text. Use a canonical public GitHub issue URL directly when one is provided.`;

const templates: Record<AgentTarget, { path: string; contents: string }> = {
  claude: {
    path: ".claude/skills/fixmap/SKILL.md",
    contents: `---\nname: fixmap\ndescription: Discover and run every FixMap repository-mapping workflow\ndisable-model-invocation: true\nargument-hint: [task, issue URL, file, diff, or workflow]\n---\n\n${SHARED_INSTRUCTIONS}\n`
  },
  cursor: {
    path: ".cursor/commands/fixmap.md",
    contents: `---\ndescription: List or run every FixMap repository-mapping workflow\n---\n\n${SHARED_INSTRUCTIONS}\n`
  },
  copilot: {
    path: ".github/prompts/fixmap.prompt.md",
    contents: `---\nagent: 'agent'\ndescription: 'List or run every FixMap repository-mapping workflow'\n---\n\n${SHARED_INSTRUCTIONS}\n`
  },
  agents: {
    path: ".agents/skills/fixmap/SKILL.md",
    contents: `---\nname: fixmap\ndescription: Discover and run every FixMap repository-mapping workflow\n---\n\n${SHARED_INSTRUCTIONS}\n`
  }
};

export async function installAgentCommands(input: {
  repoRoot: string;
  targets: AgentTarget[];
  force?: boolean;
}): Promise<Array<{ path: string; status: "created" | "unchanged" | "updated" }>> {
  const requestedRoot = resolve(input.repoRoot);
  try {
    if (!(await stat(requestedRoot)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Setup repository "${requestedRoot}" does not exist or is not a directory.`);
  }
  const root = await realpath(requestedRoot);
  const prepared: Array<{
    path: string;
    displayPath: string;
    contents: string;
    existing: string | undefined;
  }> = [];

  // Preflight every target before writing any of them. A customized command or unsafe link
  // must not leave a half-installed multi-agent setup behind.
  for (const target of input.targets) {
    const template = templates[target];
    const path = join(root, template.path);
    const displayPath = relative(root, path).replace(/\\/g, "/");
    await assertSafeTarget(root, path, displayPath);
    let existing: string | undefined;
    try {
      existing = await readFile(path, "utf8");
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ENOENT") {
        throw new Error(`Could not inspect existing ${displayPath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (existing !== undefined && !input.force) {
      if (existing !== template.contents) {
        throw new Error(`Refusing to overwrite existing ${displayPath}. Re-run with --force after reviewing it.`);
      }
    }
    prepared.push({ path, displayPath, contents: template.contents, existing });
  }

  const results: Array<{ path: string; status: "created" | "unchanged" | "updated" }> = [];
  for (const entry of prepared) {
    if (entry.existing === entry.contents) {
      results.push({ path: entry.displayPath, status: "unchanged" });
      continue;
    }
    await mkdir(dirname(entry.path), { recursive: true });
    await writeFile(entry.path, entry.contents, "utf8");
    results.push({ path: entry.displayPath, status: entry.existing === undefined ? "created" : "updated" });
  }
  return results;
}

async function assertSafeTarget(root: string, target: string, displayPath: string): Promise<void> {
  try {
    const targetMetadata = await lstat(target);
    if (targetMetadata.isSymbolicLink()) {
      throw new Error(`Refusing to write ${displayPath} because the target is a symbolic link.`);
    }
    if (!targetMetadata.isFile()) {
      throw new Error(`Refusing to write ${displayPath} because the target is not a regular file.`);
    }
    if (targetMetadata.nlink > 1) {
      throw new Error(`Refusing to write ${displayPath} because the target is hard-linked to another file.`);
    }
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
  }

  let ancestor = dirname(target);
  while (true) {
    try {
      const ancestorMetadata = await lstat(ancestor);
      if (!ancestorMetadata.isDirectory() && !ancestorMetadata.isSymbolicLink()) {
        throw new Error(`Refusing to write ${displayPath} because ${ancestor} is not a directory.`);
      }
      const resolvedAncestor = await realpath(ancestor);
      const distance = relative(root, resolvedAncestor);
      if (distance === ".." || distance.startsWith(`..${sep}`) || isAbsolute(distance)) {
        throw new Error(`Refusing to write ${displayPath} because its parent resolves outside the setup repository.`);
      }
      return;
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ENOENT") throw error;
      const parent = dirname(ancestor);
      if (parent === ancestor) {
        throw new Error(`Could not find a safe parent directory for ${displayPath}.`);
      }
      ancestor = parent;
    }
  }
}
