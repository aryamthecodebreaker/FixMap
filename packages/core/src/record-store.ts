import { lstat, mkdir, open, readdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { validateChangeDossier, type ChangeDossier } from "./dossier.js";
import { createOutcomeRecord, type OutcomeRecord } from "./outcomes.js";

/**
 * Repository-local persistence for outcome records (.fixmap/outcomes/) and change dossiers
 * (.fixmap/dossiers/), one JSON file per record. Follows the annotation store: writes go
 * through a temp file and rename, links and junctions are refused, and a lock held by
 * another writer is never taken over, however old it looks.
 */

export type StoredRecordProblem = { file: string; message: string };
export type StoredRecords<T> = { records: T[]; problems: StoredRecordProblem[] };

/** Stored IDs double as file names, so they exclude ':' (invalid on Windows) and a trailing dot. */
const STORED_ID = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9_-])?$/;
const LOCK_ATTEMPTS = 40;
const LOCK_RETRY_MS = 25;

type Kind<T> = {
  directory: "outcomes" | "dossiers";
  label: string;
  validate: (value: unknown) => T;
  id: (record: T) => string;
  date: (record: T) => string;
};

const OUTCOMES: Kind<OutcomeRecord> = {
  directory: "outcomes",
  label: "outcome record",
  validate: (value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid outcome record envelope.");
    const { outcomeRecordVersion, ...rest } = value as OutcomeRecord;
    if (outcomeRecordVersion !== 1) throw new Error("Invalid outcome record envelope.");
    return createOutcomeRecord(rest);
  },
  id: (record) => record.id,
  date: (record) => record.recordedAt
};

const DOSSIERS: Kind<ChangeDossier> = {
  directory: "dossiers",
  label: "change dossier",
  validate: validateChangeDossier,
  id: (record) => record.id,
  date: (record) => record.createdAt
};

export function isStoredRecordId(id: string): boolean { return STORED_ID.test(id); }

export const readStoredOutcomes = (repoRoot: string) => listRecords(OUTCOMES, repoRoot);
export const readStoredOutcome = (repoRoot: string, id: string) => readRecord(OUTCOMES, repoRoot, id);
export const saveStoredOutcome = (repoRoot: string, record: OutcomeRecord) => saveRecord(OUTCOMES, repoRoot, record);
export const deleteStoredOutcome = (repoRoot: string, id: string) => deleteRecord(OUTCOMES, repoRoot, id);
/** Delete outcome records recorded strictly before `cutoff`. Malformed files are reported, never deleted. */
export const pruneStoredOutcomes = (repoRoot: string, cutoff: Date) => pruneRecords(OUTCOMES, repoRoot, cutoff);

export const readStoredDossiers = (repoRoot: string) => listRecords(DOSSIERS, repoRoot);
export const readStoredDossier = (repoRoot: string, id: string) => readRecord(DOSSIERS, repoRoot, id);
export const saveStoredDossier = (repoRoot: string, record: ChangeDossier) => saveRecord(DOSSIERS, repoRoot, record);
export const deleteStoredDossier = (repoRoot: string, id: string) => deleteRecord(DOSSIERS, repoRoot, id);

async function listRecords<T>(kind: Kind<T>, repoRoot: string): Promise<StoredRecords<T>> {
  const root = await repositoryRoot(repoRoot);
  const directory = await existingKindDirectory(kind, root);
  if (!directory) return { records: [], problems: [] };
  const records: T[] = [];
  const problems: StoredRecordProblem[] = [];
  for (const name of (await readdir(directory)).sort()) {
    if (name.startsWith(".")) continue; // in-flight or abandoned temp files
    const file = `.fixmap/${kind.directory}/${name}`;
    const id = name.endsWith(".json") ? name.slice(0, -".json".length) : "";
    if (!isStoredRecordId(id)) { problems.push({ file, message: "Not a record file (expected <id>.json)." }); continue; }
    try {
      records.push(await readRecordFile(kind, directory, id));
    } catch (error) {
      problems.push({ file, message: errorMessage(error) });
    }
  }
  records.sort((a, b) => kind.date(a).localeCompare(kind.date(b)) || kind.id(a).localeCompare(kind.id(b)));
  return { records, problems };
}

async function readRecord<T>(kind: Kind<T>, repoRoot: string, id: string): Promise<T> {
  assertId(kind, id);
  const root = await repositoryRoot(repoRoot);
  const directory = await existingKindDirectory(kind, root);
  if (!directory) throw new Error(`No ${kind.label} found: ${id}`);
  try {
    return await readRecordFile(kind, directory, id);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) throw new Error(`No ${kind.label} found: ${id}`);
    throw error;
  }
}

async function saveRecord<T>(kind: Kind<T>, repoRoot: string, record: T): Promise<T> {
  const validated = kind.validate(record);
  const id = kind.id(validated);
  assertId(kind, id);
  const root = await repositoryRoot(repoRoot);
  return withLock(kind, root, async (directory) => {
    const target = recordPath(directory, id);
    if (await fileInfo(target)) throw new Error(`A ${kind.label} with id ${id} already exists.`);
    const temporary = resolve(directory, `.${id}.${process.pid}.${randomUUID()}.tmp`);
    const handle = await open(temporary, "wx", 0o600);
    try {
      await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    try {
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true });
      throw error;
    }
    return validated;
  });
}

async function deleteRecord<T>(kind: Kind<T>, repoRoot: string, id: string): Promise<void> {
  assertId(kind, id);
  const root = await repositoryRoot(repoRoot);
  await withLock(kind, root, async (directory) => {
    const target = recordPath(directory, id);
    const info = await fileInfo(target);
    if (!info) throw new Error(`No ${kind.label} found: ${id}`);
    assertRegularFile(kind, info);
    await rm(target);
  });
}

async function pruneRecords<T>(kind: Kind<T>, repoRoot: string, cutoff: Date): Promise<{ removed: string[]; kept: number; problems: StoredRecordProblem[] }> {
  if (!Number.isFinite(cutoff.getTime())) throw new Error("Prune cutoff must be a valid date.");
  const root = await repositoryRoot(repoRoot);
  if (!(await existingKindDirectory(kind, root))) return { removed: [], kept: 0, problems: [] };
  return withLock(kind, root, async (directory) => {
    const { records, problems } = await listRecords(kind, root);
    const removed: string[] = [];
    for (const record of records) {
      if (Date.parse(kind.date(record)) >= cutoff.getTime()) continue;
      const target = recordPath(directory, kind.id(record));
      const info = await fileInfo(target);
      if (!info) continue;
      assertRegularFile(kind, info);
      await rm(target);
      removed.push(kind.id(record));
    }
    return { removed, kept: records.length - removed.length, problems };
  });
}

async function readRecordFile<T>(kind: Kind<T>, directory: string, id: string): Promise<T> {
  const path = recordPath(directory, id);
  const info = await lstat(path);
  assertRegularFile(kind, info);
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error(`Not valid JSON: ${error.message}`);
    throw error;
  }
  const record = kind.validate(parsed);
  if (kind.id(record) !== id) throw new Error(`File name does not match its ${kind.label} id ${kind.id(record)}.`);
  return record;
}

async function withLock<T, R>(kind: Kind<T>, root: string, operation: (directory: string) => Promise<R>): Promise<R> {
  const directory = await createKindDirectory(kind, root);
  const lockPath = resolve(root, ".fixmap", `${kind.directory}.lock`);
  let handle;
  for (let attempt = 1; !handle; attempt += 1) {
    const existing = await lockInfo(lockPath);
    if (existing && existing !== "releasing") assertRegularFile(kind, existing);
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      // EPERM on Windows: the previous lock is still delete-pending; wait for it like a held lock.
      if (!isNodeError(error, "EEXIST") && !(process.platform === "win32" && isNodeError(error, "EPERM"))) throw error;
      // Age cannot prove that a writer has stopped (it may be suspended), so the lock is never
      // taken over. Wait a bounded time for a live writer, then refuse.
      if (attempt >= LOCK_ATTEMPTS) {
        throw new Error(`Another FixMap ${kind.label} update is in progress or left a lock. Retry after it finishes; if interrupted, confirm no FixMap writer is running before manually removing .fixmap/${kind.directory}.lock.`);
      }
      await new Promise((done) => setTimeout(done, LOCK_RETRY_MS));
    }
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
    await handle.sync();
    await assertDirectory(kind, root, directory);
    return await operation(directory);
  } finally {
    try {
      await handle.close();
    } finally {
      await rm(lockPath, { force: true });
    }
  }
}

async function repositoryRoot(path: string): Promise<string> {
  const root = await realpath(path);
  if (!(await stat(root)).isDirectory()) throw new Error("FixMap repository must be a directory.");
  return root;
}

async function existingKindDirectory<T>(kind: Kind<T>, root: string): Promise<string | undefined> {
  const fixmap = resolve(root, ".fixmap");
  if (!(await fileInfo(fixmap))) return undefined;
  await assertDirectory(kind, root, fixmap);
  const directory = resolve(fixmap, kind.directory);
  if (!(await fileInfo(directory))) return undefined;
  await assertDirectory(kind, root, directory);
  return directory;
}

async function createKindDirectory<T>(kind: Kind<T>, root: string): Promise<string> {
  const fixmap = resolve(root, ".fixmap");
  if (await fileInfo(fixmap)) await assertDirectory(kind, root, fixmap);
  else await makeDirectory(fixmap);
  await assertDirectory(kind, root, fixmap);
  const directory = resolve(fixmap, kind.directory);
  if (!(await fileInfo(directory))) await makeDirectory(directory);
  await assertDirectory(kind, root, directory);
  return directory;
}

/** A concurrent writer may create the directory first; the link check that follows still applies. */
async function makeDirectory(path: string): Promise<void> {
  await mkdir(path).catch((error: unknown) => {
    if (!isNodeError(error, "EEXIST")) throw error;
  });
}

/** Refuse a link, junction, or anything that resolves somewhere other than its lexical path. */
async function assertDirectory<T>(kind: Kind<T>, root: string, directory: string): Promise<void> {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink() || await realpath(directory) !== directory || !directory.startsWith(root)) {
    throw new Error(`The ${kind.label} store must be a real repository-local directory (.fixmap/${kind.directory}), not a link or junction.`);
  }
}

function assertRegularFile<T>(kind: Kind<T>, info: Awaited<ReturnType<typeof lstat>>): void {
  if (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1) {
    throw new Error(`Stored ${kind.label} files and locks must be regular, unlinked repository-local files.`);
  }
}

function recordPath(directory: string, id: string): string {
  const path = resolve(directory, `${id}.json`);
  if (resolve(path, "..") !== directory) throw new Error("Record path escapes its store directory.");
  return path;
}

function assertId<T>(kind: Kind<T>, id: string): void {
  if (typeof id !== "string" || !isStoredRecordId(id)) {
    throw new Error(`Invalid ${kind.label} id: use letters, digits, '.', '_' or '-' (at most 128 characters, no path separators).`);
  }
}

/**
 * A lock another writer is deleting is briefly "delete pending" on Windows: lstat reports nlink 0
 * or fails with EPERM. That is a lock being released, not a tampered file; the open("wx") below
 * then waits for it like any held lock. Hard links (nlink > 1) and non-files are still refused.
 */
async function lockInfo(path: string): Promise<Awaited<ReturnType<typeof lstat>> | "releasing" | undefined> {
  try {
    const info = await lstat(path);
    return info.nlink === 0 ? "releasing" : info;
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return undefined;
    if (process.platform === "win32" && isNodeError(error, "EPERM")) return "releasing";
    throw error;
  }
}

async function fileInfo(path: string) {
  return lstat(path).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  });
}

function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
