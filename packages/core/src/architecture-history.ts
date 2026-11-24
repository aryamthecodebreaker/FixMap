import { execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { architecturePolicyFromRepo, buildArchitectureSnapshot, compareArchitectureSnapshots } from "./architecture.js";
import type { ArchitectureDrift, ArchitectureSnapshot } from "./architecture.js";
import { inventoryDecisionRecords } from "./decisions.js";
import type { DecisionDiagnostic } from "./decisions.js";
import { buildPathExcluder } from "./exclude.js";
import { describeFileFromBytes, readRepositoryHistory } from "./repo-scan.js";
import type { PackageScript, RepoFile, RepoMap, ScanDiagnostic } from "./types.js";

const exec = promisify(execFile);
const MAX_REF_LENGTH = 500;
const MAX_TREE_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 25_000;
/** Larger blobs get no content, as a checkout's sampler would still read windows from them; rare enough to bound memory. */
const MAX_HISTORICAL_BLOB_BYTES = 16 * 1024 * 1024;
const MAX_BATCH_BYTES = 64 * 1024 * 1024;
const MAX_BATCH_OUTPUT_BYTES = MAX_BATCH_BYTES + 2 * 1024 * 1024;
// Bump whenever the import graph, snapshot, or decision-rule derivation changes. A commit's
// tree never changes, so this version and the commit ID are the whole invalidation key.
// 2: historical files are read with the checkout scan's rules (large-file samples, SFC script blocks).
const ARCHITECTURE_CACHE_VERSION = 2;
const ARCHITECTURE_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const ARCHITECTURE_CACHE_FILE = /^architecture-v\d+-[a-f0-9]{40,64}-(?:policy|no-policy)\.json$/;
const ARCHITECTURE_CACHE_TEMP_FILE = /^architecture-v\d+-[a-f0-9]{40,64}-(?:policy|no-policy)\.json\.\d+-[0-9a-f-]{36}\.tmp$/;

export type TreeEntry = { mode: string; oid: string; size: number; path: string };

export type HistoricalRepoMap = {
  requestedRef: string;
  commit: string;
  repo: RepoMap;
  /** Root `.fixmapignore` text as committed, when present and readable. */
  ignoreFile?: string;
};

/** An import rule stated by an accepted decision record at this commit. */
export type HistoricalDecisionRule = {
  decisionId: string;
  decisionPath: string;
  decisionTitle: string;
  from: string;
  deny: string;
};

export type HistoricalArchitectureSnapshot = {
  requestedRef: string;
  commit: string;
  snapshot: ArchitectureSnapshot;
  decisionRules: HistoricalDecisionRule[];
  /** Decision records at this commit that could not be read as authored rules. */
  decisionDiagnostics: DecisionDiagnostic[];
};

export type DecisionDisagreement = {
  decisionId: string;
  decisionPath: string;
  decisionTitle: string;
  rule: { from: string; deny: string };
  edge: { from: string; to: string };
  /** True when the violating edge is absent from the earlier snapshot. */
  introduced: boolean;
};

export type ArchitectureRefComparison = {
  from: HistoricalArchitectureSnapshot;
  to: HistoricalArchitectureSnapshot;
  drift: ArchitectureDrift;
  decisionDisagreements: DecisionDisagreement[];
};

type ArchitectureEntry = Omit<HistoricalArchitectureSnapshot, "requestedRef" | "commit">;

/** Read a committed repository state through Git objects without checking it out. */
export async function scanRepoAtRef(input: { repoRoot: string; ref: string }): Promise<HistoricalRepoMap> {
  const repoRoot = resolve(input.repoRoot);
  const requestedRef = validateRef(input.ref);
  // Plans rank with co-change history, so a historical plan reads the history up to that commit,
  // exactly as a checkout of it would.
  return scanCommit(repoRoot, requestedRef, await resolveCommit(repoRoot, requestedRef), { includeHistory: true });
}

async function scanCommit(repoRoot: string, requestedRef: string, commit: string, options: { includeHistory?: boolean } = {}): Promise<HistoricalRepoMap> {
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

  // The same source rule as the checkout scan decides what is read. Blobs are read in batches of
  // at most MAX_BATCH_BYTES and reduced to their samples at once, so memory stays bounded while
  // every readable file gets content, as on a checkout (a single 64 MB budget left 14,850 files of
  // a 213 MB repository without content).
  const wanted = entries.filter((entry) =>
    (entry.path === ".fixmapignore" || describeFileFromBytes(entry.path, entry.size, undefined).isSource) &&
    entry.size <= MAX_HISTORICAL_BLOB_BYTES);
  const described = new Map<string, RepoFile>();
  let ignoreBytes: Buffer | undefined;
  for (let start = 0; start < wanted.length;) {
    const batch: TreeEntry[] = [];
    let batchBytes = 0;
    while (start < wanted.length && (batch.length === 0 || batchBytes + wanted[start]!.size <= MAX_BATCH_BYTES)) {
      batch.push(wanted[start]!);
      batchBytes += wanted[start]!.size;
      start += 1;
    }
    const content = await readBlobs(repoRoot, batch);
    for (const entry of batch) {
      const bytes = content.get(entry.oid);
      if (entry.path === ".fixmapignore") ignoreBytes = bytes;
      described.set(entry.path, describeFileFromBytes(entry.path, entry.size, bytes, `git:${entry.oid}`));
    }
  }
  const files = entries.map((entry): RepoFile =>
    described.get(entry.path) ?? describeFileFromBytes(entry.path, entry.size, undefined, `git:${entry.oid}`));
  const history = options.includeHistory
    ? await readRepositoryHistory(repoRoot, new Set(files.map((file) => file.path)), diagnostics, commit)
    : undefined;
  return {
    requestedRef,
    commit,
    repo: {
      root: repoRoot,
      files,
      trackedFiles: entries.map((entry) => entry.path),
      packageScripts: historicalPackageScripts(files, diagnostics),
      changedFiles: [],
      diffText: "",
      packageManager: inferPackageManager(entries),
      diagnostics,
      ...(history ? { history } : {})
    },
    ...(ignoreBytes ? { ignoreFile: ignoreBytes.toString("utf8") } : {})
  };
}

export async function buildArchitectureSnapshotAtRef(input: {
  repoRoot: string;
  ref: string;
  applyRepositoryPolicy?: boolean;
  /** Reuse and store per-commit snapshots outside the repository (default true). */
  useCache?: boolean;
}): Promise<HistoricalArchitectureSnapshot> {
  const repoRoot = resolve(input.repoRoot);
  const requestedRef = validateRef(input.ref);
  const commit = await resolveCommit(repoRoot, requestedRef);
  const applyPolicy = input.applyRepositoryPolicy !== false;
  const cachePath = input.useCache === false ? undefined : architectureCachePath(repoRoot, commit, applyPolicy);
  const cached = cachePath ? await readArchitectureCache(cachePath, commit, applyPolicy) : undefined;
  if (cached) return { requestedRef, commit, ...cached };

  const historical = await scanCommit(repoRoot, requestedRef, commit);
  const policy = applyPolicy ? architecturePolicyFromRepo(historical.repo) : undefined;
  const inventory = inventoryDecisionRecords(historical.repo);
  const entry: ArchitectureEntry = {
    snapshot: buildArchitectureSnapshot(historical.repo, policy),
    // Only accepted records state intent. Proposed, rejected, superseded, and unlabeled
    // records are history, and treating them as rules would invent disagreements.
    decisionRules: inventory.records.filter((record) => record.status === "accepted").flatMap((record) =>
      (record.dependencyRules ?? []).map((rule) => ({
        decisionId: record.id,
        decisionPath: record.path,
        decisionTitle: record.title,
        from: rule.from,
        deny: rule.deny
      }))
    ),
    decisionDiagnostics: inventory.diagnostics.filter((diagnostic) => diagnostic.code !== "decision-target-missing")
  };
  if (cachePath) await writeArchitectureCache(cachePath, commit, applyPolicy, entry);
  return { requestedRef, commit, ...entry };
}

export async function compareArchitectureRefs(input: {
  repoRoot: string;
  fromRef: string;
  toRef: string;
  applyRepositoryPolicy?: boolean;
  couplingDelta?: number;
  useCache?: boolean;
}): Promise<ArchitectureRefComparison> {
  const options = {
    repoRoot: input.repoRoot,
    ...(input.applyRepositoryPolicy !== undefined ? { applyRepositoryPolicy: input.applyRepositoryPolicy } : {}),
    ...(input.useCache !== undefined ? { useCache: input.useCache } : {})
  };
  const [from, to] = await Promise.all([
    buildArchitectureSnapshotAtRef({ ...options, ref: input.fromRef }),
    buildArchitectureSnapshotAtRef({ ...options, ref: input.toRef })
  ]);
  return {
    from,
    to,
    drift: compareArchitectureSnapshots(from.snapshot, to.snapshot, {
      ...(input.couplingDelta !== undefined ? { couplingDelta: input.couplingDelta } : {})
    }),
    decisionDisagreements: findDecisionDisagreements(from.snapshot, to)
  };
}

/** Rules come from the later commit's accepted records and are checked against its edges. */
function findDecisionDisagreements(
  previous: ArchitectureSnapshot,
  current: HistoricalArchitectureSnapshot
): DecisionDisagreement[] {
  const earlier = new Set(previous.edges.map((edge) => `${edge.from}\0${edge.to}`));
  return current.decisionRules.flatMap((rule) => {
    const from = buildPathExcluder([rule.from]);
    const deny = buildPathExcluder([rule.deny]);
    return current.snapshot.edges.filter((edge) => from.excludes(edge.from) && deny.excludes(edge.to)).map((edge) => ({
      decisionId: rule.decisionId,
      decisionPath: rule.decisionPath,
      decisionTitle: rule.decisionTitle,
      rule: { from: rule.from, deny: rule.deny },
      edge: { from: edge.from, to: edge.to },
      introduced: !earlier.has(`${edge.from}\0${edge.to}`)
    }));
  }).sort((a, b) => a.decisionPath.localeCompare(b.decisionPath) || a.rule.from.localeCompare(b.rule.from) ||
    a.rule.deny.localeCompare(b.rule.deny) || a.edge.from.localeCompare(b.edge.from) || a.edge.to.localeCompare(b.edge.to));
}

function architectureCacheRoot(): string {
  // Same location rules as the repository scan cache: FIXMAP_CACHE_DIR, else the user cache.
  return resolve(process.env.FIXMAP_CACHE_DIR ?? join(
    process.env.LOCALAPPDATA ?? process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
    "fixmap",
    "scans"
  ));
}

function architectureCachePath(repoRoot: string, commit: string, applyPolicy: boolean): string | undefined {
  const cacheRoot = architectureCacheRoot();
  const fold = (value: string) => process.platform === "win32" ? value.toLowerCase() : value;
  const distance = relative(fold(repoRoot), fold(cacheRoot));
  // Never write into the repository being read, matching the scan cache.
  if (distance === "" || (distance !== ".." && !distance.startsWith(`..${sep}`) && !isAbsolute(distance))) return undefined;
  return join(cacheRoot, `architecture-v${ARCHITECTURE_CACHE_VERSION}-${commit}-${applyPolicy ? "policy" : "no-policy"}.json`);
}

async function readArchitectureCache(path: string, commit: string, applyPolicy: boolean): Promise<ArchitectureEntry | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (parsed.architectureHistoryCacheVersion !== ARCHITECTURE_CACHE_VERSION || parsed.commit !== commit ||
      parsed.applyPolicy !== applyPolicy || typeof parsed.checksum !== "string") return undefined;
    if (parsed.checksum !== checksum(JSON.stringify(parsed.entry))) return undefined;
    return isArchitectureEntry(parsed.entry) ? parsed.entry : undefined;
  } catch {
    // Missing, unreadable, or corrupt entries are rebuilt from Git objects.
    return undefined;
  }
}

async function writeArchitectureCache(path: string, commit: string, applyPolicy: boolean, entry: ArchitectureEntry): Promise<void> {
  const temporaryPath = `${path}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(path), { recursive: true });
    await pruneArchitectureCache(dirname(path));
    const record = {
      architectureHistoryCacheVersion: ARCHITECTURE_CACHE_VERSION,
      commit,
      applyPolicy,
      checksum: checksum(JSON.stringify(entry)),
      entry
    };
    await writeFile(temporaryPath, `${JSON.stringify(record)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, path);
  } catch {
    // Caching is an optimization; a read-only cache directory must not fail a history run.
    try {
      await unlink(temporaryPath);
    } catch { /* The rename may already have consumed it. */ }
  }
}

async function pruneArchitectureCache(directory: string): Promise<void> {
  try {
    const now = Date.now();
    await Promise.all((await readdir(directory, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && (ARCHITECTURE_CACHE_FILE.test(entry.name) || ARCHITECTURE_CACHE_TEMP_FILE.test(entry.name)))
      .map(async (entry) => {
        const path = join(directory, entry.name);
        try {
          if (now - (await stat(path)).mtimeMs > ARCHITECTURE_CACHE_MAX_AGE_MS) await unlink(path);
        } catch { /* Best effort. */ }
      }));
  } catch { /* A missing or read-only directory is harmless. */ }
}

function isArchitectureEntry(value: unknown): value is ArchitectureEntry {
  if (!isRecord(value) || !isRecord(value.snapshot) || !Array.isArray(value.decisionRules) || !Array.isArray(value.decisionDiagnostics)) return false;
  const snapshot = value.snapshot;
  const edge = (entry: unknown) => isRecord(entry) && typeof entry.from === "string" && typeof entry.to === "string";
  return snapshot.architectureSnapshotVersion === 1 && typeof snapshot.fingerprint === "string" &&
    typeof snapshot.sourceFingerprint === "string" && Array.isArray(snapshot.edges) && snapshot.edges.every(edge) &&
    Array.isArray(snapshot.cycles) && snapshot.cycles.every((cycle) => Array.isArray(cycle) && cycle.every((path) => typeof path === "string")) &&
    Array.isArray(snapshot.coupling) && Array.isArray(snapshot.boundaryViolations) && isRecord(snapshot.truncated) &&
    value.decisionRules.every((rule) => isRecord(rule) &&
      ["decisionId", "decisionPath", "decisionTitle", "from", "deny"].every((key) => typeof rule[key] === "string"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checksum(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function historicalPackageScripts(files: readonly RepoFile[], diagnostics: ScanDiagnostic[]): PackageScript[] {
  return files.filter((file) => file.path === "package.json" || file.path.endsWith("/package.json")).flatMap((manifest) => {
    if (manifest.textSampleComplete !== true) return [];
    try {
      const parsed = JSON.parse(manifest.textSample.replace(/^﻿/, "")) as { name?: unknown; scripts?: unknown };
      const packageDir = manifest.path.includes("/") ? manifest.path.slice(0, manifest.path.lastIndexOf("/")) : "";
      const packageName = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : undefined;
      const scripts = isRecord(parsed.scripts) ? parsed.scripts : {};
      return Object.entries(scripts).flatMap(([name, command]) => typeof command === "string"
        ? [{ name, command, packageDir, ...(packageName ? { packageName } : {}) }]
        : []);
    } catch {
      diagnostics.push({
        code: "package-json-invalid",
        severity: "warning",
        message: `Could not parse ${manifest.path} at this commit; scripts from that package were skipped.`
      });
      return [];
    }
  });
}

export function validateRef(value: string): string {
  const ref = value.trim();
  if (!ref || ref.length > MAX_REF_LENGTH || /[\0\r\n]/.test(ref)) throw new Error("Git ref must be a bounded single-line value.");
  return ref;
}

export async function resolveCommit(repoRoot: string, ref: string): Promise<string> {
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

export function parseTree(value: string): TreeEntry[] {
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

export async function readBlobs(repoRoot: string, entries: readonly TreeEntry[]): Promise<Map<string, Buffer>> {
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
  // git can exit before reading every id (not a repository, or killed at the output cap); the exit code reports that.
  child.stdin.on("error", () => undefined);
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
