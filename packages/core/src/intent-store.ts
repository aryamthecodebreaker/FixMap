import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rename, rm, rmdir, stat, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ChangeIntent, ChangeZone } from "./change-conflicts.js";
import { createGraphIdentity } from "./identity-graph.js";

/**
 * A coordination record an agent leaves in `.fixmap/intents/` before editing: who it is, what it
 * is doing, and which files (optionally which line ranges) it plans to touch. One file per intent,
 * so concurrent agents never overwrite each other's records.
 */
export type AgentIntent = {
  agentIntentVersion: 1;
  id: string;
  agent: string;
  task: string;
  baseCommit: string;
  createdAt: string;
  expiresAt: string;
  edits: AgentIntentEdit[];
  impacts: string[];
  contracts: string[];
};

export type AgentIntentEdit = { path: string; ranges?: Array<{ start: number; end: number }> };

export type RecordAgentIntentInput = {
  id?: string;
  agent: string;
  task: string;
  baseCommit: string;
  edits: AgentIntentEdit[];
  impacts?: string[];
  contracts?: string[];
  ttlMinutes?: number;
};

export type AgentIntentListing = {
  intents: AgentIntent[];
  expired: AgentIntent[];
  invalid: Array<{ file: string; message: string }>;
};

const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const AGENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const COMMIT = /^[0-9a-f]{40}([0-9a-f]{24})?$/;
const MAX_PATHS = 1_000;
const MAX_RANGES = 50;
const MAX_TASK = 500;
const DEFAULT_TTL_MINUTES = 120;
const MAX_TTL_MINUTES = 7 * 24 * 60;
const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;
const KEYS = new Set(["agentIntentVersion", "id", "agent", "task", "baseCommit", "createdAt", "expiresAt", "edits", "impacts", "contracts"]);

export function agentIntentsDirectory(repoRoot: string): string {
  return join(repoRoot, ".fixmap", "intents");
}

/** Validates a stored or proposed intent strictly; unknown fields, traversal, and unbounded lists are rejected. */
export function validateAgentIntent(value: unknown): AgentIntent {
  if (!isRecord(value) || value.agentIntentVersion !== 1) throw new Error("Agent intent must declare agentIntentVersion 1.");
  const unknown = Object.keys(value).filter((key) => !KEYS.has(key));
  if (unknown.length > 0) throw new Error(`Agent intent has unknown field ${unknown[0]}.`);
  const id = pattern(value.id, ID, "id");
  const agent = pattern(value.agent, AGENT, "agent");
  if (typeof value.task !== "string" || !value.task.trim() || value.task.length > MAX_TASK || /[\0-\x1f\x7f]/.test(value.task)) {
    throw new Error(`Agent intent task must be one line of at most ${MAX_TASK} characters.`);
  }
  const baseCommit = pattern(value.baseCommit, COMMIT, "baseCommit");
  const createdAt = timestamp(value.createdAt, "createdAt");
  const expiresAt = timestamp(value.expiresAt, "expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(createdAt)) throw new Error("Agent intent expiresAt must be after createdAt.");
  if (!Array.isArray(value.edits) || value.edits.length === 0 || value.edits.length > MAX_PATHS) {
    throw new Error(`Agent intent edits must list 1-${MAX_PATHS} files.`);
  }
  const edits = value.edits.map((entry, index) => edit(entry, index));
  const paths = new Set<string>();
  for (const entry of edits) {
    if (paths.has(entry.path)) throw new Error(`Agent intent edits list ${entry.path} more than once.`);
    paths.add(entry.path);
  }
  return {
    agentIntentVersion: 1,
    id,
    agent,
    task: value.task.trim(),
    baseCommit,
    createdAt,
    expiresAt,
    edits: edits.sort((a, b) => a.path.localeCompare(b.path)),
    impacts: pathList(value.impacts, "impacts"),
    contracts: pathList(value.contracts, "contracts")
  };
}

/** Records (or replaces, by id) one intent. The write is atomic and serialized with release and prune. */
export async function recordAgentIntent(repoRoot: string, input: RecordAgentIntentInput, now = new Date()): Promise<AgentIntent> {
  const ttl = input.ttlMinutes ?? DEFAULT_TTL_MINUTES;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_MINUTES) throw new Error(`ttlMinutes must be a whole number from 1 to ${MAX_TTL_MINUTES}.`);
  const intent = validateAgentIntent({
    agentIntentVersion: 1,
    id: input.id ?? `${input.agent}-${randomUUID().slice(0, 8)}`,
    agent: input.agent,
    task: input.task,
    baseCommit: input.baseCommit.toLowerCase(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl * 60_000).toISOString(),
    edits: input.edits,
    impacts: input.impacts ?? [],
    contracts: input.contracts ?? []
  });
  const directory = await ensureDirectory(repoRoot);
  await withLock(directory, async () => {
    const target = join(directory, `${intent.id}.json`);
    const temporary = join(directory, `.${intent.id}.${process.pid}.${randomUUID()}.tmp`);
    await writeFile(temporary, `${JSON.stringify(intent, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
    try {
      await rename(temporary, target);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  });
  return intent;
}

/** Reads every stored intent; expired and unreadable ones are reported separately, never silently used. */
export async function listAgentIntents(repoRoot: string, now = new Date()): Promise<AgentIntentListing> {
  const directory = agentIntentsDirectory(repoRoot);
  let names: string[];
  try {
    await assertNotLink(directory);
    names = await readdir(directory);
  } catch (error) {
    if ((error as { code?: string }).code === "ENOENT") return { intents: [], expired: [], invalid: [] };
    throw error;
  }
  const listing: AgentIntentListing = { intents: [], expired: [], invalid: [] };
  for (const name of names.filter((entry) => entry.endsWith(".json") && !entry.startsWith(".")).sort()) {
    try {
      const intent = validateAgentIntent(JSON.parse(await readFile(join(directory, name), "utf8")) as unknown);
      if (`${intent.id}.json` !== name) throw new Error(`file name does not match id ${intent.id}`);
      (Date.parse(intent.expiresAt) <= now.getTime() ? listing.expired : listing.intents).push(intent);
    } catch (error) {
      listing.invalid.push({ file: name, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return listing;
}

export async function releaseAgentIntent(repoRoot: string, id: string): Promise<boolean> {
  pattern(id, ID, "id");
  const directory = agentIntentsDirectory(repoRoot);
  if (!(await exists(directory))) return false;
  await assertNotLink(directory);
  return withLock(directory, async () => {
    try {
      await unlink(join(directory, `${id}.json`));
      return true;
    } catch (error) {
      if ((error as { code?: string }).code === "ENOENT") return false;
      throw error;
    }
  });
}

/** Removes expired intents only. Unreadable files are left for a person to inspect. */
export async function pruneAgentIntents(repoRoot: string, now = new Date()): Promise<string[]> {
  const directory = agentIntentsDirectory(repoRoot);
  if (!(await exists(directory))) return [];
  return withLock(directory, async () => {
    const { expired } = await listAgentIntents(repoRoot, now);
    for (const intent of expired) await unlink(join(directory, `${intent.id}.json`)).catch(() => undefined);
    return expired.map((intent) => intent.id);
  });
}

/** File-level graph identities, so stored intents feed the same engine as explicit change intents. */
export function agentIntentToChangeIntent(intent: AgentIntent): ChangeIntent {
  const zone = (path: string, ranges?: AgentIntentEdit["ranges"]): ChangeZone => ({
    identity: createGraphIdentity({ workspace: "local", kind: "file", key: path }),
    label: path,
    ...(ranges && ranges.length > 0 ? { ranges: ranges.map((range) => ({ startLine: range.start, endLine: range.end })) } : {})
  });
  return {
    changeIntentVersion: 1,
    id: intent.id,
    baseGraphFingerprint: `git:${intent.baseCommit}`,
    edits: intent.edits.map((entry) => zone(entry.path, entry.ranges)),
    impacts: intent.impacts.map((path) => zone(path)),
    contracts: intent.contracts.map((path) => zone(path))
  };
}

async function ensureDirectory(repoRoot: string): Promise<string> {
  const directory = agentIntentsDirectory(repoRoot);
  await mkdir(directory, { recursive: true });
  await assertNotLink(join(repoRoot, ".fixmap"));
  await assertNotLink(directory);
  return directory;
}

async function assertNotLink(path: string): Promise<void> {
  const info = await lstat(path);
  if (info.isSymbolicLink()) throw new Error(`${path} is a symbolic link; FixMap only writes intents inside the repository.`);
}

/** A directory lock: mkdir is atomic on every platform. A lock older than 30 s is treated as abandoned. */
async function withLock<T>(directory: string, action: () => Promise<T>): Promise<T> {
  const lock = join(directory, ".lock");
  const started = Date.now();
  for (let attempt = 0; ; attempt += 1) {
    try {
      await mkdir(lock);
      break;
    } catch (error) {
      if ((error as { code?: string }).code !== "EEXIST") throw error;
      const age = await stat(lock).then((info) => Date.now() - info.mtimeMs, () => 0);
      if (age > LOCK_STALE_MS) {
        await rm(lock, { recursive: true, force: true });
        continue;
      }
      if (Date.now() - started > LOCK_WAIT_MS) throw new Error(`Timed out waiting for ${lock}; remove it if no FixMap process is running.`);
      await new Promise((resolve) => setTimeout(resolve, Math.min(200, 10 + attempt * 10)));
    }
  }
  try {
    return await action();
  } finally {
    await rmdir(lock).catch(() => undefined);
  }
}

async function exists(path: string): Promise<boolean> {
  return lstat(path).then(() => true, () => false);
}

function edit(value: unknown, index: number): AgentIntentEdit {
  if (!isRecord(value)) throw new Error(`Agent intent edits[${index}] must be an object.`);
  const unknown = Object.keys(value).filter((key) => key !== "path" && key !== "ranges");
  if (unknown.length > 0) throw new Error(`Agent intent edits[${index}] has unknown field ${unknown[0]}.`);
  const path = relativePath(value.path, `edits[${index}].path`);
  if (value.ranges === undefined) return { path };
  if (!Array.isArray(value.ranges) || value.ranges.length === 0 || value.ranges.length > MAX_RANGES) {
    throw new Error(`Agent intent edits[${index}].ranges must list 1-${MAX_RANGES} line ranges.`);
  }
  const ranges = value.ranges.map((range, position) => {
    if (!isRecord(range) || !Number.isInteger(range.start) || !Number.isInteger(range.end) ||
      (range.start as number) < 1 || (range.end as number) < (range.start as number) || (range.end as number) > 10_000_000) {
      throw new Error(`Agent intent edits[${index}].ranges[${position}] must be whole lines with 1 <= start <= end.`);
    }
    return { start: range.start as number, end: range.end as number };
  }).sort((a, b) => a.start - b.start || a.end - b.end);
  return { path, ranges };
}

function pathList(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_PATHS) throw new Error(`Agent intent ${label} must list at most ${MAX_PATHS} files.`);
  return [...new Set(value.map((entry, index) => relativePath(entry, `${label}[${index}]`)))].sort();
}

function relativePath(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`Agent intent ${label} must be a repository-relative path.`);
  const path = value.trim().replace(/\\/g, "/");
  if (!path || path.length > 1_024 || /^(?:\/|[A-Za-z]:)/.test(path) || /[\0-\x1f]/.test(path) ||
    path.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Agent intent ${label} must be a repository-relative path without "..": ${JSON.stringify(value)}`);
  }
  return path;
}

function pattern(value: unknown, expression: RegExp, label: string): string {
  if (typeof value !== "string" || !expression.test(value)) throw new Error(`Agent intent ${label} is invalid.`);
  return value;
}

function timestamp(value: unknown, label: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value)) || new Date(value).toISOString() !== value) {
    throw new Error(`Agent intent ${label} must be an ISO-8601 UTC timestamp.`);
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
