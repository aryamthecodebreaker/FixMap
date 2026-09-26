import { mkdir, open, readFile, realpath, rename, rm, stat, lstat } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { emptyAnnotationStore, validateAnnotationStore, type AnnotationStore } from "./annotations.js";

/** Read a repository-local store without creating one. */
export async function readAnnotationStore(repoRoot: string): Promise<AnnotationStore> {
  return readStore(await annotationRoot(repoRoot));
}

/** Apply one validated mutation under the shared cross-process store lock. */
export async function updateAnnotationStore(
  repoRoot: string,
  update: (store: AnnotationStore) => AnnotationStore | Promise<AnnotationStore>
): Promise<AnnotationStore> {
  const root = await annotationRoot(repoRoot);
  return withStoreLock(root, async () => {
    const updated = validateAnnotationStore(await update(await readStore(root)));
    await writeStore(root, updated);
    return updated;
  });
}

async function annotationRoot(path: string): Promise<string> {
  const root = await realpath(path);
  if (!(await stat(root)).isDirectory()) throw new Error("Annotation repository must be a directory.");
  return root;
}

async function readStore(repoRoot: string): Promise<AnnotationStore> {
  await assertStoreBoundary(repoRoot);
  const path = resolve(repoRoot, ".fixmap", "annotations.json");
  try {
    return validateAnnotationStore(JSON.parse(await readFile(path, "utf8")) as unknown);
  } catch (error) {
    if (isNodeError(error, "ENOENT")) return emptyAnnotationStore();
    if (error instanceof SyntaxError) throw new Error(`${path} is not valid JSON; repair it before adding annotations.`);
    throw error;
  }
}

async function writeStore(repoRoot: string, store: AnnotationStore): Promise<void> {
  const directory = resolve(repoRoot, ".fixmap");
  await mkdir(directory, { recursive: true });
  await assertStoreBoundary(repoRoot);
  const target = resolve(directory, "annotations.json");
  const temporary = resolve(directory, `.annotations.${process.pid}.${randomUUID()}.tmp`);
  const handle = await open(temporary, "wx", 0o600);
  try {
    await handle.writeFile(`${JSON.stringify(validateAnnotationStore(store), null, 2)}\n`, "utf8");
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
}

async function withStoreLock<T>(repoRoot: string, operation: () => Promise<T>): Promise<T> {
  await assertStoreBoundary(repoRoot);
  const directory = resolve(repoRoot, ".fixmap");
  await mkdir(directory, { recursive: true });
  await assertStoreBoundary(repoRoot);
  const lockPath = resolve(directory, "annotations.lock");
  let handle;
  try {
    handle = await open(lockPath, "wx", 0o600);
  } catch (error) {
    if (!isNodeError(error, "EEXIST")) throw error;
    // Age cannot prove that a writer has stopped (for example after suspension).
    // Never steal a lock: doing so permits overlapping read-modify-write cycles.
    throw new Error("Another FixMap annotation update is in progress or left a lock. Retry after it finishes; if interrupted, confirm no annotation writer is running before manually removing .fixmap/annotations.lock.");
  }
  try {
    await handle.writeFile(`${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`, "utf8");
    await handle.sync();
    return await operation();
  } finally {
    try {
      await handle.close();
    } finally {
      await rm(lockPath, { force: true });
    }
  }
}

async function assertStoreBoundary(repoRoot: string): Promise<void> {
  const directory = resolve(repoRoot, ".fixmap");
  const directoryInfo = await lstat(directory).catch((error: unknown) => {
    if (isNodeError(error, "ENOENT")) return undefined;
    throw error;
  });
  if (!directoryInfo) return;
  if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || await realpath(directory) !== directory) {
    throw new Error("Annotation store directory must be a real repository-local .fixmap directory, not a link or junction.");
  }
  for (const name of ["annotations.json", "annotations.lock"]) {
    const info = await lstat(resolve(directory, name)).catch((error: unknown) => {
      if (isNodeError(error, "ENOENT")) return undefined;
      throw error;
    });
    if (info && (!info.isFile() || info.isSymbolicLink() || info.nlink !== 1)) {
      throw new Error("Annotation store and lock must be regular, unlinked repository-local files.");
    }
  }
}


function isNodeError(error: unknown, code: string): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === code;
}
