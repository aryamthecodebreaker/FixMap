import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { lstat, readlink } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { promisify } from "node:util";
import { renderVerifyMarkdown, scanRepo, verifyPlan, type FixMapReport, type VerifyResult } from "@aryam/fixmap-core";

const exec = promisify(execFile);
const GIT_MAX_BUFFER = 24 * 1024 * 1024;

export type WatchUpdate = {
  watchVersion: 1;
  sequence: number;
  observedAt: string;
  verification: VerifyResult;
};

export type WatchRepositoryInput = {
  repoRoot: string;
  report: FixMapReport;
  intervalMs?: number | undefined;
  includeUntracked?: boolean | undefined;
  once?: boolean | undefined;
  signal?: AbortSignal | undefined;
  onUpdate: (update: WatchUpdate) => void | Promise<void>;
  fingerprint?: ((repoRoot: string, includeUntracked: boolean) => Promise<string>) | undefined;
  scan?: typeof scanRepo | undefined;
  wait?: ((milliseconds: number, signal?: AbortSignal) => Promise<void>) | undefined;
};

/**
 * Continuously verifies the working tree against a saved plan. The lightweight Git
 * fingerprint prevents full repository scans while nothing has changed; every emitted
 * update is backed by a fresh scan and a recalculated Impact Graph.
 */
export async function watchRepository(input: WatchRepositoryInput): Promise<WatchUpdate | undefined> {
  const intervalMs = input.intervalMs ?? 1_500;
  const includeUntracked = input.includeUntracked === true;
  const fingerprint = input.fingerprint ?? fingerprintWorkingTree;
  const scan = input.scan ?? scanRepo;
  const wait = input.wait ?? waitForInterval;
  let previousFingerprint: string | undefined;
  let history: Awaited<ReturnType<typeof scanRepo>>["history"];
  let sequence = 0;
  let lastUpdate: WatchUpdate | undefined;

  if (!input.fingerprint) await validateWatchRepository(input.repoRoot);

  while (!input.signal?.aborted) {
    const currentFingerprint = await fingerprint(input.repoRoot, includeUntracked);
    if (currentFingerprint !== previousFingerprint) {
      const repo = await scan({
        repoRoot: input.repoRoot,
        workingTree: true,
        includeUntracked,
        useCache: false,
        includeHistory: history === undefined
      });
      const unresolved = repo.diagnostics.find((entry) => entry.code === "diff-unavailable");
      if (unresolved) throw new Error(`${unresolved.message} Watch needs a local Git working tree.`);
      history ??= repo.history;
      if (!repo.history && history) repo.history = history;

      sequence += 1;
      const verification = verifyPlan(input.report, repo);
      const mismatch = verification.findings.find((finding) => finding.code === "plan-repository-mismatch");
      if (mismatch) {
        throw new Error(`${mismatch.message} Watch stopped because the saved report belongs to a different repository.`);
      }
      lastUpdate = {
        watchVersion: 1,
        sequence,
        observedAt: new Date().toISOString(),
        verification
      };
      await input.onUpdate(lastUpdate);
      previousFingerprint = currentFingerprint;
    }

    if (input.once) return lastUpdate;
    try {
      await wait(intervalMs, input.signal);
    } catch (error) {
      if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) return lastUpdate;
      throw error;
    }
  }
  return lastUpdate;
}

export function renderWatchUpdate(update: WatchUpdate, format: "markdown" | "json"): string {
  if (format === "json") return `${JSON.stringify(update)}\n`;
  return [
    `## Watch update ${update.sequence} — ${update.observedAt}`,
    "",
    renderVerifyMarkdown(update.verification).trimEnd(),
    ""
  ].join("\n");
}

export async function fingerprintWorkingTree(repoRoot: string, includeUntracked: boolean): Promise<string> {
  const git = async (args: string[]) => (await exec("git", args, {
    cwd: repoRoot,
    encoding: "buffer",
    maxBuffer: GIT_MAX_BUFFER,
    windowsHide: true,
    env: {
      ...process.env,
      GIT_CONFIG_COUNT: "2",
      GIT_CONFIG_KEY_0: "core.fsmonitor",
      GIT_CONFIG_VALUE_0: "false",
      GIT_CONFIG_KEY_1: "diff.external",
      GIT_CONFIG_VALUE_1: ""
    }
  })).stdout;

  try {
    const [status, untracked] = await Promise.all([
      git(["status", "--porcelain=v1", "-z", includeUntracked ? "--untracked-files=all" : "--untracked-files=no"]),
      includeUntracked ? git(["ls-files", "--others", "--exclude-standard", "-z"]) : Promise.resolve(Buffer.alloc(0))
    ]);
    let diff: Buffer;
    let contentPaths = untracked;
    try {
      diff = await git(["diff", "--no-ext-diff", "--no-textconv", "--binary", "HEAD", "--"]);
    } catch (error) {
      if (!isMissingHead(error)) throw error;
      diff = Buffer.alloc(0);
      contentPaths = Buffer.concat([contentPaths, await git(["ls-files", "--cached", "-z"])]);
    }
    const hash = createHash("sha256").update(status).update(diff).update(contentPaths);
    if (contentPaths.length > 0) await hashWorkingFiles(repoRoot, contentPaths, hash);
    return hash.digest("hex");
  } catch (error) {
    if (isMissingGit(error)) throw new Error("Watch needs Git installed and available on PATH.");
    if (isNotGitRepository(error)) throw new Error(`Watch needs a local Git checkout; ${resolve(repoRoot)} is not a Git repository.`);
    throw new Error(`Could not inspect the working tree: ${gitErrorDetail(error)}`);
  }
}

export async function validateWatchRepository(repoRoot: string): Promise<void> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: GIT_MAX_BUFFER,
      windowsHide: true
    });
    if (stdout.trim() !== "true") throw new Error("not-repository");
  } catch (error) {
    if (isMissingGit(error)) throw new Error("Watch needs Git installed and available on PATH.");
    throw new Error(`Watch needs a local Git checkout; ${resolve(repoRoot)} is not a Git repository.`);
  }
}

function isMissingGit(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "ENOENT";
}

function isNotGitRepository(error: unknown): boolean {
  return /not a git repository|not-repository/i.test(gitErrorText(error));
}

function gitErrorText(error: unknown): string {
  const candidate = error as { message?: unknown; stderr?: unknown };
  return `${typeof candidate?.message === "string" ? candidate.message : String(error)}\n${String(candidate?.stderr ?? "")}`;
}

function gitErrorDetail(error: unknown): string {
  const candidate = error as { message?: unknown; stderr?: unknown };
  const stderr = typeof candidate?.stderr === "string" ? candidate.stderr : Buffer.isBuffer(candidate?.stderr) ? candidate.stderr.toString("utf8") : "";
  const message = typeof candidate?.message === "string" ? candidate.message : String(error);
  return stderr.split(/\r?\n/).find((line) => line.trim()) ?? message.split(/\r?\n/)[0] ?? "unknown Git error";
}

function isMissingHead(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const stderr = "stderr" in error ? String((error as Error & { stderr?: unknown }).stderr ?? "") : "";
  return /bad revision ['"]?HEAD|unknown revision.*HEAD|ambiguous argument ['"]?HEAD/i.test(`${error.message}\n${stderr}`);
}

async function hashWorkingFiles(repoRoot: string, paths: Buffer, hash: ReturnType<typeof createHash>): Promise<void> {
  for (const path of paths.toString("utf8").split("\0").filter(Boolean).slice(0, 25_000)) {
    const absolute = resolve(repoRoot, path);
    const distance = relative(repoRoot, absolute);
    if (!distance || distance === ".." || distance.startsWith(`..${sep}`) || isAbsolute(distance)) continue;
    hash.update(path).update("\0");
    try {
      const info = await lstat(absolute);
      if (info.isSymbolicLink()) {
        hash.update("symlink\0").update(await readlink(absolute));
      } else if (info.isFile()) {
        for await (const chunk of createReadStream(absolute)) hash.update(chunk as Buffer);
      }
    } catch {
      // A file can disappear between `git ls-files` and the read. Its next fingerprint
      // records the new state; this pass stays alive instead of crashing the monitor.
      hash.update("unavailable\0");
    }
  }
}

async function waitForInterval(milliseconds: number, signal?: AbortSignal): Promise<void> {
  await delay(milliseconds, undefined, signal ? { signal } : undefined);
}
