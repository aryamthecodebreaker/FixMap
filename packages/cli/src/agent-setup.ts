import { randomUUID } from "node:crypto";
import { lstat, mkdir, open, readFile, realpath, rename, rmdir, stat, unlink, writeFile, type FileHandle } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export type AgentTarget = "claude" | "cursor" | "copilot" | "agents";

export const FIXMAP_FEATURES = [
  { name: "Plan", command: "fixmap plan", detail: "Rank context files, test routes, risks, changed files, and uncertainty from a task, issue URL, diff, or working tree." },
  { name: "Impact Graph", command: "fixmap plan", detail: "Map likely dependents, dependencies, tests, and repeated Git co-change relationships around the primary context, with explicit evidence." },
  { name: "Context Pack", command: "fixmap context --issue <task> --budget 10000", detail: "Select task-aware source ranges from primary and impact files within a deterministic token budget." },
  { name: "Graph export", command: "fixmap graph --issue <task> --format mermaid", detail: "Export imports, reverse dependents, routed tests, and co-change evidence as Mermaid or JSON." },
  { name: "Explain", command: "fixmap plan --explain <path>", detail: "Show whether a path ranked, tied below the limit, was excluded, or was never scanned." },
  { name: "Compare", command: "fixmap plan --compare <report.json>", detail: "Compare a refined task and current plan with an earlier JSON report." },
  { name: "Verify", command: "fixmap verify --report <report.json>", detail: "Compare the completed diff or working tree with the saved plan; add --fail-on warning for a strict CI gate." },
  { name: "Validate", command: "fixmap validate <report.json>", detail: "Check a saved report against FixMap's structural compatibility contract." },
  { name: "Doctor", command: "fixmap doctor", detail: "Diagnose stale local, global, PATH, and npx install shadows." },
  { name: "MCP", command: "fixmap mcp", detail: "Expose Plan, Context, Graph, Explain, Compare, Verify, and Doctor over local stdio." },
  { name: "Public tasks", command: "fixmap owner/repository#123", detail: "Fetch public GitHub issue or pull-request text anonymously and scan its repository in an isolated checkout." },
  { name: "Repository sources", command: "--repo <path|url> --ref <branch|tag>", detail: "Map a local checkout, file URL, directory archive, or a named branch or tag from a public GitHub repository." },
  { name: "Task files", command: "--issue-file <file|->", detail: "Read long task text from UTF-8, UTF-16, or stdin, including BOM-less UTF-16 from common Windows tools." },
  { name: "Focus", command: "--limit, --exclude, .fixmapignore", detail: "Narrow ranking without changing the repository." },
  { name: "Live changes", command: "--working-tree --include-untracked", detail: "Map staged, unstaged, and optionally untracked work against HEAD." },
  { name: "Fresh scan", command: "--no-cache", detail: "Bypass the exact git-state cache with CLI --no-cache, MCP noCache: true, or Action no-cache: true, and report that a fresh scan was used." },
  { name: "Machine output", command: "--format json --output <file>", detail: "Emit a versioned JSON contract or readable Markdown without executing repository code." },
  { name: "Compact agent output", command: "--format agent", detail: "Emit EDIT CANDIDATE, INSPECT, TEST, RISK, AVOID, and UNCERTAINTY sections for a small context window." },
  { name: "Repository benchmark", command: "fixmap benchmark --repo . --last 50", detail: "Backtest BM25, FixMap, and Impact Graph on historical parent snapshots with history cut off before each target change." },
  { name: "Watch", command: "fixmap watch --report plan.json --repo .", detail: "Continuously verify working-tree drift and recalculate impact as an agent edits." },
  { name: "Test routing", command: "fixmap plan", detail: "Detect package, workspace, and language test commands, related tests, and skipped or gated suites." },
  { name: "Risk and diagnostics", command: "fixmap plan", detail: "Report bounded risk areas, grounding quality, unread content, scan limits, package-manager conflicts, and unresolved diffs." },
  { name: "GitHub Action", command: "uses: aryamthecodebreaker/FixMap@<version>", detail: "Plan or verify pull requests with bounded summaries, outputs, and one updated comment." },
  { name: "Agent setup", command: "fixmap setup", detail: "Install the discoverable /fixmap command for Claude Code, Cursor, GitHub Copilot, or Agent Skills." }
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
2. Use the matching local command: Plan, Context, Graph, Explain, Compare, Verify, Watch, Benchmark, Validate, Doctor, or MCP.
3. Read the Impact Graph as files to inspect, not a claim that each file must change. Preserve each relationship's evidence.
4. Prefer \`--format agent\` when context is constrained, \`fixmap watch\` while an agent is editing, and \`fixmap benchmark\` when the user asks whether FixMap works on this repository.
5. Preserve the user's repository and never imply that FixMap ran tests or proved correctness; it produces a starting map and verification findings.
6. Report the exact command used and summarize files, impact, checks, risks, and diagnostics.

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
}, dependencies: {
  /** Internal seam for deterministic race/failure tests; production setup never supplies it. */
  beforeCommit?: (entry: { path: string; displayPath: string }, index: number) => Promise<void>;
} = {}): Promise<Array<{ path: string; status: "created" | "unchanged" | "updated" }>> {
  const requestedRoot = resolve(input.repoRoot);
  try {
    if (!(await stat(requestedRoot)).isDirectory()) throw new Error("not a directory");
  } catch {
    throw new Error(`Setup repository "${requestedRoot}" does not exist or is not a directory.`);
  }
  const root = await realpath(requestedRoot);
  const setupLock = await acquireSetupLock(root);
  try {
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

  const changed = prepared.filter((entry) => entry.existing !== entry.contents);
  const staged: Array<(typeof changed)[number] & { stagedPath: string }> = [];
  const committed: Array<(typeof changed)[number]> = [];
  const createdDirectories = new Set<string>();

  try {
    // Stage every new command beside its destination before mutating any destination. The
    // random sibling name means a parent link swapped after preflight cannot redirect the
    // final rename: that name will not exist in the attacker's directory, so rename fails.
    for (const entry of changed) {
      const parent = dirname(entry.path);
      const firstCreated = await mkdir(parent, { recursive: true });
      if (firstCreated) rememberCreatedDirectories(createdDirectories, firstCreated, parent);
      await assertSafeTarget(root, entry.path, entry.displayPath);
      const stagedPath = join(parent, `.${basename(entry.path)}.fixmap-${randomUUID()}.tmp`);
      await writeFile(stagedPath, entry.contents, { encoding: "utf8", flag: "wx" });
      await assertSafeTarget(root, stagedPath, `${entry.displayPath} staging file`);
      staged.push({ ...entry, stagedPath });
    }

    for (let index = 0; index < staged.length; index += 1) {
      const entry = staged[index]!;
      await dependencies.beforeCommit?.({ path: entry.path, displayPath: entry.displayPath }, index);
      // Close the original check-then-write window. rename replaces a final symlink or
      // hardlink directory entry rather than following it, but rejecting one is clearer and
      // preserves an unexpected concurrent change instead of silently replacing it.
      await assertTargetUnchanged(root, entry.path, entry.displayPath, entry.existing);
      await assertSafeTarget(root, entry.stagedPath, `${entry.displayPath} staging file`);
      await rename(entry.stagedPath, entry.path);
      committed.push(entry);
    }
  } catch (error) {
    const rollbackErrors: string[] = [];
    for (const entry of committed.reverse()) {
      try {
        if (entry.existing === undefined) {
          await assertSafeTarget(root, entry.path, entry.displayPath);
          const current = await readFile(entry.path, "utf8");
          if (current !== entry.contents) {
            throw new Error("the installed file changed before rollback");
          }
          await unlink(entry.path);
        } else {
          await replaceWithContents(root, entry.path, entry.displayPath, entry.existing);
        }
      } catch (rollbackError) {
        rollbackErrors.push(`${entry.displayPath}: ${rollbackError instanceof Error ? rollbackError.message : String(rollbackError)}`);
      }
    }
    await cleanupStagingFiles(staged);
    await cleanupCreatedDirectories(createdDirectories);
    const detail = error instanceof Error ? error.message : String(error);
    if (rollbackErrors.length > 0) {
      throw new Error(`${detail} Setup rollback also failed for ${rollbackErrors.join("; ")}.`);
    }
    throw error;
  }

  const results = prepared.map((entry) => ({
    path: entry.displayPath,
    status: entry.existing === entry.contents
      ? "unchanged" as const
      : entry.existing === undefined
        ? "created" as const
        : "updated" as const
  }));
  return results;
  } finally {
    await releaseSetupLock(setupLock);
  }
}

async function assertTargetUnchanged(
  root: string,
  target: string,
  displayPath: string,
  expectedContents: string | undefined
): Promise<void> {
  await assertSafeTarget(root, target, displayPath);
  try {
    const currentContents = await readFile(target, "utf8");
    if (expectedContents === undefined || currentContents !== expectedContents) {
      throw new Error(`Refusing to write ${displayPath} because it changed while setup was running.`);
    }
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
    if (expectedContents !== undefined) {
      throw new Error(`Refusing to write ${displayPath} because it changed while setup was running.`);
    }
  }
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
      if (ancestorMetadata.isSymbolicLink()) {
        throw new Error(`Refusing to write ${displayPath} because parent ${ancestor} is a symbolic link.`);
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

async function replaceWithContents(root: string, target: string, displayPath: string, contents: string): Promise<void> {
  const parent = dirname(target);
  await assertSafeTarget(root, target, displayPath);
  const stagedPath = join(parent, `.${basename(target)}.fixmap-rollback-${randomUUID()}.tmp`);
  try {
    await writeFile(stagedPath, contents, { encoding: "utf8", flag: "wx" });
    await assertSafeTarget(root, stagedPath, `${displayPath} rollback file`);
    await assertSafeTarget(root, target, displayPath);
    await rename(stagedPath, target);
  } finally {
    try { await unlink(stagedPath); } catch (error) {
      if ((error as { code?: unknown }).code !== "ENOENT") throw error;
    }
  }
}

async function cleanupStagingFiles(entries: Array<{ stagedPath: string }>): Promise<void> {
  for (const entry of entries) {
    try { await unlink(entry.stagedPath); } catch (error) {
      if ((error as { code?: unknown }).code !== "ENOENT") {
        // Cleanup cannot make the original installation failure safer or more actionable.
        // A unique .tmp file may remain, but no /fixmap command points at it.
      }
    }
  }
}

function rememberCreatedDirectories(paths: Set<string>, firstCreated: string, leaf: string): void {
  const boundary = dirname(resolve(firstCreated));
  let current = resolve(leaf);
  while (current !== boundary) {
    paths.add(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}

async function cleanupCreatedDirectories(paths: Set<string>): Promise<void> {
  const deepestFirst = [...paths].sort((left, right) => right.length - left.length);
  for (const path of deepestFirst) {
    try { await rmdir(path); } catch (error) {
      if (!new Set(["ENOENT", "ENOTEMPTY", "EEXIST"]).has(String((error as { code?: unknown }).code))) {
        // Never turn cleanup of an empty setup directory into a broader deletion.
      }
    }
  }
}

type SetupLock = { handle: FileHandle; path: string; token: string };

async function acquireSetupLock(root: string): Promise<SetupLock> {
  const path = join(root, ".fixmap-setup.lock");
  const deadline = Date.now() + 10_000;
  while (true) {
    const token = `${process.pid}:${Date.now()}:${randomUUID()}`;
    try {
      const handle = await open(path, "wx", 0o600);
      try {
        await handle.writeFile(token, "utf8");
        return { handle, path, token };
      } catch (error) {
        await handle.close();
        try { await unlink(path); } catch { /* preserve the original lock creation error */ }
        throw error;
      }
    } catch (error) {
      const code = String((error as { code?: unknown }).code ?? "");
      if (!new Set(["EEXIST", "EPERM", "EACCES"]).has(code)) throw error;

      // Windows can briefly report EPERM while another setup closes and removes the lock.
      // Retry that directory-entry transition, but preserve a persistent permission error
      // when no lock file actually exists instead of misreporting it as another setup.
      let lockPresent = code === "EEXIST";
      if (!lockPresent) {
        try {
          await lstat(path);
          lockPresent = true;
        } catch (inspectionError) {
          if ((inspectionError as { code?: unknown }).code !== "ENOENT") lockPresent = true;
        }
      }
      if (Date.now() >= deadline) {
        if (!lockPresent && code !== "EEXIST") throw error;
        throw new Error(
          `Another FixMap setup is still using "${path}". Wait for it to finish, or remove the lock only after confirming no setup process is running.`
        );
      }
      await delay(25);
    }
  }
}

async function releaseSetupLock(lock: SetupLock): Promise<void> {
  await lock.handle.close();
  try {
    const [contents, metadata] = await Promise.all([
      readFile(lock.path, "utf8"),
      lstat(lock.path)
    ]);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink > 1 || contents !== lock.token) {
      throw new Error(`FixMap setup lock "${lock.path}" changed while setup was running; it was left in place for review.`);
    }
    await unlink(lock.path);
  } catch (error) {
    if ((error as { code?: unknown }).code !== "ENOENT") throw error;
  }
}
