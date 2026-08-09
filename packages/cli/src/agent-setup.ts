import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

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
  const root = resolve(input.repoRoot);
  try {
    if (!(await stat(root)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Setup repository "${root}" does not exist or is not a directory.`);
  }
  const results: Array<{ path: string; status: "created" | "unchanged" | "updated" }> = [];
  for (const target of input.targets) {
    const template = templates[target];
    const path = join(root, template.path);
    let existing: string | undefined;
    try { existing = await readFile(path, "utf8"); } catch { /* A missing file is expected. */ }
    if (existing === template.contents) {
      results.push({ path: relative(root, path).replace(/\\/g, "/"), status: "unchanged" });
      continue;
    }
    if (existing !== undefined && !input.force) {
      throw new Error(`Refusing to overwrite existing ${relative(root, path)}. Re-run with --force after reviewing it.`);
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, template.contents, "utf8");
    results.push({ path: relative(root, path).replace(/\\/g, "/"), status: existing === undefined ? "created" : "updated" });
  }
  return results;
}
