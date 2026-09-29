import { execFile, spawn } from "node:child_process";
import { extname, resolve } from "node:path";
import { promisify } from "node:util";
import { architecturePolicyFromRepo, buildArchitectureSnapshot, compareArchitectureSnapshots } from "./architecture.js";
import type { ArchitectureDrift, ArchitectureSnapshot } from "./architecture.js";
import { isLanguageTestPath } from "./language-adapters.js";
import { SOURCE_FILE_EXTENSIONS } from "./paths.js";
import type { RepoFile, RepoMap, ScanDiagnostic } from "./types.js";

const exec = promisify(execFile);
const MAX_REF_LENGTH = 500;
const MAX_TREE_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 25_000;
const MAX_TEXT_SAMPLE_BYTES = 64_000;
const MAX_BATCH_BYTES = 64 * 1024 * 1024;
const MAX_BATCH_OUTPUT_BYTES = MAX_BATCH_BYTES + 2 * 1024 * 1024;

type TreeEntry = { mode: string; oid: string; size: number; path: string };

export type HistoricalRepoMap = {
  requestedRef: string;
  commit: string;
  repo: RepoMap;
};

export type HistoricalArchitectureSnapshot = {
  requestedRef: string;
  commit: string;
  snapshot: ArchitectureSnapshot;
};

/** Read a committed repository state through Git objects without checking it out. */
export async function scanRepoAtRef(input: { repoRoot: string; ref: string }): Promise<HistoricalRepoMap> {
  const repoRoot = resolve(input.repoRoot);
  const requestedRef = validateRef(input.ref);
  const commit = await resolveCommit(repoRoot, requestedRef);
  const { stdout } = await exec("git", ["ls-tree", "-r", "-z", "-l", "--full-tree", commit, "--"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: MAX_TREE_BYTES
  });
  const allEntries = parseTree(stdout).filter((entry) => entry.mode !== "120000");
  const entries = allEntries.slice(0, MAX_FILES);
  const diagnostics: ScanDiagnostic[] = [];
  if (allEntries.length > entries.length) diagnostics.push({
    code: "scan-limit-reached",
    severity: "warning",
    message: `Historical scan stopped after ${MAX_FILES.toLocaleString()} files at ${commit}.`
  });

  const readable: TreeEntry[] = [];
  let scheduledBytes = 0;
  for (const entry of entries) {
    if (!isSourcePath(entry.path) || entry.size > MAX_TEXT_SAMPLE_BYTES) continue;
    if (scheduledBytes + entry.size > MAX_BATCH_BYTES) continue;
    readable.push(entry);
    scheduledBytes += entry.size;
  }
  const content = await readBlobs(repoRoot, readable);
  const files = entries.map((entry): RepoFile => buildRepoFile(entry, content.get(entry.oid)));
  return {
    requestedRef,
    commit,
    repo: {
      root: repoRoot,
      files,
      trackedFiles: entries.map((entry) => entry.path),
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: inferPackageManager(entries),
      diagnostics
    }
  };
}

export async function buildArchitectureSnapshotAtRef(input: {
  repoRoot: string;
  ref: string;
  applyRepositoryPolicy?: boolean;
}): Promise<HistoricalArchitectureSnapshot> {
  const historical = await scanRepoAtRef(input);
  const policy = input.applyRepositoryPolicy === false ? undefined : architecturePolicyFromRepo(historical.repo);
  return {
    requestedRef: historical.requestedRef,
    commit: historical.commit,
    snapshot: buildArchitectureSnapshot(historical.repo, policy)
  };
}

export async function compareArchitectureRefs(input: {
  repoRoot: string;
  fromRef: string;
  toRef: string;
  applyRepositoryPolicy?: boolean;
  couplingDelta?: number;
}): Promise<{
  from: HistoricalArchitectureSnapshot;
  to: HistoricalArchitectureSnapshot;
  drift: ArchitectureDrift;
}> {
  const [from, to] = await Promise.all([
    buildArchitectureSnapshotAtRef({
      repoRoot: input.repoRoot,
      ref: input.fromRef,
      ...(input.applyRepositoryPolicy !== undefined ? { applyRepositoryPolicy: input.applyRepositoryPolicy } : {})
    }),
    buildArchitectureSnapshotAtRef({
      repoRoot: input.repoRoot,
      ref: input.toRef,
      ...(input.applyRepositoryPolicy !== undefined ? { applyRepositoryPolicy: input.applyRepositoryPolicy } : {})
    })
  ]);
  return {
    from,
    to,
    drift: compareArchitectureSnapshots(from.snapshot, to.snapshot, {
      ...(input.couplingDelta !== undefined ? { couplingDelta: input.couplingDelta } : {})
    })
  };
}

function validateRef(value: string): string {
  const ref = value.trim();
  if (!ref || ref.length > MAX_REF_LENGTH || /[\0\r\n]/.test(ref)) throw new Error("Git ref must be a bounded single-line value.");
  return ref;
}

async function resolveCommit(repoRoot: string, ref: string): Promise<string> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1024 * 1024
    });
    const commit = stdout.trim();
    if (!/^[a-f0-9]{40,64}$/i.test(commit)) throw new Error("Git returned an invalid commit identity.");
    return commit.toLowerCase();
  } catch (error) {
    throw new Error(`Could not resolve Git ref ${JSON.stringify(ref)}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function parseTree(value: string): TreeEntry[] {
  return value.split("\0").flatMap((record): TreeEntry[] => {
    if (!record) return [];
    const tab = record.indexOf("\t");
    const header = tab === -1 ? "" : record.slice(0, tab);
    const path = tab === -1 ? "" : record.slice(tab + 1).replace(/\\/g, "/");
    const match = /^(\d+) blob ([a-f0-9]{40,64})\s+(\d+)$/.exec(header);
    if (!match || !safePath(path)) return [];
    return [{ mode: match[1]!, oid: match[2]!.toLowerCase(), size: Number(match[3]), path }];
  });
}

async function readBlobs(repoRoot: string, entries: readonly TreeEntry[]): Promise<Map<string, Buffer>> {
  if (entries.length === 0) return new Map();
  const uniqueOids = [...new Set(entries.map((entry) => entry.oid))];
  const child = spawn("git", ["cat-file", "--batch"], { cwd: repoRoot, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  let outputBytes = 0;
  child.stdout.on("data", (chunk: Buffer) => {
    outputBytes += chunk.length;
    if (outputBytes > MAX_BATCH_OUTPUT_BYTES) child.kill();
    else stdout.push(chunk);
  });
  child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
  child.stdin.end(`${uniqueOids.join("\n")}\n`);
  const exitCode = await new Promise<number | null>((resolveExit, reject) => {
    child.once("error", reject);
    child.once("close", resolveExit);
  });
  if (exitCode !== 0 || outputBytes > MAX_BATCH_OUTPUT_BYTES) {
    throw new Error(`git cat-file failed while reading historical sources: ${Buffer.concat(stderr).toString("utf8").trim() || `exit ${exitCode}`}`);
  }
  return parseBatch(Buffer.concat(stdout), uniqueOids);
}

function parseBatch(output: Buffer, oids: readonly string[]): Map<string, Buffer> {
  const result = new Map<string, Buffer>();
  let offset = 0;
  for (const expected of oids) {
    const newline = output.indexOf(0x0a, offset);
    if (newline === -1) throw new Error("git cat-file returned a truncated header.");
    const header = output.subarray(offset, newline).toString("ascii");
    const match = /^([a-f0-9]{40,64}) blob (\d+)$/.exec(header);
    if (!match || match[1]!.toLowerCase() !== expected) throw new Error("git cat-file returned an unexpected object.");
    const size = Number(match[2]);
    const start = newline + 1;
    const end = start + size;
    if (!Number.isSafeInteger(size) || end >= output.length || output[end] !== 0x0a) {
      throw new Error("git cat-file returned a truncated object.");
    }
    result.set(expected, output.subarray(start, end));
    offset = end + 1;
  }
  if (offset !== output.length) throw new Error("git cat-file returned trailing output.");
  return result;
}

function buildRepoFile(entry: TreeEntry, bytes: Buffer | undefined): RepoFile {
  const extension = extname(entry.path).toLowerCase();
  const isSource = isSourcePath(entry.path);
  let textSample = "";
  let textSampleComplete: boolean | undefined;
  let textSampleSkipReason: RepoFile["textSampleSkipReason"];
  if (isSource) {
    if (!bytes) {
      textSampleComplete = false;
      textSampleSkipReason = "too-large";
    } else {
      try {
        textSample = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        textSampleComplete = true;
      } catch {
        textSampleComplete = false;
        textSampleSkipReason = "not-text";
      }
    }
  }
  return {
    path: entry.path,
    contentFingerprint: `git:${entry.oid}`,
    extension,
    sizeBytes: entry.size,
    isTest: isLanguageTestPath(entry.path, extension) || /(?:^|\/)(?:__tests__|tests?|spec)(?:\/|$)/i.test(entry.path),
    isSource,
    kind: classify(entry.path, extension),
    textSample,
    ...(textSampleComplete !== undefined ? { textSampleComplete } : {}),
    ...(textSampleSkipReason ? { textSampleSkipReason } : {})
  };
}

function isSourcePath(path: string): boolean {
  return SOURCE_FILE_EXTENSIONS.has(extname(path).toLowerCase()) || /(?:^|\/)(?:dockerfile|makefile|pom\.xml|pyproject\.toml)$/i.test(path);
}

function classify(path: string, extension: string): RepoFile["kind"] {
  if (/\.(?:md|mdx)$/i.test(extension) || /(?:^|\/)docs?\//i.test(path)) return "documentation";
  if (/\.(?:json|ya?ml|toml)$/i.test(extension) || /(?:^|\/)(?:dockerfile|makefile|pom\.xml)$/i.test(path)) return "config";
  return isSourcePath(path) ? "code" : "other";
}

function inferPackageManager(entries: readonly TreeEntry[]): RepoMap["packageManager"] {
  const names = new Set(entries.map((entry) => entry.path.split("/").at(-1)?.toLowerCase()));
  if (names.has("pnpm-lock.yaml")) return "pnpm";
  if (names.has("yarn.lock")) return "yarn";
  if (names.has("bun.lock") || names.has("bun.lockb")) return "bun";
  return "npm";
}

function safePath(path: string): boolean {
  return Boolean(path) && !path.includes("\0") && !path.includes("\ufffd") && !/^[\/]/.test(path) &&
    path.split("/").every((part) => part && part !== "." && part !== "..");
}
