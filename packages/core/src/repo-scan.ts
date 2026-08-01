import { execFile } from "node:child_process";
import { lstat, readdir, readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { ALWAYS_IGNORED_DIRS, GENERATED_DIRS } from "./paths.js";
import { DIAGNOSTIC_SPEC_LIMIT, truncateForDiagnostic } from "./text.js";
import type { FixMapInput, PackageScript, RepoFile, RepoMap } from "./types.js";

const WALK_IGNORED_DIRS = new Set([...ALWAYS_IGNORED_DIRS, ...GENERATED_DIRS]);
const SOURCE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".go",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".py",
  ".rs",
  ".ts",
  ".tsx",
  ".yaml",
  ".yml"
]);
const TEST_PATTERNS = [/\.test\./, /\.spec\./, /(^|\/|\\)__tests__(\/|\\)/, /(^|\/|\\)tests?(\/|\\)/];
const MAX_TEXT_SAMPLE_BYTES = 64_000;
const MAX_DIFF_TEXT_CHARS = 200_000;
const MAX_SCANNED_FILES = 25_000;
const GIT_MAX_BUFFER = 10 * 1024 * 1024;
const exec = promisify(execFile);
type ScanState = { count: number; limitReported: boolean };

export async function scanRepo(
  input: Pick<
    FixMapInput,
    "repoRoot" | "baseRef" | "headRef" | "diffSpec" | "workingTree" | "includeUntracked"
  >
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
  const files = await listFiles(repoRoot, diagnostics);
  const trackedFiles = await listTrackedPaths(repoRoot);
  const packageScripts = await readPackageScripts(repoRoot, files, diagnostics);
  const diffSpec = resolveDiffSpec(input);
  const diff = input.workingTree
    ? await readWorkingTree(repoRoot, input.includeUntracked === true, diagnostics)
    : await readDiff(repoRoot, diffSpec, diagnostics);

  return {
    root: repoRoot,
    files,
    trackedFiles,
    packageScripts,
    changedFiles: diff.changedFiles,
    diffText: diff.diffText,
    packageManager: detectPackageManager(files),
    diagnostics
  };
}

async function listTrackedPaths(root: string): Promise<string[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["ls-files", "--cached", "-z"],
      { cwd: root, maxBuffer: GIT_MAX_BUFFER }
    );
    return stdout.split("\0").filter(Boolean).map(normalizePath);
  } catch {
    return [];
  }
}

function resolveDiffSpec(input: Pick<FixMapInput, "baseRef" | "headRef" | "diffSpec">): string | undefined {
  return input.diffSpec ?? (input.baseRef ? `${input.baseRef}...${input.headRef ?? "HEAD"}` : undefined);
}

async function listFiles(root: string, diagnostics: RepoMap["diagnostics"]): Promise<RepoFile[]> {
  const gitPaths = await listGitPaths(root);
  if (gitPaths) {
    return buildFilesFromPaths(root, gitPaths, diagnostics);
  }

  const files = await walkFiles(root, root, diagnostics, { count: 0, limitReported: false });
  return files.sort((a, b) => a.path.localeCompare(b.path));
}

async function listGitPaths(root: string): Promise<string[] | undefined> {
  try {
    const { stdout } = await exec(
      "git",
      ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
      { cwd: root, maxBuffer: GIT_MAX_BUFFER }
    );
    return [...new Set(stdout.split("\0").filter(Boolean))];
  } catch {
    return undefined;
  }
}

async function buildFilesFromPaths(
  root: string,
  paths: string[],
  diagnostics: RepoMap["diagnostics"]
): Promise<RepoFile[]> {
  const results: RepoFile[] = [];
  const absent: string[] = [];
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

    const scanned = await toRepoFile(join(root, rawPath), relativePath);
    if (scanned.status === "absent") {
      absent.push(relativePath);
      continue;
    }
    if (scanned.status !== "ok") {
      continue;
    }

    const seenIndex = seenRealPaths.get(scanned.realPath);
    if (seenIndex !== undefined) {
      const seenFile = results[seenIndex]!;
      // Exactly one of the two can be the real file, so a single lstat settles it. This
      // runs only on a collision, which is rare by definition.
      if (await isSymbolicLink(join(root, seenFile.path))) {
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
  state: ScanState
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
      results.push(...await walkFiles(root, join(current, entry.name), diagnostics, state));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = join(current, entry.name);
    const scanned = await toRepoFile(absolutePath, normalizePath(relative(root, absolutePath)));
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
      textSampleComplete: sample.complete
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

async function isSymbolicLink(absolutePath: string): Promise<boolean> {
  try {
    return (await lstat(absolutePath)).isSymbolicLink();
  } catch {
    return false;
  }
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

    const decoded = decodeManifest(bytes);
    try {
      const parsed = JSON.parse(decoded.text) as { scripts?: Record<string, string> };
      const packageDir = normalizePath(dirname(manifest.path));
      scripts.push(...Object.entries(parsed.scripts ?? {}).map(([name, command]) => ({
        name,
        command,
        packageDir: packageDir === "." ? "" : packageDir
      })));
    } catch {
      diagnostics.push({
        code: "package-json-invalid",
        severity: "warning",
        message:
          `Could not parse ${manifest.path}; scripts from that package were skipped.` +
          // Encoding is no longer a cause of failure, so naming it here rules it out rather
          // than sending someone to re-save a file whose real problem is a syntax error.
          (decoded.encoding === "utf8" ? "" : ` It was decoded as ${decoded.encoding}, so the problem is the JSON itself, not the encoding.`)
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
    return { text: bytes.subarray(2).swap16().toString("utf16le"), encoding: "UTF-16BE" };
  }
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { text: bytes.subarray(3).toString("utf8"), encoding: "UTF-8 with a byte order mark" };
  }
  return { text: bytes.toString("utf8"), encoding: "utf8" };
}

async function readDiff(
  repoRoot: string,
  diffSpec: string | undefined,
  diagnostics: RepoMap["diagnostics"]
): Promise<{ changedFiles: string[]; diffText: string }> {
  if (!diffSpec) {
    return { changedFiles: [], diffText: "" };
  }

  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--relative", "--name-only", diffSpec], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--relative", diffSpec], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
      .map(normalizePath);
    const untracked = diffSpec.includes("..") ? [] : await listUntrackedPaths(repoRoot);
    return {
      changedFiles: [...new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b)),
      diffText: diffText.slice(0, MAX_DIFF_TEXT_CHARS)
    };
  } catch (error) {
    // git echoes the failing command back, so its own message contains the spec a second
    // time. Truncating only the interpolation above would leave the full string in `detail`.
    const rawDetail = error instanceof Error ? error.message.split(/\r?\n/)[0] : "unknown git error";
    const detail = truncateForDiagnostic(rawDetail ?? "unknown git error", DIAGNOSTIC_SPEC_LIMIT * 2);
    diagnostics.push({
      code: "diff-unavailable",
      severity: "warning",
      message: describesMissingRepository(error)
        ? `Could not resolve git diff "${truncateForDiagnostic(diffSpec, DIAGNOSTIC_SPEC_LIMIT)}": ${NOT_A_GIT_CHECKOUT}`
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
  diagnostics: RepoMap["diagnostics"]
): Promise<{ changedFiles: string[]; diffText: string }> {
  try {
    const [{ stdout: names }, { stdout: diffText }] = await Promise.all([
      exec("git", ["diff", "--relative", "--name-only", "HEAD"], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", "--relative", "HEAD"], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
    ]);
    const tracked = names
      .split(/\r?\n/)
      .map((path) => path.trim())
      .filter(Boolean)
      .map(normalizePath);
    const untracked = includeUntracked ? await listUntrackedPaths(repoRoot) : [];
    const changedFiles = [...new Set([...tracked, ...untracked])].sort((a, b) => a.localeCompare(b));

    diagnostics.push({
      code: "working-tree-diff",
      severity: "info",
      message: changedFiles.length === 0
        ? "Working-tree mode found no changes against HEAD; results use the task text only."
        : `Working-tree mode used ${changedFiles.length} changed ${changedFiles.length === 1 ? "path" : "paths"} ` +
          `against HEAD${includeUntracked ? ", including untracked files" : " (untracked files excluded; pass --include-untracked to add them)"}.`,
      paths: changedFiles.slice(0, 8)
    });

    return { changedFiles, diffText: diffText.slice(0, MAX_DIFF_TEXT_CHARS) };
  } catch (error) {
    const rawDetail = error instanceof Error ? error.message.split(/\r?\n/)[0] : "unknown git error";
    diagnostics.push({
      code: "diff-unavailable",
      severity: "warning",
      message: describesMissingRepository(error)
        ? `Could not read the working tree: ${NOT_A_GIT_CHECKOUT}`
        : `Could not read the working tree: ${truncateForDiagnostic(rawDetail ?? "unknown git error", DIAGNOSTIC_SPEC_LIMIT * 2)}. ` +
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

/**
 * `execFile` puts "Command failed: git ..." in `message` and git's own explanation in
 * `stderr`, so matching on the message alone never saw the reason. Both are checked.
 */
function describesMissingRepository(error: unknown): boolean {
  const candidate = error as { message?: unknown; stderr?: unknown };
  const text = [
    typeof candidate?.message === "string" ? candidate.message : "",
    typeof candidate?.stderr === "string" ? candidate.stderr : ""
  ].join("\n");
  return /not a git repository|does not have a commit checked out/i.test(text);
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
): Promise<{ text: string; complete: boolean }> {
  if (sizeBytes > MAX_TEXT_SAMPLE_BYTES) {
    return { text: "", complete: false };
  }

  try {
    const bytes = await readFile(path);
    // A NUL byte does not occur in real source. Treating such a file as text produced a
    // garbled sample that matched nothing, while the path still scored — so a binary blob
    // named like source ranked on its name alone with no way to tell from the report.
    // Reporting it as incomplete routes it through the same "content unavailable" handling
    // as an oversized file.
    if (bytes.includes(0)) {
      return { text: "", complete: false };
    }
    return { text: bytes.toString("utf8"), complete: true };
  } catch {
    return { text: "", complete: false };
  }
}

async function listUntrackedPaths(repoRoot: string): Promise<string[]> {
  try {
    const { stdout } = await exec(
      "git",
      ["ls-files", "--others", "--exclude-standard", "-z"],
      { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }
    );
    return stdout.split("\0").filter(Boolean).map(normalizePath);
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
