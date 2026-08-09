import { execFile } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, realpath, rename, stat, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { ALWAYS_IGNORED_DIRS, GENERATED_DIRS, isGeneratedPath } from "./paths.js";
import { DIAGNOSTIC_SPEC_LIMIT, truncateForDiagnostic } from "./text.js";
import type { FixMapInput, PackageScript, RepoFile, RepoMap } from "./types.js";

const WALK_IGNORED_DIRS = new Set([...ALWAYS_IGNORED_DIRS, ...GENERATED_DIRS]);
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".cs",
  ".css",
  ".cts",
  ".go",
  ".java",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".mts",
  ".php",
  ".py",
  ".rb",
  ".rs",
  ".svelte",
  ".ts",
  ".tsx",
  ".vue",
  ".yaml",
  ".yml"
]);

/**
 * A single-file component is mostly template and style. Sampling the whole file let markup
 * and CSS class names outvote the logic underneath, so only the script block is read — that
 * is where the identifiers a task names actually live.
 */
const SFC_EXTENSIONS = new Set([".vue", ".svelte"]);
const SFC_SCRIPT_BLOCK = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
const TEST_PATTERNS = [
  /\.test(?:\.|-d\.)/,
  /\.spec\./,
  /(^|\/|\\)__tests__(\/|\\)/,
  /(^|\/|\\)tests?(\/|\\)/,
  /_test\.go$/,
  /(^|\/|\\)(?:test_[^/\\]+|[^/\\]+_test)\.py$/
];
const MAX_TEXT_SAMPLE_BYTES = 64_000;
const MAX_DIFF_TEXT_CHARS = 200_000;
const MAX_SCANNED_FILES = 25_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
const exec = promisify(execFile);
type ScanState = { count: number; limitReported: boolean };
const SCAN_CACHE_VERSION = 2;
const SCAN_CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SCAN_CACHE_FILE = /^[a-f0-9]{24}-[a-f0-9]{24}\.json$/;

type CachedScan = {
  version: typeof SCAN_CACHE_VERSION;
  stateKey: string;
  createdAt: string;
  files: RepoFile[];
  trackedFiles: string[];
  packageScripts: PackageScript[];
  packageManager: RepoMap["packageManager"];
  diagnostics: RepoMap["diagnostics"];
};

export async function scanRepo(
  input: Pick<
    FixMapInput,
    "repoRoot" | "baseRef" | "headRef" | "diffSpec" | "workingTree" | "includeUntracked" | "useCache"
  > & { internalExclude?: string[] | undefined }
): Promise<RepoMap> {
  const repoRoot = resolve(input.repoRoot);
  if (!(await isDirectory(repoRoot))) {
    return {
      root: input.repoRoot,
      files: [],
      packageScripts: [],
      changedFiles: [],
      diffText: "",
      packageManager: "npm",
      diagnostics: [{
        code: "repo-root-missing",
        severity: "error",
        message: `Repository root "${input.repoRoot}" does not exist or is not a directory.`
      }]
    };
  }

  const diagnostics: RepoMap["diagnostics"] = [];
  const internalPaths = await resolveInternalPaths(repoRoot, input.internalExclude ?? []);
  const cacheRoot = configuredScanCacheRoot();
  const internalCacheRoot = sameFilesystemPath(cacheRoot, repoRoot) || containedPath(repoRoot, cacheRoot) !== undefined
    ? cacheRoot
    : undefined;
  const cacheDecision = input.useCache === true
    ? await buildScanCacheLocation(repoRoot, cacheRoot, internalPaths)
    : undefined;
  const cacheLocation = cacheDecision?.location;
  if (input.useCache === false) {
    diagnostics.push({
      code: "cache-bypass",
      severity: "info",
      message: "Repository scan caching was bypassed by --no-cache; this report used a fresh scan."
    });
  } else if (input.useCache === true && cacheDecision?.skipReason) {
    diagnostics.push({
      code: "cache-skip",
      severity: "info",
      message: cacheDecision.skipReason
    });
  }
  const cached = cacheLocation ? await readScanCache(cacheLocation) : undefined;
  let files: RepoFile[];
  let trackedFiles: string[];
  let packageScripts: PackageScript[];
  let packageManager: RepoMap["packageManager"];
  if (cached) {
    files = cached.files;
    trackedFiles = cached.trackedFiles;
    packageScripts = cached.packageScripts;
    packageManager = cached.packageManager;
    diagnostics.push(...cached.diagnostics, {
      code: "cache-hit",
      severity: "info",
      message: `Reused the repository scan for the exact current git state (${files.length.toLocaleString()} files, ${describeCacheAge(cached.createdAt)}). Pass --no-cache to rescan.`
    });
  } else {
    files = await listFiles(repoRoot, diagnostics, internalCacheRoot, internalPaths);
    trackedFiles = await listTrackedPaths(repoRoot, internalPaths);
    packageScripts = await readPackageScripts(repoRoot, files, diagnostics);
    packageManager = detectPackageManager(files);
    if (cacheLocation) {
      await writeScanCache(cacheLocation, {
        version: SCAN_CACHE_VERSION,
        stateKey: cacheLocation.stateKey,
        createdAt: new Date().toISOString(),
        files,
        trackedFiles,
        packageScripts,
        packageManager,
        diagnostics: [...diagnostics]
      });
    }
  }
  const diffSpec = resolveDiffSpec(input);
  const diff = input.workingTree
    ? await readWorkingTree(repoRoot, input.includeUntracked === true, diagnostics, internalPaths)
    : await readDiff(repoRoot, diffSpec, diagnostics, internalPaths);

  return {
    root: repoRoot,
    files,
    trackedFiles,
    packageScripts,
    changedFiles: diff.changedFiles,
    diffText: diff.diffText,
    packageManager,
    diagnostics
  };
}

type ScanCacheLocation = { path: string; stateKey: string };
type ScanCacheDecision = { location?: ScanCacheLocation; skipReason?: string };

function configuredScanCacheRoot(): string {
  return resolve(process.env.FIXMAP_CACHE_DIR ?? join(
    process.env.LOCALAPPDATA ?? process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
    "fixmap",
    "scans"
  ));
}

function containedPath(root: string, candidate: string): string | undefined {
  const distance = relative(root, candidate);
  return distance === "" || distance === ".." || distance.startsWith(`..${sep}`) || isAbsolute(distance)
    ? undefined
    : normalizePath(distance);
}

async function resolveInternalPaths(root: string, paths: string[]): Promise<Set<string>> {
  const requested = paths.flatMap((path) => {
    const relativePath = containedPath(root, resolve(path));
    return relativePath ? [relativePath] : [];
  });
  if (requested.length === 0 || process.platform !== "win32") return new Set(requested);

  // Git pathspecs remain case-sensitive even on a case-insensitive Windows worktree. A
  // caller can open PLAN.JSON when the directory entry is plan.json, so recover Git's
  // canonical spelling before using exact exclusions in status and diff commands.
  try {
    const { stdout } = await exec(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, maxBuffer: GIT_MAX_BUFFER }
    );
    const repositoryPaths = stdout.split("\0").filter(Boolean).map(normalizePath);
    return new Set(requested.map((path) =>
      repositoryPaths.find((candidate) => sameFilesystemPath(candidate, path)) ?? path
    ));
  } catch {
    return new Set(requested);
  }
}

function hasInternalPath(paths: ReadonlySet<string>, path: string): boolean {
  return [...paths].some((candidate) => sameFilesystemPath(candidate, path));
}

function gitPathspec(internalPaths: ReadonlySet<string>): string[] {
  return ["--", ".", ...[...internalPaths]
    .sort((a, b) => a.localeCompare(b))
    .map((path) => `:(exclude,literal)${path}`)];
}

async function buildScanCacheLocation(
  root: string,
  cacheRoot: string,
  internalPaths: ReadonlySet<string>
): Promise<ScanCacheDecision> {
  if (sameFilesystemPath(cacheRoot, root) || containedPath(root, cacheRoot) !== undefined) {
    return {
      skipReason:
        "Repository scan caching was skipped because FIXMAP_CACHE_DIR is inside the scanned repository. " +
        "Move the cache outside the repository to enable exact-state reuse."
    };
  }
  try {
    const [{ stdout: head }, { stdout: status }] = await Promise.all([
      exec("git", ["rev-parse", "HEAD"], { cwd: root, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["status", "--porcelain=v1", "-z", "--untracked-files=all", ...gitPathspec(internalPaths)], {
        cwd: root,
        maxBuffer: GIT_MAX_BUFFER
      })
    ]);
    // Untracked files are scanner inputs but are absent from `git diff`. Do not cache that
    // state rather than keying it on names alone and serving stale contents after an edit.
    if (status.split("\0").some((entry) => entry.startsWith("?? "))) {
      return {
        skipReason: "Repository scan caching was skipped because untracked files are scanner inputs and can change without a stable git diff."
      };
    }
    const dirtyDiff = status.length > 0
      ? (await exec("git", ["diff", "--binary", "--no-ext-diff", "HEAD", ...gitPathspec(internalPaths)], {
          cwd: root,
          maxBuffer: GIT_MAX_BUFFER
        })).stdout
      : "";
    const stateKey = hashText([
      String(SCAN_CACHE_VERSION),
      resolve(root),
      head.trim(),
      status,
      dirtyDiff,
      ...[...internalPaths].sort((a, b) => a.localeCompare(b))
    ].join("\0"));
    return { location: {
      path: join(cacheRoot, `${hashText(resolve(root))}-${stateKey}.json`),
      stateKey
    } };
  } catch {
    // Non-git directories deliberately do not cache: they have no cheap exact invalidation key.
    return {
      skipReason: "Repository scan caching was skipped because this directory has no exact git state to key safely."
    };
  }
}

async function readScanCache(location: ScanCacheLocation): Promise<CachedScan | undefined> {
  try {
    const cached = JSON.parse(await readFile(location.path, "utf8")) as Partial<CachedScan>;
    if (
      cached.version !== SCAN_CACHE_VERSION ||
      cached.stateKey !== location.stateKey ||
      typeof cached.createdAt !== "string" ||
      !Number.isFinite(Date.parse(cached.createdAt)) ||
      Date.now() - Date.parse(cached.createdAt) > SCAN_CACHE_MAX_AGE_MS ||
      !Array.isArray(cached.files) ||
      !Array.isArray(cached.trackedFiles) ||
      !Array.isArray(cached.packageScripts) ||
      !Array.isArray(cached.diagnostics) ||
      !["npm", "pnpm", "yarn", "bun"].includes(cached.packageManager ?? "")
    ) return undefined;
    return cached as CachedScan;
  } catch {
    return undefined;
  }
}

async function writeScanCache(location: ScanCacheLocation, cached: CachedScan): Promise<void> {
  const temporaryPath = `${location.path}.${process.pid}-${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(location.path), { recursive: true });
    await pruneExpiredScanCache(dirname(location.path));
    // Write beside the destination and rename only after the JSON is complete. Readers never
    // observe a truncated cache file, and a corrupt/expired exact-key entry heals immediately.
    await writeFile(temporaryPath, `${JSON.stringify(cached)}\n`, { encoding: "utf8", flag: "wx" });
    await rename(temporaryPath, location.path);
  } catch {
    // Cache writes are an optimization. Read-only directories and concurrent writers must not
    // fail a report. Remove only this process's uniquely named temporary file.
    try {
      await unlink(temporaryPath);
    } catch { /* The rename may already have consumed it. */ }
  }
}

async function pruneExpiredScanCache(cacheRoot: string): Promise<void> {
  try {
    const entries = await readdir(cacheRoot, { withFileTypes: true });
    const now = Date.now();
    await Promise.all(entries
      .filter((entry) => entry.isFile() && SCAN_CACHE_FILE.test(entry.name))
      .map(async (entry) => {
        const path = join(cacheRoot, entry.name);
        try {
          const metadata = await stat(path);
          if (now - metadata.mtimeMs > SCAN_CACHE_MAX_AGE_MS) await unlink(path);
        } catch {
          // Cache cleanup is best effort and must never block a report.
        }
      }));
  } catch {
    // A read-only or concurrently removed cache directory is harmless.
  }
}

function describeCacheAge(createdAt: string): string {
  const ageMs = Math.max(0, Date.now() - Date.parse(createdAt));
  if (ageMs < 5_000) return "scanned just now";
  const minutes = Math.floor(ageMs / 60_000);
  if (minutes < 1) return "scanned less than a minute ago";
  if (minutes < 60) return `scanned ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `scanned ${hours}h ago`;
  return `scanned ${Math.floor(hours / 24)}d ago`;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}

async function listTrackedPaths(root: string, internalPaths: ReadonlySet<string>): Promise<string[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["ls-files", "--cached", "-z"],
      { cwd: root, maxBuffer: GIT_MAX_BUFFER }
    );
    return stdout.split("\0").filter(Boolean).map(normalizePath)
      .filter((path) => !hasInternalPath(internalPaths, path));
  } catch {
    return [];
  }
}

function resolveDiffSpec(input: Pick<FixMapInput, "baseRef" | "headRef" | "diffSpec">): string | undefined {
  return input.diffSpec ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : undefined);
}

async function listFiles(
  root: string,
  diagnostics: RepoMap["diagnostics"],
  internalCacheRoot: string | undefined,
  internalPaths: ReadonlySet<string>
): Promise<RepoFile[]> {
  const gitPaths = await listGitPaths(root);
  const visiblePaths = gitPaths?.paths.filter((path) =>
    !hasInternalPath(internalPaths, normalizePath(path)) && !isInternalCachePath(root, path, internalCacheRoot)
  );
  const files = gitPaths
    ? await buildFilesFromPaths(root, visiblePaths ?? [], diagnostics, gitPaths.gitLinks)
    : (await walkFiles(root, root, diagnostics, { count: 0, limitReported: false }, internalCacheRoot, internalPaths))
      .sort((a, b) => a.path.localeCompare(b.path));

  // These are properties of the scanned files, not of git. Keeping them here makes an
  // extracted archive and a checkout report the same content limitations.
  reportUnreadContent(diagnostics, files);
  reportGeneratedDominance(diagnostics, files);
  return files;
}

function isInternalCachePath(root: string, path: string, internalCacheRoot?: string): boolean {
  if (!internalCacheRoot) return false;
  const relativeCacheRoot = containedPath(root, internalCacheRoot);
  if (relativeCacheRoot) {
    const candidate = process.platform === "win32" ? path.toLowerCase() : path;
    const cachePath = process.platform === "win32" ? relativeCacheRoot.toLowerCase() : relativeCacheRoot;
    return candidate === cachePath || candidate.startsWith(`${cachePath}/`);
  }
  // If someone points FIXMAP_CACHE_DIR at the repository root itself, do not hide the
  // repository. Hide only filenames owned by FixMap's cache format.
  return sameFilesystemPath(internalCacheRoot, root) && (
    SCAN_CACHE_FILE.test(path) ||
    /^[a-f0-9]{24}-[a-f0-9]{24}\.json\.\d+-[0-9a-f-]+\.tmp$/i.test(path)
  );
}

async function listGitPaths(root: string): Promise<{ paths: string[]; gitLinks: Set<string> } | undefined> {
  try {
    const [{ stdout }, { stdout: staged }] = await Promise.all([
      exec("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
        cwd: root,
        maxBuffer: GIT_MAX_BUFFER
      }),
      exec("git", ["ls-files", "--stage", "-z"], { cwd: root, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const gitLinks = new Set(staged.split("\0").flatMap((entry) => {
      const match = /^160000\s+[0-9a-f]+\s+\d+\t(.+)$/i.exec(entry);
      return match?.[1] ? [normalizePath(match[1])] : [];
    }));
    return { paths: [...new Set(stdout.split("\0").filter(Boolean))], gitLinks };
  } catch {
    return undefined;
  }
}

async function buildFilesFromPaths(
  root: string,
  paths: string[],
  diagnostics: RepoMap["diagnostics"],
  knownGitLinks = new Set<string>()
): Promise<RepoFile[]> {
  const results: RepoFile[] = [];
  const absent: string[] = [];
  const gitLinks: string[] = [];
  // Git can hand back two tracked paths that are one file on disk: a symlink beside its
  // target, or anything under a Windows junction. `stat` follows both, so each produced an
  // identically scored row and one module filled two slots in the plan.
  //
  // The surviving row is the real file, never the link — editing through an alias is the
  // same edit, but the real path is the one a reader can reason about. Keeping whichever
  // git listed first would have made that an alphabetical accident.
  const seenRealPaths = new Map<string, number>();
  const linked: Array<{ path: string; target: string }> = [];

  for (const [index, rawPath] of paths.entries()) {
    if (results.length >= MAX_SCANNED_FILES) {
      // Git handed us the whole tracked list, so the remainder is known exactly.
      // Saying which directories went unread lets a reader judge whether the
      // truncation touched the code their task is about.
      reportScanLimit(diagnostics, paths.slice(index).map(normalizePath));
      break;
    }

    const relativePath = normalizePath(rawPath);
    if (isInAlwaysIgnoredDir(relativePath)) {
      continue;
    }
    if (knownGitLinks.has(relativePath)) {
      gitLinks.push(relativePath);
      continue;
    }

    const scanned = await toRepoFile(join(root, rawPath), relativePath);
    if (scanned.status === "absent") {
      absent.push(relativePath);
      continue;
    }
    if (scanned.status === "not-a-file") {
      gitLinks.push(relativePath);
      continue;
    }
    if (scanned.status !== "ok") {
      continue;
    }

    const seenIndex = seenRealPaths.get(scanned.realPath);
    if (seenIndex !== undefined) {
      const seenFile = results[seenIndex]!;
      // Looking only at the leaf with lstat misses Windows junctions, where the linked
      // object is an ancestor directory. Comparing literal and resolved paths covers both.
      const seenIsAlias = !sameFilesystemPath(resolve(root, seenFile.path), scanned.realPath);
      const currentIsAlias = !sameFilesystemPath(resolve(root, relativePath), scanned.realPath);
      if (seenIsAlias && !currentIsAlias) {
        linked.push({ path: seenFile.path, target: relativePath });
        results[seenIndex] = scanned.file;
      } else {
        linked.push({ path: relativePath, target: seenFile.path });
      }
      continue;
    }
    seenRealPaths.set(scanned.realPath, results.length);
    results.push(scanned.file);
  }

  reportAbsentTrackedPaths(diagnostics, absent);
  reportLinkedDuplicates(diagnostics, linked);
  reportSkippedSubmodules(diagnostics, gitLinks);

  return results.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * A tracked path with nothing on disk was dropped silently, so the plan read as a complete
 * scan when part of the repository had never been looked at. Several unrelated causes look
 * identical from here — a sparse checkout, an uncommitted deletion, or a checkout that could
 * not create the file at all, which is routine on Windows for paths past the length limit or
 * with names NTFS rejects. Measuring the adversarial suite turned up webpack's long test
 * fixture paths and a `日.js` doing exactly that. So the diagnostic reports what was observed
 * and lists the causes rather than asserting one.
 */
function reportAbsentTrackedPaths(diagnostics: RepoMap["diagnostics"], absent: string[]): void {
  if (absent.length === 0) return;

  diagnostics.push({
    code: "tracked-paths-absent",
    severity: "warning",
    message:
      `${absent.length.toLocaleString()} tracked path${absent.length === 1 ? " is" : "s are"} not present on disk ` +
      `and went unranked, mostly under ${summarizeSkippedScope(absent)}. ` +
      "That means a sparse or partial checkout, an uncommitted deletion, or a path this " +
      "filesystem could not create."
  });
}

/**
 * A source file whose contents were never read still ranks — on its path alone. That is the
 * shape of the `got` miss behind #274: `source/core/index.ts` is 79 kB, past the sample
 * ceiling, so its entire content signal was silently absent and only an explicit path
 * mention kept it visible. Naming those files lets a reader see that the ranking for them
 * rests on the path and nothing else.
 */
function reportUnreadContent(diagnostics: RepoMap["diagnostics"], files: RepoFile[]): void {
  const unavailable = files.filter((file) =>
    file.isSource &&
    file.textSampleComplete === false &&
    file.textSampleSkipReason !== "too-large"
  );
  for (const reason of ["not-text", "unreadable"] as const) {
    const affected = unavailable.filter((file) => file.textSampleSkipReason === reason);
    if (affected.length === 0) continue;
    const sample = affected.slice(0, 3).map((file) => file.path).join(", ");
    const prefix = `${affected.length.toLocaleString()} source file${affected.length === 1 ? "" : "s"}`;
    diagnostics.push({
      code: "content-unread",
      severity: "warning",
      message: reason === "not-text"
        ? `${prefix} ${affected.length === 1 ? "is" : "are"} not UTF-8 text (for example UTF-16 or binary) and ` +
          `rank${affected.length === 1 ? "s" : ""} on path alone: ${sample}${affected.length > 3 ? ", ..." : ""}. Re-save source as UTF-8 to rank its contents.`
        : `${prefix} could not be read and rank${affected.length === 1 ? "s" : ""} on path alone: ${sample}${affected.length > 3 ? ", ..." : ""}. Check file permissions and retry.`,
      paths: affected.slice(0, 8).map((file) => file.path)
    });
  }

  const unread = files.filter((file) =>
    file.isSource &&
    file.textSampleComplete === false &&
    file.textSampleSkipReason === "too-large"
  );
  if (unread.length === 0) return;

  const sample = unread
    .slice()
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 3)
    .map((file) => `${file.path} (${Math.ceil(file.sizeBytes / 1000).toLocaleString()} kB)`)
    .join(", ");

  diagnostics.push({
    code: "content-unread",
    severity: "warning",
    message:
      `${unread.length.toLocaleString()} source file${unread.length === 1 ? "" : "s"} could not be read as text and ` +
      `rank${unread.length === 1 ? "s" : ""} on path alone — largest: ${sample}` +
      `${unread.length > 3 ? ", …" : ""}. Files over ${(MAX_TEXT_SAMPLE_BYTES / 1000).toLocaleString()} kB are not sampled.`,
    paths: unread.slice(0, 8).map((file) => file.path)
  });
}

function reportSkippedSubmodules(diagnostics: RepoMap["diagnostics"], gitLinks: string[]): void {
  if (gitLinks.length === 0) return;
  diagnostics.push({
    code: "submodules-skipped",
    severity: "info",
    message:
      `${gitLinks.length.toLocaleString()} git submodule${gitLinks.length === 1 ? " was" : "s were"} not scanned: ` +
      `${gitLinks.slice(0, 3).join(", ")}${gitLinks.length > 3 ? ", …" : ""}. ` +
      "Submodules are separate repositories; point --repo at one to map its contents.",
    paths: gitLinks.slice(0, 8)
  });
}

/**
 * `GENERATED_DIRS` keeps build output out of a directory walk, but a repository that commits
 * its `dist/` has those files in `git ls-files`, and they consume the scan budget before any
 * first-party code is reached. The budget is not changed here — moving it without evidence
 * would reshuffle ranking everywhere, since the boilerplate threshold is a share of the
 * candidate set. Saying so lets a reader narrow `--repo` themselves, which is the fix that
 * actually works.
 */
const GENERATED_DOMINANCE_SHARE = 0.4;
const GENERATED_DOMINANCE_MINIMUM = 500;

function reportGeneratedDominance(diagnostics: RepoMap["diagnostics"], files: RepoFile[]): void {
  if (files.length < GENERATED_DOMINANCE_MINIMUM) return;
  const generated = files.filter((file) => isGeneratedPath(file.path));
  const share = generated.length / files.length;
  if (share < GENERATED_DOMINANCE_SHARE) return;

  diagnostics.push({
    code: "generated-paths-dominant",
    severity: "info",
    message:
      `${Math.round(share * 100)}% of the ${files.length.toLocaleString()} scanned files are committed build output ` +
      `(mostly ${summarizeSkippedScope(generated.map((file) => file.path))}). They are penalized in ranking but still ` +
      "consume the scan budget — point --repo at the source directory for a sharper result."
  });
}

function reportLinkedDuplicates(
  diagnostics: RepoMap["diagnostics"],
  linked: Array<{ path: string; target: string }>
): void {
  if (linked.length === 0) return;

  const sample = linked.slice(0, 3)
    .map((entry) => `${entry.path} -> ${entry.target}`)
    .join(", ");
  diagnostics.push({
    code: "duplicate-real-path",
    severity: "info",
    message:
      `${linked.length.toLocaleString()} tracked path${linked.length === 1 ? "" : "s"} resolved to a file already ` +
      `scanned under another name and ${linked.length === 1 ? "was" : "were"} ranked once: ${sample}` +
      `${linked.length > 3 ? ", …" : ""}.`
  });
}

async function walkFiles(
  root: string,
  current: string,
  diagnostics: RepoMap["diagnostics"],
  state: ScanState,
  internalCacheRoot: string | undefined,
  internalPaths: ReadonlySet<string>
): Promise<RepoFile[]> {
  let entries;
  try {
    entries = await readdir(current, { withFileTypes: true });
  } catch {
    return [];
  }
  const results: RepoFile[] = [];

  for (const entry of entries) {
    if (state.count >= MAX_SCANNED_FILES) {
      if (!state.limitReported) {
        reportScanLimit(diagnostics);
        state.limitReported = true;
      }
      break;
    }
    if (entry.isDirectory()) {
      if (WALK_IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      const directory = join(current, entry.name);
      if (internalCacheRoot && sameFilesystemPath(directory, internalCacheRoot)) continue;
      results.push(...await walkFiles(root, directory, diagnostics, state, internalCacheRoot, internalPaths));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = join(current, entry.name);
    const relativePath = normalizePath(relative(root, absolutePath));
    if (hasInternalPath(internalPaths, relativePath) || isInternalCachePath(root, relativePath, internalCacheRoot)) continue;
    const scanned = await toRepoFile(absolutePath, relativePath);
    if (scanned.status === "ok") {
      results.push(scanned.file);
      state.count += 1;
    }
  }

  return results;
}

type ScannedFile =
  | { status: "ok"; file: RepoFile; realPath: string }
  /** Tracked by git but not on disk — a sparse or partial checkout. */
  | { status: "absent" }
  | { status: "not-a-file" };

async function toRepoFile(absolutePath: string, relativePath: string): Promise<ScannedFile> {
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return { status: "absent" };
  }
  if (!fileStat.isFile()) {
    return { status: "not-a-file" };
  }

  const extension = extname(relativePath);
  const isSource = SOURCE_EXTENSIONS.has(extension);
  const sample = isSource
    ? await readTextSample(absolutePath, fileStat.size)
    : { text: "", complete: true };
  if (SFC_EXTENSIONS.has(extension) && sample.text) {
    sample.text = extractScriptBlocks(sample.text);
  }

  return {
    status: "ok",
    realPath: await resolveRealPath(absolutePath),
    file: {
      path: relativePath,
      extension,
      sizeBytes: fileStat.size,
      isTest: TEST_PATTERNS.some((pattern) => pattern.test(relativePath)),
      isSource,
      kind: classifyFile(relativePath, extension),
      textSample: sample.text,
      textSampleComplete: sample.complete,
      ...(sample.skipReason ? { textSampleSkipReason: sample.skipReason } : {})
    }
  };
}

/**
 * Falls back to the literal path when the real path cannot be read, which keeps an
 * unreadable entry rankable rather than colliding every such file onto one key.
 */
async function resolveRealPath(absolutePath: string): Promise<string> {
  try {
    return await realpath(absolutePath);
  } catch {
    return absolutePath;
  }
}

/**
 * Falls back to the whole file when there is no script block, because a component that is
 * pure template still has class and prop names worth matching — better a weak signal than
 * an empty one.
 */
function extractScriptBlocks(text: string): string {
  const blocks = [...text.matchAll(SFC_SCRIPT_BLOCK)].map((match) => match[1] ?? "");
  const joined = blocks.join("\n").trim();
  return joined || text;
}

function sameFilesystemPath(left: string, right: string): boolean {
  return process.platform === "win32"
    ? left.toLowerCase() === right.toLowerCase()
    : left === right;
}

function isInAlwaysIgnoredDir(relativePath: string): boolean {
  return relativePath.split("/").slice(0, -1).some((segment) => ALWAYS_IGNORED_DIRS.has(segment));
}

function reportScanLimit(diagnostics: RepoMap["diagnostics"], skipped?: string[]): void {
  const advice = `Stopped scanning after ${MAX_SCANNED_FILES.toLocaleString()} files. Narrow the repository root for more precise results.`;
  const scope = skipped && skipped.length > 0
    ? ` ${skipped.length.toLocaleString()} path${skipped.length === 1 ? "" : "s"} went unread, mostly under ${summarizeSkippedScope(skipped)}.`
    : "";

  diagnostics.push({
    code: "scan-limit-reached",
    severity: "warning",
    message: `${advice}${scope}`
  });
}

/** The busiest top-level directories among unread paths, so the omission is inspectable. */
export function summarizeSkippedScope(paths: string[]): string {
  const counts = new Map<string, number>();
  for (const path of paths) {
    const [head] = path.split("/");
    const scope = path.includes("/") && head ? `${head}/` : "the repository root";
    counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }

  return [...counts]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .map(([scope, count]) => `${scope} (${count.toLocaleString()})`)
    .join(", ");
}

async function readPackageScripts(root: string, files: RepoFile[], diagnostics: RepoMap["diagnostics"]): Promise<PackageScript[]> {
  const manifests = files.filter((file) => file.path === "package.json" || file.path.endsWith("/package.json"));
  const scripts: PackageScript[] = [];

  for (const manifest of manifests) {
    const absolutePath = join(root, manifest.path);
    let bytes: Buffer;
    try {
      bytes = await readFile(absolutePath);
    } catch {
      diagnostics.push({
        code: "package-json-invalid",
        severity: "warning",
        message: `Could not read ${manifest.path}; scripts from that package were skipped.`
      });
      continue;
    }

    let decoded: { text: string; encoding: string } | undefined;
    try {
      decoded = decodeManifest(bytes);
      const parsed = JSON.parse(decoded.text) as { name?: unknown; scripts?: Record<string, string> };
      const packageDir = normalizePath(dirname(manifest.path));
      // The declared workspace name, so a yarn route can address the package the way both
      // Yarn 1 and Berry understand rather than with Yarn 1's removed `--cwd`.
      const packageName = typeof parsed.name === "string" && parsed.name.trim() ? parsed.name.trim() : undefined;
      scripts.push(...Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({
        name,
        command,
        packageDir: packageDir === "." ? "" : packageDir,
        ...(packageName ? { packageName } : {})
      })));
    } catch {
      diagnostics.push({
        code: "package-json-invalid",
        severity: "warning",
        message:
          `Could not parse ${manifest.path}; scripts from that package were skipped.` +
          // Encoding is no longer a cause of failure, so naming it here rules it out rather
          // than sending someone to re-save a file whose real problem is a syntax error.
          (!decoded || decoded.encoding === "utf8" ? "" : ` It was decoded as ${decoded.encoding}, so the problem is the JSON itself, not the encoding.`)
      });
    }
  }

  return scripts;
}

/**
 * `Set-Content -Encoding utf8` on Windows writes a byte order mark, and `JSON.parse` rejects
 * one outright — so a perfectly valid manifest reported as invalid JSON and every script in
 * it was skipped, which surfaced downstream as `no-test-route`. Decoding the common editor
 * encodings first keeps `package-json-invalid` for genuinely broken syntax, and the encoding
 * label is carried out so the diagnostic can say so when parsing still fails.
 */
function decodeManifest(bytes: Buffer): { text: string; encoding: string } {
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { text: bytes.subarray(2).toString("utf16le"), encoding: "UTF-16LE" };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    const body = bytes.subarray(2);
    if (body.length % 2 !== 0) {
      throw new Error("Truncated UTF-16BE input has an odd byte count");
    }
    return { text: Buffer.from(body).swap16().toString("utf16le"), encoding: "UTF-16BE" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: bytes.subarray(3).toString("utf8"), encoding: "UTF-8 with a byte order mark" };
  }
  return { text: bytes.toString("utf8"), encoding: "utf8" };
}

async function readDiff(
  repoRoot: string,
  diffSpec: string | undefined,
  diagnostics: RepoMap["diagnostics"],
  internalPaths: ReadonlySet<string>
): Promise<{ changedFiles: string[]; diffText: string }> {
  if (!diffSpec) {
    return { changedFiles: [], diffText: "" };
  }

  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--relative", "--name-only", diffSpec, ...gitPathspec(internalPaths)], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--relative", diffSpec, ...gitPathspec(internalPaths)], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
      .map(normalizePath);
    const untracked = diffSpec.includes("..") ? [] : await listUntrackedPaths(repoRoot, internalPaths);
    const changedFiles = [...new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b));
    diagnostics.push({
      code: "diff-resolved",
      severity: "info",
      message: changedFiles.length === 0
        ? `The diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}" resolved to zero changed files, so results use the task text only. Paths are relative to the working directory; run from the repository root to include changes outside it.`
        : `Diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}" resolved ${changedFiles.length} changed ${changedFiles.length === 1 ? "path" : "paths"}.`,
      paths: changedFiles.slice(0, 8)
    });
    return {
      changedFiles,
      diffText: diffText.slice(0, MAX_DIFF_TEXT_CHARS)
    };
  } catch (error) {
    const checkoutState = isMissingGit(error) ? undefined : await describeGitCheckout(repoRoot);
    const detail = truncateForDiagnostic(gitErrorDetail(error), DIAGNOSTIC_SPEC_LIMIT * 2);
    diagnostics.push({
      code: "diff-unavailable",
      severity: "warning",
      message: checkoutState === "not-repository"
        ? `Could not resolve git diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}": ${NOT_A_GIT_CHECKOUT}`
        : checkoutState === "no-history"
          ? `Could not resolve git diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}": ${NO_GIT_HISTORY}`
        : `Could not resolve git diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}": ` +
          `${detail}. Results use the task text only.`
    });
    return { changedFiles: [], diffText: "" };
  }
}

/**
 * "Map what I am touching right now."
 *
 * Reaching this through `--diff HEAD` worked but was neither obvious nor quite right: it
 * swept in untracked files, which on an agent-driven checkout means .claude/ metadata and
 * scratch notes ranking beside the edit. Staged and unstaged tracked changes are what
 * "what I am working on" means; untracked files are a separate, opt-in question.
 */
async function readWorkingTree(
  repoRoot: string,
  includeUntracked: boolean,
  diagnostics: RepoMap["diagnostics"],
  internalPaths: ReadonlySet<string>
): Promise<{ changedFiles: string[]; diffText: string }> {
  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--relative", "--name-only", "HEAD", ...gitPathspec(internalPaths)], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--relative", "HEAD", ...gitPathspec(internalPaths)], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
      .map(normalizePath);
    const untracked = includeUntracked ? await listUntrackedPaths(repoRoot, internalPaths) : [];
    const changedFiles = [...new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b));

    diagnostics.push({
      code: "working-tree-diff",
      severity: "info",
      message: changedFiles.length === 0
        ? "Working-tree mode found no changes against HEAD; results use the task text only."
        : `Working-tree mode used ${changedFiles.length} changed ${changedFiles.length === 1 ? "path" : "paths"} ` +
          // "untracked files excluded" read as "untracked files are invisible", which is false:
          // they are excluded from the change set and remain ranking candidates.
          `against HEAD${includeUntracked ? ", including untracked files" : " (untracked files are not counted as changed, though they still rank; pass --include-untracked to count them)"}.`,
      paths: changedFiles.slice(0, 8)
    });

    return { changedFiles, diffText: diffText.slice(0, MAX_DIFF_TEXT_CHARS) };
  } catch (error) {
    const checkoutState = isMissingGit(error) ? undefined : await describeGitCheckout(repoRoot);
    diagnostics.push({
      code: "diff-unavailable",
      severity: "warning",
      message: checkoutState === "not-repository"
        ? `Could not read the working tree: ${NOT_A_GIT_CHECKOUT}`
        : checkoutState === "no-history"
          ? `Could not read the working tree: ${NO_GIT_HISTORY}`
        : `Could not read the working tree: ${truncateForDiagnostic(gitErrorDetail(error), DIAGNOSTIC_SPEC_LIMIT * 2)}. ` +
          "Results use the task text only."
    });
    return { changedFiles: [], diffText: "" };
  }
}

/**
 * A plain directory still ranks, because the scanner falls back to walking it — so pointing
 * FixMap at an extracted tarball is a supported thing to do. Only the change-mapping modes
 * need git, and echoing git's raw "fatal: not a git repository" left the reader to work out
 * which of the two facts was the problem.
 */
const NOT_A_GIT_CHECKOUT =
  "this directory is not a git checkout. Ranking still works from the task text; " +
  "--diff, --base/--head and --working-tree need a repository with history.";

const NO_GIT_HISTORY =
  "this repository has no commits yet, so there is nothing to diff against. " +
  "Commit the initial work first, or run with --issue alone to rank from the task text.";

/**
 * `execFile` puts "Command failed: git ..." in `message` and git's own explanation in
 * `stderr`, so matching on the message alone never saw the reason. Both are checked.
 */
async function describeGitCheckout(root: string): Promise<"not-repository" | "no-history" | undefined> {
  try {
    const { stdout } = await exec("git", ["rev-parse", "--is-inside-work-tree"], { cwd: root, maxBuffer: GIT_MAX_BUFFER });
    if (stdout.trim() !== "true") return "not-repository";
  } catch {
    return "not-repository";
  }
  try {
    await exec("git", ["rev-parse", "--verify", "HEAD"], { cwd: root, maxBuffer: GIT_MAX_BUFFER });
    return undefined;
  } catch {
    return "no-history";
  }
}

function gitErrorDetail(error: unknown): string {
  const candidate = error as { code?: unknown; message?: unknown; stderr?: unknown };
  if (candidate?.code === "ENOENT") return "Git is not installed or is not available on PATH";
  const stderr = typeof candidate?.stderr === "string" ? candidate.stderr : "";
  const message = typeof candidate?.message === "string" ? candidate.message : String(error);
  return stderr.split(/\r?\n/).find((line) => line.trim()) ?? message.split(/\r?\n/)[0] ?? "unknown git error";
}

function isMissingGit(error: unknown): boolean {
  return (error as { code?: unknown })?.code === "ENOENT";
}

function detectPackageManager(files: RepoFile[]): RepoMap["packageManager"] {
  const paths = new Set(files.map((file) => file.path));
  if (paths.has("pnpm-lock.yaml") || paths.has("pnpm-workspace.yaml")) return "pnpm";
  if (paths.has("yarn.lock") || paths.has(".yarnrc.yml")) return "yarn";
  if (paths.has("bun.lock") || paths.has("bun.lockb")) return "bun";
  return "npm";
}

function classifyFile(path: string, extension: string): RepoFile["kind"] {
  const lower = path.toLowerCase();
  if (extension === ".md" || lower.startsWith("docs/") || lower === "license") return "documentation";
  if (
    lower.startsWith(".github/") ||
    [".json", ".yaml", ".yml"].includes(extension) ||
    /(^|\/)([^/]+\.)?(config|rc)\.[^/]+$/.test(lower)
  ) return "config";
  if (SOURCE_EXTENSIONS.has(extension)) return "code";
  return "other";
}

async function readTextSample(
  path: string,
  sizeBytes: number
): Promise<{ text: string; complete: boolean; skipReason?: RepoFile["textSampleSkipReason"] }> {
  if (sizeBytes > MAX_TEXT_SAMPLE_BYTES) {
    return { text: "", complete: false, skipReason: "too-large" };
  }

  try {
    const bytes = await readFile(path);
    // A NUL byte does not occur in real source. Treating such a file as text produced a
    // garbled sample that matched nothing, while the path still scored — so a binary blob
    // named like source ranked on its name alone with no way to tell from the report.
    // Reporting it as incomplete routes it through the same "content unavailable" handling
    // as an oversized file.
    if (bytes.includes(0)) {
      return { text: "", complete: false, skipReason: "not-text" };
    }
    return { text: bytes.toString("utf8"), complete: true };
  } catch {
    return { text: "", complete: false, skipReason: "unreadable" };
  }
}

async function listUntrackedPaths(
  repoRoot: string,
  internalPaths: ReadonlySet<string> = new Set<string>()
): Promise<string[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }
    );
    return stdout.split("\0").filter(Boolean).map(normalizePath)
      .filter((path) => !hasInternalPath(internalPaths, path));
  } catch {
    return [];
  }
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function normalizePath(path: string): string {
  return path.split(sep).join("/");
}
