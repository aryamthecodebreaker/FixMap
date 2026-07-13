import { execFile } from "node:child_process";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, join, relative, sep } from "node:path";
import { promisify } from "node:util";
import type { FixMapInput, PackageScript, RepoFile, RepoMap } from "./types.js";

const IGNORED_DIRS = new Set([
  ".cache", ".git", ".idea", ".netlify", ".next", ".nuxt", ".output", ".turbo", ".venv", ".vercel", ".vscode",
  "build", "coverage", "dist", "node_modules", "target", "vendor"
]);
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

export async function scanRepo(input: Pick<FixMapInput, "repoRoot" | "baseRef" | "headRef" | "diffSpec">): Promise<RepoMap> {
  if (!(await isDirectory(input.repoRoot))) {
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
  const files = await listFiles(input.repoRoot, diagnostics);
  const packageScripts = await readPackageScripts(input.repoRoot, files, diagnostics);
  const diffSpec = resolveDiffSpec(input);
  const diff = await readDiff(input.repoRoot, diffSpec, diagnostics);

  return {
    root: input.repoRoot,
    files,
    packageScripts,
    changedFiles: diff.changedFiles,
    diffText: diff.diffText,
    packageManager: detectPackageManager(files),
    diagnostics
  };
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

  for (const rawPath of paths) {
    if (results.length >= MAX_SCANNED_FILES) {
      reportScanLimit(diagnostics);
      break;
    }

    const relativePath = normalizePath(rawPath);
    if (isInIgnoredDir(relativePath)) {
      continue;
    }

    const file = await toRepoFile(join(root, rawPath), relativePath);
    if (file) {
      results.push(file);
    }
  }

  return results.sort((a, b) => a.path.localeCompare(b.path));
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
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      results.push(...await walkFiles(root, join(current, entry.name), diagnostics, state));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const absolutePath = join(current, entry.name);
    const file = await toRepoFile(absolutePath, normalizePath(relative(root, absolutePath)));
    if (file) {
      results.push(file);
      state.count += 1;
    }
  }

  return results;
}

async function toRepoFile(absolutePath: string, relativePath: string): Promise<RepoFile | undefined> {
  let fileStat;
  try {
    fileStat = await stat(absolutePath);
  } catch {
    return undefined;
  }
  if (!fileStat.isFile()) {
    return undefined;
  }

  const extension = extname(relativePath);
  const isSource = SOURCE_EXTENSIONS.has(extension);

  return {
    path: relativePath,
    extension,
    sizeBytes: fileStat.size,
    isTest: TEST_PATTERNS.some((pattern) => pattern.test(relativePath)),
    isSource,
    kind: classifyFile(relativePath, extension),
    textSample: isSource ? await readTextSample(absolutePath, fileStat.size) : ""
  };
}

function isInIgnoredDir(relativePath: string): boolean {
  return relativePath.split("/").slice(0, -1).some((segment) => IGNORED_DIRS.has(segment));
}

function reportScanLimit(diagnostics: RepoMap["diagnostics"]): void {
  diagnostics.push({
    code: "scan-limit-reached",
    severity: "warning",
    message: `Stopped scanning after ${MAX_SCANNED_FILES.toLocaleString()} files. Narrow the repository root for more precise results.`
  });
}

async function readPackageScripts(root: string, files: RepoFile[], diagnostics: RepoMap["diagnostics"]): Promise<PackageScript[]> {
  const manifests = files.filter((file) => file.path === "package.json" || file.path.endsWith("/package.json"));
  const scripts: PackageScript[] = [];

  for (const manifest of manifests) {
    try {
      const raw = await readFile(join(root, manifest.path), "utf8");
      const parsed = JSON.parse(raw) as { scripts?: Record<string, string> };
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
        message: `Could not parse ${manifest.path}; scripts from that package were skipped.`
      });
    }
  }

  return scripts;
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
      exec("git", ["diff", "--name-only", diffSpec], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER }),
      exec("git", ["diff", diffSpec], { cwd: repoRoot, maxBuffer: GIT_MAX_BUFFER })
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
    const detail = error instanceof Error ? error.message.split(/\r?\n/)[0] : "unknown git error";
    diagnostics.push({
      code: "diff-unavailable",
      severity: "warning",
      message: `Could not resolve git diff "${diffSpec}": ${detail}. Results use the task text only.`
    });
    return { changedFiles: [], diffText: "" };
  }
}

function detectPackageManager(files: RepoFile[]): RepoMap["packageManager"] {
  const paths = new Set(files.map((file) => file.path));
  if (paths.has("pnpm-lock.yaml")) return "pnpm";
  if (paths.has("yarn.lock")) return "yarn";
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

async function readTextSample(path: string, sizeBytes: number): Promise<string> {
  if (sizeBytes > MAX_TEXT_SAMPLE_BYTES) {
    return "";
  }

  try {
    return await readFile(path, "utf8");
  } catch {
    return "";
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
